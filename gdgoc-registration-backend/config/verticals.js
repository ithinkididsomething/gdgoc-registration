"use strict";

/**
 * Canonical map of the 10 GDGoC verticals to their Google Form URLs.
 *
 * ============================================================================
 * TO GO LIVE: replace the PLACEHOLDER_FORM_URL value below with each vertical's
 * real form URL. Nothing else needs to change — the keys are the contract with
 * the frontend and must not be renamed.
 *
 * The ten keys, in display order:
 *   content      -> Content ................. sharing one form
 *   creatives    -> Creatives ............... sharing one form
 *   operations   -> Operations .............. sharing one form
 *   social media -> Social Media ............ sharing one form
 *   design       -> Design .................. sharing one form
 *   production   -> Production .............. sharing one form
 *   pr           -> PR ...................... sharing one form
 *   sponsorship  -> Sponsorship ............. sharing one form
 *   marketing    -> Marketing ............... sharing one form
 *   technical    -> Technical ............... sharing one form
 *
 * NOTE ON HISTORICAL DATA: registrations stored before this list was finalised
 * may carry older combined keys ("production and social media", "pr and
 * sponsership"). Those are intentionally NOT accepted any more, and existing log
 * rows are left exactly as submitted — the log is a record of what students
 * chose, not a live config mirror. Rewriting it would falsify history.
 *
 * A typical URL looks like:
 *   https://docs.google.com/forms/d/e/<FORM_ID>/viewform
 * The `/edit` variant works too; it just pre-fills for an owner.
 *
 * The frontend embeds these in an iframe and adds `embedded=true` itself, so do
 * not bake that parameter into the value stored here.
 *
 * Until each vertical has its own form, the remaining nine point at
 * PLACEHOLDER_FORM_URL so the embed works end to end during testing instead of
 * 404ing. `marketing` already has its own (MARKETING_FORM_URL).
 * ============================================================================
 *
 * SECURITY: this object is never serialised into an API response. The register
 * handler resolves exactly the two keys the student chose and returns only
 * those, so the other 8 form links are never reachable from the client.
 * `Object.freeze` prevents accidental runtime mutation.
 */
/**
 * The single real form currently wired up, used for the nine verticals that do
 * not yet have their own form, while the per-vertical forms are still being
 * created.
 *
 * The query string is deliberately absent: the frontend appends the embed flag
 * itself at render time (see toEmbedUrl in Step3Forms.tsx), so this stays the
 * canonical shareable link.
 *
 * Replace each value below with that vertical's own form, and delete this
 * constant once none of the ten still point at it.
 */
const PLACEHOLDER_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSesiqfpUgiyJwz1wNzGbCm0rqKj-ZcvV5_pOrVqnBNesbkHOw/viewform";

/** Marketing's own form — the first vertical split off the shared link. */
const MARKETING_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfLYBYfrdp1YUxes8kBkphm15sfu_Se6Z4_580eATUgr7EaMQ/viewform";

const VERTICAL_FORMS = Object.freeze({
  content: PLACEHOLDER_FORM_URL,
  creatives: PLACEHOLDER_FORM_URL,
  operations: PLACEHOLDER_FORM_URL,
  "social media": PLACEHOLDER_FORM_URL,
  design: PLACEHOLDER_FORM_URL,
  production: PLACEHOLDER_FORM_URL,
  pr: PLACEHOLDER_FORM_URL,
  sponsorship: PLACEHOLDER_FORM_URL,
  marketing: MARKETING_FORM_URL,
  technical: PLACEHOLDER_FORM_URL,
});

/** Immutable allowlist of valid vertical keys, in display order. */
const VERTICAL_KEYS = Object.freeze(Object.keys(VERTICAL_FORMS));

/**
 * Null-prototype set of valid vertical keys.
 *
 * Why not a plain object: `{ constructor: 1 }` inherits `Object.prototype`,
 * so a check like `if (allowlist[key])` would wrongly accept `"constructor"`
 * or `"toString"` as a valid vertical. A null-prototype map cannot be spoofed
 * by any key a client can send.
 */
const VERTICAL_LOOKUP = Object.freeze(VERTICAL_KEYS.reduce((acc, key) => {
  acc[key] = true;
  return acc;
}, Object.create(null)));

/**
 * Normalise user input to a canonical vertical key.
 * Accepts harmless sloppiness ("  Technical ", "PRODUCTION   AND SOCIAL MEDIA")
 * and returns the exact key used by VERTICAL_FORMS, or null if unrecognised.
 *
 * @param {unknown} value
 * @returns {string|null} canonical key, or null when invalid
 */
function normaliseVertical(value) {
  if (typeof value !== "string") return null;
  // Lowercase, collapse whitespace runs to single spaces, trim.
  const candidate = value.toLowerCase().replace(/\s+/g, " ").trim();
  return VERTICAL_LOOKUP[candidate] === true ? candidate : null;
}

module.exports = { VERTICAL_FORMS, VERTICAL_KEYS, VERTICAL_LOOKUP, normaliseVertical };
