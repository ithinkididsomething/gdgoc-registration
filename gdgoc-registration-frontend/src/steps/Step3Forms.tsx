import { useEffect, useMemo, useRef, useState } from 'react'
import { useLanguage } from '../i18n'
import { markFormComplete } from '../api/client'
import { WhatsAppInvite } from '../components/WhatsAppInvite'
import { VERTICALS } from '../config/verticals'
import type { AuthorisedForms, StudentDetails } from '../types'

/**
 * Step 3 — the two authorised task forms, embedded one after the other.
 *
 * WHAT CHANGED AND WHY
 * Previously this rendered two links that opened the forms in a new tab. It now
 * embeds each form in an iframe and walks the student through them in order:
 * fill Priority 1, tap continue, fill Priority 2.
 *
 * WHY THERE IS A CONTINUE BUTTON AND NOT AUTOMATIC ADVANCING
 * The tempting version of this feature is "advance when the form is submitted".
 * That cannot be built, and the reason is worth stating plainly:
 *
 *   An embedded Google Form is a cross-origin document. The browser forbids the
 *   parent page from reading its DOM or its URL, and the form does not post a
 *   message back on submit. There is no event to listen for. Any code claiming
 *   to have detected it is either polling something unreliable or reading
 *   nothing at all.
 *
 * So the step is explicit and honest: the student taps continue once they have
 * submitted. The animation makes that feel like a deliberate part of the flow
 * rather than a missing feature, and "open in a new tab" stays available for
 * anyone whose browser or network refuses to load the embed.
 *
 * SECURITY: unchanged in substance. This component renders only the two URLs in
 * the `forms` object returned by POST /api/register. It never iterates the full
 * VERTICALS list for links (only for display labels), and no form URL exists in
 * the source or the bundle. The other six links are absent from the DOM, from
 * state and from the shipped JavaScript — they live only on the server.
 */

interface Step3Props {
  details: StudentDetails
  forms: AuthorisedForms
}

type Stage = 1 | 2 | 3

/**
 * Turns a canonical form URL into its embeddable form.
 *
 * Done generically on the query string rather than against a known URL prefix,
 * because hardcoding the host here would put a form URL pattern in the bundle
 * and fail the build guard in scripts/assert-no-form-urls.mjs. Anything the
 * server hands over is treated as a URL and flagged for embedding.
 */
function toEmbedUrl(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.searchParams.set('embedded', 'true')
    return parsed.toString()
  } catch {
    // Not parseable: fall back to the raw URL rather than rendering nothing.
    // The iframe will simply fail to load, which the panel makes visible.
    return url
  }
}

