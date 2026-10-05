import { useCallback, useEffect, useRef, useState } from 'react'
import { SelectField, TextField } from '../components/Field'
import { useLanguage, type TranslationKey } from '../i18n'
import { lookupRollNumber } from '../api/client'
import {
  BRANCHES,
  GENDERS,
  SECTIONS,
  SKILLS,
  YEARS_OF_STUDY,
  sectionsForBranch,
} from '../config/options'
import type { ExistingRegistration, StudentDetails } from '../types'

/**
 * Step 1 — student details with roll-number autofill.
 *
 * Autofill policy: typing a roll number debounced for 500ms (and again on
 * blur) triggers GET /api/lookup/:rollNumber. A hit fills every field and puts
 * them in the locked state; a miss leaves everything editable for manual entry.
 */

const EMPTY: StudentDetails = {
  rollNumber: '',
  fullName: '',
  branch: '',
  section: '',
  yearOfStudy: '1st Year',
  contactNumber: '',
  gender: '',
  email: '',
  linkedin: '',
  github: '',
  instagram: '',
  skills: '',
  teamMessage: '',
}

type LookupState =
  | 'idle'
  | 'searching'
  | 'found'
  | 'needsRollNumber'
  | 'rollNumberUnverified'
  | 'verifiedOffline'
  | 'notFound'
  | 'failed'

/** Mirrors the server's ROLL_NUMBER_RE so the UI never sends a rejected value. */
const ROLL_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/

/**
 * A JEE roll number rather than a college enrollment number.
 *
 * Some students are recorded in the roster under their 12-digit JEE roll
 * number instead of the (24|25|26)(letter)(4 digits) college format. Looking
 * one up works and pre-fills correctly, but the JEE number is not what this
 * form should register against, so it is cleared and the student is asked for
 * their college roll number. Verified against the roster: 54 such records, all
 * 12 digits, so the threshold sits well clear of the 7-digit college format.
 */
const JEE_ROLL_RE = /^\d{10,}$/
const EMAIL_RE = /^[^\s@,;<>()[\]\\]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/
const NONE_TOKENS = new Set(['na', 'n/a', 'n.a.', 'na.', 'none', 'nil', 'not available', '-', '--'])

const digitsOnly = (value: string) => value.replace(/\D/g, '')

/**
 * "+91 9876543210" -> "9876543210"
 *
 * Takes the LAST 10 digits rather than testing for a leading "91". Any
 * prefix-stripping rule that depends on the current length is not idempotent:
 * while the student is still typing, "+91 9" is only three digits long, so a
 * length-guarded strip leaves "919" in the box, the next keystroke appends to
 * that, and the field fills itself with a growing run of "91" until maxLength
 * refuses all further input. Slicing from the end is stable for every
 * intermediate state, so typing works.
 */
function localNumber(value: string): string {
  return digitsOnly(value).slice(-10)
}

const isNoneToken = (value: string) => NONE_TOKENS.has(value.toLowerCase().replace(/\s+/g, ' ').trim())

/**
 * Never lock a field the server did not fill in.
 *
 * A locked field is inert, so a required field that arrives from the roster
 * EMPTY and gets locked is a validation error the student cannot clear by any
 * means inside the form - the only escape is hunting for the "Edit manually"
 * link, which unlocks their whole verified identity to fix one dropdown. Every
 * blank in the roster produces one of these, so the fix is conditional rather
 * than a hardcoded list of the affected roll numbers: if there is no value to
 * protect, there is nothing to lock.
 *
 * This also keeps holding if the roster is corrected, if a new blank appears,
 * or if a future field is added - the rule cannot be forgotten per-field,
 * because every locked field goes through here.
 */
const lockIfFilled = (locked: boolean, value: string): boolean =>
  locked && Boolean(value.trim())

/**
 * Guarantee the current value is selectable.
 *
 * The roster stores free-text values ("Information Technology") while the form
 * offers short codes ("IT"). Without this, an autofilled — and therefore
 * locked — <select> would render blank, looking like a broken field. Injecting
 * an unmatched value as an extra option makes the locked field display its
 * real value. It cannot be re-submitted as a new value because the field is
 * read-only in that state.
 */
function withCurrent(
  options: readonly { value: string; label: string }[],
  value: string,
): readonly { value: string; label: string }[] {
  if (!value) return options
  if (options.some((option) => option.value === value)) return options
  return [{ value, label: value }, ...options]
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}

