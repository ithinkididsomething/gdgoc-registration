# GDGoC IET DAVV — Registration Portal

A registration portal for the 8 GDGoC verticals. Students look up their roll
number, confirm their details, pick two vertical preferences, and get back the
Google Form links for exactly those two.

This repository holds both halves of the app:

| Folder | Runs on | Owns |
|---|---|---|
| [`gdgoc-registration-frontend/`](gdgoc-registration-frontend) | `:5173` | The form, light/dark theme, English/Hindi |
| [`gdgoc-registration-backend/`](gdgoc-registration-backend) | `:3000` | The student roster, validation, all 8 form URLs, the registration log |

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
| **Load the real student list** | Edit `gdgoc-registration-backend/data/students.json` (no restart — re-read every 30s) |
| **Use a roster without editing the repo** | Set `DATA_DIR` to the folder holding your `students.json` |
| **Put in the real Google Form URLs** | Edit `gdgoc-registration-backend/config/verticals.js` |
| **Add a branch, year, gender or skill** | Edit `gdgoc-registration-frontend/src/config/options.ts` |
| **Change the API port** | `PORT` for the backend **and** the proxy target in `frontend/vite.config.ts` |
| **Change colours or theme** | `gdgoc-registration-frontend/src/index.css` |
| **Change the Hindi/English wording** | `gdgoc-registration-frontend/src/i18n/dictionaries.ts` |
| **Run the tests** | backend: `npm test` · frontend: `npm run check` |
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
`gdgoc-registration-backend/config/verticals.js`. Eight URLs, one object, paste
the real links over them.

Both steps have copy-pasteable examples and verification commands in the
[backend notes](gdgoc-registration-backend/README.md). Neither needs any code
change.

---

## Before you commit

```bash
cd gdgoc-registration-backend  && npm test          # 30 tests
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