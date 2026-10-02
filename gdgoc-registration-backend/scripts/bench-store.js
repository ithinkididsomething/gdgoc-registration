"use strict";
/**
 * Measures the JSON store at the scale this project will actually reach
 * (~1000 registrations), using the REAL store functions rather than a
 * reimplementation, by pointing DATA_DIR at a temp directory.
 *
 * Question: does this need a database?
 *
 * Run: node scripts/bench-store.js
 */

const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "gdgoc-bench-"));
process.env.DATA_DIR = TMP;

// Required AFTER DATA_DIR is set, because config/env.js reads it at import.
const { env } = require("../config/env");
const { getStore } = require("../src/store");
const { findStudentByRollNumber } = require("../src/students");

// Benchmarked against whichever driver is configured, so this stays meaningful
// after the store is ported rather than silently continuing to measure the old
// engine.
const { appendRegistration } = getStore();

const BRANCHES = ["CS", "IT", "CSBS", "ENTC", "Mechanical Engineering",
  "Electronics and Instrumentation", "EEE", "IP", "Civil Engineering"];

/** A record shaped like the real validated output. */
function makeRecord(i) {
  return {
    rollNumber: `26I${String(1000 + i).padStart(4, "0")}`,
    fullName: `Student Name ${i}`,
    branch: BRANCHES[i % BRANCHES.length],
    section: "A",
    yearOfStudy: `${(i % 4) + 1}${["st", "nd", "rd", "th"][i % 4]} Year`,
    contactNumber: `+91 9${String(800000000 + i).slice(0, 9)}`,
    gender: ["Female", "Male", "Non-binary"][i % 3],
    email: `student${i}@example.com`,
    linkedin: `https://linkedin.com/in/student${i}`,
    github: "NA",
    instagram: "NA",
    skills: "Web Development",
  };
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: sorted[0],
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    max: sorted[sorted.length - 1],
  };
}

const ms = (n) => `${n.toFixed(2)} ms`;

async function main() {
  await fsp.mkdir(TMP, { recursive: true });

  // --- 1. Seed a 1000-student roster, then measure lookup -----------------
  const roster = Array.from({ length: 1000 }, (_, i) => ({
    rollNumber: `26I${String(1000 + i).padStart(4, "0")}`,
    fullName: `Student Name ${i}`,
    branch: BRANCHES[i % BRANCHES.length],
    section: "A",
    yearOfStudy: `${(i % 4) + 1}${["st", "nd", "rd", "th"][i % 4]} Year`,
    email: `student${i}@example.com`,
  }));
  await fsp.writeFile(env.STUDENTS_FILE, JSON.stringify(roster, null, 2));

  const lookupTimings = [];
  for (let i = 0; i < 200; i += 1) {
    const roll = roster[(i * 7) % roster.length].rollNumber;
    const t0 = process.hrtime.bigint();
    await findStudentByRollNumber(roll);
    lookupTimings.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  const lk = stats(lookupTimings);
  console.log(`\nGET /api/lookup  (roster = ${roster.length} students)`);
  console.log(`  p50 ${ms(lk.p50)}   p95 ${ms(lk.p95)}   max ${ms(lk.max)}`);

  // --- 2. Fill registrations to 1000, timing the real append --------------
  console.log(`\nFilling registrations to 1000 via the real appendRegistration()...`);
  const fillStart = Date.now();
  for (let i = 0; i < 1000; i += 1) {
    await appendRegistration({ ...makeRecord(i), priority1: "Web Development", priority2: "Python" });
  }
  console.log(`  1000 appends in ${((Date.now() - fillStart) / 1000).toFixed(2)}s`);

  // --- 3. Now measure steady-state writes AT that size -------------------
  const writeTimings = [];
  for (let i = 1000; i < 1100; i += 1) {
    const t0 = process.hrtime.bigint();
    await appendRegistration({ ...makeRecord(i), priority1: "Web Development", priority2: "Python" });
    writeTimings.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  const w = stats(writeTimings);
  const finalSize = (await fsp.stat(env.REGISTRATIONS_FILE)).size;
  console.log(`\nPOST /api/register  (store = 1000+ records, ${(finalSize / 1024).toFixed(0)} KB)`);
  console.log(`  p50 ${ms(w.p50)}   p95 ${ms(w.p95)}   max ${ms(w.max)}`);

  // --- 4. Duplicate detection: does a second submit get rejected? ----------
  const { record, priority1, priority2 } = {
    record: makeRecord(9999),
    priority1: "Web Development",
    priority2: "Python",
  };
  await appendRegistration({ ...record, priority1, priority2 });
  const afterFirst = JSON.parse(await fsp.readFile(env.REGISTRATIONS_FILE, "utf8"));
  await appendRegistration({ ...record, priority1, priority2 });
  const afterSecond = JSON.parse(await fsp.readFile(env.REGISTRATIONS_FILE, "utf8"));
  const dupes = afterSecond.length - afterFirst.length;
  console.log(`\nSame roll number submitted twice: ${afterFirst.length} -> ${afterSecond.length} records`);
  console.log(`  duplicate accepted? ${dupes > 0 ? "YES - no unique constraint exists" : "no"}`);

  // --- 5. Headroom against the configured ceiling ------------------------
  const cap = env.MAX_STORE_BYTES;
  console.log(`\nHeadroom`);
  console.log(`  1000 records = ${(finalSize / 1024).toFixed(0)} KB of the ${(cap / 1024 / 1024).toFixed(0)} MB cap`);
  console.log(`  ceiling reached at roughly ${Math.round((cap / finalSize) * 1000).toLocaleString()} records`);

  await fsp.rm(TMP, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