function validate(details: StudentDetails, t: (k: TranslationKey) => string) {
  const errors: Partial<Record<keyof StudentDetails, string>> = {}

  if (!details.rollNumber.trim()) errors.rollNumber = t('error.required')
  else if (!ROLL_RE.test(details.rollNumber.trim())) errors.rollNumber = t('error.rollNumber')

  if (details.fullName.trim().length < 2) errors.fullName = t('error.name')

  if (!details.branch) errors.branch = t('error.required')
  if (!details.section) errors.section = t('error.required')
  if (!details.yearOfStudy) errors.yearOfStudy = t('error.required')

  if (localNumber(details.contactNumber).length !== 10) errors.contactNumber = t('error.phone')

  if (!details.gender) errors.gender = t('error.required')

  if (!details.email.trim()) errors.email = t('error.required')
  else if (!EMAIL_RE.test(details.email.trim())) errors.email = t('error.email')

  // LinkedIn is mandatory, but "NA" is an accepted answer for it.
  if (!details.linkedin.trim()) errors.linkedin = t('error.required')
  else if (!isNoneToken(details.linkedin) && !isHttpUrl(details.linkedin)) errors.linkedin = t('error.url')

  if (details.github.trim() && !isNoneToken(details.github) && !isHttpUrl(details.github)) {
    errors.github = t('error.url')
  }
  if (details.instagram.trim() && !isNoneToken(details.instagram)) {
    const handle = /^@[A-Za-z0-9._]{1,30}$/.test(details.instagram.trim())
    const url = isHttpUrl(details.instagram.trim())
    if (!handle && !url) errors.instagram = t('error.url')
  }

  if (!details.skills) errors.skills = t('error.required')

  // Trimmed before the check, so a box holding only spaces is rejected instead
  // of passing here and then being stored as "" — the same answer the server
  // would give, arrived at without a round trip.
  if (!details.teamMessage.trim()) errors.teamMessage = t('error.required')

  return errors
}

