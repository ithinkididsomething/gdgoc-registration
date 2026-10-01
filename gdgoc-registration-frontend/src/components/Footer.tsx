import { useLanguage } from '../i18n'

export function Footer() {
  const { t } = useLanguage()
  return (
    <footer className="w-full pb-2 text-center">
      <p className="px-6 text-[0.68rem] leading-relaxed text-ink-soft/60">{t('footer.copy')}</p>
    </footer>
  )
}
