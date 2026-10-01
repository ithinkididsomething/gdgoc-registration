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
import type { StudentDetails } from '../types'

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
}

type LookupState = 'idle' | 'searching' | 'found' | 'notFound' | 'failed'

/** Mirrors the server's ROLL_NUMBER_RE so the UI never sends a rejected value. */
const ROLL_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,31}$/
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

  return errors
}

export function Step1Details({ onSubmit }: { onSubmit: (details: StudentDetails) => void }) {
  const { t } = useLanguage()
  const [details, setDetails] = useState<StudentDetails>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof StudentDetails, string>>>({})
  const [locked, setLocked] = useState(false)
  const [lookupState, setLookupState] = useState<LookupState>('idle')
  const [touched, setTouched] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

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
      const rollNumber = raw.trim()

      abortRef.current?.abort()

      // Too short to be a real roll number — don't bother the server.
      if (rollNumber.length < 3) {
        setLookupState('idle')
        return
      }
      if (!ROLL_RE.test(rollNumber)) {
        setLookupState('notFound')
        return
      }

      const controller = new AbortController()
      abortRef.current = controller
      setLookupState('searching')

      try {
        const result = await lookupRollNumber(rollNumber, controller.signal)
        if (controller.signal.aborted) return

        if (result.found) {
          setDetails((previous) => ({ ...previous, ...result.student, rollNumber }))
          setLocked(true)
          setLookupState('found')
          setErrors({})
        } else {
          setLocked(false)
          setLookupState('notFound')
        }
      } catch (error) {
        // A superseded lookup is not a failure — just a stale request.
        const name = (error as { name?: string } | null)?.name
        if (name === 'AbortError' || controller.signal.aborted) return
        // Network/server failure must not block manual registration.
        setLocked(false)
        setLookupState('failed')
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
      email: details.email.trim().toLowerCase(),
      contactNumber: `+91 ${localNumber(details.contactNumber)}`,
      linkedin: details.linkedin.trim(),
      github: details.github.trim(),
      instagram: details.instagram.trim(),
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
          onChange={(e) => {
            set('rollNumber', e.target.value)
            if (locked) setLocked(false)
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
          {locked ? (
            <button
              type="button"
              onClick={() => {
                setLocked(false)
                setLookupState('idle')
              }}
              className="font-extrabold text-ink underline underline-offset-2 hover:text-ink-soft"
            >
              {t('lookup.clear')}
            </button>
          ) : null}
        </p>

        <TextField
          label={t('fields.fullName')}
          inputId="field-fullName"
          required
          placeholder={t('fields.fullNamePh')}
          value={details.fullName}
          error={show('fullName')}
          locked={locked}
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
          locked={locked}
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
          locked={locked}
          disabled={singleSection && !locked}
          hint={singleSection ? t('fields.sectionFixed') : undefined}
          onChange={(e) => set('section', e.target.value)}
        />

        <SelectField
          label={t('fields.yearOfStudy')}
          inputId="field-yearOfStudy"
          required
          options={withCurrent(YEARS_OF_STUDY, details.yearOfStudy)}
          placeholder=""
          value={details.yearOfStudy}
          error={show('yearOfStudy')}
          locked={locked}
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
              disabled={locked}
              readOnly={locked}
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
          locked={locked}
          onChange={(e) => set('gender', e.target.value)}
        />

        <TextField
          label={t('fields.email')}
          inputId="field-email"
          required
          type="email"
          placeholder={t('fields.emailPh')}
          value={details.email}
          error={show('email')}
          hint={t('fields.emailHelp')}
          locked={locked}
          onChange={(e) => set('email', e.target.value)}
          autoComplete="email"
          maxLength={254}
        />

        <TextField
          label={t('fields.linkedin')}
          inputId="field-linkedin"
          required
          placeholder={t('fields.linkedinPh')}
          value={details.linkedin}
          error={show('linkedin')}
          locked={locked}
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
          hint={t('fields.optional')}
          locked={locked}
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
          hint={t('fields.optional')}
          locked={locked}
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
          locked={locked}
          onChange={(e) => set('skills', e.target.value)}
        />
      </div>

      <button type="submit" className="neu-btn mt-8 w-full py-4 text-sm font-extrabold tracking-wide">
        {t('action.submit')}
      </button>
    </form>
  )
}
