"use strict";

const { normaliseVertical, VERTICAL_KEYS } = require("../config/verticals");
const { collapseWhitespace, stripControlChars, clamp, safeHttpUrl } = require("./security");

/**
 * Payload validation for POST /api/register.
 *
 * Strategy: allowlist, then normalise, then validate. Nothing from the client
 * is trusted or passed through — the returned record is built field by field,
 * so unknown keys (and any prototype-pollution attempt) are dropped by
 * construction rather than by filtering.
 */

const GENDERS = Object.freeze([
  "Female",
  "Male",
  "Non-binary",
  "Prefer not to say",
]);

const YEARS_OF_STUDY = Object.freeze([
  "1st Year",
  "2nd Year",
  "3rd Year",
  "4th Year",
]);

const LIMITS = Object.freeze({
  rollNumber: 32,
  fullName: 100,
  branch: 80,
  section: 8,
  yearOfStudy: 16,
  contactNumber: 20,
  email: 254,
  social: 120,
  skills: 500,
  // Free-text note to the team. Required, and capped so one very long answer
  // cannot bloat the JSON store or the CSV cell.
  teamMessage: 500,
});

/** Accepts 26I9014, 26-i-1143, etc. Rejects path chars, quotes, spaces. */
const ROLL_NUMBER_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/;
/** Permissive on purpose: rejects newlines, control chars, and absurd lengths. */
const CONTACT_RE = /^\+?[0-9][0-9\s()-]{5,18}[0-9]$/;
const EMAIL_RE = /^[^\s@,;<>()[\]\\]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
/** Instagram handles: @word.word, or a full profile URL. */
const INSTAGRAM_RE = /^(?:@[A-Za-z0-9._]{1,30}|https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9._/]{1,60}\/?)$/;

class ValidationError extends Error {
  /** @param {Record<string,string>} fields */
  constructor(fields) {
    super("Validation failed");
    this.name = "ValidationError";
    this.status = 400;
    this.expose = true;
    this.fields = fields;
  }
}

/** @returns {string} trimmed, control-char-free, whitespace-collapsed text */
function text(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return "";
  return collapseWhitespace(stripControlChars(value));
}

function required(value, field, errors, limit) {
  if (!value) {
    errors[field] = `${field} is required`;
    return "";
  }
  if (value.length > limit) {
    errors[field] = `${field} must be ${limit} characters or fewer`;
    return value.slice(0, limit);
  }
  return value;
}

function optional(value, field, errors, limit, validate) {
  if (!value) return "";
  if (value.length > limit) {
    errors[field] = `${field} must be ${limit} characters or fewer`;
    return value.slice(0, limit);
  }
  if (validate && !validate(value)) {
    errors[field] = `${field} is not a valid value`;
    return "";
  }
  return value;
}

/**
 * Values students type to mean "I don't have one of these".
 * The registration form advertises "or NA", so the API has to agree.
 */
const NONE_TOKENS = new Set([
  "na",
  "n/a",
  "n.a.",
  "na.",
  "none",
  "nil",
  "not available",
  "notapplicable",
  "-",
  "--",
]);

/** @param {string} value @returns {boolean} */
function isNoneToken(value) {
  return NONE_TOKENS.has(value.toLowerCase().replace(/\s+/g, " ").trim());
}

/**
 * Validate a social profile field.
 *
 * Accepts a real http(s) URL, an Instagram handle, or an explicit "none"
 * token (which is stored as an empty string). Rejects everything else —
 * notably `javascript:`, `data:`, and credential-bearing URLs, which would
 * otherwise be stored and later rendered as live clickable links.
 *
 * @param {unknown} rawValue
 * @param {string} field
 * @param {Record<string,string>} errors
 * @param {{required: boolean}} options
 * @returns {string} the value to store
 */
function parseSocial(rawValue, field, errors, { required }) {
  const value = text(rawValue);

  if (!value) {
    if (required) errors[field] = `${field} is required (enter a profile URL or "NA")`;
    return "";
  }
  if (value.length > LIMITS.social) {
    errors[field] = `${field} must be ${LIMITS.social} characters or fewer`;
    return value.slice(0, LIMITS.social);
  }

  // Explicit "I don't have one" — accepted and stored as empty.
  if (isNoneToken(value)) return "";

  if (field === "instagram" && INSTAGRAM_RE.test(value)) return value;

  const url = safeHttpUrl(value);
  if (url === null) {
    errors[field] = `${field} must be a valid URL, an @handle, or "NA"`;
    return "";
  }
  return url;
}

/**
 * Validate and sanitise a registration payload.
 *
 * @param {unknown} body parsed JSON request body
 * @returns {{record: object, priority1: string, priority2: string}}
 * @throws {ValidationError} with a per-field message map
 */
