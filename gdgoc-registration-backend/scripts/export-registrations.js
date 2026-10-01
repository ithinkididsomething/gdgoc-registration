"use strict";
/**
 * Exports the registration log to CSV, ready for Google Sheets / Excel.
 *
 * Run:
 *   node scripts/export-registrations.js               -> data/registrations.csv
 *   node scripts/export-registrations.js out.csv       -> that exact filename
 *   node scripts/export-registrations.js -             -> CSV to stdout
 *
 * Why this exists: the whole point of collecting registrations is to act on
 * them, and the store is a JSON array. Excel will not open a .json file, and
 * "paste the array into Sheets" breaks the moment a name contains a comma.
 * So this flattens it properly - every field its own column, and quoting done
 * correctly.
 *
 * Read-only: it never modifies registrations.json.
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, "..", "data");
const REGISTRATIONS_FILE = path.join(DATA_DIR, "registrations.json");

/** Column order. Anything missing from a record becomes an empty cell. */
const COLUMNS = [
  "submittedAt",
  "rollNumber",
  "fullName",
  "branch",
  "section",
  "yearOfStudy",
  "contactNumber",
  "gender",
  "email",
  "linkedin",
  "github",
  "instagram",
  "skills",
  "priority1",
  "priority2",
];

/**
 * Quote a value for CSV per RFC 4180.
 *
 * Wrapping in quotes is not enough on its own: a cell containing a double quote
 * has to have that quote doubled, or Sheets truncates the field at the quote.
 * A leading =, +, - or @ is prefixed with a tab as well, because those make
 * spreadsheets treat the cell as a formula - a real risk here, since
 * contactNumber values can contain them.
 */
function csvCell(value) {
  if (value === null || value === undefined) return '""';
  let text = String(value);

  if (/^[=+\-@\t\r]/.test(text)) text = `\t${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

function readRegistrations() {
  if (!fs.existsSync(REGISTRATIONS_FILE)) {
    console.error(`\n  No registrations file at:\n    ${REGISTRATIONS_FILE}\n`);
    console.error("  Nothing to export yet. Submit the form once, or run:");
    console.error("    node scripts/seed-test-data.js\n");
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(REGISTRATIONS_FILE, "utf8"));
  } catch (error) {
    console.error(`\n  registrations.json is not valid JSON: ${error.message}\n`);
    process.exit(1);
  }

  if (!Array.isArray(parsed)) {
    console.error("\n  registrations.json should contain a JSON array.\n");
    process.exit(1);
  }
  return parsed;
}

function toCsv(rows) {
  const lines = [COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(COLUMNS.map((column) => csvCell(row?.[column])).join(","));
  }
  // Excel is happier with CRLF line endings in a CSV.
  return `${lines.join("\r\n")}\r\n`;
}

const args = process.argv.slice(2);
const records = readRegistrations();
const csv = toCsv(records);

if (args[0] === "-") {
  process.stdout.write(csv);
  process.exit(0);
}

const outFile = args[0]
  ? path.resolve(args[0])
  : path.join(DATA_DIR, "registrations.csv");

fs.writeFileSync(outFile, csv, "utf8");

// A quick summary the organisers will actually want.
const byVertical = {};
for (const record of records) {
  for (const key of ["priority1", "priority2"]) {
    const name = record?.[key];
    if (name) byVertical[name] = (byVertical[name] || 0) + 1;
  }
}

console.log(`\n  Exported ${records.length} registration(s) -> ${outFile}`);
if (records.length) {
  console.log("\n  Choices per vertical (a student counts in both):");
  const sorted = Object.entries(byVertical).sort((a, b) => b[1] - a[1]);
  const widest = Math.max(...sorted.map(([, count]) => String(count).length));
  for (const [name, count] of sorted) {
    console.log(`    ${name.padEnd(24)} ${String(count).padStart(widest)}`);
  }
  const unique = new Set(records.map((r) => String(r.rollNumber).toLowerCase()));
  if (unique.size !== records.length) {
    console.log(
      `\n  Note: ${records.length} submissions but ${unique.size} distinct roll numbers.\n` +
        "  Some roll numbers appear more than once - the API does not block this yet."
    );
  }
}
console.log();