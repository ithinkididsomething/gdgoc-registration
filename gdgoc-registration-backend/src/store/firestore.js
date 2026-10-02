"use strict";

/**
 * Firestore registration store.
 *
 * STATUS: written, not yet verified. Selecting it before the emulator suite in
 * `test/store-contract.test.js` passes is on you - see the note at the bottom of
 * this file.
 *
 * WHY IT IS WORTH THE TROUBLE: the file driver needs a persistent disk, which is
 * the single reason this backend cannot run on a free serverless host. Moving the
 * registrations to a document database removes that constraint, and with it the
 * awkward two-halves split.
 *
 * It also fixes something the file driver cannot fix. The file driver's
 * duplicate protection is an in-process promise queue, so it holds only while
 * there is exactly one Node process. Two containers, two lambdas, `pm2 cluster`
 * - each has its own queue, neither can see the other, and two simultaneous
 * registrations for the same roll number both get accepted. The transaction
 * below is enforced by the database instead, so it holds across every process
 * and every machine. That is a genuine improvement, not a port.
 *
 * DOCUMENT MODEL
 *
 *   registrations/{rollKey(rollNumber)}
 *
 * One document per student, and the document ID IS the identity - `rollKey()`
 * already lowercases and collapses whitespace, which is exactly what a document
 * ID needs. So there is no second key scheme, and no index to maintain.
 *
 * The `rollNumber` FIELD is kept uppercase for display and is not what the
 * duplicate check reads. If the two ever disagree, the field is what the
 * organiser sees and the ID is what the guarantee rests on.
 */

const {
  rollKey,
  alreadyRegisteredError,
  notRegisteredError,
  persistError,
} = require("./contract");

const { env } = require("../../config/env");

/** Single collection. A second one would mean a second thing to back up. */
const COLLECTION = "registrations";

/**
 * Every record is read back for the CSV export, so keep the projection
 * explicit and flat. A Timestamp here would break the export - see the warning
 * at the top of src/registrations-csv.js.
 */
function toPlainRecord(documentId, data) {
  return Object.assign({ id: documentId }, data);
}

let cached = null;

/**
 * Lazily initialise the Admin SDK and return a Firestore instance.
 *
 * Lazy rather than at require time for the same reason the driver is lazy: a
 * missing dependency or absent credentials should surface on the first real
 * registration with a readable message, not as an import-time crash that takes
 * down the whole server including /api/health.
 */
function getFirestore() {
  if (cached) return cached;

  // The single most dangerous misconfiguration available here. If this variable
  // reaches a production host, the SDK talks to an emulator that is not there
  // and every read and write fails - or worse, appears to succeed against
  // whatever happens to be listening. Refuse to boot instead.
  if (env.IS_PRODUCTION && process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      "FIRESTORE_EMULATOR_HOST is set in production. The SDK would send every " +
        "read and write to a local emulator instead of Firestore. Remove it."
    );
  }

  // firebase-admin v13+ dropped `admin.firestore()`. The client is now created by
  // `getFirestore()` from the `/firestore` subpath, and the app itself by
  // `initializeApp()` from `/app`. Both are imported lazily here for the same
  // reason as the require itself.
  let app;
  let firestoreModule;
  try {
    /* eslint-disable global-require */
    app = require("firebase-admin/app");
    firestoreModule = require("firebase-admin/firestore");
    /* eslint-enable global-require */
  } catch (error) {
    if (error.code === "MODULE_NOT_FOUND") {
      throw new Error(
        "REGISTRATION_STORE=firestore needs the firebase-admin package. " +
          "Run: npm install firebase-admin"
      );
    }
    throw error;
  }

  // No credential object passed: the SDK picks up Application Default
  // Credentials, which on a managed host means the attached service account and
  // on a laptop means GOOGLE_APPLICATION_CREDENTIALS pointing at the key file.
  // Never ship a service account key to the browser - the whole point of this
  // driver is that only the server ever talks to Firestore.
  if (!app.getApps().length) app.initializeApp();

  // The database ID is passed EXPLICITLY even when it is `(default)`. The SDK's
  // bare `getFirestore()` means only `(default)`, and a project whose database
  // was named anything else fails with a bare NOT_FOUND and no explanation.
  // See FIREBASE_DATABASE_ID in config/env.js.
  cached = firestoreModule.getFirestore(env.FIREBASE_DATABASE_ID);
  return cached;
}

/**
 * Firestore's default `ignoreUndefinedProperties` is false, which turns an
 * undefined field into a write error. The validators already drop empty optional
 * fields, so a record should never contain one - if it ever does, a loud failure
 * at registration time is the right outcome, not a silently skipped field.
 *
 * Collections and reads are otherwise left at the SDK defaults on purpose: fewer
 * knobs, and nothing here justifies a non-default retry or timeout policy.
 */

/**
 * Append one registration record.
 *
 * The duplicate check and the insert share a transaction, so the pair is atomic
 * across every process. `tx.create` (rather than `set`) is deliberate belt and
 * braces: if a document appeared between the read and the write, `create` fails
 * instead of silently overwriting a student's real registration.
 */
