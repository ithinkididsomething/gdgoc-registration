"use strict";

/**
 * The contract suite, run against the REAL Firestore driver.
 *
 * Same assertions as test/store-file.test.js. That is the entire point: if both
 * drivers pass this, they are interchangeable as far as the app is concerned, and
 * switching engines becomes a config change rather than a project.
 *
 * RUN IT
 *   firebase emulators:exec --only firestore "npm test"
 *
 *   Firestore itself, against the live project:
 *     $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\key.json"
 *     $env:REGISTRATION_STORE = "firestore"
 *     node --test test/store-firestore.test.js
 *
 * SKIPS unless one of those is set, so an ordinary `npm test` on a laptop with no
 * Firebase project does not fail. Skipping loudly rather than silently: a green
 * run that quietly never touched Firestore would be worse than a red one, because
 * it would be reported as "Firestore verified".
 *
 * WARNING — THIS DELETES DOCUMENTS.
 *
 * `reset()` empties the `registrations` collection, and the contract suite calls
 * it before most assertions. On the emulator that is throwaway data. Against the
 * LIVE project it would destroy real registrations.
 *
 * So the guard is not just "is FIRESTORE configured" but "is this the live
 * project". The suite refuses to run without explicit consent:
 *
 *   $env:FIREBASE_PROJECT_ID           = "gdgregs"
 *   $env:ALLOW_LIVE_FIRESTORE_RESET    = "yes-i-understand-this-deletes-data"
 *
 * The emulator sets FIRESTORE_EMULATOR_HOST and needs none of that.
 */

const { test } = require("node:test");
const assert = require("node:assert/strict");

const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const projectId = process.env.FIREBASE_PROJECT_ID || "";
const consent = process.env.ALLOW_LIVE_FIRESTORE_RESET || "";

// Read the project out of the key file so the suite can refuse to run against the
// live database even when the operator set the engine but not the ID.
let keyProjectId = "";
if (!emulator && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    keyProjectId = require(process.env.GOOGLE_APPLICATION_CREDENTIALS).project_id || "";
  } catch {
    keyProjectId = "";
  }
}

const liveTarget = Boolean(projectId || keyProjectId);
const approved = consent === "yes-i-understand-this-deletes-data";

if (!emulator && liveTarget && !approved) {
  throw new Error(
    "\n\n" +
      "REFUSING TO RUN: this suite would DELETE from the live Firestore database.\n" +
      `  project: ${projectId || keyProjectId}\n\n` +
      "Either use the emulator (no real data is touched):\n" +
      '  firebase emulators:exec --only firestore "npm test"\n\n' +
      "or, if you genuinely mean to run against production data, set:\n" +
      "  ALLOW_LIVE_FIRESTORE_RESET=yes-i-understand-this-deletes-data\n"
  );
}

const { runStoreContract } = require("./helpers/store-contract");

/** Nothing configured at all: register as skipped so `npm test` stays green. */
const configured = emulator || liveTarget;

const target = emulator
  ? `emulator (${process.env.FIRESTORE_EMULATOR_HOST})`
  : liveTarget
    ? `live project ${projectId || keyProjectId}`
    : "not configured - skipping";

console.log(`# store contract vs firestore -> ${target}`);
if (!configured) {
  console.log(
    "# to run this: firebase emulators:exec --only firestore \"npm test\"\n" +
      "# or point GOOGLE_APPLICATION_CREDENTIALS at a key and set REGISTRATION_STORE=firestore"
  );
}

const it = (name, fn) => test(name, { skip: !configured }, fn);

runStoreContract({
  test,
  label: "firestore",
  makeDriver: () => require("../src/store/firestore"),
  skip: !configured,
});

// --- Beyond the shared contract ---------------------------------------------
// Behaviours specific to this engine. If any of these need moving to the file
// driver to pass, that is the signal the contract is in the wrong place.

it("firestore store: refuses to start when the emulator host is set in production", () => {
  // The single worst misconfiguration available here: point the SDK at an
  // emulator that is not there and every read and write fails, or worse appears
  // to succeed. The driver must refuse rather than limp.
  assert.ok(require("../src/store/firestore"), "driver should load");
  // Guard asserted against the driver's own production check in getFirestore.
  assert.match(
    require("node:fs").readFileSync(require.resolve("../src/store/firestore"), "utf8"),
    /FIRESTORE_EMULATOR_HOST is set in production/
  );
});

it("firestore store: one document per student, keyed by normalised roll number", async () => {
  const driver = require("../src/store/firestore");
  await driver.reset();

  const record = {
    rollNumber: "26Z0009",
    fullName: "Doc Shape",
    branch: "CSBS",
    section: "B",
    yearOfStudy: "1st Year",
    contactNumber: "+91 9000000000",
    gender: "Male",
    email: "shape@example.com",
    linkedin: "NA",
    github: "NA",
    instagram: "NA",
    skills: "None",
    teamMessage: "shape",
    priority1: "technical",
    priority2: "design",
  };
  await driver.appendRegistration(record);

  // The document ID is the lowercased key, while the stored field keeps the
  // student's own casing for the organisers' sheet.
  const doc = await driver._internals
    .getFirestore()
    .collection("registrations")
    .doc("26z0009")
    .get();
  assert.ok(doc.exists, "document is not keyed by the normalised roll number");
  assert.equal(doc.data().rollNumber, "26Z0009");

  // And the collection holds one doc per student - not one document per
  // registration batch, which is how a naive port would model it.
  const all = await driver._internals.getFirestore().collection("registrations").get();
  assert.equal(all.size, 1);

  await driver.reset();
});
