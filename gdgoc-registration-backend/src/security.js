"use strict";

/** Keys that must never be accepted from a client, at any nesting depth. */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Reject a parsed JSON body outright if it tries the prototype-pollution
 * trick. `JSON.parse('{"__proto__":{"admin":true}}')` creates a *real own*
 * property, which then detonates on the next `Object.assign({}, body)` or
 * `target[key] = value` anywhere downstream. Cheap to block, expensive to debug.
 *
 * @param {unknown} body
 * @returns {boolean} true when the body is safe to use
 */
function isSafeObject(body) {
  if (body === null || typeof body !== "object") return false;
  if (Array.isArray(body)) return false;
  for (const key of Object.getOwnPropertyNames(body)) {
    if (FORBIDDEN_KEYS.has(key)) return false;
  }
  return true;
}

/**
 * Collapse all whitespace (incl. newlines/tabs) to single spaces and trim.
 * Stops multi-line values from breaking out of a CSV/one-line context.
 *
 * @param {unknown} value
 * @returns {string}
 */
function collapseWhitespace(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

/**
 * Clamp a string to a max length, appending an ellipsis marker if truncated.
 * @param {string} value
 * @param {number} max
 */
function clamp(value, max) {
  return value.length > max ? `${value.slice(0, max)}` : value;
}

/**
 * Strip characters that have no business in a free-text form field and are
 * classic log-injection / CSV-formula vectors. Keeps letters, digits, spaces
 * and common punctuation.
 */
function stripControlChars(value) {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
}

/**
 * Normalise a URL-ish field: trims, enforces http(s), and returns null for
 * anything that is not a safe absolute URL. Rejects `javascript:`,
 * `data:`, and `file:` schemes, which would otherwise be stored and later
 * rendered as clickable links.
 *
 * @param {string} value
 * @returns {string|null}
 */
function safeHttpUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  // Guard against embedded credentials, which are a phishing / leak vector.
  if (parsed.username || parsed.password) return null;
  return parsed.toString();
}

/**
 * In-process fixed-window rate limiter.
 *
 * Deliberately dependency-free: this is a single-instance service and the goal
 * is to blunt casual hammering, not to replace an edge/WAF limiter. If you run
 * more than one instance behind a load balancer, put a shared limiter at the
 * proxy instead — this one is per-process and its counters are not shared.
 *
 * @param {{windowMs: number, max: number, maxKeys?: number, name?: string}} options
 */
function createRateLimiter({ windowMs, max, maxKeys = 20_000, name = "requests" }) {
  /** @type {Map<string, {count: number, resetAt: number}>} */
  const hits = new Map();

  const sweep = () => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  };

  // Bound memory: drop the whole table once it grows past maxKeys.
  const timer = setInterval(sweep, Math.max(windowMs, 30_000));
  timer.unref?.();

  /**
   * @param {import('express').Request} req
   * @returns {{allowed: boolean, remaining: number, retryAfterSeconds: number}}
   */
  function check(req) {
    if (hits.size > maxKeys) sweep();
    if (hits.size > maxKeys) hits.clear();

    // req.ip honours `trust proxy` settings; with TRUST_PROXY_HOPS=0 it is the
    // socket address and cannot be spoofed via X-Forwarded-For.
    const key = req.ip || req.socket?.remoteAddress || "unknown";
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: max - 1, retryAfterSeconds: 0 };
    }

    entry.count += 1;
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return {
      allowed: entry.count <= max,
      remaining: Math.max(0, max - entry.count),
      retryAfterSeconds,
    };
  }

  function reset() {
    hits.clear();
  }

  return { check, reset, name, windowMs, max };
}

/**
 * Wrap an async route handler so a rejected promise reaches Express'
 * error handler. Express 4 does not do this on its own.
 *
 * @param {Function} handler
 */
function asyncHandler(handler) {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/**
 * Wrap a route in a rate limiter, emitting standard RateLimit headers.
 * @param {ReturnType<typeof createRateLimiter>} limiter
 */
function rateLimit(limiter) {
  return function rateLimitMiddleware(req, res, next) {
    const { allowed, remaining, retryAfterSeconds } = limiter.check(req);
    res.setHeader("X-RateLimit-Limit", String(limiter.max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    if (!allowed) {
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return next(
        Object.assign(new Error("Too many requests. Please slow down and try again shortly."), {
          status: 429,
          expose: true,
        })
      );
    }
    return next();
  };
}

/** Client IP for logging — avoids logging the full spoofable header chain. */
function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

module.exports = {
  isSafeObject,
  collapseWhitespace,
  stripControlChars,
  clamp,
  safeHttpUrl,
  createRateLimiter,
  rateLimit,
  asyncHandler,
  clientIp,
};
