"use strict";

/**
 * End-to-end tests. Run with `npm test`.
 *
 * Each run copies the seed dataset into a fresh temp DATA_DIR, so tests never
 * touch the real data/ files and always start from a known state.
 */

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

// Point env at a temp dir *before* config/env is required anywhere.
const TMP_DIR = path.join(
  os.tmpdir(),
  `gdgoc-test-${process.pid}-${Date.now()}`
);
process.env.DATA_DIR = TMP_DIR;
process.env.NODE_ENV = "test";
process.env.RATE_LIMIT_MAX_LOOKUP = "1000";
process.env.RATE_LIMIT_MAX_REGISTER = "1000";

const { createApp } = require("../src/app");
const { VERTICAL_FORMS, VERTICAL_KEYS } = require("../config/verticals");
const { invalidateCache } = require("../src/students");
const { drain } = require("../src/registrations");
const { REGISTRATIONS_FILE } = require("../config/env").env;

const SEED_STUDENT = {
  rollNumber: "26I9014",
  fullName: "Jane Doe",
  branch: "Information Technology",
  section: "A",
  yearOfStudy: "2nd Year",
  contactNumber: "+91 9876543210",
  gender: "Female",
  email: "jane.doe@ietdavv.edu.in",
  linkedin: "https://linkedin.com/in/janedoe",
  github: "https://github.com/janedoe",
  instagram: "@janedoe",
  skills: "Web Development",
};

const VALID_REGISTRATION = {
  ...SEED_STUDENT,
  priority1: "technical",
  priority2: "design",
};

let server;
let baseUrl;

/** @param {string} p @param {RequestInit} [init] */
function call(p, init) {
  return fetch(`${baseUrl}${p}`, init);
}

async function readStore() {
  await drain();
  const raw = await fs.readFile(REGISTRATIONS_FILE, "utf8");
  return JSON.parse(raw);
}

before(async () => {
  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.writeFile(
    path.join(TMP_DIR, "students.json"),
    JSON.stringify([SEED_STUDENT], null, 2)
  );
  await fs.writeFile(path.join(TMP_DIR, "registrations.json"), "[]");

  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  invalidateCache();
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(TMP_DIR, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ */
/* GET /api/lookup/:rollNumber                                         */
/* ------------------------------------------------------------------ */

test("lookup: returns the matching student", async () => {
  const res = await call("/api/lookup/26I9014");
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.found, true);
  assert.equal(body.student.rollNumber, "26I9014");
  assert.equal(body.student.fullName, "Jane Doe");
  assert.equal(body.student.email, "jane.doe@ietdavv.edu.in");
});

test("lookup: is case-insensitive and whitespace-tolerant", async () => {
  for (const variant of ["26i9014", "26I9014", "26i9014".toUpperCase()]) {
    const body = await (await call(`/api/lookup/${variant}`)).json();
    assert.equal(body.found, true, `expected ${variant} to match`);
  }
});

test("lookup: unknown roll number returns found:false and no student key", async () => {
  const res = await call("/api/lookup/26I9999");
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.deepEqual(body, { success: true, found: false });
  assert.equal("student" in body, false);
});

test("lookup: never exposes the full roster", async () => {
  const body = await (await call("/api/lookup/26I9014")).json();
  const serialised = JSON.stringify(body);

  // The response must be exactly one record, not an array or a wrapped list.
  assert.equal(Array.isArray(body.student), false);
  assert.equal(body.students, undefined);
  assert.equal(body.data, undefined);
  // And it must not be a two-element list containing the seed twice.
  assert.equal(serialised.match(/26I9014/g).length, 1);
});

test("lookup: path traversal attempts are rejected without reading files", async () => {
  for (const attempt of [
    "..%2F..%2Fpackage.json",
    "..%2Fstudents.json",
    "%2e%2e%2f%2e%2e%2fconfig%2fverticals.js",
    "..%5C..%5Cpackage.json",
    "26I9014%00.json",
  ]) {
    const res = await call(`/api/lookup/${attempt}`);
    assert.equal(res.status, 400, `unexpected ${res.status} for ${attempt}`);
    const text = await res.text();
    assert.equal(text.includes("VERTICAL_FORMS"), false);
    assert.equal(text.includes("dependencies"), false);
    assert.equal(text.includes("express"), false);
  }
});

test("lookup: a valid-but-absent roll number still returns 200 found:false", async () => {
  const res = await call("/api/lookup/26I0000");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { success: true, found: false });
});

test("lookup: no endpoint lists all students", async () => {
  for (const path of ["/api/students", "/api/lookup", "/api/lookup/"]) {
    const res = await call(path);
    const text = await res.text();
    assert.equal(text.includes("Jane Doe"), false, `${path} leaked roster data`);
  }
});

/* ------------------------------------------------------------------ */
/* POST /api/register                                                  */
/* ------------------------------------------------------------------ */

test("register: happy path returns exactly the two chosen form links", async () => {
  const res = await call("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(VALID_REGISTRATION),
  });
  assert.equal(res.status, 201);

  const body = await res.json();
  assert.equal(body.success, true);
  assert.deepEqual(body.forms, {
    priority1: { name: "technical", url: VERTICAL_FORMS.technical },
    priority2: { name: "design", url: VERTICAL_FORMS.design },
  });
});