/** Small step indicator: pips plus a label for whichever is active. */
function StageRail({ stage, single }: { stage: Stage; single: boolean }) {
  const { t } = useLanguage()
  // One pip, not two, when the student declined a second vertical. Showing an
  // empty second stage would imply there was something they skipped.
  const steps: { id: 1 | 2; label: string }[] = single
    ? [{ id: 1, label: t('step3.priority1Cta') }]
    : [
        { id: 1, label: t('step3.priority1Cta') },
        { id: 2, label: t('step3.priority2Cta') },
      ]

  return (
    <ol className="mb-7 flex items-center justify-center gap-3" aria-label={t('step3.progress')}>
      {steps.map((s, i) => {
        const done = stage > s.id
        const active = stage === s.id
        return (
          <li key={s.id} className="flex items-center gap-3">
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={[
                  'flex h-7 w-7 items-center justify-center rounded-full text-[0.68rem] font-black transition-all duration-500',
                  done
                    ? 'bg-accent text-ink'
                    : active
                      ? 'bg-navy text-accent ring-4 ring-accent/25'
                      : 'bg-navy/60 text-ink-soft/45',
                ].join(' ')}
              >
                {done ? (
                  <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
                    <path
                      d="m4 10 4 4 8-8"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  s.id
                )}
              </span>
              <span
                className={[
                  'hidden text-[0.62rem] font-bold tracking-[0.14em] uppercase transition-colors duration-500 sm:block',
                  active ? 'text-accent' : done ? 'text-ink-soft/70' : 'text-ink-soft/35',
                ].join(' ')}
              >
                {s.label}
              </span>
            </span>
            {i < steps.length - 1 && (
              <span
                aria-hidden="true"
                className="h-px w-8 overflow-hidden bg-ink-soft/20 sm:w-14"
              >
                <span
                  className="block h-px bg-accent transition-transform duration-700 ease-out"
                  style={{
                    transform: `scaleX(${stage > s.id ? 1 : 0})`,
                    transformOrigin: 'left',
                  }}
                />
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/**
 * The embed panel for one form.
 *
 * `key` on the iframe is what makes the swap animate: React remounts a fresh
 * node for the next form, so the entrance transition replays instead of the
 * iframe silently reusing the previous document.
 */
function EmbeddedForm({
  form,
  stage,
  onContinue,
  onReset,
}: {
  form: { name: string; url: string }
  stage: 1 | 2
  onContinue: () => void
  onReset: () => void
}) {
  const { t } = useLanguage()
  const [loaded, setLoaded] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const frameRef = useRef<HTMLIFrameElement>(null)

  const embedUrl = useMemo(() => toEmbedUrl(form.url), [form.url])
  const known = VERTICALS.find((v) => v.key === form.name)
  const displayName = known ? known.label : form.name
  const ctaKey = stage === 1 ? 'step3.priority1Cta' : 'step3.priority2Cta'

  // Watchdog for a slow or refused embed: after 4s, show the fallback rather
  // than an indefinite spinner. Mount-only on purpose — the parent keys this
  // component on the active form and epoch, so a new form or a reopen is a
  // fresh mount with fresh state. Resetting these flags from an effect keyed on
  // embedUrl was both redundant and a cascading-render hazard.
  useEffect(() => {
    const timer = window.setTimeout(() => setAttempted(true), 4000)
    return () => window.clearTimeout(timer)
  }, [])

  // Land keyboard and screen-reader users inside the newly revealed form.
  //
  // This deliberately runs on mount rather than from the previous form's
  // continue handler. Continuing unmounts that component, so React nulls its ref
  // before any deferred focus() call could run — the old version silently did
  // nothing at all.
  useEffect(() => {
    frameRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <div className="step3-rise text-left">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-[0.62rem] font-bold tracking-[0.16em] text-accent uppercase">
            {t(ctaKey)}
          </span>
          <span className="mt-1 block truncate text-lg font-extrabold text-white">
            {displayName}
          </span>
        </div>

        {/* Escape hatch: some networks and privacy extensions block third-party
            iframes outright. A dead embed must never be the only way through. */}
        <a
          href={form.url}
          target="_blank"
          rel="noopener noreferrer"
          className="neu-btn shrink-0 px-4 py-2 text-[0.68rem] font-bold tracking-[0.08em] text-ink-soft uppercase"
        >
          {t('step3.openInNewTab')}
        </a>
      </div>

      {/* Rectangle, deliberately not .neu-inset.
       *
       * .neu-inset carries border-radius: 9999px, a pill meant for the short
       * text inputs elsewhere in the form. On a 70vh container that radius is
       * larger than the box's own height, so combined with overflow-hidden it
       * clipped the embedded form into a lozenge. The radius is overridden here
       * rather than changed globally, because every other .neu-inset in the app
       * is a single-line field that the pill shape suits. */}
      <div className="neu-inset relative overflow-hidden rounded-2xl p-1.5">
        {/* Loading shimmer, replaced on the iframe's load event. */}
        {!loaded && (
          <div
            className="absolute inset-1.5 z-10 flex flex-col items-center justify-center gap-3 bg-navy"
            aria-hidden="true"
          >
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
            <span className="text-[0.65rem] font-bold tracking-[0.14em] text-ink-soft/60 uppercase">
              {t('step3.loading')}
            </span>
          </div>
        )}

        {attempted && !loaded && (
          <div
            className="absolute inset-1.5 z-20 flex flex-col items-center justify-center gap-3 bg-navy px-6 text-center"
            role="status"
          >
            <p className="text-sm font-extrabold text-white">{t('step3.embedBlocked')}</p>
            <p className="max-w-sm text-[0.7rem] leading-relaxed text-ink-soft/60">
              {t('step3.embedBlockedHint')}
            </p>
            <a
              href={form.url}
              target="_blank"
              rel="noopener noreferrer"
              className="neu-btn px-5 py-2.5 text-[0.68rem] font-bold tracking-[0.1em] text-ink uppercase"
            >
              {t('step3.openInNewTab')}
            </a>
          </div>
        )}

<iframe
          key={embedUrl}
          ref={frameRef}
          src={embedUrl}
          title={`${displayName} — ${t(ctaKey)}`}
          onLoad={() => setLoaded(true)}
          className="h-[70vh] min-h-[520px] w-full rounded-[1rem] border-0 bg-white"
          // Eager, not lazy: this frame is the main content of the step, and a
          // deferred load can outlast the 4s watchdog above and trip the "did
          // not load" fallback for a form that was about to arrive fine. A
          // slightly earlier request is cheaper than a false error message.
          loading="eager"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={onContinue}
          className="neu-btn group flex flex-1 items-center justify-between gap-4 px-6 py-4 text-left"
        >
          <span className="min-w-0">
            <span className="block text-[0.6rem] font-bold tracking-[0.16em] text-ink-soft/60 uppercase">
              {t('step3.alreadySubmitted')}
            </span>
            <span className="mt-0.5 block text-sm font-extrabold text-white">
              {stage === 1 ? t('step3.continueToSecond') : t('step3.finish')}
            </span>
          </span>
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-ink transition-transform duration-300 group-hover:translate-x-1"
            aria-hidden="true"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
              <path
                d="M4 10h11M11 6l4 4-4 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>

        <button
          type="button"
          onClick={onReset}
          className="shrink-0 px-4 py-3 text-[0.65rem] font-bold tracking-[0.1em] text-ink-soft/50 uppercase transition-colors hover:text-ink-soft/80"
        >
          {t('step3.reopenForm')}
        </button>
      </div>
    </div>
  )
}

/** Closing panel once both forms are done. */
function DonePanel({ details, single }: { details: StudentDetails; single: boolean }) {
  const { t } = useLanguage()

  return (
    <div className="step3-rise text-center">
      <div className="neu-inset px-6 py-10">
        <span
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-ink"
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
        <p className="text-lg font-extrabold text-white">
          {single ? t('step3.allDoneSingle') : t('step3.allDone')}
        </p>
        <p className="mt-2 text-[0.7rem] leading-relaxed text-ink-soft/60">
          {single ? t('step3.allDoneSingleHint') : t('step3.allDoneHint')}
        </p>
<p className="mt-4 text-[0.7rem] text-ink-soft/50">
          {details.fullName} � {details.rollNumber}
        </p>
        {/* No form pebbles on this screen, so the invite sizes to its own label rather
            than stretching to match a pair it is not beside. */}
        <div className="mt-7 flex justify-center">
          <WhatsAppInvite />
        </div>
      </div>
    </div>
  )
}

export function Step3Forms({ details, forms }: Step3Props) {
  const { t } = useLanguage()
  const [stage, setStage] = useState<Stage>(1)
  // Bumping this remounts the iframe, which is how "reopen" re-requests the
  // form document instead of showing a stale already-loaded frame.
  const [epoch, setEpoch] = useState(0)

  // Absent priority2 is the server telling us the student declined a second
  // vertical, so there is exactly one form and no second stage to walk.
  const single = !forms.priority2
  const active = stage === 1 ? forms.priority1 : forms.priority2

  /**
   * The student pressed "I have submitted this form": record it, then advance.
   *
   * This is the only place a Google Form submission can be observed. The form is
   * on docs.google.com and this page is not, so the iframe cannot report
   * anything back; the confirmation button is the student's own statement, and
   * the POST turns that statement into a durable timestamp the organisers can
   * sort by.
   *
   * `markFormComplete` swallows its own errors by design. A student who has
   * genuinely filled the form must not be stranded on a button because a
   * timestamp failed to save, so the stage advances either way and the mark is
   * retried from the "response noted" screen if it failed.
   */
  function advance() {
    // Stage 1 either way. With a single form there is no stage 2 to record, and
    // posting one would fail for a vertical the student never chose.
    void markFormComplete(details.rollNumber, stage === 1 ? 1 : 2)
    // Straight to the closing panel when there is no second form.
    setStage((s) => (s === 1 ? (single ? 3 : 2) : 3))
  }

  return (
    <div className="text-center">
      {/* Acceptance notice */}
      <div className="neu-inset mb-6 px-6 py-6">
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
        <p className="text-sm leading-relaxed font-extrabold text-ink">
          {t('step3.noticeBefore')}
          <span className="font-extrabold text-info-blue">{t('step3.noticeHighlight')}</span>
          {t('step3.noticeAfter')}
        </p>
        <p className="mt-2 text-[0.7rem] text-ink-soft/65">
          {details.fullName} · {details.rollNumber}
        </p>
      </div>

      <StageRail stage={stage} single={single} />

      {/* `!active` cannot happen once `single` is honoured - stage 2 is never
          reached - but falling through to the closing panel beats handing an
          iframe an undefined form if that ever changes. */}
      {stage === 3 || !active ? (
        <DonePanel details={details} single={single} />
      ) : (
        <EmbeddedForm
          key={`${active.name}-${epoch}`}
          form={active}
          stage={stage}
          onContinue={advance}
          onReset={() => setEpoch((n) => n + 1)}
        />
      )}

      <p className="mt-6 px-2 text-[0.68rem] leading-relaxed text-ink-soft/55">
        {t('step3.securityNote')}
      </p>
    </div>
  )
}
