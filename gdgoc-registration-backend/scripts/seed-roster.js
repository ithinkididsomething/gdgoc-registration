"use strict";
/**
 * Writes data/students.json at BUILD time, for hosts that deploy from Git.
 *
 * WHY THIS EXISTS
 * data/students.json is gitignored because it holds real student data, so a
 * checkout-based deploy ships without it and every lookup silently returns
 * "found: false". This runs during `npm run build` and materialises the roster
 * from whichever channel the host provides:
 *
 *   1. STUDENTS_FILE_PATH - a path to a real roster JSON file. Best option
 *      where the host can mount one (Render secret files, a Docker image, an
 *      SSH-mounted volume). No size limit, and you can read what you mounted.
 *   2. STUDENTS_JSON_B64_FILE - a path to the packed payload written by
 *      scripts/encode-roster.js. Used when the host gives you a file but not a
 *      conveniently sized variable - Windows caps one env var at 32,767 chars
 *      and the payload is ~39,000, so it cannot be set there at all.
 *   3. STUDENTS_JSON_B64 - that same payload inline, for hosts whose dashboard
 *      only takes environment variables, such as Vercel, whose 64KB-per-var
 *      cap is why the payload is compressed in the first place.
 *
 * None set: normal local development, where the roster is already on disk,
 * so this is a no-op and exits 0.
 *
 * If students.json already exists it is left alone. That keeps local runs and
 * hosts with a persistent volume from having a fresh deploy clobber the roster
 * that is already mounted there.
 *
 * Run: node scripts/seed-roster.js
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, "..", "data");

const STUDENTS_FILE = path.join(DATA_DIR, "students.json");

/**
 * Unpacks a marker-prefixed payload written by scripts/encode-roster.js.
 * The marker is explicit rather than sniffed, so a truncated or corrupt
 * payload fails loudly instead of decoding to plausible-looking garbage.
 */
function decode(payload) {
  const marker = payload[0];
  const buf = Buffer.from(payload.slice(1), "base64");

  switch (marker) {
    case "b":
      return zlib.brotliDecompressSync(buf);
    case "z":
      return zlib.gunzipSync(buf);
    case "r":
      return buf;
    default:
      throw new Error(
        `unknown payload marker "${marker}" (expected "b" brotli, "z" gzip or "r" raw). ` +
        "Regenerate it with: node scripts/encode-roster.js"
      );
  }
}

/**
 * Guards against deploying a roster-less or truncated app: a wrong roster means
 * students get another person's details on lookup, so fail the build instead.
 */
function validate(students, source) {
  if (!Array.isArray(students) || students.length === 0) {
    throw new Error(`${source} did not decode into a non-empty array`);
  }
  const bad = students.findIndex(
    (s) => !s || typeof s !== "object" || !s.rollNumber || !s.fullName
  );
  if (bad !== -1) {
    throw new Error(`${source}: record ${bad} has no rollNumber/fullName`);
  }
}

function write(students) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // mode 0o600 matches how the server and the other data scripts write the
  // roster: readable by the app's user, not by the world on a shared host.
  fs.writeFileSync(STUDENTS_FILE, `${JSON.stringify(students, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function main() {
  if (fs.existsSync(STUDENTS_FILE)) {
    // Already present: local checkout, or a volume mounted over the path.
    console.log("seed-roster: students.json already exists, leaving it untouched.");
    return;
  }

  const sourcePath = (process.env.STUDENTS_FILE_PATH || "").trim();
  if (sourcePath) {
    const resolved = path.resolve(sourcePath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`STUDENTS_FILE_PATH points at ${resolved}, which does not exist`);
    }
    const students = JSON.parse(fs.readFileSync(resolved, "utf8").replace(/^\uFEFF/, ""));
    validate(students, "STUDENTS_FILE_PATH");
    write(students);
    console.log(`seed-roster: wrote ${students.length} students from ${resolved}`);
return;
  }

  const payload = (process.env.STUDENTS_JSON_B64 || "").trim();
  const payloadFile = (process.env.STUDENTS_JSON_B64_FILE || "").trim();
  const hasInline = Boolean(payload);
  const hasFile = Boolean(payloadFile);

  if (hasInline || hasFile) {
    const label = hasFile ? "STUDENTS_JSON_B64_FILE" : "STUDENTS_JSON_B64";
    if (hasInline && hasFile) {
      console.warn(`seed-roster: both payload sources set, using ${label}.`);
    }

    let packed = payload;
    if (hasFile) {
      const resolved = path.resolve(payloadFile);
      if (!fs.existsSync(resolved)) {
        throw new Error(`STUDENTS_JSON_B64_FILE points at ${resolved}, which does not exist`);
      }
      packed = fs.readFileSync(resolved, "utf8").trim();
    }

    const students = JSON.parse(decode(packed).toString("utf8"));
    validate(students, label);
    write(students);
    // Never log the payload itself; it is the entire roster.
    console.log(`seed-roster: wrote ${students.length} students from ${label}`);
    return;
  }

  console.log(
    "seed-roster: no STUDENTS_FILE_PATH or STUDENTS_JSON_B64 set, nothing to do.\n" +
    "  Local dev? Fine, the roster is already on disk.\n" +
    "  Deploying? Set one of them, or lookups will return found:false for everyone."
  );
}

try {
  main();
} catch (err) {
  console.error(`seed-roster failed: ${err.message}`);
  process.exit(1);
}