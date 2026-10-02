import { useState } from 'react'
import { useLanguage } from '../i18n'
import { markFormComplete } from '../api/client'
import { verticalByKey } from '../config/verticals'
import type { ExistingRegistration } from '../types'

/**
 * Shown instead of the whole flow once a roll number is recognised as already
 * registered.
 *
 * WHY A WHOLE PAGE AND NOT AN ERROR BANNER: the student did nothing wrong.
 * They responded once, as asked, and are now back — on a second laptop, a week
 * later, unsure whether it worked. A red "error" styling or a validation
 * message would tell them they failed at something they already completed. This
 * page confirms, shows what was recorded, and offers the only thing still worth
 * doing: opening a form they have not submitted yet.
 *
 * There is deliberately no "edit my response" path. The rule is one response per
 * student, and a portal that can edit one is a portal that will be asked to.
 */
export function ResponseNoted({
  rollNumber,
  registration,
}: {
  rollNumber: string
  registration: ExistingRegistration
}) {
  const { t } = useLanguage()

  // Local mirror of the server's flags so pressing "I've submitted this" ticks
  // the row immediately. The server keeps the authoritative timestamp; if the
  // save fails the student is not stranded, and their next visit shows the real
  // state.
  const [marked, setMarked] = useState<{ 1: boolean; 2: boolean }>({
    1: Boolean(registration.priority1CompletedAt),
    2: Boolean(registration.priority2CompletedAt),
  })
  const [saving, setSaving] = useState<1 | 2 | null>(null)

  async function confirm(stage: 1 | 2) {
    setSaving(stage)
    const result = await markFormComplete(rollNumber, stage)
    // Only claim success when the server confirmed it. Showing a tick that the
    // organisers' sheet does not have would be worse than showing nothing.
    if (result) setMarked((previous) => ({ ...previous, [stage]: true }))
    setSaving(null)
  }

  const priority1 = verticalByKey(registration.priority1)
  const priority2 = verticalByKey(registration.priority2)
  const everythingDone = marked[1] && marked[2]

  return (
    <div className="step3-rise text-center">
      <div className="neu-inset px-6 py-10 sm:px-10">
        <span
          className="mx-auto mb-7 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-ink"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7">
            <path
              d="m5 13 4.5 4.5L19 7"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>

        <h2 className="text-lg font-extrabold text-ink">{t('noted.title')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft/80">{t('noted.subtitle')}</p>

        <dl className="mx-auto mt-7 grid max-w-sm gap-3 text-left">
          <Row label={t('noted.rollNumber')} value={rollNumber} />
          <Row label={t('noted.priority1')} value={priority1?.label ?? registration.priority1} />
          <Row label={t('noted.priority2')} value={priority2?.label ?? registration.priority2} />
          {registration.submittedAt ? (
            <Row
              label={t('noted.recordedOn')}
              value={new Date(registration.submittedAt).toLocaleString()}
            />
          ) : null}
        </dl>

        {/*
          The escape hatch, and it is not optional. A student can register and
          then close the tab before opening their Priority form. Without this
          they would be locked out of it forever by the very rule that protects
          their single response, and their only way forward would be to email an
          organiser.
        */}
        <div className="mt-8 flex flex-col gap-3">
          <p className="text-xs leading-relaxed font-bold text-ink-soft/70">
            {everythingDone ? t('noted.allSubmitted') : t('noted.formsHint')}
          </p>

          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            {([1, 2] as const).map((stage) => {
              const form = stage === 1 ? registration.forms.priority1 : registration.forms.priority2
              const vertical = stage === 1 ? priority1 : priority2
              return (
                <div key={stage} className="flex flex-1 flex-col gap-2 sm:max-w-[14rem]">
                  <a
                    href={form?.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-disabled={form?.url ? undefined : true}
                    className={`neu-btn px-4 py-3 text-xs font-extrabold tracking-wide ${
                      form?.url ? '' : 'pointer-events-none opacity-40'
                    }`}
                  >
                    {vertical?.label ?? registration[stage === 1 ? 'priority1' : 'priority2']}
                    <span className="ml-1 text-[0.55rem] opacity-60">
                      {t('noted.openForm')}
                    </span>
                  </a>

                  <button
                    type="button"
                    onClick={() => confirm(stage)}
                    disabled={marked[stage] || saving !== null}
                    className="px-3 py-2 text-[0.6rem] font-bold tracking-[0.1em] text-ink-soft/60 uppercase transition-colors enabled:hover:text-ink-soft/90 disabled:cursor-default"
                  >
                    {marked[stage] ? t('noted.submitted') : t('noted.markSubmitted')}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        <p className="mt-7 text-[0.65rem] leading-relaxed text-ink-soft/50">
          {t('noted.footer')}
        </p>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="neu-inset flex items-baseline justify-between gap-4 px-4 py-3">
      <dt className="shrink-0 text-[0.6rem] font-bold tracking-[0.12em] text-ink-soft/60 uppercase">
        {label}
      </dt>
      <dd className="min-w-0 truncate text-sm font-extrabold text-ink" title={value}>
        {value}
      </dd>
    </div>
  )
}
