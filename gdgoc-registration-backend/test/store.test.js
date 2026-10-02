"use strict";

/**
 * Tests for the store seam itself.
 *
 * The rest of the suite proves the FILE driver behaves. These prove the seam is
 * real — that a second driver can be dropped in and selected without any route,
 * validation or export code being aware of it. That is the property the Firestore
 * port depends on, and it is the property that silently rots: a "harmless"
 * refactor that reaches for `fs` inside a route would still pass every other test
 * in this repository.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");

// Point env at a temp dir before config/env is required, same as api.test.js.
process.env.DATA_DIR = path.join(os.tmpdir(), `gdgoc-store-test-${process.pid}`);
process.env.NODE_ENV = "test";

// Production defaults to the firestore driver. This file is about the seam and
// about the file driver specifically, so it asks for `file` rather than
// inheriting the default - otherwise the assertions below would be describing
// the cloud driver while running against a temp JSON file, which is how a test
// suite ends up green for the wrong reason.
process.env.REGISTRATION_STORE = "file";

const { getStore, resetStore, drain, rollKey } = require("../src/store");
const { assertStoreDriver, REQUIRED_METHODS } = require("../src/store/contract");
const { spawnSync } = require("node:child_process");

test("store: the default driver implements the whole contract", () => {
  const store = getStore();
  assert.equal(store.name, "file");
  for (const method of REQUIRED_METHODS) {
    assert.equal(typeof store[method], "function", `missing ${method}()`);
  }
});

test("store: the driver is constructed once and reused", () => {
  // drain() and the in-flight write queue are only coherent if every caller
  // shares one driver. A driver rebuilt per request would hand out a fresh empty
  // queue each time and quietly break shutdown flushing.
  assert.equal(getStore(), getStore());
});

test("store: drain() resolves before any driver has been built", async () => {
  // server.js calls drain() from shutdown, including on a boot where no request
  // ever arrived and nothing was ever persisted. That must resolve, not throw —
  // otherwise Ctrl-C on an idle server exits non-zero.
  resetStore();
  await drain();

  // Rebuild for any later test in this file.
  assert.ok(getStore());
});

test("store: assertStoreDriver names the method a driver is missing", () => {
  const broken = { name: "broken" };
  assert.throws(
    () => assertStoreDriver(broken, "REGISTRATION_STORE=broken"),
    /missing required store method: appendRegistration\(\)/
  );

  assert.throws(
    () => assertStoreDriver(null, "REGISTRATION_STORE=broken"),
    /did not return a store driver/
  );

  // A driver that implements everything passes through untouched.
  const complete = Object.fromEntries(REQUIRED_METHODS.map((m) => [m, () => {}]));
  complete.name = "stub";
  assert.equal(assertStoreDriver(complete, "stub"), complete);
});

test("store: rollKey collapses case and whitespace so identity is stable", () => {
  assert.equal(rollKey("26B1140"), "26b1140");
  assert.equal(rollKey("  de 25234  "), "de 25234");
  assert.equal(rollKey("26B1140"), rollKey(" 26b1140 "));
  // Junk must not throw — this runs on unvalidated user input.
  assert.equal(rollKey(null), "");
  assert.equal(rollKey(undefined), "");
  assert.equal(rollKey(26), "26");
});

test("store: an unknown REGISTRATION_STORE fails loudly, listing the options", () => {
  // A typo'd env var would otherwise sit undetected until the first student hit
  // submit. This asserts the failure names the valid values, because that
  // message is what whoever is deploying at 11pm will actually read.
  const result = spawnSync(
    process.execPath,
    ["-e", 'require("./src/store").getStore();'],
    {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8",
      env: { ...process.env, REGISTRATION_STORE: "firestroe" },
    }
  );

  assert.notEqual(result.status, 0, "an unknown store name should not start");
  const output = `${result.stdout}${result.stderr}`;
  assert.match(output, /Unknown REGISTRATION_STORE "firestroe"/);
  assert.match(output, /Expected one of: file/);
});

test("store: REGISTRATION_STORE is case-insensitive", () => {
  // .env files get hand-edited; `FILE` should not be a production incident.
  const result = spawnSync(
    process.execPath,
    ["-e", 'process.stdout.write(require("./src/store").getStore().name)'],
    {
      cwd: path.join(__dirname, ".."),
      encoding: "utf8",
      env: { ...process.env, REGISTRATION_STORE: "FILE" },
    }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "file");
});
