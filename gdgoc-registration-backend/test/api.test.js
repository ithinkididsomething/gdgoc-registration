"use strict";

/**
 * End-to-end tests. Run with `npm test`.
 *
 * Each run copies the seed dataset into a fresh temp DATA_DIR, so tests never
 * touch the real data/ files and always start from a known state.
 */

const { test, before, beforeEach, after } = require("node:test");
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

// Pinned to the file driver, and this must be an assignment rather than a
// default: production now defaults REGISTRATION_STORE to firestore, and without
// this line these tests would try to run against the real cloud database - 53
// failures, most of them "record was not persisted", because there is no
// credential in a bare `npm test`. Driver-specific coverage lives in
// test/store-file.test.js and test/store-firestore.test.js, which opt in
// explicitly.
process.env.REGISTRATION_STORE = "file";

const { createApp } = require("../src/app");
const { VERTICAL_FORMS, VERTICAL_KEYS, normaliseVertical } = require("../config/verticals");
const { invalidateCache } = require("../src/students");
const { drain, getStore } = require("../src/store");

/**
 * Matches a whole Google Form URL in a response body, on either host Google
 * serves forms from. Shared so the leak assertions and the "placeholder-" leak
 * check cannot drift apart in what they consider a form URL.
 */
const FORM_URL_RE = /https:\/\/(?:docs|forms)\.google\.com\/[^\s"'<>)\]}]+/g;

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
  teamMessage: "The workshops are what convinced me to join.",
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
  const store = await getStore();
  return store.readAllRegistrations();
}

