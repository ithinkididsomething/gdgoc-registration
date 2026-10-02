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
- [Everyday tasks](#everyday-tasks)
- [The two jobs you'll be asked to do](#the-two-jobs-youll-be-asked-to-do)
- [Getting the registrations out](#getting-the-registrations-out)
- [Why it is split in two](#why-it-is-split-in-two)
- [How a request flows](#how-a-request-flows)
- [API reference](#api-reference)
- [The form's dropdowns](#the-forms-dropdowns)
- [Configuration](#configuration)
- [Project layout](#project-layout)
- [Testing and checks](#testing-and-checks)
- [Troubleshooting](#troubleshooting)
- [Deployment](#deployment)
- [Going live](#going-live)
- [Security notes](#security-notes)
- [What stays out of git, and why](#what-stays-out-of-git-and-why)

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

**One-time data setup** — after every fresh clone:

```bash
cd gdgoc-registration-backend
node scripts/seed-test-data.js
```

> **This step is easy to miss and fails quietly.** `data/students.json` is
> git-ignored because it holds personal data, so your clone does not contain
> one. Until you create it, the app runs and students can still register, but
> **every roll-number lookup returns "not found"** — there is no roster to match
> against, and the server logs nothing about it. The seed script needs no
> dependencies beyond Node itself, so it works before `npm install`. To use the
> real student list instead, just drop it into that same file — see
> [Update the student roster](#1-update-the-student-roster).

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
| `26I9019` | A stand-in for the maintainer — edit it with your own details, never commit them |
| `26I9999` | Not in the roster — the manual-entry path |

---

### Everyday tasks

Everything you might need to do, in one place. Details for each are linked.

**Getting set up and running**

| I want to… | Do this |
|---|---|
| Set up from a fresh clone | `npm install` in both folders, then the seed script — [Quick start](#quick-start) |
| Run everything | `npm run dev:all` from `gdgoc-registration-frontend/` |
| Run only the API | `cd gdgoc-registration-backend && npm run dev` |
| Run only the web app | `cd gdgoc-registration-frontend && npm run dev` |
| Check the API is alive | `curl http://localhost:3000/api/health` |

**Student data**

| I want to… | Do this |
|---|---|
| Get the 19-student test roster back | `node scripts/seed-test-data.js` (backend) |
| Clear submitted registrations only | `node scripts/seed-test-data.js --reset-only` |
| Load the real student list | Edit `data/students.json` — [details](#1-update-the-student-roster) |
| Import an existing Google Form export | `node scripts/import-google-form.js "<export>.json"` — [details](#importing-an-existing-google-form-export) |
| Use a roster without touching the repo | Set `DATA_DIR` to the folder holding it |
| Back up registrations | Copy `data/registrations.json` somewhere durable — [why it matters](#going-live) |
| **Get registrations into a spreadsheet** | `node scripts/export-registrations.js` — [details](#getting-the-registrations-out) |
| See which vertical is most popular | The same export prints a per-vertical tally |
| Check for a duplicate roll number | The export warns you, or `npm run check` — [known gap](#going-live) |

**Google Form links**

| I want to… | Do this |
|---|---|
| Put in the real form URLs | Edit `config/verticals.js` — [details](#2-replace-the-placeholder-google-form-urls) |
| Rename a vertical's label or blurb | `src/config/verticals.ts` (frontend) |
| Reorder the verticals | `src/config/verticals.ts` |
| Add or remove a vertical | Both files — [details](#changing-the-verticals) |
| Get the URL out of Google Forms | **Send → Link**, use the `/viewform` variant |

**The form itself**

| I want to… | Do this |
|---|---|
| Add a branch, or change which have A/B | `src/config/options.ts` — [details](#branches-and-sections) |
| Add a year or a gender option | `src/config/options.ts` **and** `src/validation.js` |
| Add a skill suggestion | `src/config/options.ts` |
| Change any wording (EN or HI) | `src/i18n/dictionaries.ts` |
| Change a colour or the neumorphic depth | `src/index.css` |
| Change the footer | `src/components/Footer.tsx` |
| Change the logo | Replace the PNGs, or run `node scripts/make-logo-variants.mjs` |
| Make a field optional or required | `src/steps/Step1Details.tsx` **and** `src/validation.js` |

**Server behaviour**

| I want to… | Do this |
|---|---|
| Change the API port | `PORT` **and** the target in `vite.config.ts` — [both](#configuration) |
| Change the rate limits | `RATE_LIMIT_MAX_LOOKUP` / `RATE_LIMIT_MAX_REGISTER` — [table](#backend-environment-variables) |
| Change the max upload/storage size | `BODY_LIMIT` / `MAX_STORE_BYTES` |
| Change how often the roster re-reads | `STUDENTS_CACHE_TTL_MS` |
| Allow a real domain (production) | `CORS_ORIGINS` — [required in prod](#configuration) |

**Checking your work**

| I want to… | Do this |
|---|---|
| Run the tests | backend `npm test` · frontend `npm run check` |
| Click through every feature by hand | [Manual test checklist](#manual-test-checklist) |
| Check the phone field logic | `node scripts/verify-phone.mjs` (frontend) |
| Check performance at scale | `node scripts/bench-store.js` (backend) |
| Confirm no form URL leaked into the bundle | `npm run build` — fails on its own |
| Something is broken | [Troubleshooting](#troubleshooting) |

**Deploying**

| I want to… | Do this |
|---|---|
| Put it online | [Deployment](#deployment) |
| Check it works on a real domain | See the CORS and `VITE_API_BASE_URL` rows above |

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

### Importing an existing Google Form export

If registrations were collected in a **Google Form** before this portal existed,
you do not need to retype anything. Export the responses as JSON from Google
Forms (Responses → Link → download) and run the importer:

```bash
cd gdgoc-registration-backend
node scripts/import-google-form.js "../path/to/Export.json"
node scripts/import-google-form.js "../path/to/Export.json" --dry-run   # look, don't write
```

It prints a reconciliation before writing anything:

```
  Sheets in the export
    Sheet1                    738 rows   728 unique  <- used
    Sheet4                    582 rows   581 unique  (fully contained, skipped)
    duplicate of sheet 1      104 rows    82 unique  (fully contained, skipped)
    Drafts                      2 rows     0 unique  (fully contained, skipped)

  Reconciliation
    non-empty rows in "Sheet1" : 738
    duplicate submissions removed  : 1
    rolled up to unique students   : 737
    roster written                : 720
    excluded, no usable enrollment: 17
    drafts excluded (never submitted): 2
```

#### Why only one sheet is read

A Forms export can contain several sheets, and **merging them all is almost always
wrong.** The importer uses `Sheet1` alone and verifies the other sheets against
it on every run:

- **`Sheet4`** — every enrollment number in it also appears in `Sheet1`. It is a
  stale earlier export. Merging it would create ~582 phantom duplicate students.
- **`duplicate of sheet 1`** — also entirely inside `Sheet1`. Merging it would
  create ~104 more.
- **`Drafts`** — responses the student started but never submitted. Google
  captures them; they are not registrations.

The "fully contained, skipped" note is computed at runtime, not assumed. If a
future export has a sheet that *does* add students, the script reports
`(+N new)` instead, and you can decide what to do about it.

#### How duplicates are decided

Deduplication keys on the **Google account**, not the enrollment number. An
enrollment number can be mistyped, left blank, or shared by two people; the
signed-in Google account cannot change between two submissions by the same
person. Where an account submitted twice, the **earlier** submission is kept.

#### Students it refuses to import

A roster entry is useless without a usable enrollment number, because that is
what a student types to look themselves up. Anything blank or containing
characters outside `[A-Za-z0-9-]` is excluded and listed in
`data/needs-enrollment.csv`:

| What you see | Why |
|---|---|
| blank | the field was skipped |
| `26\|1161` | a `\|` instead of a letter |
| `25B2137/DE25861` | **two students merged into one cell** |

That last one is worth knowing about: it means two people submitted into the
same spreadsheet cell. Fix those by hand in `data/needs-enrollment.csv`, then
add the corrected enrollment numbers to `students.json`.

#### Branch names are remapped

The export uses the sheet's short codes; the form's dropdown uses canonical
names. These are translated automatically:

| Export | Imported as |
|---|---|
| `ETC` | `ENTC` |
| `EI` | `Electronics and Instrumentation` |
| `Mech` | `Mechanical Engineering` |
| `Civil` | `Civil Engineering` |

Matching is case-insensitive, so a lowercase `cs` still becomes `CS`. Anything
with no mapping (`B.Design`, `Mtech IIPS`, `Mtech SDSF`, `Other`) is passed
through **and reported**, so you can decide whether to add a real option to
`src/config/options.ts` rather than have it silently mis-mapped. Those values
still display in the form — the branch field injects unknown values — but they
are not selectable from a fresh dropdown.

#### Enrollment number format

The official format is **two-digit year (24, 25 or 26) + one branch letter +
exactly four digits** — `26C1149`, `25B3010`, `24D1018`. The importer audits
every row against it and prints the result:

```
  Enrollment number format
    official (24|25|26)(letter)(4 digits) : 566
    other ID schemes, still imported     : 154
        54 x 999999999999
        37 x AA99999
        20 x AA9999999
         5 x AA-9A99-99
```

**Those 154 are not typos.** The export legitimately contains several other ID
schemes:

| Shape | Example | Likely cohort |
|---|---|---|
| 12 digits | `260310001170` | a **JEE roll number** — see below |
| 2 letters + 5 digits | `DD25010`, `DE24092` | a `DD`/`DE` prefix scheme |
| 2 letters + 7 digits | `DE2402288` | same, longer form |
| `AA-2K26-NN` | `CS-2K26-01` | a batch code — `2K26` reads as 2nd year, 2026 |
| 3-digit year | `260C1020` | `260` instead of `26` |

They are **imported by default**, because dropping them would stop 154 real
students from looking themselves up. To drop them anyway:

```bash
node scripts/import-google-form.js "<export>.json" --strict-roll
```

A handful of rows are plainly junk rather than another scheme — `Test1`,
`Clouddevopshub`, `26000000000000000`, bare numbers like `32`. No filter
guesses at those; check them by hand and delete them from `students.json`.

Roll numbers are upper-cased on import. The export mixes `26C1234` and
`26c1234`; lookup is case-insensitive and there are no case-only collisions, so
this is purely cosmetic — it just stops the roster looking half-typed.

#### JEE roll numbers

The 54 twelve-digit records are **JEE roll numbers**. A handful of students are
recorded in the roster under their JEE number instead of their college
enrollment number, so the number they know by is not the one the form registers
against.

They can still look themselves up. The form treats a long all-digit number
(`/^\d{10,}$/`) as a JEE number and, when one resolves, handles it differently:

| Step | What happens |
|---|---|
| They type their JEE roll number | Lookup runs and **matches** |
| | Their details fill in and **lock** — name, branch, section, year, phone, gender, LinkedIn |
| | The JEE number is **cleared and discarded** |
| | Banner: *"Found you by your JEE roll number — please enter your college roll number"* |
| They type their **college** roll number | Stored, and it is the only number recorded |
| That number is *not* in the roster | Expected. Details **stay locked**; she checks them and continues |

The last row matters: those students are usually listed *only* under their JEE
number, so their college roll number will normally miss. That is not an error
and must not release the lock — the details were verified moments earlier.
Identity is already proven, so a later miss or a dropped connection leaves the
fields locked and only the message changes.

The one deliberate escape hatch is the **Edit manually** link on the banner,
which releases the lock for anyone who wants to correct a field.

Two details worth knowing if you touch this code:

- The lock is tracked by a **ref**, not by state. `runLookup` is a `useCallback`
  with an empty dependency array, so reading state inside it would go stale and
  the lock would drop on the first re-render.
- Typing in the roll-number field normally *releases* the lock, so a mistyped
  number stays recoverable. That behaviour is suppressed while JEE-verified,
  otherwise the first keystroke would destroy the pre-fill.

The JEE number is **never** stored, submitted, or exported — not in
`registrations.json`, not in the CSV. The threshold cannot collide with a college
number: JEE numbers are 12 digits, college enrollment numbers are 7.

#### Branch letters are consistent

Worth knowing, because it confirms the data is clean: every branch uses exactly
one letter, with no mixing.

| Branch | Letter | | Branch | Letter |
|---|---|---|---|---|
| CS | `C` | | IP | `P` |
| IT | `I` | | EEE | `L` |
| CSBS | `B` | | ENTC | `T` |
| B.Design | `D` | | Electronics and Instrumentation | `E` |
| Mechanical Engineering | `M` | | Civil Engineering | `V` |

Note **CSBS uses `B`, not `C`**, and **EEE uses `L`** — neither is guessable,
and both would be wrong if the letter were derived from the branch name. There
are **zero** records whose letter disagrees with its branch.

#### Safety

- The importer **backs up** the current roster to `data/students.backup.json`
  before overwriting, because `students.json` is git-ignored and therefore not
  in version control.
- It writes only `data/students.json`, `data/needs-enrollment.csv` and
  `data/import-report.json`. All four are git-ignored, so **no real name,
  email or phone number can be committed**.
- It never runs `git`. It cannot push anything anywhere.

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

## Getting the registrations out

Collecting registrations is only half the job — somebody eventually needs the
list in a spreadsheet to email people, assign mentors, or tally results.

The store is `gdgoc-registration-backend/data/registrations.json`, a plain JSON
array. Excel won't open a `.json` file, and manually pasting the array into
Google Sheets breaks the moment a name contains a comma. So use the exporter.

```bash
cd gdgoc-registration-backend
node scripts/export-registrations.js
```

That writes `data/registrations.csv` and prints a summary:

```
  Exported 47 registration(s) -> .../data/registrations.csv

  Choices per vertical (a student counts in both):
    technical                31
    design                   24
    content                  12
```

Other ways to use it:

```bash
node scripts/export-registrations.js people.csv   # choose the filename
node scripts/export-registrations.js -           # print to the terminal
```

### Opening the CSV

| Tool | How |
|---|---|
| Google Sheets | Drive → New → File upload → pick the `.csv` |
| Excel | Data → From Text/CSV → pick the file |
| LibreOffice | File → Open → pick the file |
| Excel, straight from the server | See [Live CSV endpoint](#live-csv-endpoint) — no file needed |

### Live CSV endpoint

The script above needs a terminal. If you would rather open a spreadsheet that
fetches the data itself, the server can serve the same CSV over HTTP:

```
GET /api/registrations.csv?key=<EXPORT_TOKEN>
```

It is **off unless you turn it on.** Set `EXPORT_TOKEN` and the route appears;
leave it unset and it returns `404`, not `401`, so an unconfigured deployment
does not even confirm the route exists.

```bash
# Generate a token (32 random bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Then export it to the server's environment:
EXPORT_TOKEN=<paste>
```

**Excel / LibreOffice.** Open the URL and the browser downloads the file
straight into the right application:

```
https://your-domain/api/registrations.csv?key=<EXPORT_TOKEN>
```

**Google Sheets, auto-updating.** This is the reason the token is in the query
string — a spreadsheet cannot send headers. Put this in a cell:

```
=IMPORTDATA("https://your-domain/api/registrations.csv?key=<EXPORT_TOKEN>")
```

`IMPORTDATA` refreshes roughly every 15 minutes. To turn it into a proper table,
select a cell above the range, paste the formula, then **Data → Split text to
columns** (or fill down and wrap in `ARRAYFORMULA`/`QUERY`).

Alternatively **File → Import → URL** in Sheets, pasting the same address.

#### Read this before enabling it

This endpoint hands out **every student's name, phone number and email** to
anyone who has the URL. There is no second factor and no per-user identity.

- Treat the URL like a password. Do not paste it into Slack, a shared doc, or
  anywhere students can see it.
- It lands in your proxy and web-server access logs, because query strings do.
  That is unavoidable for a spreadsheet to fetch it.
- Rotate by changing `EXPORT_TOKEN` and restarting. Anyone holding the old URL
  keeps access until you do.
- Prefer the CLI script when you are at the machine anyway — nothing is exposed
  over the network that way.

Nothing else changed about access: `/api/lookup` is still unauthenticated, and
that is the larger exposure. See [Security notes](#security-notes).

### What the exporter handles

- One column per field, in a fixed order, so re-running gives a diffable file.
- Values containing commas, double quotes or newlines are quoted per RFC 4180,
  so `"Sharma, Priya"` stays one cell instead of splitting in two.
- Values starting with `=`, `+`, `-` or `@` get a leading tab. Without this,
  Excel treats the cell as a **formula** — a real risk here, because a
  `contactNumber` or a skills field could start with a minus.
- Missing fields become empty cells rather than shifting the row.
- CRLF line endings, which Excel prefers.
- It never modifies `registrations.json`.

### The duplicate warning

If `Exported 47` but you see `47 submissions but 45 distinct roll numbers`, the
same person submitted twice. The API does not block this yet — see
[Going live](#going-live).

### Getting the CSV to the organisers

`registrations.csv` is git-ignored, so running `git add -A` after an export will
**not** commit real names and phone numbers. That is deliberate — the export is
a working file, not source. Send it to the organisers however you like (email,
shared drive, Slack); just don't `git add -f` it.

See [What stays out of git](#what-stays-out-of-git-and-why).

### Backups

There is no database server, so the only backup is the file itself. Copy
`registrations.json` somewhere durable regularly:

```bash
# examples
copy data\registrations.json D:\gdgoc-backups\registrations-2026-10-02.json
```

Do this **before** you deploy any change that touches the API.

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

A 12-digit **JEE roll number** resolves exactly like any other key. The form then
clears it and asks for the college enrollment number instead — see
[JEE roll numbers](#jee-roll-numbers). The number is never stored.

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

#### Changing the verticals

**Renaming the label or blurb** (what the student sees) — edit only
`src/config/verticals.ts`:

```ts
{
  key: 'technical',
  label: 'Technical',          // the card heading
  blurb: 'Build things that work.',   // the one-line description
}
```

Leave `key` alone unless you are following the rename steps below — it is the
join between the two files.

**Reordering** — the array order in `src/config/verticals.ts` is the display
order. Cut and paste the whole object; do not reindex anything.

**Adding or removing a vertical** takes edits in both files:

1. `gdgoc-registration-backend/config/verticals.js` — add the `key` and
   `formUrl`. This is the one that must not break; see
   [task 2](#2-replace-the-placeholder-google-form-urls).
2. `gdgoc-registration-frontend/src/config/verticals.ts` — add the matching
   object with the **same** `key`.
3. Add a test fixture to the backend lookup/register tests if you want coverage.

Then confirm both files agree:

```bash
cd gdgoc-registration-backend
npm test
```

The tests iterate over every vertical in `config/verticals.js`, so a key that
exists in one file but not the other fails there rather than silently in
production.

**Removing a vertical** — delete it from both files. Existing registrations that
reference it will still export fine; the CSV just keeps the old name in the
`priority1` / `priority2` columns.

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
    import-google-form.js   build the roster from a real Google Forms export
    export-registrations.js turn the submission log into a spreadsheet CSV
    bench-store.js          throughput and duplicate-registration check
  test/
    api.test.js             30 tests
    export-csv.test.js      10 tests
    export-disabled.test.js  3 tests

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
# Backend - 43 tests: validation, security, routes, store
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

### Manual test checklist

Automated tests cover the API and the data rules, but they cannot click. After
changing anything in `src/`, walk this list once. It takes about five minutes.

```bash
npm run dev:all
```

Then, at `http://localhost:5173`:

| # | Do this | Expect |
|---|---|---|
| 1 | Open the page | Neumorphic card, no console errors |
| 2 | Type `26I9001` and search | Student details fill in automatically |
| 3 | Search a roll number that doesn't exist | Clear "not found" message, no crash |
| 4 | Switch EN ↔ HI | All labels change, the thumb slides, choice is remembered |
| 5 | Type a phone number | Field stays inside its pill, no scrollbar |
| 6 | Click **elsewhere** on the pill, then type | Focus ring returns correctly |
| 7 | Pick priority 1, then priority 2 | The other verticals grey out and can't be clicked |
| 8 | Finish and submit | Success screen with **only your two** form links |
| 9 | Click one of those links | Opens the right form |
| 10 | Submit, then reload and submit again | Both succeed — the known duplicate gap |
| 11 | Resize to a phone width | Layout holds, nothing clipped |
| 12 | Stop the backend, then search | Friendly "can't reach the API" message, not a blank screen |
| 13 | Type a **JEE roll number** (e.g. `260310838051`) | Details fill in and lock; the number is **cleared**; prompt asks for the college roll number |
| 14 | Type your college roll number into that field | Details **stay locked** even though it won't match the roster |
| 15 | Stop the backend during step 14 | Details **stay locked**; message changes to "couldn't reach the server" |

Step 12 is the one people forget to check, and it's the failure students
actually see when the API is down on the day.

Steps 13–15 cover the JEE path, where the lock has to survive a lookup that
cannot succeed. There is **no frontend test suite**, so these three are the only
coverage that path gets — if you touch `Step1Details.tsx`, run them.

If you changed dropdown options, also confirm the new option appears in **both**
the form and the backend's validation.

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

## Deployment

The two halves deploy separately, and that's the point of the split: the
frontend is static files that anyone can host for free, and only the API
needs a server.

| | Frontend | Backend |
|---|---|---|
| Output | static files in `dist/` | a running Node process |
| Needs | any static host | Node 18+ with a **persistent disk** |
| Holds personal data | no | **yes** |

### Frontend — any static host

```bash
cd gdgoc-registration-frontend
npm run build
```

Upload the contents of `dist/` to Netlify, Vercel, GitHub Pages, Cloudflare
Pages or Firebase Hosting. There is no server-side component and no build step
the host needs to know about — point it at `dist/` and upload.

**Setting the API address.** The dev proxy only exists in development, so in
production the browser calls the API directly and must be told where:

```bash
# build with the live API URL (no trailing slash)
VITE_API_BASE_URL=https://api.example.com npm run build
```

Baked into the bundle at build time — rebuild after changing it. Forgetting
this is the usual cause of the "can't reach the API" message in production.

If you host the API at the same domain under `/api`, you can leave
`VITE_API_BASE_URL` unset and serve the frontend with a rewrite rule.

### Backend — any Node host

Needs a persistent disk, because `registrations.json` lives on the filesystem.
An ephemeral container (Heroku dynos, AWS Lambda, most free tiers) **loses every
registration on redeploy.** If your host is ephemeral, move `DATA_DIR` to a
mounted volume or object storage first.

```bash
cd gdgoc-registration-backend
npm install --omit=dev
NODE_ENV=production \
CORS_ORIGINS=https://your-frontend-domain \
PORT=3000 \
node server.js
```

`server.js` sits at the **backend root**, not in `src/` — `src/` holds only the
modules it requires. `npm start` does the same thing.

Required in production, or the API refuses to start:

| Variable | Example | Why |
|---|---|---|
| `CORS_ORIGINS` | `https://gogc.example.com` | Exact origins, comma-separated. `NODE_ENV=production` with this unset is a hard startup failure — deliberate. |
| `NODE_ENV` | `production` | Hides error detail, tightens CORS |

Put these in your host's dashboard or a `.env` file your platform reads. Do
**not** commit a `.env` — it is git-ignored, and it contains your domain.

### After deploying

```bash
curl https://api.example.com/api/health     # expect {"ok":true,...}
```

Then run the [manual test checklist](#manual-test-checklist) against the real
URL. The one that matters most on a real domain is CORS: open the browser
console, and a `CORS policy` error means `CORS_ORIGINS` doesn't match your
frontend origin exactly — including the protocol, and with no trailing slash.

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

---

## What stays out of git, and why

Three things are deliberately not in this repository. Understanding *why* matters,
because the reason is a property of git rather than of this project.

### The one rule that explains all of it

**Git history is permanent, and copying.** Once a file is in any commit, every
clone has it forever. Deleting it in a later commit does **not** remove it —
the old blob stays in history, and `git log -p` still prints the contents.

So "I'll delete it before it leaks" is not a plan. The only safe time to keep
something out of git is *before it ever goes in*.

### 1. `data/students.json` — real names, emails, phone numbers

Personal data for every student who signs up. Once committed it has been
distributed to every clone, permanently, and it is far more likely to leak by
accident than by attack: someone screenshots a lookup result, or someone commits
the wrong folder from this directory.

It is excluded here, and it is **not a loss of anything** — the roster is
reproducible. `scripts/seed-test-data.js` has no npm dependencies at all (just
`fs` and `path`), so this works in a fresh clone before you install anything:

```bash
cd gdgoc-registration-backend
node scripts/seed-test-data.js     # writes 19 test students
```

For the real list, drop it into that same file. It re-reads from disk every
30 seconds, so no restart is needed.

### 2. `data/registrations.json` — the submission log

Same reasoning: it is student personal data, and it is a log that grows on its
own. The server creates it automatically on the first submission, so nothing is
lost by not having it.

### 3. `config/verticals.js` — the form URLs, *later*

This one **is** tracked, and that is fine today: it currently holds only
`placeholder-` values. The moment someone pastes the real links and commits
them, those URLs are in history permanently.

That quietly breaks the main thing the architecture buys you — that the eight
links are only ever handed out **two at a time**, to the student who chose them.
In git history, all eight become readable by anyone who can clone.

This is an acceptable trade **only while the repository is private** and shared
with people who already have the links. If it is ever made public, or given to
someone outside the team, move the real URLs out first:

```bash
# 1. stop tracking it, keep the current copy on disk
cd gdgoc-registration-backend
git rm --cached config/verticals.js

# 2. keep the placeholder file, add the ignore rule
echo "config/verticals.local.js" >> .gitignore
```

Then in `config/verticals.js`, load the real values from a git-ignored sibling
and fall back to the placeholders:

```js
const PLACEHOLDER_FORMS = Object.freeze({
  content: "https://forms.google.com/placeholder-content",
  /* ...the other seven, unchanged... */
});

// Real URLs live in verticals.local.js, which is git-ignored and never committed.
let VERTICAL_FORMS = PLACEHOLDER_FORMS;
try {
  VERTICAL_FORMS = Object.freeze({ ...PLACEHOLDER_FORMS, ...require("./verticals.local") });
} catch {
  /* no local override - the placeholders stay in place */
}
```

Seniors then paste their real links into `config/verticals.local.js`. **It must
be a JavaScript module, not JSON** — `module.exports = { … }`, with the
vertical keys unquoted. Raw JSON throws `Unexpected token ':'` and the override
silently does nothing, because the `catch` swallows it:

```js
// config/verticals.local.js   -- correct
module.exports = {
  technical: "https://docs.google.com/forms/d/e/REALFORM123/viewform",
  design: "https://docs.google.com/forms/d/e/REALFORM456/viewform",
};
```

```json
{ "technical": "https://docs.google.com/forms/d/e/REALFORM123/viewform" }   // WRONG
```

Because the failure is silent, verify it took effect — restart the API and
submit the form, or check the URL directly:

```bash
cd gdgoc-registration-backend
node -e "console.log(require('./config/verticals').VERTICAL_FORMS.technical)"
```

If that still prints a `placeholder-` URL, the override did not load.

**Do this before making the repo public, not after** — history cannot be
cleanly rewritten, and the only real remedy after the fact is deleting the
repository and starting again.
