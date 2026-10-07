"use strict";

/**
 * The registration store contract.
 *
 * Everything the app knows about persistence lives here and nowhere else. `app.js`
 * imports a driver, never a file format: it does not know whether a registration
 * lives in a JSON file or in Firestore, and it must not be allowed to find out.
 *
 * WHY THIS IS A SEPARATE FILE: the point of the seam is that swapping the
 * storage engine is a change to ONE directory. If `app.js` reached for `fs` or
 * for the Firestore SDK directly, every future storage change would be a diff
 * across the whole codebase, and the routes would grow storage-specific branches
 * that nobody tests.
 *
 * THE TWO ENGINES, AND WHY THEY DIFFER WHERE THEY DIFFER:
 *
 *  - `file` (`./file`) — a JSON array on local disk. Needs a persistent volume,
 *    needs a write queue, and needs a size cap. Simple, greppable, and the right
 *    answer for a laptop or a single VM.
 *
 *  - Firestore (planned) — one document per registration. Needs no volume, so the
 *    backend can run serverless. It also needs no write queue: the duplicate
 *    check and the insert happen inside a database transaction, which is enforced
 *    across every process instead of only within one. That is a genuine
 *    improvement, not a port.
 *
 * Note the asymmetry that matters: the file driver's serialisation only protects
 * a SINGLE PROCESS. Two instances on one host, or two serverless containers, and
 * the in-process queue protects nothing while two simultaneous registrations for
 * the same roll number both succeed. Do not treat "the tests pass" as evidence
 * that the file driver is safe at scale — the tests run against one process.
 */

/**
 * Roll numbers are compared case-insensitively and with whitespace collapsed.
 *
 * A student typing "de25234" must not be able to register a second time
 * alongside "DE25234", so the identity used for the uniqueness check cannot be
 * the raw stored string. This mirrors how students.js normalises a lookup key.
 *
 * It is also a valid Firestore document ID as it stands, which is why the
 * Firestore driver can use it verbatim instead of inventing a second key scheme.
 * That means it must strip `/` and `..` — Firestore rejects document IDs
 * containing path separators or traversal segments, and the file driver's
 * tolerance for them (an array find that simply misses) must not become a
 * Firestore INVALID_ARGUMENT.
 *
 * @param {unknown} value
 * @returns {string}
 */
function rollKey(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\//g, "-")
    .replace(/\.{2,}/g, ".");
}

/** Raised when a roll number already has a registration. Carries a 409. */
function alreadyRegisteredError() {
  return Object.assign(
    new Error("This roll number has already been registered."),
    { status: 409, expose: true, code: "alreadyRegistered" }
  );
}

/** Raised when a completion is recorded for a roll number that never registered. */
function notRegisteredError() {
  return Object.assign(new Error("No registration found for that roll number."), {
    status: 404,
    expose: true,
    code: "notRegistered",
  });
}

/** Raised when the store is at capacity. Carries a 503. */
function storeFullError() {
  return Object.assign(
    new Error("Registration storage is full. Please contact the organisers."),
    { status: 503, expose: true }
  );
}

/** Wrap an unexpected driver failure as a 500 the error handler will expose. */
function persistError(error, message = "Could not persist the registration.") {
  return Object.assign(new Error(message), { status: 500, expose: true, cause: error });
}

/**
 * @typedef {object} StoreDriver
 *
 * @property {(record: object) => Promise<{record: object}>} appendRegistration
 *   Store one validated registration, resolving with the stored record.
 *   MUST reject with `alreadyRegisteredError()` if the roll number is taken, and
 *   MUST do the check and the insert atomically — within one process for a file
 *   driver, in one indivisible operation for a database driver.
 *
 *   That does not have to be a transaction. An exists=false precondition is
 *   evaluated server-side as part of the write itself, so it satisfies this
 *   while costing no reads at all. Prefer it: reads and writes are metered
 *   against separate quotas, and a driver that must read before it may write
 *   stops accepting registrations the moment the read quota is spent — which
 *   is not a limit the student used.
 *
 *   Deliberately no record count in the return value. The file driver could
 *   report the array length for free; a database driver would need a second
 *   query to match. Nothing read it, so requiring it would tax every future
 *   engine to satisfy a field nobody used.
 *
 * @property {(rollNumber: unknown) => Promise<object|null>} findRegistration
 *   The registration for a roll number, or null. MUST be case- and
 *   whitespace-insensitive via `rollKey`. When a store legitimately holds more
 *   than one row for a roll number, MUST return the EARLIEST: rewriting history
 *   is worse than tolerating it.
 *
 * @property {(rollNumber: unknown, stage: 1|2) => Promise<object>} markFormCompleted
 *   Record that a student submitted one of their Google Forms. MUST be
 *   idempotent, keeping the FIRST timestamp for a stage, so a double tap cannot
 *   rewrite when the student actually did it. MUST reject with
 *   `notRegisteredError()` for an unknown roll number.
 *
 * @property {() => Promise<object[]>} readAllRegistrations
 *   Every stored record, OLDEST FIRST. Read-only; feeds the CSV export.
 *   MUST resolve to [] on an empty store rather than throwing.
 *   Order is load-bearing, not cosmetic: the organisers read the exported sheet
 *   in submission order, so a driver that returns arbitrary order silently
 *   reorders their spreadsheet.
 *
 *   Records MUST keep the shape the CSV exporter expects — see the note on
 *   native database types in `src/registrations-csv.js`. In short: timestamps
 *   as ISO strings, never as database-native objects.
 *
 * @property {() => Promise<void>} drain
 *   Wait for all pending writes. Used by graceful shutdown and by tests. A
 *   database driver with no local queue resolves immediately — the interface is
 *   honest about that rather than pretending to queue.
 *
 * @property {() => Promise<void>} [reset]
 *   Delete everything. TEST SEAM ONLY, never called by the app: it exists so the
 *   shared contract suite can start each assertion from a known-empty store on
 *   any engine. A driver without one cannot join the contract suite.
 *
 * @property {string} name
 *   Driver name, for startup logging and error messages.
 */

/** Every method the app relies on. A driver missing any of these is a bug. */
const REQUIRED_METHODS = [
  "appendRegistration",
  "findRegistration",
  "markFormCompleted",
  "readAllRegistrations",
  "drain",
];

/**
 * Fail loudly at startup rather than mysteriously on the first registration.
 *
 * @param {unknown} driver
 * @param {string} label
 * @returns {StoreDriver}
 */
function assertStoreDriver(driver, label) {
  if (!driver || typeof driver !== "object") {
    throw new TypeError(`${label} did not return a store driver.`);
  }
  for (const method of REQUIRED_METHODS) {
    if (typeof driver[method] !== "function") {
      throw new TypeError(`${label} is missing required store method: ${method}()`);
    }
  }
  return driver;
}

module.exports = {
  rollKey,
  alreadyRegisteredError,
  notRegisteredError,
  storeFullError,
  persistError,
  assertStoreDriver,
  REQUIRED_METHODS,
};
