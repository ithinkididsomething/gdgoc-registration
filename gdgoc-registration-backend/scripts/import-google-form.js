"use strict";
/**
 * Imports a Google Forms export into the roster (data/students.json).
 *
 * Usage:
 *   node scripts/import-google-form.js "<path to export>.json"
 *   node scripts/import-google-form.js "<path>" --dry-run
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DOES WITH THE SHEETS
 *
 * A Google Forms export can contain several sheets. This importer deliberately
 * uses ONLY "Sheet1", and this is the single most important thing to understand
 * about it:
 *
 *   - "Sheet4" is entirely contained within "Sheet1". Every enrollment number in
 *     it also appears in Sheet1. It is a stale, earlier export. Merging it would
 *     create ~582 phantom duplicate students.
 *   - "duplicate of sheet 1" is ALSO entirely contained within "Sheet1". Every
 *     one of its enrollment numbers is already there. Merging it would create
 *     ~104 more phantom duplicates.
 *   - "Drafts" are never-submitted responses. Google captures them, but the
 *     student never pressed submit, so they are not registrations. Excluded.
 *
 * So: Sheet1 in, everything else ignored. The script verifies the containment
 * claim on every run and prints the result, rather than trusting this comment.
 *
 * Deduplication is keyed on the Google account, not the enrollment number. An
 * enrollment number can be mistyped or left blank; the signed-in Google account
 * cannot change between two submissions by the same person.
 *
 * ---------------------------------------------------------------------------
 * THIS SCRIPT NEVER TOUCHES GIT.
 *
 * students.json holds real names, emails and phone numbers, so it is
 * git-ignored. Nothing this script writes is meant to be committed. Only this
 * file is source code.
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, "..", "data");

const ROSTER_FILE = path.join(DATA_DIR, "students.json");
const NEEDS_ENROLLMENT_FILE = path.join(DATA_DIR, "needs-enrollment.csv");
const REPORT_FILE = path.join(DATA_DIR, "import-report.json");

/** Mirrors ROLL_NUMBER_RE in src/students.js and src/validation.js. */
const ROLL_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/;

/**
 * Google Forms writes the sheet's short codes ("ETC") but the app's dropdowns
 * use the canonical names ("ENTC"). Left unmapped, those students would be
 * auto-filled with a value the branch list does not contain.
 *
 * Any branch not listed here is passed through untouched and reported, so new
 * cohorts can be added deliberately rather than silently mis-mapped.
 *
 * Matched case-insensitively: the export contains at least one lowercase "cs",
 * which would otherwise miss the map and land in the form as an unknown branch.
 */
const BRANCH_MAP = {
  CS: "CS",
  IT: "IT",
  CSBS: "CSBS",
  ETC: "ENTC",
  EEE: "EEE",
  IP: "IP",
  EI: "Electronics and Instrumentation",
  Mech: "Mechanical Engineering",
  Civil: "Civil Engineering",
};

const BRANCH_LOOKUP = new Map(
  Object.entries(BRANCH_MAP).map(([k, v]) => [k.toLowerCase(), v])
);

const GENDERS = new Set(["Male", "Female"]);
const YEARS = new Set(["1st Year", "2nd Year", "3rd Year", "4th Year"]);

