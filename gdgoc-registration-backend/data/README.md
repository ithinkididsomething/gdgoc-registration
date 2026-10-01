# data/

Two JSON files, both read and written at runtime by the server.

## `students.json`

The **read-only master list** of eligible students, used to prefill the
registration form. It must be a JSON **array of student objects** and nothing
else — no wrapper object, no trailing commas, no JavaScript comments.

This file is the *sensitive* one: it is the full roll-number roster, so it is
**never** returned to the client. `GET /api/lookup/:rollNumber` reads it,
matches one record, and returns only that record.

### Dropping in the final dataset

Replace the contents of `students.json` with the real roster, keeping the exact
same array shape. No code changes are required. A record looks like:

```json
{
  "rollNumber": "26I9014",
  "fullName": "Jane Doe",
  "branch": "Information Technology",
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
```

Notes:

- `rollNumber` is matched **case-insensitively** and whitespace-trimmed, so
  `26i9014` finds the record stored as `26I9014`.
- Any key beginning with `_` is stripped before the record is returned, so
  `"_comment": "..."` may be used to annotate the file without leaking.
- The file is re-read automatically every `STUDENTS_CACHE_TTL_MS` (30s default),
  so you can swap it in without a restart.
- Roll numbers must be unique. If the file contains duplicates, the first match
  wins — de-duplicate before deploying.
- If the file is missing or malformed, the server logs the problem and treats
  the roster as empty (lookup returns `found: false`). It does not crash.

## `registrations.json`

The **append-only** log of every successful `POST /api/register`. Initialised to
`[]`.

- Each submission is appended as one object, including
  `"submittedAt": "<ISO-8601 timestamp>"`.
- Writes are serialised and atomic (write to a temp file, then rename), so
  concurrent submissions cannot corrupt or lose each other.
- File size is capped by `MAX_STORE_BYTES` (8 MB default). Past that, the API
  returns `503` instead of degrading.
- This file contains personal data. Keep it out of version control and restrict
  filesystem permissions. Back it up to whatever durable store you use in
  production — a file on a container filesystem is not durable across redeploys.
