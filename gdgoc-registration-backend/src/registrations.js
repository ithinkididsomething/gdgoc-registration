"use strict";

const fs = require("fs/promises");
const path = require("path");
const { env } = require("../config/env");

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

function serialiseError(error, message = "Could not persist the registration.") {
  return Object.assign(new Error(message), {
    status: 500,
    expose: true,
    cause: error,
  });
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
 * Append one registration record.
 *
 * @param {object} record already-validated, already-sanitised fields
 * @returns {Promise<{record: object, total: number}>}
 */
function appendRegistration(record) {
  return enqueue(async () => {
    let existing;
    try {
      existing = await readAll();
    } catch (error) {
      if (error.code !== "ENOENT") throw serialiseError(error);
      // Missing file: start a fresh log rather than failing the student's
      // submission. The directory is created below anyway.
      existing = [];
    }

    // Availability guard: refuse to grow the file without bound.
    let currentBytes = 0;
    try {
      currentBytes = (await fs.stat(env.REGISTRATIONS_FILE)).size;
    } catch {
      /* file may not exist yet */
    }
    if (currentBytes > env.MAX_STORE_BYTES) {
      throw Object.assign(
        new Error("Registration storage is full. Please contact the organisers."),
        { status: 503, expose: true }
      );
    }

    const stored = Object.assign({}, record, {
      submittedAt: new Date().toISOString(),
    });

    // Reassign the array with a new reference so nothing can mutate the parsed
    // buffer we are about to write, and so a rejected write leaves no side state.
    const next = existing.concat([stored]);
    const payload = `${JSON.stringify(next, null, 2)}\n`;

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
      throw serialiseError(error);
    }

    return { record: stored, total: next.length };
  });
}

/** Wait for all pending writes to finish. Used by tests and graceful shutdown. */
function drain() {
  return writeQueue;
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
    throw serialiseError(error, "Could not read the registration log.");
  }
}

module.exports = { appendRegistration, readAllRegistrations, drain };
