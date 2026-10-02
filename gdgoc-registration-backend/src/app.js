"use strict";

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const { env } = require("../config/env");
const { VERTICAL_FORMS } = require("../config/verticals");
const { findStudentByRollNumber } = require("./students");
const { getStore } = require("./store");
const { toCsv } = require("./registrations-csv");
const { validateRegistration, ValidationError } = require("./validation");
const { isSafeObject, createRateLimiter, rateLimit, asyncHandler, clientIp } = require("./security");

/**
 * The subset of a stored registration that a student is shown about themselves.
 *
 * Deliberately excludes every personal field the log holds (name, email, phone,
 * socials, the note to the team). A roll number is not a secret — it is
 * printed on a student's ID card — so this endpoint is reachable by anyone who
 * has one, and the fewer columns it can answer with, the smaller the surface.
 */
function summariseRegistration(record) {
  const priority1 = typeof record.priority1 === "string" ? record.priority1 : "";
  const priority2 = typeof record.priority2 === "string" ? record.priority2 : "";

  // Same rule as /api/register: only ever name two keys explicitly. The
  // verticals came from a validated submission, but a hand-edited log could hold
  // anything, so an unknown key resolves to no URL rather than to a lookup.
  const forms = {};
  if (VERTICAL_FORMS[priority1]) {
    forms.priority1 = { name: priority1, url: VERTICAL_FORMS[priority1] };
  }
  if (VERTICAL_FORMS[priority2]) {
    forms.priority2 = { name: priority2, url: VERTICAL_FORMS[priority2] };
  }

  return {
    submittedAt: record.submittedAt ?? null,
    priority1,
    priority2,
    priority1CompletedAt: record.priority1CompletedAt ?? null,
    priority2CompletedAt: record.priority2CompletedAt ?? null,
    formsCompletedAt: record.formsCompletedAt ?? null,
    forms,
  };
}

/**
 * Build the Express app. Kept separate from server.js so tests can mount it
 * without binding a fixed port.
 */
