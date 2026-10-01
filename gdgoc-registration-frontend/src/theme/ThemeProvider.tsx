import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ThemeContext, type ResolvedTheme, type ThemePreference } from './context'

/**
 * Colour-theme state.
 *
 * Three modes rather than a boolean: `system` follows the OS and keeps
 * updating on its own, `light` and `dark` are explicit user choices. A plain
 * toggle cannot express "follow my OS, unless I say otherwise", which is what
 * most people actually want from a dark mode.
 *
 * The class is applied by a blocking inline script in index.html before first
 * paint, so this provider only has to keep it in sync — it is not the
 * anti-flash mechanism and must not be relied on as one.
 */

const STORAGE_KEY = 'gdgoc.theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // Storage blocked (private mode) — fall through to the default.
  }
  return 'system'
}

function systemTheme(): ResolvedTheme {
  return typeof matchMedia === 'function' && matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

/** Applies the theme class to <html>. */
function applyThemeClass(theme: ResolvedTheme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference)
  // Mirrors the OS setting so `system` stays live rather than sampled once.
  const [systemValue, setSystemValue] = useState<ResolvedTheme>(systemTheme)

  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const query = matchMedia(DARK_QUERY)
    const onChange = (event: MediaQueryListEvent) => setSystemValue(event.matches ? 'dark' : 'light')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const theme: ResolvedTheme = preference === 'system' ? systemValue : preference

  useEffect(() => {
    applyThemeClass(theme)
  }, [theme])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Storage blocked — the toggle still works for this session.
    }
  }, [])

  const cycle = useCallback(() => {
    setPreference(preference === 'light' ? 'dark' : preference === 'dark' ? 'system' : 'light')
  }, [preference, setPreference])

  const value = useMemo(
    () => ({ preference, theme, setPreference, cycle }),
    [preference, theme, setPreference, cycle],
  )

  return <ThemeContext value={value}>{children}</ThemeContext>
}
