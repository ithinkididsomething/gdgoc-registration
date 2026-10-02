// Confirms dist/roster.b64.txt is the REAL roster: same 720 students as
// data/students.json, with no test fixtures mixed in.
const fs = require("fs");
const zlib = require("zlib");

const payload = fs.readFileSync("dist/roster.b64.txt", "utf8").trim();
const marker = payload[0];
const buf = Buffer.from(payload.slice(1), "base64");
const decoded =
  marker === "b" ? zlib.brotliDecompressSync(buf)
  : marker === "z" ? zlib.gunzipSync(buf)
  : buf;

const fromPayload = JSON.parse(decoded.toString("utf8"));
const fromDisk = JSON.parse(fs.readFileSync("data/students.json", "utf8"));

console.log(`payload marker      : ${marker}`);
console.log(`records in payload  : ${fromPayload.length}`);
console.log(`records on disk     : ${fromDisk.length}`);

const key = (s) => `${s.rollNumber}|${s.fullName}`.toLowerCase();
const payloadKeys = new Set(fromPayload.map(key));
const diskKeys = new Set(fromDisk.map(key));

const missing = [...diskKeys].filter((k) => !payloadKeys.has(k));
const extra = [...payloadKeys].filter((k) => !diskKeys.has(k));
console.log(`in disk but NOT in payload : ${missing.length}${missing.length ? ` -> ${missing.slice(0, 5)}` : ""}`);
console.log(`in payload but NOT in disk : ${extra.length}${extra.length ? ` -> ${extra.slice(0, 5)}` : ""}`);

// Anything that smells like a fixture is a problem, not a harmless extra.
const suspicious = fromPayload.filter((s) =>
  /test|fixture|sample|dummy|lorem|^na$|xxx/i.test(`${s.rollNumber} ${s.fullName}`)
);
console.log(`suspicious/test-looking rows : ${suspicious.length}`);
if (suspicious.length) {
  for (const s of suspicious.slice(0, 12)) console.log(`   ${s.rollNumber} | ${s.fullName}`);
}

const withEmail = fromPayload.filter((s) => s.email && !/^n\/?a$/i.test(s.email.trim())).length;
console.log(`rows carrying a real email  : ${withEmail}`);
console.log(`distinct branches           : ${new Set(fromPayload.map((s) => s.branch)).size}`);