function createApp() {
  const app = express();

  // 0 (default) = ignore X-Forwarded-For, so a client cannot spoof its IP to
  // escape the rate limiter. Raise only when behind a proxy you control.
  app.set("trust proxy", env.TRUST_PROXY_HOPS);
  app.disable("x-powered-by");
  app.set("etag", false);

  // --- Security headers ---------------------------------------------------
  // This is a JSON API, so the useful protections are: no MIME sniffing, no
  // framing, no referrer leakage of form URLs, and a restrictive CSP.
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Resource-Policy", "same-site");
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    res.removeHeader("X-Powered-By");
    next();
  });

  // --- CORS ---------------------------------------------------------------
  // Allowlist of the portal's own origins. Requests from other origins get no
  // CORS headers, so a browser cannot read the response.
  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin, curl, server-to-server: no Origin header to check.
        if (!origin) return callback(null, true);

        const allowed = env.ALLOWED_ORIGINS.some((entry) =>
          entry instanceof RegExp ? entry.test(origin) : entry === origin
        );
        if (allowed) return callback(null, true);
        return callback(null, false); // omit headers; do not throw a 500
      },
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type"],
      credentials: false,
      maxAge: 600,
    })
  );

  // --- Body parsing -------------------------------------------------------
  // A registration is well under 1 KB; 64 KB is a generous ceiling that still
  // stops a large-payload memory attack.
  app.use(
    express.json({
      limit: env.BODY_LIMIT,
      type: ["application/json", "application/*+json"],
      strict: true,
    })
  );

  const lookupLimiter = createRateLimiter({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX_LOOKUP,
    name: "lookup",
  });
  const registerLimiter = createRateLimiter({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX_REGISTER,
    name: "register",
  });
  // Higher than register: a spreadsheet polling =IMPORTDATA() is legitimate
  // traffic, and one organiser should not lock themselves out of their sheet.
  const exportLimiter = createRateLimiter({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX_EXPORT,
    name: "export",
  });

  // --- Health -------------------------------------------------------------
  app.get("/api/health", (_req, res) => {
    res.json({ success: true, service: "gdgoc-registration-backend", env: env.NODE_ENV });
  });

  /**
   * GET /api/lookup/:rollNumber
   *
   * Returns the single matching student, or found:false. The roster itself is
   * never included in any response — there is no code path that returns it.
   *
   * Also reports whether this student has ALREADY registered, so the portal can
   * show "response already noted" the moment a roll number is typed instead of
   * letting them fill the whole form again and only then rejecting it.
   *
   * Two details worth knowing about the `registration` payload:
   *
   *  - It is the ONLY place a roll number is answered with a form URL after the
   *    original registration. That is deliberate: a student who registered but
   *    never opened their Priority form would otherwise be permanently locked
   *    out of it by the very duplicate check that protects them. The release is
   *    the same explicit two-key pick used at registration time — nothing
   *    iterates VERTICAL_FORMS — so no other vertical's link can leak.
   *
   *  - It carries no name, email or contact number. Someone who guesses a roll
   *    number learns that it is registered and which verticals were chosen, and
   *    nothing else.
   *
   *  - It is returned even when the roll number is NOT in the roster
   *    (`found:false`). A registered student missing from the roster is a real
   *    case here, not a hypothetical: at least one roll number in the live data
   *    is absent from every available roster source. Without the summary the
   *    portal has no way to show them the confirmation, so they would fill in
   *    the entire form, be refused with a 409, and land on a confirmation page
   *    with no form links — locked out of their own forms by the rule that is
   *    meant to protect them. `registered` is already reported on that path, so
   *    withholding the summary only makes the answer useless, not safer.
   */
  app.get(
    "/api/lookup/:rollNumber",
    rateLimit(lookupLimiter),
    asyncHandler(async (req, res) => {
      const registration = await getStore().findRegistration(req.params.rollNumber);
      const student = await findStudentByRollNumber(req.params.rollNumber);
      const summary = registration ? summariseRegistration(registration) : undefined;

      if (!student) {
        // Same shape as a hit minus `student`, so a caller cannot use response
        // size or key ordering to distinguish "not in roster" from other cases.
        return res
          .status(200)
          .json({ success: true, found: false, registered: Boolean(registration), registration: summary });
      }
      return res.status(200).json({
        success: true,
        found: true,
        student,
        registered: Boolean(registration),
        registration: summary,
      });
    })
  );

  /**
   * POST /api/register
   *
   * Persists the submission, then hands back only the two Google Form links the
   * student actually chose. The remaining 8 links are never read into a
   * response object.
   *
   * A roll number that is already registered is refused with 409 and the code
   * `alreadyRegistered`. The UI checks this earlier, on roll-number lookup, but
   * that check is a courtesy: this one is what actually enforces one response
   * per student, and it has to be here because the browser cannot be trusted to
   * have asked.
   */
  app.post(
    "/api/register",
    rateLimit(registerLimiter),
    asyncHandler(async (req, res) => {
      const body = req.body;

      if (!isSafeObject(body)) {
        throw new ValidationError({
          _body: "Request body must be a JSON object",
        });
      }

      const { record, priority1, priority2 } = validateRegistration(body);

      // The chosen verticals are persisted alongside the student details —
      // they are the whole point of the application, so a log that omits them
      // cannot be used to allocate anyone to a vertical.
      // Throws 409 if this roll number is already in the log.
      await getStore().appendRegistration({ ...record, priority1, priority2 });

      // Explicitly pick the two chosen keys. Nothing iterates over
      // VERTICAL_FORMS, so no other vertical's URL can appear here.
      const forms = {
        priority1: { name: priority1, url: VERTICAL_FORMS[priority1] },
        priority2: { name: priority2, url: VERTICAL_FORMS[priority2] },
      };

      return res.status(201).json({ success: true, forms });
    })
  );

  /**
   * POST /api/register/:rollNumber/complete
   *
   * Records that the student submitted one of their two Google Forms.
   *
   * WHY THE STUDENT HAS TO SAY SO: the forms are on docs.google.com and the
   * portal is not, so there is no way to observe a submission. The iframe
   * cannot read the form's DOM, and Google offers no callback. The only honest
   * signal available is the student confirming it, which is exactly what the
   * "I have submitted this form" button in step 3 already is — this route just
   * makes it durable instead of a UI-only state.
   *
   * It can only ever set a completion timestamp on an existing row. It cannot
   * create, alter or delete a registration, so the damage from a forged request
   * is limited to a wrong tick on an organiser's sheet.
   */
  app.post(
    "/api/register/:rollNumber/complete",
    rateLimit(registerLimiter),
    asyncHandler(async (req, res) => {
      // Strictly a number. `Number()` coercion would also wave through "1",
      // " 1 " and — worse — `true`, since Number(true) is 1, so a malformed
      // payload could quietly stamp the wrong stage.
      const stage = req.body?.stage;
      if (stage !== 1 && stage !== 2) {
        throw new ValidationError({ stage: "stage must be 1 or 2" });
      }

      const record = await getStore().markFormCompleted(req.params.rollNumber, stage);

      return res.status(200).json({
        success: true,
        completedAt: record[`priority${stage}CompletedAt`],
      });
    })
  );

  /**
   * GET /api/registrations.csv?key=<token>
   *
   * The registration log as a CSV, for Excel or Google Sheets.
   *
   * Disabled entirely unless EXPORT_TOKEN is set - it returns 404, not 401, so
   * an unconfigured deployment does not even confirm the route exists. The
   * token travels as a query parameter because that is the only thing
   * =IMPORTDATA() in a spreadsheet can send; Sheets cannot attach headers.
   *
   * The trade-off of a query token is that it lands in proxy and server access
   * logs. That is acceptable only because this endpoint is opt-in and the
   * alternative - no export at all - is worse for the organisers.
   */
  app.get(
    "/api/registrations.csv",
    rateLimit(exportLimiter),
    asyncHandler(async (req, res) => {
      if (!env.EXPORT_TOKEN) {
        // Indistinguishable from any other unknown path.
        return res.status(404).json({ success: false, error: "Not found" });
      }

      const provided = String(req.query.key ?? "");
      const expected = env.EXPORT_TOKEN;
      const matches =
        provided.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));

      if (!matches) {
        return res.status(401).json({ success: false, error: "Invalid export key" });
      }

      const records = await getStore().readAllRegistrations();
      const csv = toCsv(records);

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="registrations.csv"');
      // Student data must not sit in a shared cache.
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).send(csv);
    })
  );

  // 404 for anything else — no route listing, no stack traces.
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: "Not found" });
  });

  // --- Central error handler ---------------------------------------------
  // Must keep all four parameters for Express to recognise it.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const status = Number.isInteger(err?.status) ? err.status : 500;

    // Client errors (with `expose`) get their message; anything unexpected is
    // logged server-side and reported as a generic 500 so internals never leak.
    if (err instanceof ValidationError) {
      return res.status(400).json({ success: false, error: "Validation failed", fields: err.fields });
    }
    if (err?.type === "entity.too.large") {
      return res.status(413).json({ success: false, error: "Request body too large" });
    }
    if (err?.type === "entity.parse.failed") {
      return res.status(400).json({ success: false, error: "Malformed JSON body" });
    }
    if (status === 429 || status === 503) {
      return res.status(status).json({ success: false, error: err.message });
    }
    if (status >= 400 && status < 500) {
      // `code` is a stable machine-readable tag (`alreadyRegistered`) so the
      // client can branch on it instead of pattern-matching an English message.
      return res.status(status).json({
        success: false,
        error: err?.expose ? err.message : "Bad request",
        ...(err?.code ? { code: err.code } : {}),
      });
    }

    console.error(`[error] ${req.method} ${req.path} from ${clientIp(req)}:`, err);
    return res.status(500).json({ success: false, error: "Internal server error" });
  });

  return app;
}

module.exports = { createApp };
