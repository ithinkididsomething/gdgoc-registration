"use strict";

/**
 * The 10 GDGoC verticals: display order, key allowlist, and form resolution.
 *
 * ============================================================================
 * SECURITY: THE FORM URLS ARE NOT IN THIS FILE, AND MUST NEVER BE.
 * ============================================================================
 *
 * A Google Form response link is a bearer credential - anyone who has it can
 * submit to that form. This file used to hardcode all ten links. The repository
 * is PUBLIC, so from the moment that was pushed, every link was readable by
 * anyone, and by any AI with web access, via a single GitHub fetch. Removing the
 * constants now does NOT undo the exposure: they remain in git history
 * permanently, retrievable with `git show <commit>:config/verticals.js`.
 *
 * Therefore the URLs now live ONLY in the deployment environment:
 *
 *   VERTICAL_FORM_URLS={"content":"https://docs.google.com/forms/d/e/.../viewform", ...}
 *
 * Resolution order (first match wins per key):
 *   1. VERTICAL_FORM_URLS env var        - production, the only place it should be
 *   2. config/verticals.local.js         - gitignored local dev override
 *   3. the synthetic DEV_PLACEHOLDER map  - tests and dev, obviously-fake links
 *
 * What deliberately STAYS in this repo is the list of KEYS. They are labels
 * ("technical"), not access, so they are safe to commit and must stay
 * byte-identical to src/config/verticals.ts on the frontend - that pairing is
 * the contract, and frontend/scripts/assert-verticals-match.mjs enforces it.
 *
 * TO GO LIVE: put the ten real URLs in the deployment env. Nothing else changes.
 * ============================================================================
 *
 * NOTE ON HISTORICAL DATA: registrations stored before this list was finalised
 * may carry older combined keys ("production and social media", "pr and
 * sponsership"). Those are intentionally NOT accepted any more, and existing log
 * rows are left exactly as submitted - the log is a record of what students
 * chose, not a live config mirror. Rewriting it would falsify history.
 *
 * The frontend embeds these in an iframe and adds `embedded=true` itself, so do
 * not bake that parameter into a stored value.
 *
 * SECURITY: the resolved map is never serialised wholesale into an API response.
 * The register handler resolves exactly the two keys the student chose and
 * returns only those, so the other 8 form links are never reachable from the
 * client.
 */

const { env } = require("./env");

/**
 * Immutable allowlist of valid vertical keys, in display order.
 *
 * These are the stable, public-facing identifiers. Keeping them hardcoded is
 * deliberate: the list is the API contract, so it must not silently change
 * shape because an env var was mistyped.
 */
const VERTICAL_KEYS = Object.freeze([
  "content",
  "creatives",
  "operations",
  "social media",
  "design",
  "production",
  "pr",
  "sponsorship",
  "marketing",
  "technical",
]);

/**
 * Synthetic links used only when nothing else supplies a URL (dev + tests).
 *
 * They are deliberately fake but structurally real: correct host, valid URL,
 * no `embedded=` flag. That keeps the config-invariant tests meaningful (they
 * assert host and flag shape, not that the form exists) while guaranteeing a
 * real form ID can never reappear in this file by accident.
 */
const DEV_PLACEHOLDER_FORM_URL =
  "https://docs.google.com/forms/d/e/dev-ONLY-replace-with-real-form-id/viewform";

const DEV_PLACEHOLDER_FORMS = Object.freeze(
  VERTICAL_KEYS.reduce((acc, key) => {
    acc[key] = DEV_PLACEHOLDER_FORM_URL;
    return acc;
  }, Object.create(null))
);

/**
 * Optional gitignored local override, so a developer can hit a real form
 * without exporting a 700-character env var in every shell.
 * Expected shape: { "technical": "https://docs.google.com/forms/d/e/.../viewform" }
 */
function readLocalOverride() {
  try {
    const local = require("./verticals.local");
    return local && typeof local === "object" ? local : Object.create(null);
  } catch {
    // Absent file is the normal case, not an error.
    return Object.create(null);
  }
}

/** True only for the URLs Google actually serves forms from. */
function isGoogleFormUrl(value) {
  if (typeof value !== "string" || !value) return false;
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "docs.google.com" || host === "forms.google.com";
  } catch {
    return false;
  }
}

