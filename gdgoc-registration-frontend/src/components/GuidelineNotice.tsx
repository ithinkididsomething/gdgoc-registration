import { useState } from 'react'
import { useLanguage } from '../i18n'

/**
 * Drive folders backing the two prerequisite links. Constants, not dictionary
 * entries: they are destinations, not prose, so they must not be translated.
 */
const PREREQUISITES_URL =
  'https://drive.google.com/drive/folders/13l9OJGKtee8m6YkdrRz7qAYPTrBTWGVo?usp=drive_link'
const VERTICAL_TASK_URL =
  'https://drive.google.com/drive/folders/1xGnGi_ChUvpZ2tuxVqr_te4YvKof0nj2?usp=drive_link'

const ACK_KEY = 'gdgoc.guidelines.acknowledged'

/**
 * Bullets rendered at full weight. Only the one-attempt rule: it is the
 * consequence that gets an otherwise complete submission thrown away, so it
 * has to survive being skimmed. Everything else stays at body weight - bolding
 * all seven would bold nothing.
 */
const EMPHASISED_BULLETS = new Set(['b3'])

/**
 * Read-before-you-choose notice for step 2.
 *
 * WHY IT FLASHES: these are the rules that get a submission voided - public
 * links, one attempt only, a hard deadline - and a student who misses one loses
 * the vertical they wanted with no way to appeal. Attention is the whole point.
 *
 * WHY THE FLASH IS A GLOW AND NOT A BLINK: fading the instruction text would
 * make it unreadable at exactly the moment the eye arrives. The outer blue
 * glow pulses instead, which is readable across the page while the text itself
 * never drops below full contrast.
 *
 * WHY THE ACKNOWLEDGEMENT IS NOT DISMISSED: pressing OK stops the pulsing, but
 * the panel stays. The deadline and the one-attempt rule must still be on
 * screen when the student hits submit, not only before it.
 *
 * The acknowledgement is remembered for the session so stepping back to step 1
 * and returning does not restart the pulsing at someone who has already read it.
 */
export function GuidelineNotice() {
  const { t } = useLanguage()
  const [acknowledged, setAcknowledged] = useState(() => {
    try {
      return window.sessionStorage.getItem(ACK_KEY) === '1'
    } catch {
      // Private browsing and some embedded webviews throw on sessionStorage.
      // Worst case the notice pulses again; it must never break the page.
      return false
    }
  })

  function acknowledge() {
    setAcknowledged(true)
    try {
      window.sessionStorage.setItem(ACK_KEY, '1')
    } catch {
      /* Non-fatal: the pulse stops for this render either way. */
    }
  }

  const flashing = !acknowledged

  return (
    <aside
      className={`guideline-glass mx-auto mb-6 max-w-2xl px-5 py-6 sm:px-8 ${flashing ? 'guideline-flash' : ''}`}
      aria-labelledby="guideline-title"
    >
      <p className="text-center text-[0.72rem] font-bold tracking-[0.18em] text-ink-soft/60 uppercase">
        {t('step2.guide.eyebrow')}
      </p>
      <h3
        id="guideline-title"
        className={`mt-2 text-center text-base font-extrabold ${
          flashing ? 'guideline-title-flash text-ink' : 'text-ink'
        }`}
      >
        {t('step2.guide.title')}
      </h3>

      {/* Two equal-width link tiles so the top of the panel stays symmetrical. */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <GuideTile href={PREREQUISITES_URL} label={t('step2.guide.prereqLink')} />
        <GuideTile href={VERTICAL_TASK_URL} label={t('step2.guide.taskLink')} />
      </div>

      {/* The one-attempt rule is the consequence that voids a submission, so it
          is the single bullet worth shouting over its neighbours. */}
      <h4 className="field-label mt-6 text-[0.82rem]">{t('step2.guide.beforeSubmit')}</h4>
      <ul className="mt-2 space-y-2 text-[0.82rem] leading-relaxed text-ink-soft/85">
        {(['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7'] as const).map((key) => (
          <li key={key} className="flex gap-2">
            <span aria-hidden="true" className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-accent" />
            <span className={EMPHASISED_BULLETS.has(key) ? 'font-extrabold text-ink' : undefined}>
              {t(`step2.guide.${key}`)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Fact label={t('step2.guide.modeHeading')} value={t('step2.guide.modeValue')} />
        <Fact label={t('step2.guide.deadlineHeading')} value={t('step2.guide.deadline')} accent />
      </div>

      <p className="mt-5 text-center text-[0.82rem] leading-relaxed font-semibold text-ink-soft/90">
        {t('step2.guide.important')}
      </p>

      {/*
        The button is removed once pressed rather than disabled, so the panel
        visibly settles instead of leaving a dead control on screen.
      */}
      {flashing && (
        <div className="mt-5 flex justify-center">
          <button type="button" onClick={acknowledge} className="neu-btn px-6 py-2.5 text-sm font-extrabold tracking-wide">
            {t('step2.guide.ack')}
          </button>
        </div>
      )}
    </aside>
  )
}

/** Outbound Drive link. Same .neu-btn geometry as every other control. */
function GuideTile({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="neu-btn flex items-center justify-center gap-2 px-4 py-3 text-center text-sm font-extrabold tracking-wide"
    >
      {label}
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-3.5 w-3.5 shrink-0">
        <path
          d="M7 17 17 7M9 7h8v8"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  )
}

/** Small label/value pair, centred so the two columns mirror each other. */
function Fact({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-center">
      <p className="text-[0.7rem] font-bold tracking-[0.14em] text-ink-soft/60 uppercase">{label}</p>
      <p className={`mt-1 text-sm font-extrabold ${accent ? 'text-accent-red' : 'text-ink'}`}>
        {value}
      </p>
    </div>
  )
}