test("register: does not leak the other 6 vertical form links", async () => {
  const res = await call("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...VALID_REGISTRATION, priority1: "technical", priority2: "design" }),
  });
  const text = await res.text();

  const chosen = new Set([VERTICAL_FORMS.technical, VERTICAL_FORMS.design]);
  for (const [key, url] of Object.entries(VERTICAL_FORMS)) {
    if (chosen.has(url)) {
      assert.ok(text.includes(url), `expected ${key}'s chosen link to be present`);
    } else {
      assert.equal(text.includes(url), false, `LEAK: ${key} form URL was exposed`);
    }
  }

  // No form URL at all beyond the two expected ones.
  const urlsInBody = text.match(/https:\/\/forms\.google\.com\/[a-z-]+/g) ?? [];
  assert.equal(urlsInBody.length, 2);
});

test("register: normalises case and whitespace in vertical names", async () => {
  const res = await call("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...VALID_REGISTRATION,
      priority1: "  PRODUCTION   AND SOCIAL MEDIA ",
      priority2: "pr and sponsership",
    }),
  });
  assert.equal(res.status, 201);

  const body = await res.json();
  assert.equal(body.forms.priority1.name, "production and social media");
  assert.equal(body.forms.priority1.url, VERTICAL_FORMS["production and social media"]);
  assert.equal(body.forms.priority2.name, "pr and sponsership");
});

test("register: persists the record with an ISO submittedAt and the chosen verticals", async () => {
  const payload = { ...VALID_REGISTRATION, fullName: "Persist Test" };
  await call("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const store = await readStore();
  const saved = store.find((r) => r.fullName === "Persist Test");
  assert.ok(saved, "record was not persisted");
  assert.equal(saved.rollNumber, "26I9014");
  assert.equal(saved.priority1, "technical");
  assert.equal(saved.priority2, "design");
  assert.ok(
    !Number.isNaN(Date.parse(saved.submittedAt)),
    `submittedAt is not a valid date: ${saved.submittedAt}`
  );
  assert.match(saved.submittedAt, /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
});

test("register: accepts 'NA' for a social field, as the form advertises", async () => {
  for (const token of ["NA", "na", "N/A", "none", "Not Available", "-"]) {
    const res = await call("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...VALID_REGISTRATION,
        fullName: `No LinkedIn ${token}`,
        linkedin: token,
      }),
    });
    assert.equal(res.status, 201, `expected 201 for linkedin=${token}: ${await res.clone().text()}`);
  }

  const store = await readStore();
  const saved = store.find((r) => r.fullName === "No LinkedIn NA");
  assert.equal(saved.linkedin, "", 'an "NA" token should be stored as an empty value');
});

test("register: still rejects a malformed social value", async () => {
  // "NA" being allowed must not turn the field into a free-for-all.
  for (const token of ["not-a-url", "example.com/username", "N/A please", "na na"]) {
    const res = await call("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_REGISTRATION, fullName: `Bad ${token}`, linkedin: token }),
    });
    assert.equal(res.status, 400, `expected 400 for linkedin=${token}`);
    assert.ok((await res.json()).fields.linkedin);
  }
});

test("register: rejects a missing linkedin entirely", async () => {
  const res = await call("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...VALID_REGISTRATION, linkedin: "" }),
  });
  assert.equal(res.status, 400);
  assert.ok((await res.json()).fields.linkedin);
});

test("register: concurrent submissions all survive (no lost writes)", async () => {
  const before_ = (await readStore()).length;
  const total = 12;

  await Promise.all(
    Array.from({ length: total }, (_unused, i) =>
      call("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...VALID_REGISTRATION, fullName: `Concurrent ${i}` }),
      })
    )
  );

  const after_ = await readStore();
  assert.equal(after_.length, before_ + total, "some registrations were lost to a write race");
  for (let i = 0; i < total; i += 1) {
    assert.ok(
      after_.some((r) => r.fullName === `Concurrent ${i}`),
      `Concurrent ${i} is missing from the store`
    );
  }
});

test("register: rejects identical priorities", async () => {
  const res = await call("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...VALID_REGISTRATION, priority1: "technical", priority2: "technical" }),
  });
  assert.equal(res.status, 400);

  const body = await res.json();
  assert.equal(body.success, false);
  assert.ok(body.fields.priority2);
});

test("register: rejects priorities outside the 8 valid keys", async () => {
  const invalid = [
    "invalid",
    "Technical Team",
    "",
    null,
    42,
    ["technical"],
    "constructor", // inherited Object.prototype key
    "toString",
    "__proto__",
    "hasOwnProperty",
    "valueOf",
  ];

  for (const priority1 of invalid) {
    const res = await call("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_REGISTRATION, priority1, priority2: "design" }),
    });
    assert.equal(res.status, 400, `expected rejection for ${JSON.stringify(priority1)}`);

    const text = await res.text();
    assert.equal(text.includes("placeholder-"), false, "a form URL leaked on rejection");
    assert.equal(text.includes("function"), false, "a function body leaked on rejection");
  }
});

