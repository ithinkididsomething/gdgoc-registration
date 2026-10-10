"use strict";

const assert = require("node:assert/strict");

/**
 * THE STORE CONTRACT SUITE.
 *
 * One set of behavioural assertions, run against every store driver. This file
 * contains no driver-specific code and no `file` or `firestore` references: it
 * describes what the app is allowed to rely on, and each driver answers for
 * itself.
 *
 * WHY THIS IS THE POINT OF THE WHOLE SEAM
 *
 * `test/api.test.js` proves the app behaves correctly - but only against the file
 * driver, because that is what `REGISTRATION_STORE` resolves to by default. When
 * a second engine exists, "the tests pass" stops meaning "the app works" and
 * starts meaning "the app works with the engine it happened to be pointed at".
 * A Firestore driver that forgets to order by `submittedAt` passes every single
 * one of those tests and silently sorts the organisers' spreadsheet by roll number.
 *
 * So: every driver runs THIS file. A new engine is proven interchangeable or it
 * is not proven at all.
 *
 * Usage:
 *
 *   const { runStoreContract } = require("./helpers/store-contract");
 *   runStoreContract({ test, label: "file", makeDriver: () => require("../src/store/file") });
 */

/**
 * @param {object} options
 * @param {Function} options.test node:test's `test`, passed in rather than
 *   required, so the caller controls the test file's own lifecycle hooks.
 * @param {string} options.label driver name, used to name every test.
 * @param {() => object} options.makeDriver builds the driver under test.
 * @param {boolean} [options.supportsReset=false] set false for a driver that has
 *   not implemented the optional `reset()` test seam. Its isolation is skipped
 *   and reported honestly rather than silently passing.
 * @param {boolean} [options.skip=false] register the assertions as skipped. Used
 *   when a driver needs infrastructure the current environment does not have. The
 *   tests still appear in the output as SKIPPED, never as PASSED — a green run
 *   that quietly never exercised Firestore would be far worse than a red one.
 */
