"use strict";

const fs = require("fs/promises");
const { env } = require("../config/env");
const { stripControlChars, clamp } = require("./security");

/**
 * Student roster reader.
 *
 * SECURITY CONTRACT: the full roster never leaves this module. Callers get
 * either a single matched record or null. There is deliberately no exported
 * "list all students" function.
 */

/** @type {{ at: number, byRoll: Map<string, object> } | null} */
let cache = null;
/** De-duplicates concurrent cold reads so N parallel requests read once. */
let inflight = null;

/** Upper bound on a single field we will echo back to the client. */
const MAX_FIELD_LEN = 200;

/**
 * Roll-number shape: alphanumerics and hyphens only.
 *
 * This is the defence-in-depth layer against path traversal. Express decodes
 * `%2F` inside a route param, so `/api/lookup/..%2F..%2Fpackage.json` arrives
 * as the single value `../../package.json`. Rejecting `/`, `\`, `.` and null
 * bytes here means such a value can never reach the filesystem, even if the
 * call site is later refactored to do more with the input than a map lookup.
 */
const ROLL_NUMBER_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/;

/**
 * Project a raw dataset record down to the known, public student fields.
 * Explicit allowlist: an unexpected extra key in the dataset (or an injected
 * `_comment`) is dropped rather than forwarded.
 */
function toPublicStudent(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const str = (key) => {
    const value = raw[key];
    if (typeof value !== "string" && typeof value !== "number") return "";
    return clamp(stripControlChars(String(value)).trim(), MAX_FIELD_LEN);
  };

  const rollNumber = str("rollNumber");
  if (!rollNumber) return null;

  return {
    rollNumber,
    fullName: str("fullName"),
    branch: str("branch"),
    section: str("section"),
    yearOfStudy: str("yearOfStudy"),
    contactNumber: str("contactNumber"),
    gender: str("gender"),
    email: str("email"),
    linkedin: str("linkedin"),
    github: str("github"),
    instagram: str("instagram"),
    skills: str("skills"),
  };
}

async function loadRoster() {
  const raw = await fs.readFile(env.STUDENTS_FILE, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new TypeError("students.json must contain a JSON array");
  }

  const byRoll = new Map();
  for (const entry of parsed) {
    const student = toPublicStudent(entry);
    if (student) byRoll.set(student.rollNumber.toLowerCase(), student);
  }
  return byRoll;
}

/** Read the roster through a short-TTL cache, tolerating a bad/missing file. */
async function getRoster() {
  const now = Date.now();
  if (cache && now - cache.at < env.STUDENTS_CACHE_TTL_MS) return cache.byRoll;
  if (inflight) return inflight;

  inflight = loadRoster()
    .then((byRoll) => {
      cache = { at: Date.now(), byRoll };
      return byRoll;
    })
    .catch((error) => {
      // A missing or malformed roster must not take the API down. An empty
      // roster degrades to "no match", and the reason is logged server-side.
      console.error(
        `[students] could not load ${env.STUDENTS_FILE}:`,
        error.code || error.name,
        "-",
        error.message
      );
      cache = { at: Date.now(), byRoll: new Map() };
      return cache.byRoll;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

/**
 * Find one student by roll number, case-insensitively.
 *
 * @param {unknown} rollNumber
 * @returns {Promise<object|null>} the single matching record, or null
 * @throws {Error} status 400 when the roll number is malformed
 */
async function findStudentByRollNumber(rollNumber) {
  if (typeof rollNumber !== "string") return null;
  const key = stripControlChars(rollNumber).trim().toLowerCase();
  if (!key) return null;

  // Reject traversal-shaped or otherwise malformed input outright.
  if (!ROLL_NUMBER_RE.test(key)) {
    throw Object.assign(new Error("rollNumber is not a valid roll number"), {
      status: 400,
      expose: true,
    });
  }

  const roster = await getRoster();
  return roster.get(key) ?? null;
}

/** Drop the cache — used by tests and after a manual dataset swap. */
function invalidateCache() {
  cache = null;
}

module.exports = { findStudentByRollNumber, invalidateCache };