export function Step1Details({
  onSubmit,
  onAlreadyRegistered,
}: {
  onSubmit: (details: StudentDetails) => void
  /**
   * Called when the roll number belongs to a student who has already responded.
   * Handed the record so the parent can confirm without a second request.
   */
  onAlreadyRegistered: (rollNumber: string, registration: ExistingRegistration) => void
}) {
  const { t } = useLanguage()
  const [details, setDetails] = useState<StudentDetails>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof StudentDetails, string>>>({})
  const [locked, setLocked] = useState(false)
  const [lookupState, setLookupState] = useState<LookupState>('idle')
  const [touched, setTouched] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  /**
   * True once this student's identity has been proven by a JEE-number match.
   *
   * `runLookup` is a useCallback with an empty dependency array, so it cannot
   * read `locked` or `lookupState` without going stale. This ref is the single
   * source of truth for "already verified", and it is what stops a later failed
   * re-lookup - for the college roll number she types next, or a network blip -
   * from releasing details that were already confirmed against the roster.
   */
  const jeeVerifiedRef = useRef(false)

  /**
   * True once she has explicitly chosen "Edit manually".
   *
   * Clearing `locked` is not sufficient on its own. The debounced-lookup effect
   * keys off `locked`, so unlocking immediately re-arms it; 500ms later it
   * re-requested the roll number still sitting in the field, received the same
   * roster hit, and re-locked everything. The click looked like it did nothing.
   *
   * This flag suspends automatic lookups until she edits the roll number herself
   * (see the field's onChange), which is the only event that should be able to
   * put the form back under autofill control.
   */
  const manualOptOutRef = useRef(false)

  /**
   * The parent's "already responded" handler, kept in a ref for the same reason
   * as `jeeVerifiedRef`: `runLookup` has an empty dependency array on purpose,
   * so reading the prop directly would capture whatever the first render passed
   * in and go stale when the parent re-creates the callback.
   */
  const alreadyRegisteredRef = useRef(onAlreadyRegistered)
  useEffect(() => {
    alreadyRegisteredRef.current = onAlreadyRegistered
  }, [onAlreadyRegistered])

  const set = useCallback(<K extends keyof StudentDetails>(key: K, value: StudentDetails[K]) => {
    setDetails((previous) => ({ ...previous, [key]: value }))
  }, [])

  /**
   * Run the lookup. Kept in a callback so the debounce timer and the onBlur
   * handler share one code path, and so an in-flight request is cancelled
   * rather than racing a newer keystroke.
   */
  const runLookup = useCallback(
    async (raw: string) => {
      // Honoured before anything else, so neither the debounce nor the field's
      // onBlur can re-lock a form she has opted out of. Cleared only by editing
      // the roll number.
      if (manualOptOutRef.current) return

      const rollNumber = raw.trim()

      abortRef.current?.abort()

      // Too short to be a real roll number — don't bother the server.
      if (rollNumber.length < 3) {
        // Stay on the JEE prompt while she clears and retypes the field,
        // otherwise the guidance disappears mid-edit and reads as a reset.
        setLookupState(jeeVerifiedRef.current ? 'needsRollNumber' : 'idle')
        return
      }
      if (!ROLL_RE.test(rollNumber)) {
        // Rejected before the server is asked, so this is "cannot be a college
        // roll number" rather than "no such student" - and she is still locked.
        setLookupState(jeeVerifiedRef.current ? 'rollNumberUnverified' : 'notFound')
        return
      }

      const controller = new AbortController()
      abortRef.current = controller
      setLookupState('searching')

      try {
        const result = await lookupRollNumber(rollNumber, controller.signal)
        // Checked after the await as well as before it. Clicking "Edit manually"
        // blurs the roll-number field, and that blur fires onBlur -> runLookup
        // BEFORE the click handler runs, so a lookup is already in flight by the
        // time the opt-out is recorded. The pre-await guard cannot catch that,
        // and the late response would re-lock every field - which is why a
        // single click appeared to do nothing and a second one worked.
        if (controller.signal.aborted || manualOptOutRef.current) return

        // Already responded. Checked BEFORE the roster branch, and deliberately
        // independent of `found`: the server reports `registered` even when the
        // roll number is absent from the roster, because a student who
        // registered but is missing from it is a real case. This check used to
        // live inside `if (result.found)`, so every such student was dropped
        // into an empty form and made to retype everything, even though the
        // server had just told us they were done.
        //
        // Stop here rather than pre-filling a form the student is not allowed
        // to submit: the parent swaps in the "response noted" screen, and
        // anything typed below would be thrown away by the 409 anyway. A JEE
        // number is a valid lookup key but not a valid thing to register
        // against, so a returning student is only recognised by the roll number
        // they are meant to register with.
        if (result.registered && result.registration && !JEE_ROLL_RE.test(rollNumber)) {
          alreadyRegisteredRef.current(rollNumber, result.registration)
          return
        }

        if (result.found) {
          // A JEE number is a valid lookup key but not a valid thing to
          // register against. Keep the verified details, drop the number, and
          // ask for the college roll number instead.
          if (JEE_ROLL_RE.test(rollNumber)) {
            setDetails((previous) => ({ ...previous, ...result.student, rollNumber: '' }))
            jeeVerifiedRef.current = true
            setLocked(true)
            setLookupState('needsRollNumber')
          } else {
            setDetails((previous) => ({ ...previous, ...result.student, rollNumber }))
            jeeVerifiedRef.current = false
            setLocked(true)
            setLookupState('found')
          }
          setErrors({})
        } else if (jeeVerifiedRef.current) {
          // Already proven by JEE. Her college roll number simply is not in the
          // roster - which is the expected case for the students recorded only
          // under their JEE number. Keep every field locked; she types her
          // college roll number and continues. Unlocking here would discard
          // details that were correctly fetched moments earlier.
          setLookupState('rollNumberUnverified')
        } else {
          setLocked(false)
          setLookupState('notFound')
        }
      } catch (error) {
        // A superseded lookup is not a failure — just a stale request.
        const name = (error as { name?: string } | null)?.name
        if (name === 'AbortError' || controller.signal.aborted) return
        // Network/server failure must not block manual registration - unless the
        // student is already verified, in which case there is nothing to fill in
        // manually and dropping the lock would only destroy good data.
        if (jeeVerifiedRef.current) {
          setLookupState('verifiedOffline')
        } else {
          setLocked(false)
          setLookupState('failed')
        }
      }
    },
    [],
  )

  // Debounced lookup on every keystroke.
  useEffect(() => {
    if (locked) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => void runLookup(details.rollNumber), 500)
    return () => clearTimeout(debounceRef.current)
  }, [details.rollNumber, locked, runLookup])

  // Abort any in-flight request if the step unmounts mid-flight.
  useEffect(() => () => abortRef.current?.abort(), [])

  // Move focus into the roll number field the moment a JEE number is
  // recognised and the field is cleared, so she can type the replacement
  // immediately instead of hunting for where her text went. Keyed on the two
  // states that mean "a number is still needed", and it only ever runs on a
  // transition INTO one of them, so it cannot re-fire on unrelated renders.
  useEffect(() => {
    if (lookupState !== 'needsRollNumber' && lookupState !== 'rollNumberUnverified') return
    const input = document.getElementById('field-rollNumber')
    if (input instanceof HTMLElement) input.focus()
  }, [lookupState])

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const found = validate(resolvedDetails, t)
    setErrors(found)
    setTouched(true)
    if (Object.keys(found).length > 0) {
      // Move focus to the first problem so keyboard users are not stranded.
      const firstKey = Object.keys(found)[0]
      document.getElementById(`field-${firstKey}`)?.focus()
      return
    }
    onSubmit({
      ...resolvedDetails,
      // Uppercased on the way in so what is stored matches what she saw in the
      // field. The backend canonicalises too, but doing it here means the locked
      // details and the step-3 confirmation read back exactly as typed.
      rollNumber: details.rollNumber.trim().toUpperCase(),
      email: details.email.trim().toLowerCase(),
      contactNumber: `+91 ${localNumber(details.contactNumber)}`,
      linkedin: details.linkedin.trim(),
      github: details.github.trim(),
      instagram: details.instagram.trim(),
      // Trimmed so a stray trailing newline cannot pad every stored record.
      teamMessage: details.teamMessage.trim(),
    })
  }

  const show = (key: keyof StudentDetails) => (touched ? errors[key] : undefined)

  // Sections follow the branch: CS/IT/CSBS/ENTC split into A and B, while
  // Mech, EI, EEE and IP run as one section, so the control is greyed out and
  // pinned to that single value.
  const branchSections = sectionsForBranch(details.branch)
  const singleSection = branchSections.length < 2

  /**
   * The section that will actually be validated and submitted.
   *
   * Derived rather than written back into state, which avoids a setState-in-
   * effect and covers every path that could leave the stored value stale:
   * switching from a two-section branch (with B picked) to a one-section one,
   * and autofilled roster data that disagrees with the branch list. Because it
   * is derived, switching back to a two-section branch also restores whatever
   * the student had chosen before.
   */
  const resolvedDetails: StudentDetails = singleSection
    ? { ...details, section: branchSections[0] ?? '' }
    : details

  const sectionOptions = withCurrent(
    SECTIONS.filter((option) => branchSections.includes(option.value)),
    resolvedDetails.section,
  )

  const banner = {
    idle: { text: t('lookup.idle'), tone: 'text-ink-soft/70' },
    searching: { text: t('lookup.searching'), tone: 'text-ink-soft/80' },
    found: { text: t('lookup.found'), tone: 'text-accent-green' },
    needsRollNumber: { text: t('lookup.jeeFound'), tone: 'text-accent-green' },
    rollNumberUnverified: { text: t('lookup.jeeRollUnverified'), tone: 'text-ink-soft/80' },
    verifiedOffline: { text: t('lookup.jeeOffline'), tone: 'text-ink-soft/80' },
    notFound: { text: t('lookup.notFound'), tone: 'text-ink-soft/80' },
    failed: { text: t('lookup.failed'), tone: 'text-accent-red' },
  }[lookupState]

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="mb-6 text-center">
        <h2 className="field-label text-sm">{t('title.details')}</h2>
        <p className="mt-2 text-xs text-ink-soft/70">{t('title.detailsSub')}</p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <TextField
          label={t('fields.rollNumber')}
          inputId="field-rollNumber"
          required
          placeholder={t('fields.rollNumberPh')}
          value={details.rollNumber}
          error={show('rollNumber')}
          // The hint follows the lookup state. When a JEE roll number has been
          // recognised, runLookup has already blanked this field and the
          // identity is locked, so the one thing left undone is THIS field —
          // and it is the field she has to type into. Saying it next to the
          // input beats leaving it to a banner several rows above.
          hint={
            lookupState === 'needsRollNumber' || lookupState === 'rollNumberUnverified'
              ? t('fields.rollNumberReplace')
              : t('fields.rollNumberHint')
          }
