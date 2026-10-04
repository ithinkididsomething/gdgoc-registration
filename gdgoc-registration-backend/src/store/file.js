"use strict";

const fs = require("fs/promises");
const path = require("path");
const { env } = require("../../config/env");
const { isNoSecondPriority } = require("../../config/verticals");
const {
  rollKey,
  alreadyRegisteredError,
  notRegisteredError,
  storeFullError,
  persistError,
} = require("./contract");

/**
 * Append-only registration store backed by a JSON file.
 *
 * Two concurrency concerns are handled here:
 *
 *  1. Read-modify-write races. Two simultaneous POSTs would both read `[]`,
 *     each push one record, and the second write would clobber the first. All
 *     writes are funnelled through a promise chain so they run one at a time.
 *
 *  2. Torn files. A crash or kill mid-write leaves a truncated file. Each write
 *     goes to a temp file which is then `rename`d over the target — rename is
 *     atomic within a filesystem, so readers only ever see a complete file.
 *
 * The same serialisation is what makes "one registration per roll number"
 * enforceable: the duplicate check and the append happen inside a single queued
 * task, so two requests for the same student arriving together cannot both
 * observe an empty slot and both write.
 *
 * READ THIS BEFORE TRUSTING IT: point 1 is a single-process guarantee. Two Node
 * processes — two containers, `pm2 cluster`, two serverless instances — each hold
 * their own `writeQueue`, and neither can see the other's. The duplicate check
 * would then be a read followed by a write with nothing holding them together,
 * and two simultaneous registrations for the same roll number would both
 * succeed. The test suite exercises concurrent requests against ONE process, so
 * it cannot catch that. This driver is correct for a single instance; for more,
 * move to a driver whose database enforces the constraint.
 */

/** Serialises all writes; each task waits for the previous one to settle. */
let writeQueue = Promise.resolve();

