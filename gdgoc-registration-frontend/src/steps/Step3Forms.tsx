import { useLanguage } from '../i18n'
import { VERTICALS } from '../config/verticals'
import type { AuthorisedForms, StudentDetails } from '../types'

/**
 * Step 3 — delivery of the two authorised task forms.
 *
 * SECURITY: this component renders *only* the two links contained in the
 * `forms` object returned by POST /api/register. It never iterates over the
 * full VERTICALS list for links (only for a display label), and no form URL
 * exists anywhere in the source or the bundle. The other six links are not
 * present in the DOM, in state, or in the shipped JavaScript — they live only
 * on the server.
 */

interface Step3Props {
  details: StudentDetails
  forms: AuthorisedForms
}

function FormButton({
  ctaKey,
  form,
}: {
  ctaKey: 'step3.priority1Cta' | 'step3.priority2Cta'
  form: { name: string; url: string }
}) {
  const { t } = useLanguage()

  // Fall back to a readable label if the server ever returns an unknown key.
  const known = VERTICALS.find((v) => v.key === form.name)
  const displayName = known ? known.label : form.name

  return (
    <a
      href={form.url}
      target="_blank"
      rel="noopener noreferrer"
      className="neu-btn group flex items-center justify-between gap-4 px-6 py-5"
    >
      <span className="min-w-0 text-left">
        <span className="block text-[0.62rem] font-bold tracking-[0.16em] text-accent uppercase">
          {t(ctaKey)}
        </span>
        <span className="mt-1 block truncate text-sm font-extrabold text-white">
          {displayName}
        </span>
      </span>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-ink transition-transform group-hover:scale-110"
        aria-hidden="true"
      >
        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
          <path
            d="M7 5h8v8M15 5 5 15"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="sr-only">{t('action.openForm')}</span>
    </a>
  )
}

export function Step3Forms({ details, forms }: Step3Props) {
  const { t } = useLanguage()

  return (
    <div className="text-center">
      {/* Acceptance notice */}
      <div className="neu-inset mb-7 px-6 py-6">
        <span
          className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-navy text-accent"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
            <path
              d="m5 13 4.5 4.5L19 7"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <p className="text-sm leading-relaxed font-extrabold text-ink">{t('step3.notice')}</p>
        <p className="mt-2 text-[0.7rem] text-ink-soft/65">
          {details.fullName} · {details.rollNumber}
        </p>
      </div>

      {/* Exactly two CTAs — no other form link can be rendered. */}
      <div className="flex flex-col gap-4">
        <FormButton ctaKey="step3.priority1Cta" form={forms.priority1} />
        <FormButton ctaKey="step3.priority2Cta" form={forms.priority2} />
      </div>

      <p className="mt-6 px-2 text-[0.68rem] leading-relaxed text-ink-soft/55">
        {t('step3.securityNote')}
      </p>
    </div>
  )
}
