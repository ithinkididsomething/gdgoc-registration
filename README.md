# GDGoC IET DAVV — Registration Portal

A registration portal for the 8 GDGoC verticals. Students look up their roll
number, confirm their details, pick two vertical preferences, and get back the
Google Form links for exactly those two.

This repository holds both halves of the app:

| Folder | Runs on | Owns |
|---|---|---|
| [`gdgoc-registration-frontend/`](gdgoc-registration-frontend) | `:5173` | The form, light/dark theme, English/Hindi |
| [`gdgoc-registration-backend/`](gdgoc-registration-backend) | `:3000` | The student roster, validation, all 10 form URLs, the registration log |

---

## Start it

```bash
# 1. install both halves (once)
cd gdgoc-registration-backend  && npm install
cd ../gdgoc-registration-frontend && npm install

# 2. create the student data file (once, after every fresh clone)
cd ../gdgoc-registration-backend
node scripts/seed-test-data.js

# 3. run it (every time)
cd ../gdgoc-registration-frontend
npm run dev:all
```

Then open **<http://localhost:5173>** — one command starts both halves.

### Step 2 is not optional

`data/students.json` is git-ignored because it holds personal data, so a fresh
clone does **not** contain one. Until you create it, the app still runs and
students can still register, but **every roll-number lookup returns "not
found"** — there is no roster to match against. The server starts silently on an
empty roster rather than warning you, which is the easiest thing in this project
to get stuck on.

Either run the seed script above for 19 test students, or drop in the real roster
as described below.

Test roll numbers: `26I9001` (normal), `26I9009` (single-section branch),
`26I9014` (free-text branch), `26I9999` (not in the roster).

---

## Everyday tasks

