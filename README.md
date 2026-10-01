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
# once
cd gdgoc-registration-backend  && npm install
cd ../gdgoc-registration-frontend && npm install

# every time
cd gdgoc-registration-frontend
npm run dev:all
```

Then open **<http://localhost:5173>** — one command starts both halves.

Test roll numbers: `26I9001` (normal), `26I9009` (single-section branch),
`26I9014` (free-text branch), `26I9999` (not in the roster).

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