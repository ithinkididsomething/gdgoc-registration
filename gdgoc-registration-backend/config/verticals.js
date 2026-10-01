"use strict";

/**
 * Canonical map of the 8 GDGoC verticals to their Google Form URLs.
 *
 * ============================================================================
 * TO GO LIVE: replace each `https://forms.google.com/placeholder-*` value below
 * with the real form URL for that vertical. Nothing else needs to change — the
 * keys are the contract with the frontend and must not be renamed.
 *
 *   content                   -> Content .................. placeholder-content
 *   creatives                 -> Creatives ................ placeholder-creatives
 *   production and social media-> Production and Social .... placeholder-prod-social
 *   marketing                 -> Marketing ................ placeholder-marketing
 *   pr and sponsership        -> PR and Sponsorship ....... placeholder-pr-sponsorship
 *   technical                 -> Technical ................ placeholder-technical
 *   design                    -> Design ................... placeholder-design
 *   operations                -> Operations ............... placeholder-operations
 *
 * A typical URL looks like:
 *   https://docs.google.com/forms/d/e/<FORM_ID>/viewform
 * The `/edit` variant works too; it just pre-fills for an owner.
 *
 * Until these are real, the returned links land on a Google 404. That is
 * intentional and makes it obvious during testing that the link pipeline works
 * end to end while still being obvious that the URL is not filled in yet.
 * ============================================================================
 *
 * SECURITY: this object is never serialised into an API response. The register
 * handler resolves exactly the two keys the student chose and returns only
 * those, so the other 6 form links are never reachable from the client.
 * `Object.freeze` prevents accidental runtime mutation.
 */
const VERTICAL_FORMS = Object.freeze({
  content: "https://forms.google.com/placeholder-content",
  creatives: "https://forms.google.com/placeholder-creatives",
  "production and social media": "https://forms.google.com/placeholder-prod-social",
  marketing: "https://forms.google.com/placeholder-marketing",
  "pr and sponsership": "https://forms.google.com/placeholder-pr-sponsorship",
  technical: "https://forms.google.com/placeholder-technical",
  design: "https://forms.google.com/placeholder-design",
  operations: "https://forms.google.com/placeholder-operations",
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
