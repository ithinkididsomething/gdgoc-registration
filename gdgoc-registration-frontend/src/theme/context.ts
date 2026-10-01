import { createContext } from 'react'

/** What the user picked. `system` keeps following the OS preference. */
export type ThemePreference = 'system' | 'light' | 'dark'
/** What is actually painted right now. */
export type ResolvedTheme = 'light' | 'dark'

export interface ThemeContextValue {
  preference: ThemePreference
  theme: ResolvedTheme
  setPreference: (preference: ThemePreference) => void
  /** Cycles light -> dark -> system. */
  cycle: () => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)