test("register: rejects a missing priority2", async () => {
  const res = await call("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...VALID_REGISTRATION, priority2: undefined }),
  });
  assert.equal(res.status, 400);
  assert.ok((await res.json()).fields.priority2);
});

test("register: rejects invalid field values with per-field errors", async () => {
  const cases = [
    [{ email: "not-an-email" }, "email"],
    [{ contactNumber: "abc" }, "contactNumber"],
    [{ gender: "Attack Vector" }, "gender"],
    [{ yearOfStudy: "9th Year" }, "yearOfStudy"],
    [{ fullName: "x" }, "fullName"],
    [{ rollNumber: "!!" }, "rollNumber"],
  ];

  for (const [patch, field] of cases) {
    const res = await call("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_REGISTRATION, ...patch }),
    });
    assert.equal(res.status, 400, `expected 400 for ${field}: ${JSON.stringify(patch)}`);
    const body = await res.json();
    assert.ok(body.fields[field], `expected an error on "${field}", got ${JSON.stringify(body.fields)}`);
  }
});

test("register: rejects javascript: and data: URLs in social fields", async () => {
  for (const patch of [
    { github: "javascript:alert(document.cookie)" },
    { linkedin: "javascript:fetch('//evil.tld')" },
    { github: "data:text/html,<script>alert(1)</script>" },
    { linkedin: "https://user:pass@evil.tld/x" },
  ]) {
    const res = await call("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_REGISTRATION, ...patch }),
    });
    assert.equal(res.status, 400, `expected rejection for ${JSON.stringify(patch)}`);
  }
});

test("register: rejects prototype pollution via __proto__ in the body", async () => {
  const body = JSON.stringify({ ...VALID_REGISTRATION })
    // Inject a literal __proto__ key, which JSON.parse turns into a real own property.
    .replace('"rollNumber"', '"__proto__":{"polluted":true},"rollNumber"');

  const res = await call("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  assert.equal(res.status, 400);
  assert.equal({}.polluted, undefined, "Object.prototype was polluted!");
});

test("register: strips unknown fields instead of persisting them", async () => {
  const res = await call("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...VALID_REGISTRATION,
      fullName: "Extra Fields",
      isAdmin: true,
      role: "superuser",
      secretToken: "abc123",
    }),
  });
  assert.equal(res.status, 201);

  const store = await readStore();
  const saved = store.find((r) => r.fullName === "Extra Fields");
  assert.ok(saved);
  assert.equal(saved.isAdmin, undefined);
  assert.equal(saved.role, undefined);
  assert.equal(saved.secretToken, undefined);
});

test("register: rejects a non-object body", async () => {
  for (const payload of ["[]", '"hello"', "42", "null"]) {
    const res = await call("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
    assert.equal(res.status, 400, `expected 400 for body ${payload}`);
  }
});

test("register: rejects malformed JSON", async () => {
  const res = await call("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{ not json",
  });
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "Malformed JSON body");
});

test("register: rejects an oversized body", async () => {
  const res = await call("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...VALID_REGISTRATION, skills: "x".repeat(100_000) }),
  });
  assert.equal(res.status, 413);
});

/* ------------------------------------------------------------------ */
/* Hardening / headers                                                 */
/* ------------------------------------------------------------------ */

test("responses omit X-Powered-By and carry hardening headers", async () => {
  const res = await call("/api/health");
  assert.equal(res.headers.get("x-powered-by"), null);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-frame-options"), "DENY");
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
  assert.ok(res.headers.get("content-security-policy").includes("default-src 'none'"));
});

test("unknown routes return a JSON 404 with no internals", async () => {
  const res = await call("/api/nope");
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { success: false, error: "Not found" });
});

test("disallowed origins receive no CORS allow header", async () => {
  const res = await call("/api/health", { headers: { Origin: "https://evil.example.com" } });
  assert.equal(res.headers.get("access-control-allow-origin"), null);
});

test("allowed origins receive the CORS allow header", async () => {
  const res = await call("/api/health", { headers: { Origin: "http://localhost:5173" } });
  assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:5173");
});

/* ------------------------------------------------------------------ */
/* Config invariants                                                   */
/* ------------------------------------------------------------------ */

test("all 8 verticals are configured with placeholder form URLs", () => {
  assert.equal(VERTICAL_KEYS.length, 8);
  for (const key of VERTICAL_KEYS) {
    assert.match(VERTICAL_FORMS[key], /^https:\/\/forms\.google\.com\//);
  }
  // The allowlist must not be spoofable via inherited Object.prototype keys.
  assert.equal(VERTICAL_KEYS.includes("constructor"), false);
  assert.equal(VERTICAL_KEYS.includes("__proto__"), false);
});
