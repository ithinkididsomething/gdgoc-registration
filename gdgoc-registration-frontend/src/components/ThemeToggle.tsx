import { useTheme, type ResolvedTheme } from '../theme'

/**
 * Two-state theme control: light or dark. Rendered as a neumorphic inset pill
 * matching the language toggle.
 *
 * The app opens in light for everyone; this is how a student opts into dark.
 */

const OPTIONS: { value: ResolvedTheme; icon: React.ReactNode; label: string }[] = [
  {
    value: 'light',
    label: 'Light',
    icon: (
      <path
        d="M10 3.5v1.8M10 14.7v1.8M16.5 10h-1.8M5.3 10H3.5M14.7 5.3l-1.3 1.3M6.6 13.4l-1.3 1.3M14.7 14.7l-1.3-1.3M6.6 6.6 5.3 5.3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    ),
  },
  {
    value: 'dark',
    label: 'Dark',
    icon: <path d="M16.5 12.4A7 7 0 0 1 7.6 3.5a7 7 0 1 0 8.9 8.9Z" fill="currentColor" />,
  },
]

export function ThemeToggle() {
  const { preference, theme, cycle } = useTheme()

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Colour theme: ${preference}. Activate to change.`}
      title={`Theme: ${preference}`}
      className="neu-inset flex h-[38px] w-[38px] items-center justify-center text-ink-soft transition-colors hover:text-ink"
    >
      <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" aria-hidden="true">
        {OPTIONS.find((option) => option.value === theme)?.icon}
      </svg>
    </button>
  )
}
