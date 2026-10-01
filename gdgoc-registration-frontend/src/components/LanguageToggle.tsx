import { useLanguage } from '../i18n'
import type { Language } from '../types'

const OPTIONS: { value: Language; label: string }[] = [
  { value: 'en', label: 'ENG' },
  { value: 'hi', label: 'HI' },
]

/**
 * Two-state language switch with a sliding glass thumb.
 *
 * The previous version toggled a `neu-pressed` inset shadow on whichever label
 * was active, so the change was instantaneous — the shadow snapped in place and
 * the whole page re-rendered its text at once, which read as a hard refresh.
 *
 * Now a single absolutely-positioned thumb slides across the track, and only
 * its transform animates. Because the thumb is a sibling of the labels rather
 * than a style on them, nothing about the labels has to change, so the motion
 * is one continuous 220ms glide instead of two elements cross-fading.
 *
 * The thumb is `w-[calc(50%-0.25rem)]` sitting at `left-1`, so translating it by
 * 100% of its own width lands it exactly on the second cell — the geometry is
 * derived from the padding rather than hard-coded offsets, so it stays correct
 * at any font size.
 *
 * prefers-reduced-motion is honoured globally in index.css, which collapses the
 * transition to 0.01ms, so the thumb still moves but without the glide.
 */
export function LanguageToggle() {
  const { language, setLanguage, t } = useLanguage()

  return (
    <div
      role="group"
      aria-label={t('brand.langLabel')}
      className="neu-inset relative grid grid-cols-2 rounded-full p-1"
    >
      {/* Decorative: the buttons below carry the real accessible state. */}
      <span
        aria-hidden="true"
        className={`glass-thumb pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] transition-transform duration-200 ease-out motion-reduce:transition-none ${
          language === 'hi' ? 'translate-x-full' : 'translate-x-0'
        }`}
      />
      {OPTIONS.map((option) => {
        const active = option.value === language
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setLanguage(option.value)}
            aria-pressed={active}
            className={`relative z-10 rounded-full bg-transparent px-3.5 py-1.5 text-[0.7rem] font-extrabold tracking-wider transition-colors duration-200 motion-reduce:transition-none ${
              active ? 'text-ink' : 'text-ink-soft/70 hover:text-ink-soft'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