function enqueue(task) {
  const run = writeQueue.then(task, task);
  // Keep the chain alive regardless of individual task outcomes.
  writeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function readAll() {
  const raw = await fs.readFile(env.REGISTRATIONS_FILE, "utf8");
  // Tolerate a UTF-8 BOM. This file is meant to be hand-editable, and Notepad,
  // Excel and most Windows tooling will happily add one - which would otherwise
  // throw here and take down every registration and every export with it. Three
  // invisible bytes should not be able to stop the form working.
  const parsed = JSON.parse(raw.replace(/^﻿/, ""));
  if (!Array.isArray(parsed)) {
    throw new TypeError("registrations.json must contain a JSON array");
  }
  return parsed;
}

/**
 * Atomically replace the whole log.
 *
 * Shared by the append and the update path so both get identical torn-file
 * protection; the only difference between them is the array they hand over.
 *
 * @param {unknown[]} records
 */
async function writeAll(records) {
  const payload = `${JSON.stringify(records, null, 2)}\n`;
  const tempFile = path.join(
    env.DATA_DIR,
    `.registrations.${process.pid}.${Date.now()}.tmp`
  );

  try {
    await fs.mkdir(env.DATA_DIR, { recursive: true });
    await fs.writeFile(tempFile, payload, { encoding: "utf8", mode: 0o600 });
    await fs.rename(tempFile, env.REGISTRATIONS_FILE);
  } catch (error) {
    await fs.rm(tempFile, { force: true }).catch(() => {});
    throw persistError(error);
  }
}

/** Read the log, treating a missing file as empty. Never throws ENOENT. */
async function readAllOrEmpty() {
  try {
    return await readAll();
  } catch (error) {
    if (error.code !== "ENOENT") throw persistError(error);
    // Missing file: start a fresh log rather than failing the student's
    // submission. The directory is created on write anyway.
    return [];
  }
}

/** Current log size in bytes, or 0 when it does not exist yet. */
async function currentSize() {
  try {
    return (await fs.stat(env.REGISTRATIONS_FILE)).size;
  } catch {
    /* file may not exist yet */
    return 0;
  }
}

/**
 * Append one registration record.
 *
 * Refuses a roll number that already has a registration: a student gets one
 * response, and letting a second one through would double their allocation and
 * put two rows for the same person in the organisers' sheet.
 *
 * @param {object} record already-validated, already-sanitised fields
 * @returns {Promise<{record: object}>}
 * @throws {Error} 409 `alreadyRegistered` if this roll number is already in the log
 */
function appendRegistration(record) {
  return enqueue(async () => {
    const existing = await readAllOrEmpty();

    // Availability guard: refuse to grow the file without bound.
    if ((await currentSize()) > env.MAX_STORE_BYTES) {
      throw storeFullError();
    }

    const stored = Object.assign({}, record, {
      submittedAt: new Date().toISOString(),
    });

    // Checked here, inside the queued task, rather than by the route handler:
    // outside the queue two simultaneous POSTs would both read the log, both see
    // a free slot, and both write. Serialising makes check-then-write atomic.
    const key = rollKey(stored.rollNumber);
    if (existing.some((entry) => rollKey(entry?.rollNumber) === key)) {
      throw alreadyRegisteredError();
    }

    // Reassign the array with a new reference so nothing can mutate the parsed
    // buffer we are about to write, and so a rejected write leaves no side state.
    const next = existing.concat([stored]);
    await writeAll(next);

    return { record: stored };
  });
}

/**
 * The registration for a roll number, or null.
 *
 * Returns the EARLIEST match. The log may legitimately contain more than one row
 * for a roll number only if it predates the duplicate guard; when that happens
 * the first row is the authoritative one, because rewriting history would be
 * worse than tolerating it.
 *
 * @param {unknown} rollNumber
 * @returns {Promise<object|null>}
 */
async function findRegistration(rollNumber) {
  const key = rollKey(rollNumber);
  if (!key) return null;
  const records = await readAllRegistrations();
  const match = records.find((entry) => rollKey(entry?.rollNumber) === key);
  return match ?? null;
}

/**
 * Record that a student submitted one of their Google Forms.
 *
 * `stage` is 1 or 2, matching the two Priority forms. Called from the student
 * pressing "I have submitted this form" in the portal — the only completion
 * signal available, since a cross-origin Google Form cannot report its own
 * submission back to us.
 *
 * Idempotent: re-posting the same stage keeps the FIRST timestamp, so a double
 * tap or a retried request cannot rewrite when the student actually did it.
 *
 * @param {unknown} rollNumber
 * @param {1|2} stage
 * @returns {Promise<object>} the updated record
 * @throws {Error} 404 when the roll number has no registration
 */
function markFormCompleted(rollNumber, stage) {
  return enqueue(async () => {
    const records = await readAllOrEmpty();
    const key = rollKey(rollNumber);

    const index = records.findIndex((entry) => rollKey(entry?.rollNumber) === key);
    if (index === -1) {
      throw notRegisteredError();
    }

    const field = `priority${stage}CompletedAt`;
    const now = new Date().toISOString();
    const previous = records[index];
    // Keep the original timestamp if this stage was already marked.
    const updated = Object.assign({}, previous, {
      [field]: previous[field] || now,
    });
    const secondDone = updated.priority2CompletedAt || isNoSecondPriority(updated.priority2);
    if (updated.priority1CompletedAt && secondDone && !updated.formsCompletedAt) {
      updated.formsCompletedAt = now;
    }

    const next = records.slice();
    next[index] = updated;
    await writeAll(next);

    return updated;
  });
}

/** Wait for all pending writes to finish. Used by tests and graceful shutdown. */
function drain() {
  return writeQueue;
}

/**
 * Delete every registration. TEST SEAM ONLY - see the contract.
 *
 * Queued rather than written directly, so it cannot interleave with a real
 * append and leave the suite asserting against a store it just clobbered.
 */
async function reset() {
  await enqueue(async () => {
    await fs.mkdir(env.DATA_DIR, { recursive: true });
    await writeAll([]);
  });
}

/**
 * Read every stored record. Read-only - used by the CSV export route.
 *
 * Returns [] when the log does not exist yet, so a fresh install exports an
 * empty sheet rather than a 500.
 */
async function readAllRegistrations() {
  try {
    return await readAll();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    // Distinct message: readAllRegistrations feeds the export route, where
    // "could not persist the registration" would be actively misleading.
    throw persistError(error, "Could not read the registration log.");
  }
}

/** @type {import("./contract").StoreDriver} */
const fileStore = {
  name: "file",
  appendRegistration,
  readAllRegistrations,
  findRegistration,
  markFormCompleted,
  drain,
  reset,
};

module.exports = fileStore;
