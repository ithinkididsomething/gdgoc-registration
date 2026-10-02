"use strict";

const { env } = require("../../config/env");
const { rollKey, alreadyRegisteredError, notRegisteredError, assertStoreDriver } = require("./contract");

/**
 * Where registrations are stored. One place, chosen once.
 *
 * `REGISTRATION_STORE=file` is the default and needs no configuration: a JSON
 * array under `DATA_DIR`. `REGISTRATION_STORE=firestore` is planned and will
 * select a Firestore driver here. Adding a driver means adding a line to
 * DRIVERS and nothing else — no route, no test, and no CSV export changes,
 * because none of them know which engine they are talking to.
 *
 * The value is read from `env`, which snapshots `process.env` at require time.
 * Tests set `DATA_DIR` before the first require, which is why that works; the
 * same discipline applies to `REGISTRATION_STORE`.
 */

const DRIVERS = {
  file: () => require("./file"),
  // Lazy require: this is what keeps firebase-admin off the startup path of a
  // deployment that never selects it.
  firestore: () => require("./firestore"),
};

/** Cached so the driver is constructed once, and `drain()` stays meaningful. */
let instance = null;

/**
 * The active store driver.
 *
 * Built lazily rather than at require time so that a misconfigured or
 * unavailable engine cannot break `require`ing the app — the failure surfaces on
 * the first real operation, with the driver's own error, instead of as an
 * import-time crash somewhere unrelated.
 *
 * @returns {import("./contract").StoreDriver}
 */
function getStore() {
  if (instance) return instance;

  const name = env.REGISTRATION_STORE;
  const load = DRIVERS[name];
  if (!load) {
    throw new Error(
      `Unknown REGISTRATION_STORE "${name}". Expected one of: ${Object.keys(DRIVERS).join(", ")}.`
    );
  }

  instance = assertStoreDriver(load(), `REGISTRATION_STORE=${name}`);
  return instance;
}

/**
 * Test seam: forget the cached driver.
 *
 * Needed only when a test changes `REGISTRATION_STORE` after something has
 * already called `getStore()`. Exported for that reason and no other.
 */
function resetStore() {
  instance = null;
}

/**
 * Wait for all pending writes. Used by graceful shutdown and by tests.
 *
 * Delegates to the active driver so a file store's queue is honoured, and
 * resolves immediately for a driver that has nothing to flush.
 */
function drain() {
  return instance ? instance.drain() : Promise.resolve();
}

module.exports = {
  getStore,
  resetStore,
  drain,
  // Re-exported so callers get roll identity and the two domain errors from one
  // module, instead of reaching into the contract and the driver separately.
  rollKey,
  alreadyRegisteredError,
  notRegisteredError,
};