function runStoreContract({ test, label, makeDriver, supportsReset = true, skip = false }) {
  // Options form rather than `test.skip`, which is not available on every Node
  // version this might run on.
  const it = (name, fn) => (skip ? test(name, { skip: true }, fn) : test(name, fn));

  /** One driver for the whole file, rebuilt after a reset. */
  let driver = null;
  const store = () => (driver ??= makeDriver());

  /** Real wait, so two appends cannot land on the same millisecond. */
  const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Start from an empty store. */
  const reset = async () => {
    if (supportsReset) await store().reset();
    else driver = makeDriver();
  };

  /**
   * A minimal but realistic record. Uses the actual vertical keys so a future
   * driver cannot accidentally pass by storing something that would never reach
   * it, and includes the awkward characters that break naive implementations.
   */
  const record = (overrides = {}) =>
    Object.assign(
      {
        rollNumber: "26B1140",
        fullName: "Test Student",
        branch: "CSBS",
        section: "B",
        yearOfStudy: "1st Year",
        contactNumber: "+91 9000000000",
        gender: "Male",
        email: "test@example.invalid",
        linkedin: "NA",
        github: "NA",
        instagram: "NA",
        skills: "Other: Game dev",
        teamMessage: "obv",
        priority1: "technical",
        priority2: "design",
      },
      overrides
    );

  // ---------------------------------------------------------------- append ---

  it("stores a record and resolves with it, stamped and complete", async () => {
    await reset();
    const input = record();
    const { record: stored } = await store().appendRegistration(input);

    assert.equal(stored.rollNumber, "26B1140");
    assert.equal(stored.priority1, "technical");
    assert.equal(stored.priority2, "design");
    assert.equal(stored.teamMessage, "obv");

    // Every submitted field must survive the round trip. A driver that drops
    // undefined optionals is fine; one that drops a field it decided was
    // unimportant is not, because the CSV has a column for it.
    for (const key of Object.keys(input)) {
      assert.equal(stored[key], input[key], `lost ${key} on write`);
    }

    // ISO 8601 UTC, because the CSV exporter does String() on this field and a
    // database-native Timestamp would render as [object Object].
    assert.match(stored.submittedAt, /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    assert.ok(!Number.isNaN(Date.parse(stored.submittedAt)));
    assert.equal(typeof stored.submittedAt, "string");
  });

  it("refuses a second registration for the same roll number", async () => {
    await reset();
    await store().appendRegistration(record());

    const error = await store()
      .appendRegistration(record({ fullName: "Someone Else" }))
      .then(() => null, (caught) => caught);

    assert.ok(error, "a duplicate registration was accepted");
    assert.equal(error.status, 409);
    assert.equal(error.code, "alreadyRegistered");

    // The rejection must not have overwritten the original.
    const stored = await store().findRegistration("26B1140");
    assert.equal(stored.fullName, "Test Student");
  });

  it("treats case and whitespace variants as the same student", async () => {
    await reset();
    await store().appendRegistration(record({ rollNumber: "DE25234" }));

    for (const variant of ["de25234", "  DE25234  ", "De25234"]) {
      const error = await store()
        .appendRegistration(record({ rollNumber: variant }))
        .then(() => null, (caught) => caught);
      assert.ok(error, `"${variant}" was accepted as a different student`);
      assert.equal(error.code, "alreadyRegistered");
    }
  });

  it("admits exactly one winner when the same roll number arrives at once", async () => {
    // THE assertion that matters most. The file driver satisfies it with an
    // in-process queue; a database driver satisfies it with a transaction. A
    // driver that satisfied it by neither would let one student be allocated
    // twice, and would do so only under load, on the day.
    await reset();
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) => store().appendRegistration(record({ teamMessage: `try ${i}` })))
    );

    const won = attempts.filter((a) => a.status === "fulfilled");
    const lost = attempts.filter((a) => a.status === "rejected");

    assert.equal(won.length, 1, `expected 1 winner, got ${won.length}`);
    assert.equal(lost.length, 7);
    for (const failure of lost) {
      assert.equal(failure.reason?.code, "alreadyRegistered");
    }

    // And exactly one row exists afterwards.
    assert.equal((await store().readAllRegistrations()).length, 1);
  });

  it("keeps registrations for different students separate", async () => {
    await reset();
    await store().appendRegistration(record({ rollNumber: "26B1140" }));
    await tick();
    await store().appendRegistration(record({ rollNumber: "26B1141", fullName: "Someone Else" }));

    assert.equal((await store().readAllRegistrations()).length, 2);
  });

  // ----------------------------------------------------------------- find ---

  it("finds a stored registration by roll number", async () => {
    await reset();
    await store().appendRegistration(record());

    const found = await store().findRegistration("26B1140");
    assert.ok(found, "did not find a registration that exists");
    assert.equal(found.fullName, "Test Student");
    assert.equal(found.priority1, "technical");
  });

  it("finds a registration whatever case and spacing is used", async () => {
    await reset();
    await store().appendRegistration(record({ rollNumber: "26B1140" }));

    for (const variant of ["26b1140", " 26B1140 ", "26b1140"]) {
      const found = await store().findRegistration(variant);
      assert.ok(found, `lookup for "${variant}" missed`);
      assert.equal(found.rollNumber, "26B1140");
    }
  });

  it("returns null for an unknown roll number", async () => {
    await reset();
    await store().appendRegistration(record());
    assert.equal(await store().findRegistration("26Z9999"), null);
  });

  it("returns null for empty and junk input rather than throwing", async () => {
    // The lookup route runs this against unvalidated URL parameters. A driver
    // that threw here would turn a typo into a 500.
    await reset();
    for (const junk of ["", "   ", null, undefined]) {
      assert.equal(await store().findRegistration(junk), null);
    }
  });

  // -------------------------------------------------------------- complete ---

  it("stamps one stage and leaves the other empty", async () => {
    await reset();
    await store().appendRegistration(record());

    const updated = await store().markFormCompleted("26B1140", 1);
    assert.match(updated.priority1CompletedAt, /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    assert.equal(updated.priority2CompletedAt, undefined);
    // Both stages are not done, so there is no overall completion yet.
    assert.equal(updated.formsCompletedAt, undefined);
    // The other fields must survive the update.
    assert.equal(updated.fullName, "Test Student");
    assert.equal(updated.email, "test@example.invalid");
  });

  it("stamps formsCompletedAt only once both stages are done", async () => {
    await reset();
    await store().appendRegistration(record());

    const afterFirst = await store().markFormCompleted("26B1140", 1);
    assert.equal(afterFirst.formsCompletedAt, undefined);

    await tick();
    const afterSecond = await store().markFormCompleted("26B1140", 2);
    assert.ok(afterSecond.formsCompletedAt, "formsCompletedAt never set");
    assert.ok(afterSecond.priority1CompletedAt);
    assert.ok(afterSecond.priority2CompletedAt);
  });

  it("keeps the FIRST timestamp for a stage, so a double tap cannot rewrite it", async () => {
    await reset();
    await store().appendRegistration(record());

    const first = await store().markFormCompleted("26B1140", 1);
    await tick(15);
    const second = await store().markFormCompleted("26B1140", 1);
    await tick(15);
    const third = await store().markFormCompleted("26B1140", 1);

    assert.equal(second.priority1CompletedAt, first.priority1CompletedAt);
    assert.equal(third.priority1CompletedAt, first.priority1CompletedAt);
  });

  it("finds the record again after a completion, with the stamp attached", async () => {
    // The "response noted" screen reads this back, so a driver that updated a
    // cached copy instead of the record would pass the test above and fail here.
    await reset();
    await store().appendRegistration(record());
    await store().markFormCompleted("26B1140", 2);

    const found = await store().findRegistration("26B1140");
    assert.ok(found.priority2CompletedAt);
    assert.equal(found.priority1CompletedAt, undefined);
    assert.equal(found.formsCompletedAt, undefined);
  });

  it("refuses a completion for a roll number that never registered", async () => {
    await reset();
    const error = await store()
      .markFormCompleted("26Z9999", 1)
      .then(() => null, (caught) => caught);

    assert.ok(error, "a completion was recorded for an unknown student");
    assert.equal(error.status, 404);
    assert.equal(error.code, "notRegistered");
  });

  it("refuses a completion for empty and junk input rather than throwing", async () => {
    await reset();
    for (const junk of ["", "   ", null, undefined]) {
      const error = await store()
        .markFormCompleted(junk, 1)
        .then(() => null, (caught) => caught);
      assert.ok(error, `junk input "${junk}" was accepted`);
      assert.equal(error.code, "notRegistered");
    }
  });

  // ------------------------------------------------------------------ read ---

  it("returns an empty array from an empty store, not an error", async () => {
    // A fresh install must export an empty sheet rather than a 500.
    await reset();
    assert.deepEqual(await store().readAllRegistrations(), []);
  });

  it("returns every stored record", async () => {
    await reset();
    for (let i = 0; i < 5; i += 1) {
      await tick();
      await store().appendRegistration(
        record({ rollNumber: `26B${1140 + i}`, fullName: `Student ${i}` })
      );
    }
    const all = await store().readAllRegistrations();
    assert.equal(all.length, 5);
    assert.deepEqual(
      all.map((r) => r.fullName).sort(),
      ["Student 0", "Student 1", "Student 2", "Student 3", "Student 4"]
    );
  });

  it("returns records OLDEST FIRST, because the CSV is read in submission order", async () => {
    // This is the assertion that catches a Firestore driver that forgets to
    // order by `submittedAt`. Firestore's default order is by document ID,
    // which is alphabetical by roll number - so the organisers' sheet would be
    // sorted by roll number instead of by when people actually responded, and
    // nothing else in the suite would notice.
    await reset();
    const submitted = [];
    for (let i = 0; i < 4; i += 1) {
      await tick();
      await store().appendRegistration(
        // Descending roll numbers, so ID-order and insertion-order disagree.
        record({ rollNumber: `26B${1150 - i * 3}`, fullName: `Student ${i}` })
      );
      submitted.push(`Student ${i}`);
    }

    const all = await store().readAllRegistrations();
    assert.deepEqual(
      all.map((r) => r.fullName),
      submitted,
      "records came back in the wrong order"
    );

    // Belt and braces: the timestamps must actually be non-decreasing.
    const times = all.map((r) => Date.parse(r.submittedAt));
    for (let i = 1; i < times.length; i += 1) {
      assert.ok(times[i] >= times[i - 1], `record ${i} is out of order`);
    }
  });

  it("preserves characters that break naive CSV and storage implementations", async () => {
    await reset();
    const awkward = record({
      fullName: 'Awkward, Name "PJ"',
      teamMessage: "Line one\nLine two, with a comma",
      skills: "Ünïcödé ✨",
    });
    await store().appendRegistration(awkward);

    const found = await store().findRegistration("26B1140");
    assert.equal(found.fullName, 'Awkward, Name "PJ"');
    assert.equal(found.teamMessage, "Line one\nLine two, with a comma");
    assert.equal(found.skills, "Ünïcödé ✨");
  });

  // ---------------------------------------------------------------- drain ---

  it("drain() resolves", async () => {
    // server.js awaits this on shutdown and exits non-zero if it rejects.
    await reset();
    await store().drain();
  });

  if (!supportsReset) {
    it("reports that it has no reset() test seam", () => {
      assert.fail(
        `${label} has no reset(). The contract suite cannot isolate its assertions, ` +
          "so it is not proven interchangeable with the other drivers."
      );
    });
  }
}

module.exports = { runStoreContract };