onChange={(e) => {
                // Uppercased as she types, not just on submit: the field is the
                // thing she reads back to check she typed the right number, and
                // `26b1140` on screen would be a number the log never contains.
                // A controlled input means the caret and any IME mid-word are
                // unaffected - there is no DOM value to fight with.
                set('rollNumber', e.target.value.toUpperCase())
            // Typing a different roll number is an explicit request to look it
            // up, so it lifts the "Edit manually" opt-out. Otherwise the escape
            // hatch would be permanent and the field could never re-verify.
            manualOptOutRef.current = false
            // Normally typing here releases the lock, so a mistyped number is
            // recoverable. But in needsRollNumber the lock is what holds the
            // JEE-verified details in place while they type their college
            // roll number, so it must survive until the next lookup resolves.
            if (locked && !jeeVerifiedRef.current) setLocked(false)
          }}
          onBlur={() => void runLookup(details.rollNumber)}
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          maxLength={32}
          className="sm:col-span-2"
        />

        {/* Lookup status. Note the roll-number field above deliberately stays
            editable even after a hit, so a mistyped roll number is
            recoverable rather than stranding the student. */}
        <p
          className={`-mt-2 mb-1 flex items-center gap-2 px-1 text-[0.7rem] font-semibold sm:col-span-2 ${
            banner.tone
          }`}
          role="status"
          aria-live="polite"
        >
          {lookupState === 'searching' ? (
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-navy/50" aria-hidden="true" />
          ) : null}
          {banner.text}
          {/* The manual-entry escape hatch: small inline text on the status line,
           * rendered unconditionally so it is reachable from any state.
           *
           * `manualOptOutRef` is what makes it actually WORK. Unlocking alone was
           * not enough - `locked` flipping to false re-arms the debounced lookup
           * effect below, which 500ms later re-requested the SAME roll number,
           * got the same roster hit, and re-locked every field. The opt-out flag
           * suspends that until she edits the roll number herself, so this is a
           * real escape rather than a half-second flicker. */}
          <button
            type="button"
            onClick={() => {
              manualOptOutRef.current = true
              jeeVerifiedRef.current = false
              // Kill the lookup the blur just kicked off, so it cannot resolve
              // and re-lock after this handler has finished.
              abortRef.current?.abort()
              clearTimeout(debounceRef.current)
              setLocked(false)
              setLookupState('idle')
            }}
            className="font-extrabold text-ink underline underline-offset-2 hover:text-ink-soft"
          >
            {t('lookup.clear')}
          </button>
          {/* Explanatory, not part of the control: sits on the same line, in the
           * banner's own muted tone so it reads as a note about the link rather
           * than competing with it. */}
          <span className="text-ink-soft/60">{t('lookup.clearHint')}</span>
        </p>

        <TextField
          label={t('fields.fullName')}
          inputId="field-fullName"
          required
          placeholder={t('fields.fullNamePh')}
          value={details.fullName}
          error={show('fullName')}
          locked={lockIfFilled(locked, details.fullName)}
          onChange={(e) => set('fullName', e.target.value)}
          autoComplete="name"
          maxLength={100}
        />

        <SelectField
          label={t('fields.branch')}
          inputId="field-branch"
          required
          options={withCurrent(BRANCHES, details.branch)}
          placeholder={t('fields.branchPh')}
          value={details.branch}
          error={show('branch')}
          locked={lockIfFilled(locked, details.branch)}
          onChange={(e) => set('branch', e.target.value)}
        />

        <SelectField
          label={t('fields.section')}
          inputId="field-section"
          required
          options={sectionOptions}
          placeholder={t('fields.sectionPh')}
          value={resolvedDetails.section}
          error={show('section')}
          /* Prefers the "we have no section for you" prompt over the
           * single-section note: a branch that runs one section auto-fills a
           * non-empty value, so the two can never both be the reason the field
           * is inert. */
          hint={
            locked && !resolvedDetails.section
              ? t('fields.sectionMissing')
              : singleSection
                ? t('fields.sectionFixed')
                : undefined
          }
          locked={lockIfFilled(locked, resolvedDetails.section)}
          disabled={singleSection && !locked}
          onChange={(e) => set('section', e.target.value)}
        />

        {/* Unlocked only when the roster supplied no year.
         *
         * Ten students (DE25134, DE25234, DE25242, DE25368, DE25566, DE25857,
         * DE25913, DD25010, DE24127, DE24341) have an empty `year` in the
         * original Google Forms export, so there is no value to lock. Locking
         * an empty required field produced a validation error the student could
         * not clear without "Edit manually", which unlocks the entire verified
         * identity just to answer one question.
         *
         * Conditional rather than a hardcoded list of the ten: the rule that
         * matters is "never lock a field the server did not fill in", and that
         * keeps holding if the roster is corrected or a new blank appears. The
         * roster is left exactly as collected.
         *
         * Deriving the year from the roll-number cohort was considered and
         * rejected — the DE24 cohort splits 5 third-years to 1 second-year, so
         * it would have been a guess written into student records.
         */}
        <SelectField
          label={t('fields.yearOfStudy')}
          inputId="field-yearOfStudy"
          required
          options={withCurrent(YEARS_OF_STUDY, details.yearOfStudy)}
          placeholder=""
          value={details.yearOfStudy}
          error={show('yearOfStudy')}
          hint={locked && !details.yearOfStudy ? t('fields.yearMissing') : undefined}
          locked={lockIfFilled(locked, details.yearOfStudy)}
          onChange={(e) => set('yearOfStudy', e.target.value)}
        />

        {/* Fixed +91 prefix: the student types 10 digits, so the value can
            never be a malformed number the server would reject. */}
        <div className="sm:col-span-1">
          <label htmlFor="field-contactNumber" className="field-label mb-2 flex items-center gap-1">
            <span>{t('fields.contactNumber')}</span>
            <span className="text-accent-red" aria-hidden="true">
              *
            </span>
          </label>

          {/*
            The prefix sits INSIDE the inset pill, so the pill is drawn once.

            Every other control IS the pill (neu-inset is on the input itself);
            this is the only field that nests a control inside one, which is why
            it was the only one that could leak. Three guards now:

              1. `overflow-hidden` — hard guarantee that no descendant, at any
                 width or font size, can paint outside the rounded boundary.
              2. `rounded-full` on the input too — so when the field goes
                 locked, `neu-locked` paints a tinted background that follows
                 the pill's curve instead of appearing as a square block inside
                 it. That square block was the visible "leak".
              3. focus feedback moved to the container as an inset ring, because
                 `overflow-hidden` would otherwise clip a focus ring drawn on
                 the input and leave keyboard users with no focus indicator.
          */}
          <div
            className={`neu-inset flex items-center overflow-hidden rounded-full pr-5 transition-shadow focus-within:ring-2 focus-within:ring-inset focus-within:ring-accent/45 ${
              show('contactNumber') ? 'ring-2 ring-accent-red/60' : ''
            }`}
          >
            <span className="pl-5 pr-1 text-sm font-bold text-ink-soft/70" aria-hidden="true">
              +91
            </span>
            <input
              id="field-contactNumber"
              value={localNumber(details.contactNumber)}
              onChange={(e) => {
                const digits = digitsOnly(e.target.value).slice(0, 10)
                set('contactNumber', digits)
              }}
              disabled={lockIfFilled(locked, details.contactNumber)}
              readOnly={lockIfFilled(locked, details.contactNumber)}
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={10}
              placeholder="9876543210"
              aria-label={t('fields.contactNumber')}
              aria-invalid={show('contactNumber') ? true : undefined}
              aria-describedby={show('contactNumber') ? 'field-contactNumber-error' : undefined}
              className={`min-w-0 flex-1 rounded-full bg-transparent py-3 pl-1 text-sm font-medium text-ink placeholder:text-ink-soft/45 focus:outline-none ${
                locked ? 'neu-locked' : ''
              }`}
            />
          </div>
          {show('contactNumber') ? (
            <p
              id="field-contactNumber-error"
              role="alert"
              className="mt-1.5 px-4 text-[0.68rem] font-semibold text-accent-red"
            >
              {show('contactNumber')}
            </p>
          ) : null}
        </div>

        <SelectField
          label={t('fields.gender')}
          inputId="field-gender"
          required
          options={withCurrent(GENDERS, details.gender)}
          placeholder={t('fields.genderPh')}
          value={details.gender}
          error={show('gender')}
          locked={lockIfFilled(locked, details.gender)}
          onChange={(e) => set('gender', e.target.value)}
        />

