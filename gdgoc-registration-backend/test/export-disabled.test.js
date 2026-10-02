"use strict";

/**
 * The CSV export must not exist at all unless EXPORT_TOKEN is configured.
 *
 * Separate file from export-csv.test.js on purpose: config/env freezes its
 * values when it is first required, so "token configured" and "token absent"
 * cannot both be true in one process.
 */

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const TMP_DIR = path.join(os.tmpdir(), `gdgoc-csv-off-${process.pid}-${Date.now()}`);

// Before require, and deliberately not set.
process.env.DATA_DIR = TMP_DIR;
process.env.NODE_ENV = "test";
delete process.env.EXPORT_TOKEN;

const { createApp } = require("../src/app");
const { env } = require("../config/env");

let server;
let baseUrl;

before(async () => {
  await fs.mkdir(TMP_DIR, { recursive: true });
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  await fs.rm(TMP_DIR, { recursive: true, force: true });
});

test("EXPORT_TOKEN defaults to empty", () => {
  assert.equal(env.EXPORT_TOKEN, "");
});

test("an unconfigured server has no CSV export at all", async () => {
  const res = await fetch(`${baseUrl}/api/registrations.csv`);
  // 404, not 401 - an unconfigured deployment should not even confirm the
  // route exists.
  assert.equal(res.status, 404);
});

test("even a guessable key gets 404 while unconfigured", async () => {
  for (const key of ["", "export", "admin", "test"]) {
    const res = await fetch(`${baseUrl}/api/registrations.csv?key=${key}`);
    assert.equal(res.status, 404, `key "${key}" should be 404`);
  }
});