/**
 * Resolve the final key -> URL map, failing closed in production.
 *
 * A vertical with no URL is a broken iframe handed to a real student, so in
 * production an incomplete map aborts startup rather than failing quietly at
 * the one moment a student is waiting. Dev and test fall back to the synthetic
 * placeholders, which is why `npm test` works on a fresh clone.
 */
function resolveVerticalForms() {
  const local = readLocalOverride();
  const resolved = Object.create(null);

  for (const key of VERTICAL_KEYS) {
    const configured = env.VERTICAL_FORM_URLS[key] ?? local[key];

    if (configured !== undefined) {
      // Configured explicitly, so it has to be valid. env.js already rejected bad
      // hosts and embedded= flags; a local override bypasses that, so re-check.
      if (!isGoogleFormUrl(configured)) {
        throw new Error(
          `The form URL configured for vertical "${key}" is not a Google Forms URL. ` +
            "Expected https://docs.google.com/forms/d/e/<FORM_ID>/viewform."
        );
      }
      resolved[key] = configured;
      continue;
    }

    // Unconfigured. In production this is fatal; in dev/test it falls back to
    // the synthetic placeholder. NOTE the placeholder must NOT be applied in
    // production - doing so would silently hand a student a dead iframe, which
    // is the exact failure the fail-closed check exists to prevent.
    if (!env.IS_PRODUCTION) resolved[key] = DEV_PLACEHOLDER_FORMS[key];
  }

  const missing = VERTICAL_KEYS.filter((key) => !resolved[key]);

  if (missing.length > 0 && env.IS_PRODUCTION) {
    throw new Error(
      `VERTICAL_FORM_URLS is missing ${missing.length} vertical(s): ${missing.join(", ")}. ` +
        "Every vertical needs a real https://docs.google.com/forms/d/e/<FORM_ID>/viewform " +
        "URL in production, otherwise students get a broken form. Fix the env var on the " +
        "deployment host; the URLs are intentionally absent from the repository."
    );
  }

  if (missing.length > 0) {
    // Dev/test only. No URL is printed, so this cannot leak a real link.
    console.warn(
      `[verticals] Using synthetic dev placeholders for: ${missing.join(", ")}. ` +
        "Set VERTICAL_FORM_URLS or config/verticals.local.js for real forms."
    );
  }

  return Object.freeze(resolved);
}

const VERTICAL_FORMS = resolveVerticalForms();

/**
 * Null-prototype set of valid vertical keys.
 *
 * Why not a plain object: `{ constructor: 1 }` inherits `Object.prototype`, so a
 * check like `if (allowlist[key])` would wrongly accept `"constructor"` or
 * `"toString"` as a valid vertical. A null-prototype map cannot be spoofed by any
 * key a client can send.
 */
const VERTICAL_LOOKUP = Object.freeze(
  VERTICAL_KEYS.reduce((acc, key) => {
    acc[key] = true;
    return acc;
  }, Object.create(null))
);

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
  const candidate = value.toLowerCase().replace(/\s+/g, " ").trim();
  return VERTICAL_LOOKUP[candidate] === true ? candidate : null;
}

/**
 * The stored value for "I do not want a second vertical".
 *
 * NOT a vertical key, so it can never collide with one and can never resolve to a
 * form URL - `normaliseVertical` rejects it and `VERTICAL_FORMS["None"]` is
 * undefined by construction rather than by a check someone has to remember.
 *
 * The literal text is what lands in the `priority2` column of the CSV export, so
 * it is deliberately explicit rather than an empty cell: an organiser reading
 * the sheet sees why there is no second preference without needing a legend.
 */
const NO_SECOND_PRIORITY = "None";

/** True for the stored "None" marker, case-insensitively. */
function isNoSecondPriority(value) {
  return typeof value === "string" && value.trim().toLowerCase() === NO_SECOND_PRIORITY.toLowerCase();
}

module.exports = {
  VERTICAL_FORMS,
  VERTICAL_KEYS,
  VERTICAL_LOOKUP,
  NO_SECOND_PRIORITY,
  isNoSecondPriority,
  normaliseVertical,
};