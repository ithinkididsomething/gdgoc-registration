import { use } from 'react'
import { LanguageContext, type LanguageContextValue } from './context'

/** Access the active language and the `t` translate function. */
export function useLanguage(): LanguageContextValue {
  const context = use(LanguageContext)
  if (!context) throw new Error('useLanguage must be used inside <LanguageProvider>')
  return context
}

export type { TranslationKey } from './dictionaries'
