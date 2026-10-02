import { useLanguage } from '../i18n'

/**
 * Credit line under the copyright.
 *
 * Names and profile URLs are data, not copy, so they live here rather than in
 * the dictionaries - they are proper nouns and must not be translated. Only the
 * role labels come from i18n.
 *
 * The LinkedIn profile links are external, so they open in a new tab with
 * rel="noopener noreferrer": without noopener the opened page gets a handle on
 * window.opener and can navigate this tab away.
 */
const CREDITS = [
  { labelKey: 'footer.createdBy', name: 'Parth Saxena', url: 'https://www.linkedin.com/in/parth-saxena-psa11/' },
  { labelKey: 'footer.qa', name: 'Prachi Likhar', url: 'https://www.linkedin.com/in/prachi-likhar-9155bb378/' },
] as const

export function Footer() {
  const { t } = useLanguage()
  return (
    <footer className="w-full pb-2 text-center">
      <p className="px-6 text-[0.68rem] leading-relaxed text-ink-soft/60">{t('footer.copy')}</p>
      <p className="px-6 text-[0.68rem] leading-relaxed text-ink-soft/60">
        {CREDITS.map((credit, index) => (
          <span key={credit.name}>
            {index > 0 ? ' · ' : null}
            {t(credit.labelKey)}{' '}
            <a
              href={credit.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-ink-soft/80 underline underline-offset-2 transition-colors hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
            >
              {credit.name}
            </a>
          </span>
        ))}
      </p>
    </footer>
  )
}