{/* Email, GitHub and Instagram are deliberately NOT locked on a lookup
            hit. Students routinely get these wrong or leave them blank on the
            Google Form, and a hard lock left them no way to fix it - they had
            to hit "Edit manually", which unlocks everything including their
            verified name and branch. Identity fields stay locked; these three
            are self-reported links, so an edit is low-risk and useful. */}
        <TextField
          label={t('fields.email')}
          inputId="field-email"
          required
          type="email"
          placeholder={t('fields.emailPh')}
          value={details.email}
          error={show('email')}
          hint={locked ? t('fields.verifiedEditable') : t('fields.emailHelp')}
          onChange={(e) => set('email', e.target.value)}
          autoComplete="email"
          maxLength={254}
        />

        {/* Editable while every other verified field stays locked.
         *
         * The roster's LinkedIn column is the one social field that is both
         * mandatory and full of values the validator rejects - a bare display
         * name instead of a URL, a scheme-less "www.linkedin.com/in/...",
         * "..". Around
         * 250 of 720 students hit that. Locking the field meant the error
         * landed on a value the student never typed and the only way out was
         * "Edit manually", which unlocks the whole verified identity at once.
         *
         * Leaving it editable costs little: LinkedIn is a profile link, not an
         * identity claim, and the server still validates whatever arrives.
         * github and instagram were already unlocked for the same reason. */}
        <TextField
          label={t('fields.linkedin')}
          inputId="field-linkedin"
          required
          placeholder={t('fields.linkedinPh')}
          value={details.linkedin}
          error={show('linkedin')}
          hint={locked ? t('fields.verifiedEditable') : t('fields.optional')}
          onChange={(e) => set('linkedin', e.target.value)}
          autoComplete="off"
          spellCheck={false}
          maxLength={120}
        />