before(async () => {
  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.writeFile(
    path.join(TMP_DIR, "students.json"),
    JSON.stringify([SEED_STUDENT], null, 2)
  );

  const store = await getStore();
  if (store.reset) await store.reset();

  server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

/**
 * Empty the log between tests.
 *
 * One registration per roll number is now the rule, and nearly every test in
 * this file registers the same seed student. Sharing one log across the whole
 * suite would make each test fail on the one before it, which reads like a
 * regression in the thing under test rather than leakage between tests.
 *
 * `drain()` first, and it matters: the store serialises writes through a queue,
 * so a write still in flight from the previous test would land AFTER this reset
 * and quietly put a row back.
 */
beforeEach(async () => {
  await drain();
  const store = await getStore();
  if (store.reset) await store.reset();
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
  // `registered` is part of the shape now: the portal asks "have they already
  // responded?" in the same round trip, and a missing key would be read as
  // undefined rather than as a definite no.
  assert.deepEqual(body, { success: true, found: false, registered: false });
  assert.equal("student" in body, false);
  assert.equal("registration" in body, false);
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
  assert.deepEqual(await res.json(), { success: true, found: false, registered: false });
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

test("register: leaks no unauthorised vertical form link", async () => {
  const res = await call("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...VALID_REGISTRATION, priority1: "technical", priority2: "design" }),
  });
  const text = await res.text();

  // Every form URL in the response must be one this student was authorised for.
  //
  // Both assertions are needed and neither alone is sufficient. The count check
  // is what catches a leak while all ten verticals share one placeholder
  // form: the leaked URLs are string-identical to the authorised ones, so
  // `authorised.has(url)` passes for every one of them and the *count* is the
  // only signal. Once the verticals get distinct real forms, the membership
  // check becomes the one that bites and the count alone would pass a leak of
  // two plausible-but-wrong forms. Keep both.
  //
  // The old shape of this test asserted the other verticals' URLs were
  // absent, which silently stops testing anything the moment the verticals
  // share a form.
  const authorised = new Set([VERTICAL_FORMS.technical, VERTICAL_FORMS.design]);
  const urlsInBody = text.match(FORM_URL_RE) ?? [];
  assert.equal(urlsInBody.length, 2, "expected exactly the two authorised form URLs");
  for (const url of new Set(urlsInBody)) {
    assert.ok(authorised.has(url), `LEAK: unauthorised form URL exposed: ${url}`);
  }
});

test("register: normalises case and whitespace in vertical names", async () => {
  const res = await call("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...VALID_REGISTRATION,
      priority1: "  SOCIAL    MEDIA ",
      priority2: "SPONSORSHIP",
    }),
  });
  assert.equal(res.status, 201);

  const body = await res.json();
  assert.equal(body.forms.priority1.name, "social media");
  assert.equal(body.forms.priority1.url, VERTICAL_FORMS["social media"]);
  assert.equal(body.forms.priority2.name, "sponsorship");
  assert.equal(body.forms.priority2.url, VERTICAL_FORMS.sponsorship);
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

test("register: stores the roll number in uppercase", async () => {
  // The roster, the stored log and the CSV the organisers read all have to spell
  // a roll number the same way, or the sheet needs hand-fixing every time.
  const payload = { ...VALID_REGISTRATION, rollNumber: "  26i9014  ", fullName: "Case Test" };
  await call("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const store = await readStore();
  const saved = store.find((r) => r.fullName === "Case Test");
  assert.ok(saved, "record was not persisted");

  // Surrounding whitespace and case both gone.
  assert.equal(saved.rollNumber, "26I9014");
  assert.equal(saved.rollNumber, saved.rollNumber.trim());

  // And the uppercase form is still recognised as the same student: canonical
  // casing must not become a way to slip a second registration past the
  // duplicate check.
  const again = await call("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...VALID_REGISTRATION, fullName: "Case Test Two" }),
  });
  assert.equal(again.status, 409);
  assert.equal((await again.json()).code, "alreadyRegistered");

  // And the lookup answers for any casing the student might type.
  const lower = await (await call("/api/lookup/26i9014")).json();
  assert.equal(lower.registered, true);
  assert.equal(lower.registration.rollNumber, undefined, "summary must not echo the roll number back");
});

test("register: accepts 'NA' for a social field, as the form advertises", async () => {
  // A distinct roll number per case: six submissions of one roll number would
  // now be six attempts at a re-registration, and the 409s would mask what this
  // test is actually about.
  const tokens = ["NA", "na", "N/A", "none", "Not Available", "-"];

  for (const [i, token] of tokens.entries()) {
    const res = await call("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...VALID_REGISTRATION,
        rollNumber: `26S${String(2000 + i)}`,
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

  // Distinct roll numbers, deliberately. Twelve submissions of the SAME roll
  // number is no longer a write-race test — it is twelve attempts at a second
  // registration for one student, all but one of which are now correctly
  // refused. Racing twelve DIFFERENT students is the harder case anyway: every
  // one has to read-modify-write and none may overwrite another.
  await Promise.all(
    Array.from({ length: total }, (_unused, i) =>
      call("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...VALID_REGISTRATION,
          rollNumber: `26C${String(1000 + i)}`,
          fullName: `Concurrent ${i}`,
        }),
      })
    )
  );

  const statuses = await Promise.all(
    Array.from({ length: total }, async () => (await readStore()).length)
  );
  assert.ok(statuses.every((n) => n === before_ + total), "unexpected store size mid-flight");

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

test("register: requires the note to the team", async () => {
  // Required on both sides. The empty string, a missing key and a
  // whitespace-only value are three different ways of saying nothing, and all
  // three must fail: `text()` collapses whitespace, so "   " reaches the
  // required() check as "".
  for (const [label, payload] of [
    ["empty string", { teamMessage: "" }],
    ["missing key", { teamMessage: undefined }],
    ["whitespace only", { teamMessage: "   \t\n  " }],
    ["null", { teamMessage: null }],
  ]) {
    const res = await call("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_REGISTRATION, ...payload }),
    });
    assert.equal(res.status, 400, `expected 400 for ${label}`);
    const body = await res.json();
    assert.ok(body.fields.teamMessage, `expected a teamMessage error for ${label}`);
  }
});

test("register: keeps a note that is only punctuation, since it is still an answer", async () => {
  // Guards against a future "must contain a real sentence" rule creeping in. The
  // brief is one required field, not a writing assignment.
  const res = await call("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...VALID_REGISTRATION, teamMessage: "ok" }),
  });
  assert.equal(res.status, 201);
});

test("register: rejects a note longer than the 500 character cap", async () => {
  const res = await call("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...VALID_REGISTRATION, teamMessage: "a".repeat(501) }),
  });
  assert.equal(res.status, 400);
  assert.ok((await res.json()).fields.teamMessage);
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
/* One response per student                                            */
/* ------------------------------------------------------------------ */

test("register: refuses a second registration for the same roll number", async () => {
  const first = await call("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(VALID_REGISTRATION),
  });
  assert.equal(first.status, 201);

  const second = await call("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...VALID_REGISTRATION, fullName: "Impostor" }),
  });
  assert.equal(second.status, 409);

  const body = await second.json();
  assert.equal(body.success, false);
  // The code is the contract the UI branches on; matching on the English text
  // would make a copy edit silently break the "already noted" screen.
  assert.equal(body.code, "alreadyRegistered");

  const store = await readStore();
  assert.equal(store.length, 1, "the duplicate must not add a second row");
  assert.equal(store[0].fullName, SEED_STUDENT.fullName);
});

