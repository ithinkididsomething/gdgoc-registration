# gdgoc-registration-backend

The API half of the GDGoC registration portal. It owns the student roster, all
validation, all 8 Google Form URLs, and the registration log.

> The **complete guide** — architecture, the frontend, the form's dropdowns,
> deployment and troubleshooting — lives in the sibling frontend folder:
> **`../gdgoc-registration-frontend/README.md`**
>
> This file is the short version: enough to run it, and enough to do the two
> edits you will actually be asked for.

---

## Run it

```bash
npm install
npm run dev        # node --watch, restarts on save -> http://localhost:3000
npm test           # 30 tests
```

In practice you rarely run this alone — from the frontend folder,
`npm run dev:all` starts both halves together and opens on
<http://localhost:5173>.

Check it is alive:

```bash
curl http://localhost:3000/api/health
# {"success":true,"service":"gdgoc-registration-backend","env":"development"}
```

---

## Task 1 — load the student roster

**Edit `data/students.json`.** Nothing else. No code change, no restart.

It must be a JSON **array of student objects** — no wrapper object, no trailing
commas, no comments.

```json
[
  {
    "rollNumber": "26I9014",
    "fullName": "Jane Doe",
    "branch": "CS",
    "section": "A",
    "yearOfStudy": "2nd Year",
    "contactNumber": "+91 9876543210",
    "gender": "Female",
    "email": "jane.doe@ietdavv.edu.in",
    "linkedin": "https://linkedin.com/in/janedoe",
    "github": "NA",
    "instagram": "@janedoe",
    "skills": "Web Development"
  }
]
```

The rules that bite people:

- **`rollNumber` must be unique** and may contain only letters, digits and
  hyphens. Lookup is case-insensitive, so `26i9014` finds `26I9014`.
- **`yearOfStudy`** must be exactly `1st Year`, `2nd Year`, `3rd Year` or
  `4th Year`. The API rejects anything else.
- **`gender`** must be exactly `Female`, `Male`, `Non-binary` or
  `Prefer not to say`.
- **`linkedin` is required**, so students without a profile must be able to
  write `NA` — it is accepted and stored as empty. So are `n/a`, `none`, `nil`,
  `not available`, `-` and `--`.
- **`github` and `instagram`** are optional. Instagram also accepts an
  `@handle`.
- **No comments in JSON.** To annotate the file, use a `_`-prefixed key
  (`"_note": "from the 2nd list"`) — those are stripped before the record is
  sent to the browser.
- **The roster is re-read from disk every 30 seconds.** Save and wait; no
  restart. Override with `STUDENTS_CACHE_TTL_MS`.
- **A JSON syntax error makes the whole roster read as empty** rather than
  crashing. If every lookup suddenly returns "not found", check the console for
  the parse error first.

Verify:

```bash
curl http://localhost:3000/api/lookup/26I9014
```

`data/students.json` is **git-ignored** because it is personal data. Share it
through a secure channel, not through git.

For deeper notes see [`data/README.md`](data/README.md).

---

## Task 2 — replace the placeholder Google Form URLs

**Edit `config/verticals.js`.** Eight placeholder URLs in one object. Paste the
real link over each one.

```js
const VERTICAL_FORMS = Object.freeze({
  content: "https://forms.google.com/placeholder-content",
  creatives: "https://forms.google.com/placeholder-creatives",
  "production and social media": "https://forms.google.com/placeholder-prod-social",
  marketing: "https://forms.google.com/placeholder-marketing",
  "pr and sponsership": "https://forms.google.com/placeholder-pr-sponsorship",
  technical: "https://forms.google.com/placeholder-technical",
  design: "https://forms.google.com/placeholder-design",
  operations: "https://forms.google.com/placeholder-operations",
});
```

Get the link from Google Forms via **Send → Link**, and use the `/viewform`
variant:

```
https://docs.google.com/forms/d/e/<FORM_ID>/viewform
```

Two things not to change:

- **The keys are the contract with the frontend.** The browser sends the key
  back on submit and the server looks it up by exact match. Renaming a key
  breaks that vertical.
- **`pr and sponsership` is misspelled on purpose.** The typo exists in both
  projects. The display label the student sees — "PR and Sponsorship" — is
  spelled correctly.

Verify by submitting anything through the app, or hit the API directly. **In
PowerShell, do not use `curl -d '{...}'`** — it strips the inner quotes and the
server answers `Malformed JSON body`. Use this instead:

