"use strict";

/**
 * Renders the registration log as CSV.
 *
 * Lives in src/ rather than in the export script because there are now two
 * consumers - scripts/export-registrations.js and GET /api/registrations.csv -
 * and two implementations of the quoting rules would eventually disagree, at
 * which point a name containing a comma would break in one path and not the
 * other.
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