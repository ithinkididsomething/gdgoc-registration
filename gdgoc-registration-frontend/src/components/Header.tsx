import { useLanguage } from '../i18n'
import { useTheme } from '../theme'
import { LanguageToggle } from './LanguageToggle'
import { ThemeToggle } from './ThemeToggle'
import logoDark from '../assets/gdgoc-ietdavv-logo-dark.png'
import logoLight from '../assets/gdgoc-ietdavv-logo-light.png'
import type { Step } from '../types'

/**
 * Official GDGoC IET DAVV lockup.
 *
 * The supplied artwork is a WHITE logo on transparency (51% of its visible
 * pixels are near-white, 7.8% dark) — it is designed to sit on a dark
 * background. On the light neumorphic surface the wordmark was invisible, which
 * is what made it look like it had a white box behind it.
 *
 * So we ship one variant per theme instead of filtering one image:
 *   dark  -> the original, unchanged
 *   light -> the same artwork recoloured to the brand navy
 *
 * Both are cropped by scripts/make-logo-variants.mjs to the identical 975x113
 * content box (8.63:1), because the source canvas is 1109x225 (4.93:1) with
 * 55-74px of transparent padding on every side. Identical boxes mean the
 * header does not visibly resize when the theme is toggled. No background
 * colour, chip or container is drawn behind the logo in either theme.
 */
function Logo() {
  const { t } = useLanguage()
  const { theme } = useTheme()
  return (
    <img
      src={theme === 'dark' ? logoDark : logoLight}
      alt={t('brand.name')}
      width={975}
      height={113}
      className="h-6 w-auto max-w-[160px] object-contain object-left sm:h-7 sm:max-w-[190px]"
    />
  )
}

const STEP_LABELS: Record<Step, 'steps.one' | 'steps.two' | 'steps.three'> = {
  1: 'steps.one',
  2: 'steps.two',
  3: 'steps.three',
}

export function Header({ step }: { step: Step }) {
  const { t } = useLanguage()

  return (
    <header className="w-full">
      <div className="neu-card flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <Logo />
          {/* The logo lockup already carries the organisation name, so only
              the step indicator is repeated as text. The image alt text covers
              the name for screen readers, so it is not announced twice. */}
          <p className="hidden text-[0.62rem] font-bold tracking-[0.18em] text-ink-soft/60 sm:block">
            {t('steps.counter', { current: step, total: 3 })} · {t(STEP_LABELS[step])}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Brand pill: fixed navy in both themes, shadow tones follow the
              theme. The previous inline shadow hardcoded #ffffff, which is
              what made this look out of place in dark mode. */}
          <span className="neu-badge flex items-center gap-2 px-4 py-2">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
            <span className="text-[0.6rem] font-extrabold tracking-[0.14em] text-white">
              {t('brand.session')}
            </span>
          </span>
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
