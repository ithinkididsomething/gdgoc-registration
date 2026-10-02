"use strict";

/**
 * Renders the registration log as CSV.
 *
 * Lives in src/ rather than in the export script because there are now two
 * consumers - scripts/export-registrations.js and GET /api/registrations.csv -
 * and two implementations of the quoting rules would eventually disagree, at
 * which point a name containing a comma would break in one path and not the
 * other.
 *
 * ============================ READ THIS BEFORE ADDING A STORE ============
 * `csvCell` does `String(value)` and nothing else. It has no idea what a
 * Firestore Timestamp, a Decimal or a GeoPoint is, so a record holding one
 * renders as the literal text `[object Object]` in the organisers' spreadsheet -
 * no error, no warning, just a broken cell in the one file that matters.
 *
 * That is why the store contract requires ISO strings for `submittedAt` and the
 * other timestamps. When you write a new store driver, store the plain string.
 * The natural instinct with a document database is to use its native types.
 * Here, that instinct silently corrupts the only export the event depends on.
 * =========================================================================
 */

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
  "teamMessage",
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

function toCsv(rows) {
  const lines = [COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(COLUMNS.map((column) => csvCell(row?.[column])).join(","));
  }
  // Excel is happier with CRLF line endings in a CSV.
  return `${lines.join("\r\n")}\r\n`;
}

module.exports = { COLUMNS, csvCell, toCsv };