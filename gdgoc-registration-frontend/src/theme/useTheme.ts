import { use } from 'react'
import { ThemeContext, type ThemeContextValue } from './context'

/** Access the active theme and its controls. */
export function useTheme(): ThemeContextValue {
  const context = use(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>')
  return context
}
