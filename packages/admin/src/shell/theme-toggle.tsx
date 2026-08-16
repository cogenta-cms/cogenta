import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { type ThemeMode, useTheme } from '../theme/theme-context.js'
import { Button } from '../ui/index.js'

/**
 * The header's colour-scheme control.
 *
 * One button, not a menu: a click cycles `system → light → dark → system`,
 * which keeps it operable with a single `Enter`/`Space` from the keyboard and
 * announced through one `aria-label` that names both the current mode and
 * that activating it changes it — a screen reader user gets the full state
 * without a second control to inspect it.
 */

const NEXT_MODE: Record<ThemeMode, ThemeMode> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
}

export function ThemeToggle(): JSX.Element {
  const { t } = useTranslation()
  const { mode, resolved, setMode } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setMode(NEXT_MODE[mode])}
      aria-label={t('theme.toggleLabel', { mode: t(`theme.${mode}`) })}
      title={t(`theme.${mode}`)}
    >
      {mode === 'system' ? <SystemIcon /> : resolved === 'dark' ? <MoonIcon /> : <SunIcon />}
    </Button>
  )
}

function SunIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 20 20"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <circle cx="10" cy="10" r="3.25" />
      <path d="M10 1.5v2M10 16.5v2M18.5 10h-2M3.5 10h-2M15.66 4.34l-1.42 1.42M5.76 14.24l-1.42 1.42M15.66 15.66l-1.42-1.42M5.76 5.76 4.34 4.34" />
    </svg>
  )
}

function MoonIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 20 20"
      className="size-4"
      fill="currentColor"
    >
      <path d="M17.3 12.5A7.8 7.8 0 0 1 7.5 2.7a.6.6 0 0 0-.76-.76A8.8 8.8 0 1 0 18.06 13.26a.6.6 0 0 0-.76-.76Z" />
    </svg>
  )
}

function SystemIcon(): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 20 20"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="4" width="16" height="10.5" rx="1.25" />
      <path d="M7 17.5h6M10 14.5v3" />
    </svg>
  )
}