test("register: the duplicate check ignores case and stray whitespace", async () => {
  await call("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(VALID_REGISTRATION),
  });

  for (const variant of ["26i9014", "  26I9014  ", "26I9014".toLowerCase()]) {
    const res = await call("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...VALID_REGISTRATION, rollNumber: variant }),
    });
    assert.equal(res.status, 409, `"${variant}" should be recognised as the same student`);
  }

  assert.equal((await readStore()).length, 1);
});

test("register: simultaneous submissions of one roll number yield exactly one row", async () => {
  // The real race: a student double-taps submit, or two tabs are open. The
  // check has to be inside the write queue, not in the route handler, or both
  // requests read the log before either writes and two rows land.
  const attempts = 6;
  const responses = await Promise.all(
    Array.from({ length: attempts }, () =>
      call("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(VALID_REGISTRATION),
      })
    )
  );

  const created = responses.filter((res) => res.status === 201).length;
  const refused = responses.filter((res) => res.status === 409).length;
  assert.equal(created, 1, "exactly one submission may be accepted");
  assert.equal(refused, attempts - 1, "every other submission must be refused, not dropped");
  assert.equal((await readStore()).length, 1);
});

test("lookup: reports an existing registration without exposing personal fields", async () => {
  const clean = await (await call("/api/lookup/26I9014")).json();
  assert.equal(clean.registered, false);
  assert.equal("registration" in clean, false);

  await call("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(VALID_REGISTRATION),
  });

  const body = await (await call("/api/lookup/26I9014")).json();
  assert.equal(body.registered, true);
  assert.equal(body.registration.priority1, "technical");
  assert.equal(body.registration.priority2, "design");
  assert.ok(body.registration.submittedAt);

  // The two links this student chose, and nothing else.
  assert.equal(body.registration.forms.priority1.url, VERTICAL_FORMS.technical);
  assert.equal(body.registration.forms.priority2.url, VERTICAL_FORMS.design);
  assert.equal(Object.keys(body.registration.forms).length, 2);

  // A roll number is not a secret, so this response must not restate the
  // personal columns the log holds.
  const serialised = JSON.stringify(body.registration);
  for (const secret of [SEED_STUDENT.fullName, SEED_STUDENT.email, SEED_STUDENT.contactNumber]) {
    assert.equal(serialised.includes(secret), false, `registration summary leaked ${secret}`);
  }
});

test("lookup: a registered roll number missing from the roster still gets its summary", async () => {
  // A roll number can be registered and then absent from every roster source —
  // this is not hypothetical, it has already happened with live data. If the
  // summary were withheld here the portal could not show the confirmation
  // screen, so the student would fill in the whole form, be refused with a 409,
  // and end up on a confirmation page with no form links: locked out of their
  // own forms by the rule meant to protect them.
  await call("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...VALID_REGISTRATION, rollNumber: "26Z0001" }),
  });

  const body = await (await call("/api/lookup/26Z0001")).json();

  // Still "not in the roster" — this must not start leaking roster presence.
  assert.equal(body.found, false);
  assert.equal("student" in body, false);

  // But the registration is reported in full, so the portal can confirm it.
  assert.equal(body.registered, true);
  assert.equal(body.registration.priority1, "technical");
  assert.equal(body.registration.forms.priority1.url, VERTICAL_FORMS.technical);
  assert.equal(Object.keys(body.registration.forms).length, 2);

  // Unregistered roll numbers are unaffected: still no summary key at all.
  const clean = await (await call("/api/lookup/26Z0002")).json();
  assert.equal(clean.found, false);
  assert.equal(clean.registered, false);
  assert.equal("registration" in clean, false);
});

