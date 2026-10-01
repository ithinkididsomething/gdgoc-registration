import { createContext } from 'react'
import type { TranslationKey } from './dictionaries'
import type { Language } from '../types'

export interface LanguageContextValue {
  language: Language
  setLanguage: (language: Language) => void
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
}

export const LanguageContext = createContext<LanguageContextValue | null>(null)
