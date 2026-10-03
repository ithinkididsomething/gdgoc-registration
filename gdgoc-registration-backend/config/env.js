"use strict";

const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");

/** Parse a positive integer env var, falling back when unset or invalid. */
function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const NODE_ENV = process.env.NODE_ENV || "development";
const IS_PRODUCTION = NODE_ENV === "production";

/**
 * CORS allowlist.
 *
 * Dev default: the common local front-end origins (Vite dev server, plain
 * localhost/static host) so `npm run dev` works with zero configuration.
 *
 * Production: fail closed. With no explicit CORS_ORIGINS the server refuses to
 * start rather than silently opening the API to every origin, because these
 * endpoints are what hand out the internal Google Form links.
 */
function resolveAllowedOrigins() {
  const raw = process.env.CORS_ORIGINS;
  if (!raw) {
    if (IS_PRODUCTION) {
      throw new Error(
        "CORS_ORIGINS is required when NODE_ENV=production. " +
          'Example: CORS_ORIGINS="https://gdgoc.example.com,https://www.example.com"'
      );
    }
    return [
      /^http:\/\/localhost:\d+$/,
      /^http:\/\/127\.0\.0\.1:\d+$/,
    ];
  }
  const list = raw
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  if (list.length === 0) {
    throw new Error("CORS_ORIGINS was set but contained no valid origins.");
  }
  return list;
}

/** Absolute path to the data directory — overridable so tests can redirect it. */
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT_DIR, "data");

/**
 * Which engine stores registrations. `file` keeps a JSON array under DATA_DIR.
 * `firestore` uses the cloud database and needs no DATA_DIR at all.
 *
 * Default is `firestore` for production. Local dev without credentials should
 * set REGISTRATION_STORE=file to use the JSON file instead.
 */
const REGISTRATION_STORE = (process.env.REGISTRATION_STORE || "firestore").toLowerCase();

/**
 * Which Firestore database to talk to.
 *
 * Firestore databases are addressed as `projects/<project>/databases/<id>`, and
 * a project can hold several. The Firebase console's "Create database" button
 * offers `(default)`, but nothing forces you to accept it, and the Admin SDK's
 * bare `getFirestore()` ONLY ever means `(default)`.
 *
 * So a project whose database was named anything else - `gdgregs`, `prod`,
 * `registrations` - fails with a bare `NOT_FOUND` and no explanation, which is a
 * genuinely miserable hour to lose. Setting this explicitly removes the trap.
 *
 * VALIDATED, because this is the variable most likely to be filled in by
 * pasting the wrong thing. A credential JSON landed here once, and Firestore
 * reported it as `INVALID_ARGUMENT: Invalid database id {"type":"service_
 * account",...}` - technically accurate, practically useless, because it buries
 * a copy of a private key in an error message. Caught here instead, it says
 * which variable is wrong and never echoes the value.
 */
function resolveDatabaseId() {
  const raw = process.env.FIREBASE_DATABASE_ID;
  if (!raw || !raw.trim()) return "(default)";

  const id = raw.trim();

  // `(default)` is the one name that is not otherwise shaped like an ID.
  if (id === "(default)") return id;

  // Firestore: 4-63 chars, starts with a letter, lowercase letters/digits/
  // hyphens, cannot end with a hyphen.
  const valid = /^[a-z][a-z0-9-]{2,61}[a-z0-9]$/.test(id);
  if (!valid) {
    const looksLikeJson = id.startsWith("{") || id.includes("PRIVATE KEY");
    throw new Error(
      looksLikeJson
        ? "FIREBASE_DATABASE_ID looks like a service account key, not a database " +
          "name. You pasted the key into the wrong variable: the key belongs in " +
          "FIREBASE_SERVICE_ACCOUNT_JSON, and this variable should be (default) or " +
          "your database's name."
        : `FIREBASE_DATABASE_ID ("${id}") is not a valid Firestore database id. ` +
          "Expected \"(default)\", or 4-63 characters starting with a lowercase " +
          "letter and containing only lowercase letters, digits and hyphens."
    );
  }

  return id;
}

const FIREBASE_DATABASE_ID = resolveDatabaseId();

/**
 * The Google Form URL for each of the 10 verticals, as a JSON object.
 *
 * WHY THIS IS AN ENV VAR AND NOT A CONSTANT IN config/verticals.js:
 *
 * A form response link is a bearer credential. Anyone holding it can submit to
 * that form, and it is permanently embedded in this project's git history once
 * committed - which is exactly what happened: the first version of the vertical
 * map hardcoded all ten links, and the repository is PUBLIC, so every one of
 * them was readable by anyone (or any web-enabled AI) the moment it was pushed.
 * Deleting the file does not fix it, because `git show` still serves the old
 * blob forever.
 *
 * So the URLs now live ONLY in the deployment environment. What stays in the
 * repo is the list of vertical KEYS, which are just labels and carry no access.
 *
 * Accepted shape (all ten keys optional individually, but see verticals.js for
 * what happens when one is missing):
 *   VERTICAL_FORM_URLS={"content":"https://docs.google.com/forms/d/e/.../viewform", ...}
 *
 * Validation is strict about the host: only Google's own form hosts are allowed,
 * so a mistyped value fails at startup instead of turning into an iframe that
 * silently loads somebody else's page.
 */
