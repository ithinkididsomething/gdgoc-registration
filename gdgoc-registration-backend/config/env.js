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

const env = Object.freeze({
  NODE_ENV,
  IS_PRODUCTION,

  HOST: process.env.HOST || "0.0.0.0",
  PORT: intFromEnv("PORT", 3000),

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
});

module.exports = { env };