| I want to… | Do this |
|---|---|
| **Set up from a fresh clone** | `npm install` in both folders, then `node scripts/seed-test-data.js` |
| **Run the app** | `cd gdgoc-registration-frontend` → `npm run dev:all` |
| **Get the test roster back** | `cd gdgoc-registration-backend` → `node scripts/seed-test-data.js` |
| **Clear submitted registrations only** | `node scripts/seed-test-data.js --reset-only` |
| **Get registrations into a spreadsheet** | `node scripts/export-registrations.js` in the backend - writes a `.csv` and tallies each vertical |
| **Load the real student list** | Edit `gdgoc-registration-backend/data/students.json` (no restart — re-read every 30s) |
| **Use a roster without editing the repo** | Set `DATA_DIR` to the folder holding your `students.json` |
| **Put in the real Google Form URLs** | Edit `gdgoc-registration-backend/config/verticals.js` |
| **Add a branch, year, gender or skill** | Edit `gdgoc-registration-frontend/src/config/options.ts` |
| **Change the API port** | `PORT` for the backend **and** the proxy target in `frontend/vite.config.ts` |
| **Change colours or theme** | `gdgoc-registration-frontend/src/index.css` |
| **Change the Hindi/English wording** | `gdgoc-registration-frontend/src/i18n/dictionaries.ts` |
| **Run the tests** | backend: `npm test` · frontend: `npm run check` |
| **Click through everything by hand** | **Manual test checklist** in the [full guide](gdgoc-registration-frontend/README.md#manual-test-checklist) |
| **Put it online** | [Deployment](gdgoc-registration-frontend/README.md#deployment) in the full guide |
| **Regenerate the light/dark logos** | `node scripts/make-logo-variants.mjs` in the frontend |
| **Check the phone field** | `node scripts/verify-phone.mjs` in the frontend |
| **Benchmark the JSON store** | `node scripts/bench-store.js` in the backend |

Full detail for each of these is in the [backend notes](gdgoc-registration-backend/README.md).

---

## Documentation

- **[Full guide](gdgoc-registration-frontend/README.md)** — architecture, why it
  is split in two, the API, the dropdowns, configuration, troubleshooting,
  deployment and security notes.
- **[Backend notes](gdgoc-registration-backend/README.md)** — running the API,
  the two edit tasks, and its environment variables.
- **[Data files](gdgoc-registration-backend/data/README.md)** — exactly what
  goes in each JSON file.

---

## The two edits you will be asked to make

**1. Load the student roster** → edit
`gdgoc-registration-backend/data/students.json`. A JSON array of student objects.
No code change, no restart (it re-reads from disk every 30s).

**2. Replace the placeholder Google Form URLs** → edit
`gdgoc-registration-backend/config/verticals.js`. Ten URLs, one object, paste
the real links over them.

Both steps have copy-pasteable examples and verification commands in the
[backend notes](gdgoc-registration-backend/README.md). Neither needs any code
change.

---

## Deploying it

### The one thing that decides your hosting

The backend keeps registrations in `data/registrations.json` and rewrites it on
every submission. **It therefore needs a real, persistent filesystem.** A
serverless platform with an ephemeral one (Vercel functions, Cloudflare
Workers, AWS Lambda) will accept registrations, hand out form links, and then
throw the record away when the instance recycles — which is worse than failing,
because nothing looks broken.

So: **frontend on Vercel, backend on a host with a disk** (Render, Railway or
Fly.io all have free tiers). The frontend is a static Vite build with no router,
so Vercel serves it with no extra configuration.

### Getting the roster onto a deploy host

`data/students.json` is gitignored, so a deploy built from Git has **no roster**
and every lookup quietly returns `found: false`. `npm run build` fixes this by
calling `scripts/seed-roster.js`, which materialises the roster from whichever
channel the host provides — first match wins:

| Variable | Use it when | Limit |
| --- | --- | --- |
| `STUDENTS_FILE_PATH` | the host can mount a file (Render secret files, a Docker image, an SSH volume) | none — **preferred** |
| `STUDENTS_JSON_B64_FILE` | you have a file but not a usable variable (Windows caps one env var at 32,767 chars) | none |
| `STUDENTS_JSON_B64` | the host's dashboard only takes variables, e.g. Vercel | 64 KB per variable |

The last two read a payload produced by:

```bash
cd gdgoc-registration-backend && npm run encode-roster
```

which prints the sizes and writes `dist/roster.b64.txt`:

```
brotli    38.9 KB   fits, 25.1 KB to spare
gzip      46.5 KB   fits, 17.5 KB to spare
raw      321.9 KB   EXCEEDS the 64.0 KB host limit
```

That compression is the whole point: plain base64 is 322 KB and **will not
fit**. Brotli takes 241 KB of JSON down to ~39 KB, because 720 rows of repeated
keys and branch names compress very well. `brotli` and `gzip` are both built
into Node's `zlib`, so there is no dependency to add.

> The payload is still every student's name, phone number, email and socials.
> It belongs in your host's secret store — never in git, never in a shared doc.
> Rotate it if it leaks.

### Env vars to set in production

- `CORS_ORIGINS` — **required**. In production the server refuses to start
  without it rather than opening the endpoints that hand out internal form
  links. Comma-separated exact origins, no trailing slash.
- `TRUST_PROXY_HOPS=1` if there is exactly one proxy in front (Render, nginx,
  a platform load balancer), otherwise the rate limiter resolves the wrong
  client IP.
- `EXPORT_TOKEN` if you want the CSV export at all. Unset means the route does
  not exist.
- `VITE_API_BASE_URL` on the **frontend**, pointing at the backend, since the
  two are on different origins. That origin must appear in `CORS_ORIGINS`.

Not done yet: `config/verticals.js` still holds placeholder form URLs, so a
deployed build will hand students dead links until those are filled in.

---

## Before you commit

```bash
cd gdgoc-registration-backend  && npm test          # 43 tests
cd ../gdgoc-registration-frontend && npm run check   # lint + build + guard
```

`npm run build` fails on purpose if a Google Form URL reaches the frontend
bundle.

### Two things that must stay out of git

- **`data/students.json` and `data/registrations.json`** contain personal data
  and are already git-ignored. Keep it that way.
- **`config/verticals.js` holds the real form URLs** once someone fills them in.
  It *is* tracked, so pasting real URLs and committing publishes them
  permanently — git history cannot be cleanly rewritten. This is acceptable only
  while the repository is private and shared with people who already have the
  links. **If this repo is ever made public, move the real URLs to a
  git-ignored file first.**