function cell(row, ...names) {
  for (const name of names) {
    const value = row?.[name];
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

const isBlankRow = (row) =>
  !Object.values(row || {}).some((v) => String(v ?? "").trim() !== "");

/**
 * Parse the Google Forms timestamp, e.g. "9 Sept 2026, 9:30:37 pm".
 * Returns NaN if unparseable, which callers treat as "unknown, keep first".
 */
function parseTimestamp(raw) {
  const text = String(raw || "").trim();
  if (!text) return NaN;
  const normalised = text
    .replace(/(\d)(st|nd|rd|th)/gi, "$1")
    .replace(/\bSept\b/gi, "Sep")
    .replace(/\b(\d{1,2}):(\d{2}):(\d{2})\s*([ap])\.?m\.?/i, "$1:$2:$3 $4");
  const parsed = Date.parse(normalised);
  return Number.isNaN(parsed) ? NaN : parsed;
}

/** Google writes "Male"/"Female", but tolerate case and stray whitespace. */
function normaliseGender(raw) {
  const text = String(raw || "").trim();
  const match = [...GENDERS].find((g) => g.toLowerCase() === text.toLowerCase());
  return match || text;
}

function normaliseYear(raw) {
  const text = String(raw || "").trim();
  if (YEARS.has(text)) return text;
  const loose = text.replace(/\s+/g, " ").toLowerCase();
  const match = [...YEARS].find((y) => y.toLowerCase() === loose);
  return match || text;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const sourceArg = args.find((a) => !a.startsWith("--"));

  if (!sourceArg) {
    console.error('\n  Usage: node scripts/import-google-form.js "<export.json>" [--dry-run]\n');
    process.exit(1);
  }

  const sourceFile = path.resolve(sourceArg);
  if (!fs.existsSync(sourceFile)) {
    console.error(`\n  Export not found:\n    ${sourceFile}\n`);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(sourceFile, "utf8"));
  } catch (error) {
    console.error(`\n  Could not parse the export as JSON: ${error.message}\n`);
    process.exit(1);
  }

  const sheets = Object.keys(parsed).filter(
    (k) => Array.isArray(parsed[k]) && parsed[k].length
  );
  const primary = sheets.find((s) => s === "Sheet1") || sheets[0];

  if (!primary) {
    console.error("\n  The export contains no sheets with rows.\n");
    process.exit(1);
  }

  const rows = parsed[primary].filter((r) => !isBlankRow(r));

  // --- Verify, don't trust: are the other sheets really redundant? ----------
  const norm = (v) => String(v || "").trim().toLowerCase();
  const primaryKeys = new Set(
    rows.map((r) => norm(cell(r, "Enrollment Number", "enrollmentNumber"))).filter(Boolean)
  );
  const sheetAudit = sheets.map((name) => {
    const others = parsed[name].filter((r) => !isBlankRow(r));
    const keys = others
      .map((r) => norm(cell(r, "Enrollment Number", "enrollmentNumber")))
      .filter(Boolean);
    const unique = new Set(keys);
    const alreadyInPrimary = [...unique].filter((k) => primaryKeys.has(k)).length;
    return {
      sheet: name,
      rows: others.length,
      uniqueEnrollment: unique.size,
      alreadyInPrimary,
      newVsPrimary: unique.size - alreadyInPrimary,
      usedAsSource: name === primary,
    };
  });

  // --- Deduplicate on the Google account ------------------------------------
  const byAccount = new Map();
  let duplicateRows = 0;
  for (const row of rows) {
    const account = norm(cell(row, "Google Email", "googleEmail", "Email Address"));
    const key = account || `__row${byAccount.size}`; // blank account: never merge
    const existing = byAccount.get(key);
    if (!existing) {
      byAccount.set(key, { row, account });
      continue;
    }
    duplicateRows++;
    const incoming = parseTimestamp(cell(row, "Timestamp", "timestamp"));
    const current = parseTimestamp(cell(existing.row, "Timestamp", "timestamp"));
    if (!Number.isNaN(incoming) && (Number.isNaN(current) || incoming < current)) {
      byAccount.set(key, { row, account }); // keep the earlier submission
    }
  }

  // --- Project onto the roster schema ---------------------------------------
  const roster = [];
  const missingEnrollment = [];
  const unmappedBranches = new Map();
  let badRollNumber = 0;
  let unknownGender = 0;
  let unknownYear = 0;

  for (const { row } of byAccount.values()) {
    const rollNumber = cell(row, "Enrollment Number", "enrollmentNumber");
    const rawBranch = cell(row, "Branch", "branch");
    const branch = BRANCH_LOOKUP.get(rawBranch.toLowerCase()) || rawBranch;
    if (rawBranch && !BRANCH_LOOKUP.has(rawBranch.toLowerCase())) {
      unmappedBranches.set(rawBranch, (unmappedBranches.get(rawBranch) || 0) + 1);
    }

    const gender = normaliseGender(cell(row, "Gender", "gender"));
    if (gender && !GENDERS.has(gender)) unknownGender++;
    const yearOfStudy = normaliseYear(cell(row, "Year", "yearOfStudy", "year"));
    if (yearOfStudy && !YEARS.has(yearOfStudy)) unknownYear++;

    const entry = {
      rollNumber,
      fullName: cell(row, "Full Name", "fullName", "Name"),
      branch,
      section: cell(row, "Section", "section").toUpperCase(),
      yearOfStudy,
      contactNumber: cell(row, "Contact Number", "contactNumber", "Phone Number"),
      gender,
      email: cell(row, "College Email ID", "College Email", "email"),
      linkedin: cell(row, "LinkedIn ID", "LinkedIn", "linkedin"),
      github: cell(row, "Github ID", "GitHub", "github"),
      instagram: cell(row, "Instagram ID", "Instagram", "instagram"),
      skills: cell(row, "Interest Skills", "interestSkills", "skills"),
    };

    if (!rollNumber) {
      missingEnrollment.push({
        fullName: entry.fullName,
        googleAccount: cell(row, "Google Email"),
        branch: entry.branch,
        skills: entry.skills,
      });
      continue;
    }
    if (!ROLL_RE.test(rollNumber)) {
      badRollNumber++;
      missingEnrollment.push({
        fullName: entry.fullName,
        googleAccount: cell(row, "Google Email"),
        rejectedRollNumber: rollNumber,
        branch: entry.branch,
        skills: entry.skills,
      });
      continue;
    }

    roster.push(entry);
  }

  // Two people cannot share an enrollment number; last write wins, loudly noted.
  const seen = new Map();
  const collisions = [];
  const finalRoster = [];
  for (const entry of roster) {
    const key = entry.rollNumber.toLowerCase();
    if (seen.has(key)) {
      collisions.push(entry.rollNumber);
      continue;
    }
    seen.set(key, true);
    finalRoster.push(entry);
  }

  finalRoster.sort((a, b) =>
    a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true })
  );

  // --- Report ---------------------------------------------------------------
  const line = (s = "") => console.log(s);
  line();
  line(`  Source file : ${sourceFile}`);
  line(`  Sheet used  : "${primary}"`);
  line();

  line("  Sheets in the export");
  for (const s of sheetAudit) {
    const tag = s.usedAsSource ? "  <- used" : s.newVsPrimary === 0 ? "  (fully contained, skipped)" : `  (+${s.newVsPrimary} new)`;
    line(
      `    ${s.sheet.padEnd(24)} ${String(s.rows).padStart(4)} rows  ${String(s.uniqueEnrollment).padStart(4)} unique${tag}`
    );
  }
  line();

  line("  Reconciliation");
  line(`    non-empty rows in "${primary}" : ${rows.length}`);
  line(`    duplicate submissions removed  : ${duplicateRows}`);
  line(`    rolled up to unique students   : ${byAccount.size}`);
  line(`    roster written                : ${finalRoster.length}`);
  if (missingEnrollment.length) {
    line(`    excluded, no usable enrollment: ${missingEnrollment.length}`);
  }
  if (collisions.length) {
    line(`    enrollment collisions dropped  : ${collisions.length}`);
  }
  line(`    drafts excluded (never submitted): ${Math.max(0, (parsed["Drafts"] || []).length)}`);
  line();

  if (unmappedBranches.size) {
    line("  Branches with no mapping (passed through as-is)");
    for (const [name, count] of [...unmappedBranches].sort((a, b) => b[1] - a[1])) {
      line(`    ${String(name).padEnd(20)} ${count}`);
    }
    line("    These are not in the branch dropdown. The form will still show them,");
    line("    but consider adding a real option in src/config/options.ts.");
    line();
  }
  if (unknownGender || unknownYear) {
    if (unknownGender) line(`  Unrecognised gender values: ${unknownGender}`);
    if (unknownYear) line(`  Unrecognised year values: ${unknownYear}`);
    line();
  }

  if (dryRun) {
    line("  --dry-run: nothing written.\n");
    return;
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });

  // Back up the roster we are about to overwrite. It is not in git, so this is
  // the only copy that exists.
  if (fs.existsSync(ROSTER_FILE)) {
    const backup = path.join(DATA_DIR, "students.backup.json");
    fs.copyFileSync(ROSTER_FILE, backup);
    line(`  Backed up the previous roster -> ${backup}`);
  }

  fs.writeFileSync(ROSTER_FILE, `${JSON.stringify(finalRoster, null, 2)}\n`, "utf8");
  line(`  Wrote ${finalRoster.length} students -> ${ROSTER_FILE}`);

  if (missingEnrollment.length) {
    const header = "Full Name,Google Account,Branch,Rejected Roll Number,Interest Skills";
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rowsCsv = missingEnrollment.map((m) =>
      [m.fullName, m.googleAccount, m.branch, m.rejectedRollNumber || "", m.skills]
        .map(esc)
        .join(",")
    );
    fs.writeFileSync(NEEDS_ENROLLMENT_FILE, `${[header, ...rowsCsv].join("\r\n")}\r\n`, "utf8");
    line(`  ${missingEnrollment.length} student(s) need an enrollment number:`);
    line(`    ${NEEDS_ENROLLMENT_FILE}`);
  }

  fs.writeFileSync(
    REPORT_FILE,
    `${JSON.stringify(
      {
        importedAt: new Date().toISOString(),
        sourceFile,
        sourceSheet: primary,
        sheetAudit,
        rowsInSheet: rows.length,
        duplicateSubmissionsRemoved: duplicateRows,
        uniqueStudents: byAccount.size,
        rosterWritten: finalRoster.length,
        excludedForMissingEnrollment: missingEnrollment.length,
        draftsExcluded: (parsed["Drafts"] || []).length,
        unmappedBranches: Object.fromEntries(unmappedBranches),
        enrollmentCollisions: collisions,
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  line();
  line("  Remember: students.json is git-ignored. Do not commit it or any export.");
  line();
}

main();