"use strict";
/**
 * Packs the roster into a single environment-variable-safe string, for hosts
 * that deploy from Git (and therefore have no data/ directory to ship).
 *
 * WHY THIS EXISTS
 * data/students.json is gitignored because it is real student data - names,
 * phone numbers, emails and socials for 720 people. That is correct, but it
 * means a fresh checkout has NO roster, so /api/lookup/:rollNumber answers
 * "found: false" for everyone and the portal silently looks broken.
 *
 * The usual fix is to base64 the file into a build-time environment variable.
 * That does not work as-is: Vercel caps a single environment variable at 64KB
 * (total across all variables), and base64 of the roster is ~322KB. So the
 * payload is brotli-compressed first, which takes it to ~39KB because 720 rows
 * of the same JSON keys and the same branch names compress extremely well.
 * brotli and gzip both ship inside Node's zlib, so this adds no dependency.
 *
 * The output is a marker char followed by base64, so the decoder never has to
 * sniff: "b" = brotli, "z" = gzip, "r" = uncompressed base64.
 *
 * Run: node scripts/encode-roster.js
 *      node scripts/encode-roster.js --print     (dump the value to stdout)
 *      node scripts/encode-roster.js --out path  (default dist/roster.b64.txt)
 *
 * The encoded payload is still every student's personal data. It goes in your
 * host's secret store, never in git and never in a shared doc.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, "..", "data");

const STUDENTS_FILE = path.join(DATA_DIR, "students.json");

/** Vercel's documented cap for one environment variable, and therefore ours. */
const HOST_LIMIT_BYTES = 64 * 1024;

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(name);
const flagValue = (name, fallback) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

function main() {
  if (!fs.existsSync(STUDENTS_FILE)) {
    console.error(`No roster at ${STUDENTS_FILE}`);
    console.error("Import one first: node scripts/import-google-form.js <export.json>");
    process.exit(1);
  }

  const students = JSON.parse(fs.readFileSync(STUDENTS_FILE, "utf8").replace(/^\uFEFF/, ""));
  if (!Array.isArray(students) || students.length === 0) {
    console.error(`${STUDENTS_FILE} did not parse into a non-empty array.`);
    process.exit(1);
  }

  const json = Buffer.from(JSON.stringify(students), "utf8");

  // Prefer the smallest encoding that fits; fall back through the others so a
  // host with a tighter or looser budget still gets something usable.
  const candidates = [
    ["b", "brotli", zlib.brotliCompressSync(json, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
    })],
    ["z", "gzip", zlib.gzipSync(json, { level: 9 })],
    ["r", "raw", json],
  ].map(([marker, label, buf]) => ({
    marker,
    label,
    bytes: buf.length,
    value: marker + buf.toString("base64"),
  }));

  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

  console.log(`Roster: ${students.length} students, ${kb(json.length)} of JSON`);
  console.log("");
  for (const c of candidates) {
    const size = Buffer.byteLength(c.value);
    const verdict = size > HOST_LIMIT_BYTES
      ? `EXCEEDS the ${kb(HOST_LIMIT_BYTES)} host limit`
      : `fits, ${kb(HOST_LIMIT_BYTES - size)} to spare`;
    console.log(`  ${c.label.padEnd(7)} ${kb(size).padStart(9)}   ${verdict}`);
  }

  const chosen = candidates.find((c) => Buffer.byteLength(c.value) <= HOST_LIMIT_BYTES) || candidates[0];
  console.log("");
  console.log(`Using: ${chosen.label} (${kb(Buffer.byteLength(chosen.value))})`);

  if (chosen !== candidates[0]) {
    console.log("");
    console.log(`Note: ${chosen.label} was chosen because the smaller encoding did not fit.`);
    console.log("If this host's limit is smaller still, use a secret FILE instead - see README.");
  }

  if (hasFlag("--print")) {
    process.stdout.write(chosen.value);
    return;
  }

  const outPath = path.resolve(flagValue("--out", path.resolve(__dirname, "..", "dist", "roster.b64.txt")));
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  // mode 0o600: this file is the whole roster in one line.
  fs.writeFileSync(outPath, chosen.value, { encoding: "utf8", mode: 0o600 });

  console.log(`Wrote ${outPath}`);
  console.log("");
  console.log("Set it as a BUILD-time secret, then redeploy:");
  console.log(`  vercel env add STUDENTS_JSON_B64 production < "${outPath}"`);
}

try {
  main();
} catch (err) {
  console.error(`encode-roster failed: ${err.message}`);
  process.exit(1);
}