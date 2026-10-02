"use strict";
/**
 * Generates a test roster and an empty registration log.
 *
 * The roster is built to exercise EVERY branch/section path in the form, not
 * just to have rows in a file:
 *
 *   - All 9 branches, with branch strings that exactly match the frontend's
 *     <select> values, so autofill lands on a real option instead of falling
 *     through the withCurrent() escape hatch.
 *   - Sections A and B for the four branches that split (CS, IT, CSBS, ENTC).
 *   - Section A only for the five single-section branches (Mechanical, EI,
 *     EEE, IP, Civil), which is what greys the Section field out in the UI.
 *   - One student whose branch is free text ("Information Technology") rather
 *     than the short code "IT", to deliberately exercise that fallback.
 *   - Social fields set to "NA" so the accepted-none-token path is covered.
 *   - A hyphenated roll number and an all-numeric one, to confirm the
 *     alphanumerics-and-hyphens rule accepts both.
 *   - Lookup misses are NOT in here on purpose: any roll number that is absent
 *     is a miss, so you can test the manual-entry path with anything invented.
 *
 * Run: node scripts/seed-test-data.js
 *      node scripts/seed-test-data.js --reset-only   (only empty the log)
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, "..", "data");

const STUDENTS_FILE = path.join(DATA_DIR, "students.json");
const REGISTRATIONS_FILE = path.join(DATA_DIR, "registrations.json");

const YEARS = ["1st Year", "2nd Year", "3rd Year", "4th Year"];
const GENDERS = ["Female", "Male", "Non-binary", "Prefer not to say"];

/** Branch string must byte-match src/config/options.ts BRANCHES values. */
const TWO_SECTION_BRANCHES = ["CS", "IT", "CSBS", "ENTC"];
const ONE_SECTION_BRANCHES = [
  "Mechanical Engineering",
  "Electronics and Instrumentation",
  "EEE",
  "IP",
  "Civil Engineering",
];

/**
 * Explicit test cases. Writing them out by hand keeps the intent auditable and
 * keeps the file stable, so a given roll number always tests the same thing.
 */
const STUDENTS = [
  // --- Two-section branches: A and B must both be reachable ---------------
  ["26I9001", "Aarav Sharma", "CS", "A", 0, 0, "full"],
  ["26I9002", "Aditi Verma", "CS", "B", 1, 1, "na-linkedin"],
  ["26I9003", "Rohan Mehta", "IT", "A", 2, 0, "full"],
  ["26I9004", "Sneha Iyer", "IT", "B", 3, 1, "na-all-social"],
  ["26I9005", "Kabir Singh", "CSBS", "A", 0, 0, "full"],
  ["26I9006", "Ananya Rao", "CSBS", "B", 1, 1, "instagram-handle-only"],
  ["26I9007", "Vihaan Joshi", "ENTC", "A", 2, 0, "full"],
  ["26I9008", "Diya Patel", "ENTC", "B", 3, 1, "full"],

  // --- Single-section branches: Section must grey out and pin to A --------
  ["26I9009", "Arjun Nair", "Mechanical Engineering", "A", 1, 0, "full"],
  ["26I9010", "Meera Krishnan", "Electronics and Instrumentation", "A", 2, 1, "full"],
  ["26I9011", "Ishaan Desai", "EEE", "A", 3, 0, "na-github"],
  ["26I9012", "Kavya Menon", "IP", "A", 0, 1, "full"],
  ["26I9013", "Reyansh Gupta", "Civil Engineering", "A", 1, 0, "full"],

  // --- Edge cases ---------------------------------------------------------
  // Free-text branch: does NOT match the "IT" option value, so the frontend
  // must fall back and still display it on a locked select.
  ["26I9014", "Jane Doe", "Information Technology", "A", 1, 1, "full"],
  // Hyphen is legal in a roll number.
  ["26I-9015", "Aryan Gupta", "CS", "B", 2, 0, "full"],
  // All-numeric tail, and a name needing internal punctuation.
  ["26I9016", "Mary-Anne Fernandes", "ENTC", "A", 3, 1, "na-instagram"],
  // Lowercase letter in the roll number: lookup is case-insensitive.
  ["26i9017", "Zoya Ali", "CSBS", "B", 0, 1, "full"],
  // Prefer not to say, to check the 4th gender option.
  ["26I9018", "Karan Bhatt", "Civil Engineering", "A", 1, 0, "prefer-not-to-say"],

  // --- A stand-in for the project owner, for hands-on testing --------------
  // Deliberately fictional. This file is tracked in a public repository, so
  // it must never hold a real person's name, email, phone number or roll
  // number - including the maintainer's own. Edit the roll/name here to test
  // your own details without ever committing them.
  [
    "26I9019",
    "Test Owner",
    "CS",
    "A",
    0,
    1, // Male
    "na-all-social",
    {
      email: "owner@example.com",
      contactNumber: "+91 9000000000",
      gender: "Male",
      skills: "C / C++",
    },
  ],
];

