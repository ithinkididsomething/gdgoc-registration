"use strict";

/**
 * Tests for GET /api/registrations.csv with EXPORT_TOKEN set.
 *
 * The security-relevant half of this feature lives here: the endpoint hands
 * out every student's name, phone number and email, so "does it refuse without
 * the right key" matters far more than "does it produce valid CSV".
 *
 * The disabled case (no EXPORT_TOKEN configured) is a separate file, because
 * config/env freezes its values at require-time and one process cannot be both
 * configured and unconfigured.
 */

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const TMP_DIR = path.join(os.tmpdir(), `gdgoc-csv-${process.pid}-${Date.now()}`);
const TOKEN = "test-export-token-do-not-use-in-production";

// Must be set before config/env is required anywhere.
process.env.DATA_DIR = TMP_DIR;
process.env.NODE_ENV = "test";
process.env.EXPORT_TOKEN = TOKEN;
process.env.RATE_LIMIT_MAX_EXPORT = "1000";

const { createApp } = require("../src/app");
const { REGISTRATIONS_FILE } = require("../config/env").env;
const { drain } = require("../src/registrations");

let server;
let baseUrl;

async function get(pathAndQuery, init) {
  return fetch(`${baseUrl}${pathAndQuery}`, init);
}

const VALID = {
  rollNumber: "26I9014",
  fullName: "Jane Doe",
  branch: "IT",
  section: "A",
  yearOfStudy: "2nd Year",
  contactNumber: "+91 9876543210",
  gender: "Female",
  email: "jane.doe@ietdavv.edu.in",
  linkedin: "https://linkedin.com/in/janedoe",
  github: "https://github.com/janedoe",
  instagram: "@janedoe",
  skills: "Web Development",
  priority1: "technical",
  priority2: "design",
};

before(async () => {
  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.writeFile(REGISTRATIONS_FILE, "[]\n");
  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await drain();
  server?.close();
  await fs.rm(TMP_DIR, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ */
/* Authentication                                                      */
/* ------------------------------------------------------------------ */

test("refuses a request with no key", async () => {
  const res = await get("/api/registrations.csv");
  assert.equal(res.status, 401);
});

test("refuses a wrong key", async () => {
  const res = await get("/api/registrations.csv?key=wrong");
  assert.equal(res.status, 401);
});

test("refuses a key of the right length but wrong content", async () => {
  // Guards against an implementation that only checks length.
  const res = await get(`/api/registrations.csv?key=${"x".repeat(TOKEN.length)}`);
  assert.equal(res.status, 401);
});

test("an empty key is refused", async () => {
  const res = await get("/api/registrations.csv?key=");
  assert.equal(res.status, 401);
});

test("never leaks student data on a rejected request", async () => {
  const res = await get("/api/registrations.csv?key=nope");
  const body = await res.text();
  assert.equal(body.includes("9876543210"), false);
  assert.equal(body.includes("jane.doe"), false);
});

/* ------------------------------------------------------------------ */
/* Happy path                                                          */
/* ------------------------------------------------------------------ */

test("returns CSV to the correct key, with spreadsheet-friendly headers", async () => {
  const reg = await fetch(`${baseUrl}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(VALID),
  });
  assert.equal(reg.status, 201);
  await drain();

  const res = await get(`/api/registrations.csv?key=${TOKEN}`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/csv/);
  assert.match(res.headers.get("content-disposition"), /attachment; filename="registrations\.csv"/);
  // Student data must not be left sitting in a shared cache.
  assert.equal(res.headers.get("cache-control"), "no-store");

  const csv = await res.text();
  const [header] = csv.split("\r\n");
  assert.equal(
    header,
    "submittedAt,rollNumber,fullName,branch,section,yearOfStudy,contactNumber," +
      "gender,email,linkedin,github,instagram,skills,priority1,priority2"
  );
  assert.equal(csv.includes("Jane Doe"), true);
  assert.equal(csv.includes("26I9014"), true);
  assert.equal(csv.includes("jane.doe@ietdavv.edu.in"), true);
  // Trailing CRLF, which is what Excel expects.
  assert.equal(csv.endsWith("\r\n"), true);
});

test("exports an empty log as a header row rather than erroring", async () => {
  await fs.writeFile(REGISTRATIONS_FILE, "[]\n");
  const res = await get(`/api/registrations.csv?key=${TOKEN}`);
  assert.equal(res.status, 200);
  const csv = await res.text();
  assert.equal(csv.trim().split("\r\n").length, 1);
  assert.equal(csv.includes("rollNumber"), true);
});

test("survives a missing log file", async () => {
  await fs.rm(REGISTRATIONS_FILE, { force: true });
  const res = await get(`/api/registrations.csv?key=${TOKEN}`);
  assert.equal(res.status, 200);
  assert.equal((await res.text()).includes("rollNumber"), true);
});

test("quotes a name containing a comma and a quote", async () => {
  await fs.writeFile(
    REGISTRATIONS_FILE,
    JSON.stringify([{ ...VALID, fullName: 'Doe, Jane "JJ"' }])
  );
  const res = await get(`/api/registrations.csv?key=${TOKEN}`);
  const csv = await res.text();
  assert.equal(csv.includes('"Doe, Jane ""JJ"""'), true);
});

test("a UTF-8 BOM does not break the log", async () => {
  // Regression: Notepad/Excel add a BOM when a human edits this file, and the
  // resulting SyntaxError used to 500 both the export and every registration.
  await fs.writeFile(REGISTRATIONS_FILE, `﻿${JSON.stringify([VALID])}`);
  const res = await get(`/api/registrations.csv?key=${TOKEN}`);
  assert.equal(res.status, 200);
  assert.equal((await res.text()).includes("26I9014"), true);

  const reg = await fetch(`${baseUrl}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(VALID),
  });
  assert.equal(reg.status, 201);
});