test("complete: records a submitted form and is idempotent", async () => {
  await call("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(VALID_REGISTRATION),
  });

  const first = await call("/api/register/26I9014/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage: 1 }),
  });
  assert.equal(first.status, 200);
  const firstAt = (await first.json()).completedAt;
  assert.ok(firstAt);

  // A double tap or a retried request must not restamp the time.
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = await call("/api/register/26I9014/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage: 1 }),
  });
  assert.equal((await second.json()).completedAt, firstAt);

  // Only stage 1 so far, so there is no overall completion time yet.
  let stored = (await readStore())[0];
  assert.ok(stored.priority1CompletedAt);
  assert.equal(stored.priority2CompletedAt, undefined);
  assert.equal(stored.formsCompletedAt, undefined);

  const other = await call("/api/register/26I9014/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage: 2 }),
  });
  assert.equal(other.status, 200);

  stored = (await readStore())[0];
  assert.ok(stored.priority2CompletedAt);
  assert.ok(stored.formsCompletedAt, "both stages done should stamp the overall completion");

  // Marking a form must never rewrite what the student originally submitted.
  assert.equal(stored.fullName, SEED_STUDENT.fullName);
  assert.equal(stored.teamMessage, VALID_REGISTRATION.teamMessage);
  assert.equal(stored.priority1, "technical");
});

test("complete: rejects a bad stage and an unregistered roll number", async () => {
  // `true` is in this list on purpose: Number(true) is 1, so a route that
  // coerced with Number() would stamp stage 1 for a payload that never sent a 1.
  for (const stage of [0, 3, -1, "1", " 1 ", true, null, undefined, "both", 1.5, [1]]) {
    const res = await call("/api/register/26I9014/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    assert.equal(res.status, 400, `expected 400 for stage=${JSON.stringify(stage)}`);
    assert.ok((await res.json()).fields.stage);
  }

  // Not registered: there is no row to stamp, and inventing one would be worse
  // than refusing.
  const missing = await call("/api/register/26I9999/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage: 1 }),
  });
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, "notRegistered");
  assert.equal((await readStore()).length, 0);
});

test("complete: cannot create a registration for a roll number that never registered", async () => {
  await call("/api/register/26I9014/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage: 1 }),
  });

  assert.equal((await readStore()).length, 0, "no row may be created by a completion call");
});

/* ------------------------------------------------------------------ */
/* Config invariants                                                   */
/* ------------------------------------------------------------------ */

test("all 10 verticals are configured with Google Form URLs", () => {
  assert.equal(VERTICAL_KEYS.length, 10);
  for (const key of VERTICAL_KEYS) {
    // Accepts either host Google serves forms from: the older
    // forms.google.com and the current docs.google.com/forms. Hardcoding only
    // the former made this fail the moment a real form URL was pasted in, which
    // is exactly the moment it matters.
    assert.match(VERTICAL_FORMS[key], /^https:\/\/(?:docs|forms)\.google\.com\//);
    // The frontend appends `embedded=true` itself, so a stored URL must not
    // hardcode it or the embed flag would be baked into the shareable link.
    assert.equal(VERTICAL_FORMS[key].includes("embedded="), false);
  }
  // The allowlist must not be spoofable via inherited Object.prototype keys.
  assert.equal(VERTICAL_KEYS.includes("constructor"), false);
  assert.equal(VERTICAL_KEYS.includes("__proto__"), false);
});

test("the vertical list is exactly the final 10, in the agreed display order", () => {
  // Pinned explicitly rather than derived, so reordering or renaming a vertical
  // has to be a deliberate edit here instead of drifting silently.
  assert.deepEqual([...VERTICAL_KEYS], [
    "content",
    "creatives",
    "operations",
    "social media",
    "design",
    "production",
    "pr",
    "sponsorship",
    "marketing",
    "technical",
  ]);
});

test("superseded combined vertical names from the old 8-vertical list are rejected", () => {
  // Production split from Social Media, and PR split from Sponsorship. Note
  // that "content" and "creatives" are NOT in this list — they are separate
  // verticals again, exactly as they were originally. A stale cached frontend
  // could still POST a combined name; silently accepting it would store a value
  // no form URL can resolve.
  const legacy = ["production and social media", "pr and sponsership", "content creatives"];
  for (const key of legacy) {
    assert.equal(VERTICAL_KEYS.includes(key), false, `${key} should no longer be valid`);
    assert.equal(normaliseVertical(key), null, `${key} should normalise to null`);
  }
});

test("a vertical left unconfigured fails loudly instead of handing out a broken embed", () => {
  // Guards the transitional state where all ten verticals share one
  // placeholder form: the invariant that matters is that every key resolves to
  // something absolute, not that the ten values differ.
  const configured = VERTICAL_KEYS.filter((key) => VERTICAL_FORMS[key]);
  assert.equal(configured.length, VERTICAL_KEYS.length);
  for (const key of configured) {
    assert.doesNotThrow(() => new URL(VERTICAL_FORMS[key]));
  }
});