```powershell
$body = @{
  rollNumber="26I9001"; fullName="Aarav Sharma"; branch="CS"; section="A"
  yearOfStudy="1st Year"; contactNumber="+91 9876543210"; gender="Male"
  email="a@example.com"; linkedin="NA"; skills="Web Development"
  priority1="technical"; priority2="design"
} | ConvertTo-Json -Compress

Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/register" `
  -ContentType "application/json" -Body $body
```

On macOS or Linux:

```bash
curl -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{"rollNumber":"26I9001","fullName":"Aarav Sharma","branch":"CS","section":"A","yearOfStudy":"1st Year","contactNumber":"+91 9876543210","gender":"Male","email":"a@example.com","linkedin":"NA","skills":"Web Development","priority1":"technical","priority2":"design"}'
```

The reply contains only the two verticals that were requested. A URL that is
still a placeholder opens a Google 404 — that is intentional, so an unfilled
link is obvious during testing.

**These URLs are secrets.** They live only in this file and are handed out two
at a time. Do not paste them into the frontend, and do not commit them. The
frontend's `npm run build` scans the finished bundle for form URLs and fails the
build if one is found.

---

## The API

| Method | Path | Returns |
|---|---|---|
| `GET` | `/api/health` | `{ success, service, env }` |
| `GET` | `/api/lookup/:rollNumber` | `{ success, found, student? }` — never the whole roster |
| `POST` | `/api/register` | `201 { success, forms: { priority1: {name,url}, priority2: {name,url} } }` |

`POST` needs: `rollNumber`, `fullName`, `branch`, `yearOfStudy`,
`contactNumber`, `gender`, `email`, `linkedin`, `priority1`, `priority2`.
Optional: `section`, `github`, `instagram`, `skills`. The two priorities must
differ.

| Status | Meaning |
|---|---|
| `201` | Stored; two form links returned |
| `400` | Validation failed — body has a per-field `fields` map |
| `413` | Body over `BODY_LIMIT` (64 KB) |
| `429` | Over the per-IP rate limit (10 registers or 30 lookups per minute) |
| `503` | `registrations.json` has hit `MAX_STORE_BYTES` (8 MB) |

---

## Files

```
server.js              entry point
config/
  env.js               all environment defaults
  verticals.js         <<< the 8 Google Form URLs
data/
  students.json        <<< the student roster (git-ignored)
  registrations.json   the growing log (git-ignored)
  README.md            deeper notes on both files
src/
  app.js               routes + central error handler
  students.js          roster load, cache, lookup
  registrations.js     serialised atomic append
  validation.js        every rule the server enforces
  security.js          URL sanitising, throttling, text cleanup
scripts/
  seed-test-data.js    rebuild the 19-student test roster
  bench-store.js       throughput + duplicate-registration check
test/api.test.js       30 tests
```

---

## Environment variables

All optional in development; there is no `.env` file and none is needed.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Keep in sync with `vite.config.ts` if changed |
| `HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `development` | `production` tightens CORS and hides error detail |
| `CORS_ORIGINS` | localhost in dev | **Required in production** — comma-separated exact origins |
| `DATA_DIR` | `./data` | Where the JSON files live |
| `STUDENTS_CACHE_TTL_MS` | `30000` | Roster re-read interval |
| `MAX_STORE_BYTES` | `8388608` | Refuse registrations past this log size |
| `RATE_LIMIT_MAX_LOOKUP` | `30` | Per minute, per IP |
| `RATE_LIMIT_MAX_REGISTER` | `10` | Per minute, per IP |
| `BODY_LIMIT` | `64kb` | Max request body |
| `TRUST_PROXY_HOPS` | `0` | Trusted proxy count, for rate-limit IP resolution |

With `NODE_ENV=production` and no `CORS_ORIGINS` the server **refuses to
start**, rather than opening the endpoints that hand out internal form links to
every origin.

---

## Test data

```bash
node scripts/seed-test-data.js              # rebuild the 19-student roster
node scripts/seed-test-data.js --reset-only # just clear registrations.json
node scripts/bench-store.js                 # 1,000-registration benchmark
```

`seed-test-data.js` overwrites `data/students.json`, so do not run it after
loading the real roster.

---

## Known gaps

- **Duplicate roll numbers are accepted.** Nothing rejects a second submission
  from the same roll number. If that matters, check for an existing `rollNumber`
  inside the write lock in `src/registrations.js` and return `409 Conflict` —
  `rateLimit` in `src/security.js` shows the pattern.
- **`registrations.json` is not durable.** A container filesystem is wiped on
  redeploy, and it is the only record of who registered. Back it up somewhere
  durable before the event.