async function appendRegistration(record) {
  const db = getFirestore();
  const stored = Object.assign({}, record, { submittedAt: new Date().toISOString() });
  const ref = db.collection(COLLECTION).doc(rollKey(stored.rollNumber));

  try {
    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(ref);
      if (existing.exists) throw alreadyRegisteredError();
      transaction.create(ref, stored);
    });
  } catch (error) {
    // A duplicate is a normal outcome, not a fault - pass it through untouched so
    // the route can answer 409. Everything else is our problem.
    if (error.code === "alreadyRegistered") throw error;
    throw persistError(error);
  }

  return { record: stored };
}

/** The registration for a roll number, or null. */
async function findRegistration(rollNumber) {
  const key = rollKey(rollNumber);
  if (!key) return null;

  try {
    const snapshot = await getFirestore().collection(COLLECTION).doc(key).get();
    return snapshot.exists ? toPlainRecord(snapshot.id, snapshot.data()) : null;
  } catch (error) {
    throw persistError(error, "Could not read the registration log.");
  }
}

/**
 * Record that a student submitted one of their Priority forms.
 *
 * Idempotent by contract: a repeated stage keeps the FIRST timestamp, so a double
 * tap cannot rewrite when the student actually did it. That needs a read before
 * the write, so this is a transaction rather than a bare update - a plain
 * `update` would overwrite the timestamp every time.
 */
async function markFormCompleted(rollNumber, stage) {
  const db = getFirestore();
  const key = rollKey(rollNumber);

  // An empty/whitespace roll number has no document to look up, and `.doc("")`
  // is not a valid Firestore path - it raises a raw SDK error that would escape
  // the catch below as a persist failure, i.e. a 500 for what is really a bad
  // request. findRegistration guards the same case; this keeps the two in step.
  if (!key) throw notRegisteredError();

  const ref = db.collection(COLLECTION).doc(key);
  const field = `priority${stage}CompletedAt`;

  try {
    return await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) throw notRegisteredError();

      const previous = snapshot.data() || {};
      const now = new Date().toISOString();
      const updated = Object.assign({}, previous, {
        [field]: previous[field] || now,
      });
      if (updated.priority1CompletedAt && updated.priority2CompletedAt && !updated.formsCompletedAt) {
        updated.formsCompletedAt = now;
      }

      transaction.update(ref, updated);
      return toPlainRecord(snapshot.id, updated);
    });
  } catch (error) {
    if (error.code === "notRegistered") throw error;
    throw persistError(error);
  }
}

/**
 * Every record, oldest first.
 *
 * THE ORDERING IS NOT OPTIONAL. Firestore returns documents in document-ID order
 * by default, which is alphabetical by rollKey - so without this the organisers'
 * CSV would be sorted by roll number instead of by submission, and nobody would
 * notice until someone compared it to the order responses actually came in.
 *
 * Related trap in the same place: `orderBy` SILENTLY EXCLUDES documents that do
 * not have the field. Every document written here has `submittedAt`, so this is
 * safe - but a document added by hand in the Firebase console would simply not
 * appear in the export, with no error. Do not make `submittedAt` optional.
 */
async function readAllRegistrations() {
  try {
    const snapshot = await getFirestore()
      .collection(COLLECTION)
      .orderBy("submittedAt", "asc")
      .get();
    return snapshot.docs.map((document) => toPlainRecord(document.id, document.data()));
  } catch (error) {
    throw persistError(error, "Could not read the registration log.");
  }
}

/**
 * Nothing is queued in this process - Firestore acknowledged each write before it
 * resolved - so there is nothing to flush. Resolving immediately is the honest
 * answer; pretending to queue would hide the fact that the shutdown hook has no
 * work to do here.
 */
async function drain() {}

/**
 * Delete every registration. TEST SEAM ONLY - see the contract.
 *
 * WHY NOT `db.recursiveDelete(db.collection(COLLECTION))`:
 *
 * It looks like the obvious one-liner, and on the emulator it appears to work,
 * which is exactly how this bug survived. Against a real database it resolves
 * successfully and deletes NOTHING. Observed on @google-cloud/firestore v7 (the
 * copy firebase-admin@14.5.0 depends on):
 *
 *     before: 6 docs -> recursiveDelete() resolves, returns undefined
 *     after:  6 docs
 *
 * It is a silent no-op, so a test suite that trusts it does not fail loudly
 * either - the leftover documents just make every later "should be able to
 * register" assertion fail with alreadyRegistered, 17 of 22, which reads like
 * a duplicate-detection bug and is not one. The underlying query builds a range
 * filter on FieldPath.documentId() with string bounds that matches nothing, but
 * rather than depend on a specific SDK's internals the delete is done here in
 * plain, version-independent Firestore calls.
 *
 * Re-querying after each batch rather than paginating once matters: deleting the
 * documents a page returned is what advances the cursor, and a single pass can
 * stop early on a collection that shifts underneath it.
 */
const DELETE_BATCH_SIZE = 400; // Firestore caps a batch at 500 writes.

async function reset() {
  const db = getFirestore();

  for (;;) {
    const snapshot = await db.collection(COLLECTION).limit(DELETE_BATCH_SIZE).get();
    if (snapshot.empty) return;

    const batch = db.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
  }
}

/** @type {import("./contract").StoreDriver} */
const firestoreStore = {
  name: "firestore",
  appendRegistration,
  readAllRegistrations,
  findRegistration,
  markFormCompleted,
  drain,
  reset,
  // Exposed so tests can point the driver at the emulator before first use.
  _internals: { getFirestore, COLLECTION },
};

module.exports = firestoreStore;
