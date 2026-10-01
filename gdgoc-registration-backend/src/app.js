"use strict";

const express = require("express");
const cors = require("cors");

const { env } = require("../config/env");
const { VERTICAL_FORMS } = require("../config/verticals");
const { findStudentByRollNumber } = require("./students");
const { appendRegistration } = require("./registrations");
const { validateRegistration, ValidationError } = require("./validation");
const { isSafeObject, createRateLimiter, rateLimit, asyncHandler, clientIp } = require("./security");

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

  // --- Health -------------------------------------------------------------
  app.get("/api/health", (_req, res) => {
    res.json({ success: true, service: "gdgoc-registration-backend", env: env.NODE_ENV });
  });

  /**
   * GET /api/lookup/:rollNumber
   *
   * Returns the single matching student, or found:false. The roster itself is
   * never included in any response — there is no code path that returns it.
   */
  app.get(
    "/api/lookup/:rollNumber",
    rateLimit(lookupLimiter),
    asyncHandler(async (req, res) => {
      const student = await findStudentByRollNumber(req.params.rollNumber);

      if (!student) {
        // Same shape as a hit minus `student`, so a caller cannot use response
        // size or key ordering to distinguish "not in roster" from other cases.
        return res.status(200).json({ success: true, found: false });
      }
      return res.status(200).json({ success: true, found: true, student });
    })
  );

  /**
   * POST /api/register
   *
   * Persists the submission, then hands back only the two Google Form links the
   * student actually chose. The remaining 6 links are never read into a
   * response object.
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
      await appendRegistration({ ...record, priority1, priority2 });

      // Explicitly pick the two chosen keys. Nothing iterates over
      // VERTICAL_FORMS, so no other vertical's URL can appear here.
      const forms = {
        priority1: { name: priority1, url: VERTICAL_FORMS[priority1] },
        priority2: { name: priority2, url: VERTICAL_FORMS[priority2] },
      };

      return res.status(201).json({ success: true, forms });
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
      return res.status(status).json({ success: false, error: err?.expose ? err.message : "Bad request" });
    }

    console.error(`[error] ${req.method} ${req.path} from ${clientIp(req)}:`, err);
    return res.status(500).json({ success: false, error: "Internal server error" });
  });

  return app;
}

module.exports = { createApp };
