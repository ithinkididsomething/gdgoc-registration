# GDGoC IET DAVV — Registration Portal

A registration portal for the 8 GDGoC verticals. Students look up their roll
number, confirm their details, pick two vertical preferences, and receive the
Google Form links for exactly those two.

It is two small programs that run as one app:

| | Folder | Runs on | What it owns |
|---|---|---|---|
| **Frontend** | `gdgoc-registration-frontend/` | `localhost:5173` | The form, light/dark theme, English/Hindi |
| **Backend** | `gdgoc-registration-backend/` | `localhost:3000` | The student roster, validation, all 8 form URLs, the registration log |

> **New here? Read [The two jobs you'll be asked to do](#the-two-jobs-youll-be-asked-to-do)
> first — updating the student list and replacing the form links are both
> one-file edits, and neither needs any code changes.**

---

## Contents

- [Quick start](#quick-start)
- [The two jobs you'll be asked to do](#the-two-jobs-youll-be-asked-to-do)
- [Why it is split in two](#why-it-is-split-in-two)
- [How a request flows](#how-a-request-flows)
- [API reference](#api-reference)
- [The form's dropdowns](#the-forms-dropdowns)
- [Configuration](#configuration)
- [Project layout](#project-layout)
- [Testing and checks](#testing-and-checks)
- [Troubleshooting](#troubleshooting)
- [Going live](#going-live)
- [Security notes](#security-notes)

---

## Quick start

You need **Node 18.17 or newer**. Check with `node -v`.

**One-time install** (both halves have their own dependencies):

```bash
cd gdgoc-registration-backend
npm install

cd ../gdgoc-registration-frontend
npm install
```

**Every time you want to work on it** — one command, one terminal:

```bash
cd gdgoc-registration-frontend
npm run dev:all
```

Then open **<http://localhost:5173>**.

`dev:all` starts the API and the web app together, labels their output `[api]`
and `[web]`, waits until the API actually answers before printing the ready
banner, and stops both on `Ctrl+C`. If one half is already running it reuses it
instead of starting a second copy.

**Use `localhost`, not `127.0.0.1`.** Vite binds the IPv6 loopback (`::1`) on
Windows, so `http://127.0.0.1:5173` is refused even though the server is up.

<details>
<summary>Prefer two separate terminals?</summary>

```bash
# Terminal 1
cd gdgoc-registration-backend
npm run dev            # node --watch server.js  ->  :3000

# Terminal 2
cd gdgoc-registration-frontend
npm run dev            # vite --strictPort       ->  :5173
```

This is exactly what `dev:all` does for you. If you run the backend yourself,
`npm run dev` on the frontend also works, but pass `--strictPort` so Vite fails
loudly instead of silently sliding to port 5174.

</details>

### Try it without touching the data

The test roster is already in place. Open the app, type **`26I9001`**, and press
lookup. A few useful ones:

| Roll number | What it demonstrates |
|---|---|
| `26I9001` | A normal CS / Section A student |
| `26I9002` | `linkedin` set to `NA` — the "I don't have one" path |
| `26I9009` | Mechanical Engineering — Section greys out and pins to A |
| `26I9014` | Branch stored as free text, not a dropdown code |
| `26I-9015` | A hyphen in the roll number (legal) |
| `26i9019` | Parth Saxena — added by hand, for hands-on testing |
| `26I9999` | Not in the roster — the manual-entry path |

---

## The two jobs you'll be asked to do

### 1. Update the student roster

**File:** `gdgoc-registration-backend/data/students.json`

Replace the contents with the real list. It must be a JSON **array of student
objects** and nothing else — no wrapper object, no trailing commas, no
`//` comments. No code changes and no restart needed.

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
    "github": "https://github.com/janedoe",
    "instagram": "@janedoe",
    "skills": "Web Development"
  }
]
```

#### Field rules

| Field | Required | Accepted values |
|---|---|---|
| `rollNumber` | yes | Letters, digits and hyphens only. Matched **case-insensitively**, so `26i9014` finds `26I9014`. Must be unique. |
| `fullName` | yes | Free text, 2–100 characters |
| `branch` | yes | Free text, up to 80 characters. Use a value from [The form's dropdowns](#the-forms-dropdowns) to get the clean autofill. |
| `section` | no | `A` or `B` for the four split branches; single-section branches ignore it |
| `yearOfStudy` | yes | Exactly `1st Year`, `2nd Year`, `3rd Year` or `4th Year` |
| `contactNumber` | yes | 7–20 digits, optionally with `+`, spaces, `-`, `()` |
| `gender` | yes | Exactly `Female`, `Male`, `Non-binary`, or `Prefer not to say` |
| `email` | yes | A normal address. Stored lowercased. |
| `linkedin` | yes | A `http(s)://` profile URL, **or** `NA` |
| `github` | no | A `http(s)://` URL, an `@handle`, **or** `NA` |
| `instagram` | no | A full profile URL, an `@handle` such as `@jane.doe`, **or** `NA` |
| `skills` | no | Free text, up to 500 characters |

#### If a student has no social profile

`linkedin` is required, so students without one must be able to say so. All of
these are accepted and stored as empty:

```
NA   n/a   n.a.   na.   none   nil   not available   -   --
```

#### Handy tricks

- **Annotate the file safely.** Any key starting with `_` is stripped before the
  record is sent to the browser, so `"_note": "waitlist"` is safe to leave in.
- **No restart needed.** The roster is re-read from disk every 30 seconds
  (`STUDENTS_CACHE_TTL_MS`). Save the file, wait, and the change is live.
- **Comments are not possible** in JSON — use `_`-prefixed keys instead.
- **This file is git-ignored.** It contains personal data, so it is deliberately
  never committed. Share it through a secure channel, not git.

#### Check it worked

```bash
curl http://localhost:3000/api/lookup/26I9014
```

A hit returns `{"success":true,"found":true,"student":{...}}`. If the roster is
malformed the server logs the reason and treats it as **empty** rather than
crashing, so a syntax error looks exactly like "nobody is registered" — always
check the `[api]` terminal output first.

---

### 2. Replace the placeholder Google Form URLs

**File:** `gdgoc-registration-backend/config/verticals.js`

Eight placeholder URLs live in one object near the top of the file. Paste the
real URL over each one. Nothing else changes.

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

#### Getting the URL from Google Forms

1. Open the form in Google Forms.
2. **Send → Link** (or the green **Publish** button → **Copy link**).
3. You want the `/viewform` link:
   `https://docs.google.com/forms/d/e/<FORM_ID>/viewform`
4. The `/edit` variant also works — it just pre-fills for a form owner, so give
   students the `/viewform` one.

#### Two rules, both important

- **Do not rename the keys.** They are the contract between the two programs. The
  frontend sends the key back on submit and the server looks it up by exact
  match. Rename one and that vertical stops working.
- **`pr and sponsership` is misspelled on purpose.** The typo is baked into both
  projects. Leave it alone. The *display* label is correctly spelled
  "PR and Sponsorship" — students never see the key.

#### Check it worked

Submit anything through the app, or hit the API directly. **In PowerShell, do
not use `curl -d '{...}'`** — it eats the inner quotes and the server replies
`Malformed JSON body`. Use this instead:

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

On macOS or Linux the equivalent is:

```bash
curl -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{"rollNumber":"26I9001","fullName":"Aarav Sharma","branch":"CS","section":"A","yearOfStudy":"1st Year","contactNumber":"+91 9876543210","gender":"Male","email":"a@example.com","linkedin":"NA","skills":"Web Development","priority1":"technical","priority2":"design"}'
```

The response contains only the two verticals you asked for:

```json
{
  "success": true,
  "forms": {
    "priority1": { "name": "technical", "url": "https://docs.google.com/forms/d/e/…" },
    "priority2": { "name": "design",    "url": "https://docs.google.com/forms/d/e/…" }
  }
}
```

While a URL is still a placeholder the link lands on a Google 404. That is
intentional — it proves the whole pipeline works end to end while making it
obvious the URL is not filled in yet.

> **These URLs are secrets.** They exist only in the backend and are handed out
> one pair at a time. Do not paste them into the frontend, and do not commit
> them. `npm run build` in the frontend actively fails the build if any form URL
> ends up in the bundle.

---

## Why it is split in two

Because the backend holds things the browser must not see, and writes things the
browser cannot write.

1. **The 8 form URLs.** A browser downloads every byte of the JavaScript bundle,
   and anyone can read it in devtools. If the forms lived in the frontend, all
   eight would be public — including the six verticals a given student did not
   choose, letting anyone flood those forms directly. The backend keeps them,
   resolves only the two that were picked, and returns only those two.
2. **The roster.** Roll number to name, branch and email is personal data for
   every student. Server-side, the browser asks "is this roll number real?" and
   gets back a yes. Client-side, you would have to ship the entire roster to
   every visitor to answer that one question.
3. **`submit` has to go somewhere durable.** A browser cannot write to a server's
   disk. The moment you want "save registration" or "already registered", you
   need a running process with filesystem access.
4. **The client cannot be trusted.** Every check in the React form exists for
   usability, not security — anyone can skip it with `curl`. All the rules that
   matter are re-checked on the server.

The split does not leak into the user experience. Vite proxies `/api` through to
the API, so the browser sees **one origin on one port** and CORS never applies
locally. The frontend only ever uses relative `/api` paths.

---

## How a request flows

```
   Browser                          Vite dev server (:5173)
   ───────                          ─────────────────────
   roll number typed
        │
        │  GET /api/lookup/26I1140
        ├────────────────────────────▶│
        │                             │  proxy /api ──▶ Express (:3000)
        │                             │                    │
        │                             │              read data/students.json
        │                             │              match ONE record
        │  ◀── { found, student } ───┤◀───────────────────┤
        │
   form prefills, student edits
        │
        │  POST /api/register  { …details, priority1, priority2 }
        ├────────────────────────────▶│
        │                             │  proxy /api ──▶ Express (:3000)
        │                             │                    │
        │                             │              re-validate EVERYTHING
        │                             │              append data/registrations.json
        │                             │              look up only 2 form URLs
        │  ◀── 201 { forms: {…} } ────┤◀───────────────────┤
        │
   student clicks their 2 links
```

Nothing else crosses the boundary. The roster and the other six form URLs are
never in a response.

---

## API reference

Base URL in development: `http://localhost:3000`

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness check. Returns `{ success, service, env }`. |
| `GET` | `/api/lookup/:rollNumber` | Returns the one matching student, or `found: false`. |
| `POST` | `/api/register` | Validates, stores, and returns the two chosen form links. |

### `GET /api/lookup/:rollNumber`

```bash
curl http://localhost:3000/api/lookup/26i9014     # case-insensitive
```

```json
{ "success": true, "found": true, "student": { "rollNumber": "26I9014", "...": "..." } }
```

A miss returns `200` with `{"success": true, "found": false}` — the same shape
minus `student`, so response size cannot be used to tell "not in roster" apart
from anything else.

### `POST /api/register`

Required: `rollNumber`, `fullName`, `branch`, `yearOfStudy`, `contactNumber`,
`gender`, `email`, `linkedin`, `priority1`, `priority2`.
Optional: `section`, `github`, `instagram`, `skills`.

`priority1` and `priority2` must be two **different** vertical keys.

| Status | When |
|---|---|
| `201` | Stored. Body contains the two form links. |
| `400` | Validation failed. Body has a per-field `fields` map. |
| `413` | Request body over `BODY_LIMIT` (64 KB — a registration is tiny). |
| `429` | Rate limited — 10 registrations or 30 lookups per minute per IP. |
| `503` | The registration log has hit its size cap. |

```json
{
  "success": false,
  "error": "Validation failed",
  "fields": { "email": "email is not a valid email address" }
}
```

---

## The form's dropdowns

You only need this if you are **adding** a branch, year, gender or skill. To
change what a student sees, edit `gdgoc-registration-frontend/src/config/options.ts`.

### Branches and sections

| Branch | Sections |
|---|---|
| `CS`, `IT`, `CSBS`, `ENTC` | A and B |
| `Mechanical Engineering`, `Electronics and Instrumentation`, `EEE`, `IP`, `Civil Engineering` | A only — the Section field greys out and pins to A |

A roster record whose `branch` is not in this list (for example a free-text
"Information Technology") still works: the form shows it read-only instead of
silently changing it.

### Years and genders

`1st Year` – `4th Year`, and `Female` / `Male` / `Non-binary` /
`Prefer not to say`. These are also enforced by the API, so changing them means
editing `src/config/options.ts` **and** `src/validation.js` in the backend.

### Skills

A free-text field with a datalist of suggestions — `Web Development`,
`App Development`, `Data Science & AI`, `Machine Learning`, `Cloud & DevOps`,
`Cybersecurity`, `Graphic Design`, `UI / UX Design`, `Video Editing`,
`Photography`, `Content Writing`, `Social Media Management`, `Digital Marketing`,
`Event Management`, `Public Relations`, `Technical Writing`, `3D / Animation`,
`JavaScript`, `Python`, `Java`, `C / C++`, `Flutter`, `React`, `Figma`,
`Not Decided Yet`.

A value that is not in the list is still accepted and stored — the list is only
a convenience.

### Verticals

The 8 verticals are declared twice on purpose: display labels and blurbs in
`src/config/verticals.ts` (frontend), and the actual URLs in
`config/verticals.js` (backend). Keep the `key` values byte-identical between
them, including the `pr and sponsership` spelling.

---

## Configuration

### Backend environment variables

All optional in development. There is no `.env` file and none is needed — set
them in the shell or your host's dashboard.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | API port. Keep in sync with `vite.config.ts` if you change it. |
| `HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `development` | `production` tightens CORS and hides error detail |
| `CORS_ORIGINS` | localhost only in dev | **Required in production.** Comma-separated exact origins. |
| `DATA_DIR` | `./data` | Where the two JSON files live |
| `STUDENTS_CACHE_TTL_MS` | `30000` | How often the roster is re-read from disk |
| `MAX_STORE_BYTES` | `8388608` | Refuse new registrations past this log size |
| `RATE_LIMIT_MAX_LOOKUP` | `30` | Lookups per minute per IP |
| `RATE_LIMIT_MAX_REGISTER` | `10` | Registrations per minute per IP |
| `BODY_LIMIT` | `64kb` | Max request body |
| `TRUST_PROXY_HOPS` | `0` | Number of trusted proxies, for rate-limit IP resolution |

With `NODE_ENV=production` and no `CORS_ORIGINS`, the server **refuses to
start** rather than quietly opening these endpoints to the whole internet.

### Frontend

`gdgoc-registration-frontend/.env.example` documents one optional variable:

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | empty | Only set this if the API is on a different origin in production. That origin must also be in the backend's `CORS_ORIGINS`. |

Locally it stays empty — Vite's proxy handles it.

---

## Project layout

```
gdgoc-registration-backend/
  server.js                 entry point
  config/
    env.js                  all environment defaults
    verticals.js            <<< THE 8 GOOGLE FORM URLS
  data/
    students.json           <<< THE STUDENT ROSTER
    registrations.json      the growing log — never commit
    README.md               deeper notes on both files
  src/
    app.js                  routes
    students.js             roster load, cache, lookup
    registrations.js        serialised atomic append
    validation.js           every rule the server enforces
    security.js             URL sanitising, throttling, text cleanup
  scripts/
    seed-test-data.js       regenerate the test roster
    bench-store.js          throughput and duplicate-registration check
  test/api.test.js          30 tests

gdgoc-registration-frontend/
  src/
    App.tsx                 step state machine
    steps/                  Step1Details, Step2Priorities, Step3Forms
    components/             Header, Field, Footer, toggles
    config/
      options.ts            branches, sections, years, genders, skills
      verticals.ts          display labels only — no URLs
    api/client.ts           fetch wrapper and error messages
    theme/                  light / dark / system
    i18n/                   English and Hindi strings
    assets/                 light and dark logo variants
  scripts/
    dev-all.mjs             run both halves in one terminal
    assert-no-form-urls.mjs build guard
    verify-phone.mjs        phone field round-trip check
    make-logo-variants.mjs  regenerate logo colours
```

---

## Testing and checks

```bash
# Backend — 30 tests: validation, security, routes, store
cd gdgoc-registration-backend
npm test

# Frontend
cd gdgoc-registration-frontend
npm run lint        # oxlint
npm run build       # typecheck, build, and assert no form URL leaked
```

`npm run build` is the important one before any deploy: it greps the finished
bundle for Google Form URLs and **fails the build** if one is found, so nobody
can quietly reintroduce the leak later.

Regenerate the test roster (this overwrites `students.json` and clears
`registrations.json`):

```bash
cd gdgoc-registration-backend
node scripts/seed-test-data.js              # rebuild the 19-student roster
node scripts/seed-test-data.js --reset-only # just clear the log
```

---

## Troubleshooting

**"Cannot reach the registration server (HTTP 502)"**
The API is not running. `dev:all` waits for it, so this usually means you
started only `npm run dev` in the frontend folder. Start the backend too, or use
`npm run dev:all`. The 502 comes from Vite's proxy, not from your code.

**`http://127.0.0.1:5173` refuses to connect but the page works on `localhost`**
Expected on Windows — Vite binds IPv6 `::1`. Always use `localhost`.

**"Port 5173 is already in use"**
Something is already serving there — often your own earlier dev server. Find it
with `netstat -ano | findstr 5173`, or just use `npm run dev:all`, which reuses
what is already running.

**A roll number lookup says "not found"**
Check, in order: exact spelling (it is case-insensitive, but not
forgiving of extra spaces), that `students.json` is a valid array, and that you
saved within the last 30 seconds. A JSON syntax error makes the whole roster
read as empty — the `[api]` terminal prints the parse error.

**A branch shows read-only instead of in the dropdown**
Its `branch` string does not exactly match a value in
`src/config/options.ts`. Free text still works, it just cannot be re-picked.

**A submitted link 404s**
That vertical's URL is still a `placeholder-` value. See
[Replace the placeholder URLs](#2-replace-the-placeholder-google-form-urls).

**Submission says the roll number is already registered**
It is not — the API has no duplicate protection yet. Check
`data/registrations.json` by hand. See [Going live](#going-live).

---

## Going live

- [ ] Replace all 8 placeholder URLs in `config/verticals.js`.
- [ ] Load the real roster into `data/students.json`; confirm `rollNumber`s are unique.
- [ ] Set `NODE_ENV=production` and an explicit `CORS_ORIGINS`.
- [ ] Serve the frontend as static files from a CDN or static host.
- [ ] Run the API on a host with a real Node runtime and a persistent disk.
- [ ] Confirm `npm run build` passes the no-form-URL guard.
- [ ] Keep `data/students.json` and `data/registrations.json` out of git and out
      of any public bucket — both are personal data.
- [ ] Back up `registrations.json` somewhere durable. A container filesystem is
      wiped on redeploy; this file is the only record of who registered.

**Known gap:** the same roll number can be submitted more than once. If that
matters, add a check in `src/registrations.js` that scans the log for an existing
`rollNumber` inside the existing write lock and returns `409 Conflict` — the
`rateLimit` helper in `src/security.js` already provides the pattern.

---

## Security notes

The design assumes the roster and the form URLs are sensitive, and that the
browser is hostile.

- **Form URLs never reach the client except the two chosen.** The register
  handler indexes `VERTICAL_FORMS` with the two validated keys; nothing
  iterates the object.
- **The roster is never returned.** There is no code path that serialises the
  whole file.
- **Vertical keys are checked against a null-prototype map.** A plain object
  would let `"constructor"` or `"toString"` pass as valid and resolve to an
  inherited function.
- **The submitted record is rebuilt field by field** from an allowlist, so
  unknown keys and prototype-pollution attempts are dropped by construction
  rather than by filtering.
- **Social fields reject `javascript:` and `data:` URLs**, which would otherwise
  be stored and later rendered as live clickable links.
- **Writes are serialised and atomic** (temp file, then rename), so concurrent
  submissions cannot corrupt or lose each other.
- **Rate limits are on by default** and `X-Forwarded-For` is ignored unless you
  explicitly declare how many proxies you trust.

If you change any of this, keep the invariant that makes it work: the frontend
never contains a form URL or the roster, and the server re-validates everything
it is sent.