<TextField
          label={t('fields.github')}
          inputId="field-github"
          placeholder={t('fields.githubPh')}
          value={details.github}
          error={show('github')}
          hint={locked ? t('fields.verifiedEditable') : t('fields.optional')}
          onChange={(e) => set('github', e.target.value)}
          autoComplete="off"
          spellCheck={false}
          maxLength={120}
        />

        <TextField
          label={t('fields.instagram')}
          inputId="field-instagram"
          placeholder={t('fields.instagramPh')}
          value={details.instagram}
          error={show('instagram')}
          hint={locked ? t('fields.verifiedEditable') : t('fields.optional')}
          onChange={(e) => set('instagram', e.target.value)}
          autoComplete="off"
          spellCheck={false}
          maxLength={120}
        />

        <SelectField
          label={t('fields.skills')}
          inputId="field-skills"
          required
          options={withCurrent(SKILLS, details.skills)}
          placeholder={t('fields.skillsPh')}
          value={details.skills}
          error={show('skills')}
          locked={lockIfFilled(locked, details.skills)}
          onChange={(e) => set('skills', e.target.value)}
        />

        {/* Free-text note to the team.
         *
         * Required, and the one field on this step the roster can never fill in:
         * every other box is either roster data or an identity claim, so this is
         * the only one where the student has to supply something themselves. It
         * spans both columns because a one-line pill is the wrong shape for a
         * sentence, and it is never locked — nothing to lock it against.
         *
         * spellCheck stays ON here (unlike the social handles) because this is
         * prose, and autoComplete is off so a browser cannot offer a stale
         * value for a field the server has never seen. */}
        <div className="sm:col-span-2">
          <TextField
            label={t('fields.teamMessage')}
            inputId="field-teamMessage"
            placeholder={t('fields.teamMessagePh')}
            value={details.teamMessage}
            required
            error={show('teamMessage')}
            onChange={(e) => set('teamMessage', e.target.value)}
            autoComplete="off"
            maxLength={500}
          />
        </div>
      </div>

      <button type="submit" className="neu-btn mt-8 w-full py-4 text-sm font-extrabold tracking-wide">
        {t('action.submit')}
      </button>
    </form>
  )
}
