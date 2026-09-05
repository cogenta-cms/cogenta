---
'@cogenta/theme-kit': minor
---

Add `renderThemeToggle` and `THEME_TOGGLE_SCRIPT`: a shared, zero-dependency light/dark/system control every built-in theme can wire into its own chrome. Every theme's `tokens.css` already carried the full tri-state CSS pattern (`:root`, `prefers-color-scheme`, `[data-theme="dark"]`) — nothing ever set the attribute, so dark mode was invisible without changing the OS preference. `THEME_STRINGS` gains three new keys (`theme.toggle.switchToLight/Dark/System`, en/fr).