function resolveVerticalFormUrls() {
  const raw = (process.env.VERTICAL_FORM_URLS || "").trim();
  const urls = Object.create(null);
  if (!raw) return Object.freeze(urls);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Deliberately does NOT echo `raw`: a bad paste here is often a paste of
    // something else entirely, and this message ends up in host logs.
    throw new Error(
      "VERTICAL_FORM_URLS is not valid JSON. Expected an object mapping each " +
        'vertical key to its form URL, e.g. {"content":"https://docs.google.com/' +
        'forms/d/e/<FORM_ID>/viewform"}. The value was not printed because it may ' +
        "contain something sensitive."
    );
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("VERTICAL_FORM_URLS must be a JSON object, not an array or a scalar.");
  }

  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`VERTICAL_FORM_URLS["${key}"] must be a non-empty string.`);
    }
    const url = value.trim();
    let host;
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      throw new Error(
        `VERTICAL_FORM_URLS["${key}"] is not a valid absolute URL. ` +
          "Use the full https://docs.google.com/forms/d/e/<FORM_ID>/viewform link."
      );
    }
    if (host !== "docs.google.com" && host !== "forms.google.com") {
      throw new Error(
        `VERTICAL_FORM_URLS["${key}"] points at "${host}", which is not a Google ` +
          "Forms host. Only docs.google.com and forms.google.com are allowed."
      );
    }
    // The frontend appends `embedded=true` itself, so a stored URL must not
    // hardcode it or the flag would end up baked into a shareable link.
    if (url.includes("embedded=")) {
      throw new Error(
        `VERTICAL_FORM_URLS["${key}"] contains "embedded=". Remove it - the ` +
          "frontend appends that flag itself at render time."
      );
    }
    urls[key] = url;
  }

  return Object.freeze(urls);
}

const VERTICAL_FORM_URLS = resolveVerticalFormUrls();

const env = Object.freeze({
  NODE_ENV,
  IS_PRODUCTION,

  HOST: process.env.HOST || "0.0.0.0",
  PORT: intFromEnv("PORT", 3000),

  REGISTRATION_STORE,
  FIREBASE_DATABASE_ID,
  VERTICAL_FORM_URLS,

  ROOT_DIR,
  DATA_DIR,
  STUDENTS_FILE: path.join(DATA_DIR, "students.json"),
  REGISTRATIONS_FILE: path.join(DATA_DIR, "registrations.json"),

  /** Either an array of exact origins or of RegExp sources (dev localhost). */
  ALLOWED_ORIGINS: resolveAllowedOrigins(),

  /** Max request body size. A registration is tiny; 64kb is generous. */
  BODY_LIMIT: process.env.BODY_LIMIT || "64kb",

  /** Simple in-process throttle (see src/security.js). */
  RATE_LIMIT_WINDOW_MS: intFromEnv("RATE_LIMIT_WINDOW_MS", 60_000),
  RATE_LIMIT_MAX_LOOKUP: intFromEnv("RATE_LIMIT_MAX_LOOKUP", 30),
  RATE_LIMIT_MAX_REGISTER: intFromEnv("RATE_LIMIT_MAX_REGISTER", 10),

  /**
   * Number of trusted reverse proxies in front of this service, used only for
   * rate-limit client IP resolution. 0 (default) means ignore X-Forwarded-For
   * entirely, so a client cannot spoof its IP to dodge the limiter.
   */
  TRUST_PROXY_HOPS: intFromEnv("TRUST_PROXY_HOPS", 0),

  /**
   * Refuse new registrations once the store exceeds this size, so a runaway
   * client cannot fill the disk / produce a multi-megabyte JSON parse per write.
   */
  MAX_STORE_BYTES: intFromEnv("MAX_STORE_BYTES", 8 * 1024 * 1024),

  /** Student list cache TTL, so swapping in the real dataset is picked up. */
  STUDENTS_CACHE_TTL_MS: intFromEnv("STUDENTS_CACHE_TTL_MS", 30_000),

  /**
   * Shared secret that unlocks GET /api/registrations.csv.
   *
   * Unset (the default) means the CSV endpoint does not exist - the route
   * answers 404. This endpoint hands out every student's name, phone number
   * and email, so it must never be reachable by default. Generate one with:
   *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   */
  EXPORT_TOKEN: (process.env.EXPORT_TOKEN || "").trim(),

  /** Per-IP cap on CSV exports, per window. Generous for Sheets polling. */
  RATE_LIMIT_MAX_EXPORT: intFromEnv("RATE_LIMIT_MAX_EXPORT", 60),

  /**
   * How long GET /api/forms/embed-status caches its probe results.
   *
   * The endpoint asks Google whether each form still answers 200 with
   * `embedded=true`, which is the only reliable signal that someone ticked
   * "Allow anyone to embed" in the form's settings. That setting changes rarely,
   * so the answer is cached rather than re-fetched on every page view.
   */
  EMBED_PROBE_TTL_MS: intFromEnv("EMBED_PROBE_TTL_MS", 10 * 60 * 1000),
});

module.exports = { env };
