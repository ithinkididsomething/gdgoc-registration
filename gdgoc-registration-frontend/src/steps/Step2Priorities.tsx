import { useState } from 'react'
import { Spinner } from '../components/Spinner'
import { useLanguage } from '../i18n'
import { VERTICALS } from '../config/verticals'
import type { StudentDetails, VerticalKey } from '../types'

/**
 * Step 2 — pick two distinct verticals, then submit the whole application.
 *
 * Collision prevention: the vertical chosen as Priority 1 is disabled in the
 * Priority 2 list, and vice versa. If a change would create a duplicate (which
 * can happen when editing back and forth), the other slot is cleared rather
 * than silently submitting an invalid pair.
 */

interface Step2Props {
  details: StudentDetails
  submitting: boolean
  onBack: () => void
  onConfirm: (priority1: VerticalKey, priority2: VerticalKey) => void
}

export function Step2Priorities({ details, submitting, onBack, onConfirm }: Step2Props) {
  const { t, language } = useLanguage()
  const [priority1, setPriority1] = useState<VerticalKey | ''>('')
  const [priority2, setPriority2] = useState<VerticalKey | ''>('')
  const [error, setError] = useState<string | null>(null)

  const labelFor = (key: VerticalKey) => {
    const vertical = VERTICALS.find((v) => v.key === key)
    if (!vertical) return key
    return language === 'hi' ? vertical.labelHi : vertical.label
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!priority1) return setError(t('error.priority'))
    if (!priority2) return setError(t('error.priority'))
    if (priority1 === priority2) return setError(t('error.distinct'))
    setError(null)
    onConfirm(priority1, priority2)
  }

  // Changing Priority 1 must not leave an identical Priority 2 behind.
  function choosePriority1(key: VerticalKey) {
    setPriority1(key)
    if (key && key === priority2) setPriority2('')
    setError(null)
  }

  // And symmetrically for Priority 2.
  function choosePriority2(key: VerticalKey) {
    setPriority2(key)
    if (key && key === priority1) setPriority1('')
    setError(null)
  }

  const summary = [
    { label: t('fields.fullName'), value: details.fullName },
    { label: t('fields.rollNumber'), value: details.rollNumber },
    { label: t('fields.branch'), value: details.branch },
  ]

  return (
    <div>
      <div className="mb-6 text-center">
        <h2 className="text-sm font-extrabold tracking-wide text-ink-soft uppercase">
          {t('step2.heading')}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-xs text-ink-soft/70">{t('step2.sub')}</p>
      </div>

      {/* Applicant summary */}
      <div className="neu-inset mb-6 px-5 py-4">
        <p className="field-label mb-3 text-center">{t('step2.summary')}</p>
        <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
          {summary.map((row) => (
            <div key={row.label} className="min-w-0 text-center">
              <dt className="text-[0.6rem] font-bold tracking-wider text-ink-soft/55 uppercase">
                {row.label}
              </dt>
              <dd className="mt-0.5 truncate font-bold text-ink">{row.value || '—'}</dd>
            </div>
          ))}
        </dl>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {(['priority1', 'priority2'] as const).map((slot) => {
            const value = slot === 'priority1' ? priority1 : priority2
            // Collision prevention: block the other slot's current choice.
            const takenByOther = slot === 'priority1' ? priority2 : priority1

            return (
              <div key={slot}>
                <label htmlFor={`field-${slot}`} className="field-label mb-2 block">
                  {slot === 'priority1' ? t('step2.priority1') : t('step2.priority2')}
                  <span className="ml-1 text-accent-red" aria-hidden="true">
                    *
                  </span>
                </label>
                <div className="relative">
                  <select
                    id={`field-${slot}`}
                    value={value}
                    disabled={submitting}
                    onChange={(e) =>
                      slot === 'priority1'
                        ? choosePriority1(e.target.value as VerticalKey)
                        : choosePriority2(e.target.value as VerticalKey)
                    }
                    className={`neu-inset w-full appearance-none rounded-full py-3 pr-12 pl-5 text-sm font-medium text-ink focus:outline-none ${
                      value ? '' : 'text-ink-soft/45'
                    }`}
                  >
                    <option value="">
                      {slot === 'priority1' ? t('step2.priority1Ph') : t('step2.priority2Ph')}
                    </option>
                    {VERTICALS.map((vertical) => {
                      const disabled = takenByOther !== '' && vertical.key === takenByOther
                      return (
                        <option key={vertical.key} value={vertical.key} disabled={disabled}>
                          {labelFor(vertical.key)}
                          {disabled ? ` — ${t('step2.collision')}` : ''}
                        </option>
                      )
                    })}
                  </select>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    fill="none"
                    className="pointer-events-none absolute top-1/2 right-5 h-4 w-4 -translate-y-1/2 text-ink-soft/70"
                  >
                    <path
                      d="M5 7.5 10 12.5 15 7.5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>

                {/* Blurb of the current selection, so students can sanity-check. */}
                {value ? (
                  <p className="mt-1.5 px-4 text-[0.68rem] text-ink-soft/65">
                    {VERTICALS.find((v) => v.key === value)?.blurb}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>

        {error ? (
          <p role="alert" className="mt-4 text-center text-xs font-bold text-accent-red">
            {error}
          </p>
        ) : null}

        <div className="mt-7 flex flex-col gap-3 sm:flex-row-reverse">
          <button
            type="submit"
            disabled={submitting}
            className="neu-btn flex-1 py-4 text-sm font-extrabold tracking-wide"
          >
            {submitting ? <Spinner label={t('action.submitting')} /> : t('action.confirm')}
          </button>
          <button
            type="button"
            onClick={onBack}
            disabled={submitting}
            className="neu-raised px-6 py-4 text-xs font-extrabold tracking-wide text-ink-soft disabled:opacity-50"
          >
            {t('action.back')}
          </button>
        </div>
      </form>
    </div>
  )
}