function validateRegistration(body) {
  const errors = {};
  const src = body && typeof body === "object" && !Array.isArray(body) ? body : {};

  // --- Identity -----------------------------------------------------------
  // Canonicalised to UPPERCASE here, once, so the stored log and the CSV the
  // organisers read never disagree with the roster: `26B1140`, never `26b1140`
  // or `26B1140 `. Whitespace is already collapsed by `text()`.
  //
  // Duplicate detection is unaffected — it compares a lowercased key, so a row
  // written before this change still matches a mixed-case submission instead of
  // slipping past as a "different" student.
  const rollNumber = required(text(src.rollNumber), "rollNumber", errors, LIMITS.rollNumber).toUpperCase();
  if (rollNumber && !ROLL_NUMBER_RE.test(rollNumber)) {
    errors.rollNumber = "rollNumber may only contain letters, digits and hyphens";
  }

  const fullName = required(text(src.fullName), "fullName", errors, LIMITS.fullName);
  if (fullName && fullName.length < 2) {
    errors.fullName = "fullName looks too short";
  }

  // --- Academic -----------------------------------------------------------
  const branch = required(text(src.branch), "branch", errors, LIMITS.branch);
  const section = optional(text(src.section), "section", errors, LIMITS.section);

  const yearOfStudy = required(text(src.yearOfStudy), "yearOfStudy", errors, LIMITS.yearOfStudy);
  if (yearOfStudy && !YEARS_OF_STUDY.includes(yearOfStudy)) {
    errors.yearOfStudy = `yearOfStudy must be one of: ${YEARS_OF_STUDY.join(", ")}`;
  }

  // --- Contact ------------------------------------------------------------
  const contactNumber = required(
    text(src.contactNumber),
    "contactNumber",
    errors,
    LIMITS.contactNumber
  );
  if (contactNumber && !CONTACT_RE.test(contactNumber)) {
    errors.contactNumber = "contactNumber is not a valid phone number";
  }

  const email = required(text(src.email).toLowerCase(), "email", errors, LIMITS.email);
  if (email && !EMAIL_RE.test(email)) {
    errors.email = "email is not a valid email address";
  }

  const gender = required(text(src.gender), "gender", errors, LIMITS.social);
  if (gender && !GENDERS.includes(gender)) {
    errors.gender = `gender must be one of: ${GENDERS.join(", ")}`;
  }

  // --- Socials ------------------------------------------------------------
  // LinkedIn is a required field on the form, but the form explicitly offers
  // "or NA" as the escape hatch for students who have no profile. Without
  // honouring that, every such student gets a hard 400 and can never register.
  const linkedin = parseSocial(src.linkedin, "linkedin", errors, { required: true });
  const github = parseSocial(src.github, "github", errors, { required: false });
  const instagram = parseSocial(src.instagram, "instagram", errors, { required: false });

  // --- Preferences --------------------------------------------------------
  // This is the security-critical pair. `normaliseVertical` is an allowlist
  // check against a null-prototype map, so values like "constructor",
  // "toString" or "__proto__" return null and are rejected — they can never
  // reach VERTICAL_FORMS and resolve to an inherited function.
  const priority1 = normaliseVertical(src.priority1);
  const priority2 = normaliseVertical(src.priority2);

  if (!priority1) {
    errors.priority1 = `priority1 must be one of: ${VERTICAL_KEYS.join(", ")}`;
  }
  if (!priority2) {
    errors.priority2 = `priority2 must be one of: ${VERTICAL_KEYS.join(", ")}`;
  }
  if (priority1 && priority2 && priority1 === priority2) {
    errors.priority2 = "priority2 must be different from priority1";
  }

  // --- Team note ----------------------------------------------------------
  // Required. Enforced here and not only in the UI, because the client check is
  // trivially bypassable — the browser is not the thing that decides what gets
  // stored. `text()` collapses whitespace first, so a box holding only spaces
  // arrives here as "" and fails the same way an empty one does.
  const teamMessage = required(
    text(src.teamMessage),
    "teamMessage",
    errors,
    LIMITS.teamMessage
  );

  if (Object.keys(errors).length > 0) throw new ValidationError(errors);

  // Explicit allowlist of stored fields — nothing else is persisted.
  const record = {
    rollNumber,
    fullName,
    branch,
    section,
    yearOfStudy,
    contactNumber,
    gender,
    email,
    linkedin,
    github,
    instagram,
    skills: clamp(text(src.skills), LIMITS.skills),
    teamMessage,
  };

  return { record, priority1, priority2 };
}

module.exports = { validateRegistration, ValidationError };
