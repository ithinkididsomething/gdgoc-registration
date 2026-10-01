import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { DICTIONARIES, en, type TranslationKey } from './dictionaries'
import { LanguageContext } from './context'
import type { Language } from '../types'

const STORAGE_KEY = 'gdgoc.lang'

/** Restores a previous language choice; safely a no-op if storage is blocked. */
function readStoredLanguage(): Language {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'hi' ? 'hi' : 'en'
  } catch {
    return 'en'
  }
}

function persistLanguage(language: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, language)
  } catch {
    // Private-mode browsers reject writes; the toggle still works in-memory.
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage)

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next)
    persistLanguage(next)
  }, [])

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => {
      // Missing Hindi key -> English -> the key itself, so a gap is visible
      // rather than rendering an empty label.
      const template = DICTIONARIES[language][key] ?? en[key] ?? key
      if (!vars) return template
      return Object.entries(vars).reduce(
        (out, [name, value]) => out.replaceAll(`{${name}}`, String(value)),
        template,
      )
    },
    [language],
  )

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t])

  return <LanguageContext value={value}>{children}</LanguageContext>
}
