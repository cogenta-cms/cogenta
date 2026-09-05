---
'@cogenta/theme-portfolio': minor
---

Wire the shared `renderThemeToggle` (`@cogenta/theme-kit`) into the header, after the nav/mobile-menu pair, styled as `.cg-theme-toggle` in this theme's own hairline-bordered, sharp-cornered register (not canonical's pill button). Every page now offers a manual light/dark/system control; the tri-state CSS to support it already existed in `tokens.css`.