function buildStudent([roll, name, branch, section, yearIx, genderIx, social, override = {}]) {
  const base = {
    rollNumber: roll,
    fullName: name,
    branch,
    section,
    yearOfStudy: YEARS[yearIx],
    contactNumber: `+91 9${String(702000000 + Number(roll.replace(/\D/g, "").slice(-9))).slice(0, 9)}`,
    gender: GENDERS[genderIx],
    email: `${roll.toLowerCase().replace(/[^a-z0-9]/g, "")}@ietdavv.edu.in`,
    linkedin: `https://linkedin.com/in/${name.toLowerCase().split(" ")[0]}`,
    github: `https://github.com/${name.toLowerCase().split(" ")[0]}`,
    instagram: `@${name.toLowerCase().split(" ")[0]}`,
    skills: "Web Development",
  };

  if (social === "na-linkedin") {
    base.linkedin = "NA";
    base.github = "NA";
  }
  if (social === "na-all-social") {
    base.linkedin = "N/A";
    base.github = "none";
    base.instagram = "-";
  }
  if (social === "na-github") {
    base.github = "NA";
  }
  if (social === "na-instagram") {
    base.instagram = "NA";
  }
  if (social === "instagram-handle-only") {
    // Deliberately no github, to check optional-field behaviour.
    base.github = "";
  }
  if (social === "prefer-not-to-say") {
    base.gender = "Prefer not to say";
  }
  // Applied last so the tuple can pin exact values.
  return Object.assign(base, override);
}

function main() {
  const resetOnly = process.argv.includes("--reset-only");

  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!resetOnly) {
    const students = STUDENTS.map(buildStudent);
    fs.writeFileSync(STUDENTS_FILE, `${JSON.stringify(students, null, 2)}\n`);
    console.log(`Wrote ${students.length} test students -> ${path.relative(process.cwd(), STUDENTS_FILE)}`);
  }

  fs.writeFileSync(REGISTRATIONS_FILE, "[]\n");
  console.log(`Cleared the registration log -> ${path.relative(process.cwd(), REGISTRATIONS_FILE)}`);

  if (resetOnly) return;

  // Print a cheat sheet so the roster can actually be tested by hand.
  const count = (branches) =>
    STUDENTS.filter(([, , b]) => branches.includes(b)).length;

  // Labels describe what the UI will actually do, not what the data implies.
  // An unrecognised branch falls back to A/B in sectionsForBranch(), so it is
  // NOT greyed out - it shows up as an injected extra option on a locked select.
  const kindOf = (branch) => {
    if (TWO_SECTION_BRANCHES.includes(branch)) return "A/B pick";
    if (ONE_SECTION_BRANCHES.includes(branch)) return "1 section (grey)";
    return "free-text branch (A/B, injected option)";
  };

  console.log("\nRoll numbers to try in Step 1");
  console.log("------------------------------");
  for (const [roll, name, branch, section] of STUDENTS) {
    console.log(
      `  ${roll.padEnd(9)} ${name.padEnd(24)} ${branch.padEnd(31)} ${section}  ${kindOf(branch)}`
    );
  }
  console.log(`\n  ${count(TWO_SECTION_BRANCHES)} students on A/B branches`);
  console.log(`  ${count(ONE_SECTION_BRANCHES)} students on single-section branches`);
  console.log(`  ${STUDENTS.length - count(TWO_SECTION_BRANCHES) - count(ONE_SECTION_BRANCHES)} on a free-text branch`);
  console.log(`  ${STUDENTS.length} total`);

  console.log("\nLookup miss (manual entry path)");
  console.log("------------------------------");
  console.log("  26I9999        not in the roster -> fields stay editable");
  console.log("  DE26566        not in the roster -> fields stay editable");
  console.log("  26I_1101       underscore       -> rejected as malformed");
  console.log("  ../package.json                    -> rejected as malformed");
}

main();
