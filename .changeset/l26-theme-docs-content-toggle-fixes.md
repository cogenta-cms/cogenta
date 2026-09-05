---
'@cogenta/theme-docs': minor
---

Wire the manual light/dark/system toggle (`renderThemeToggle`, `@cogenta/theme-kit`) into the header, styled to this theme's own icon-button register. Fix a real mobile bug found while verifying it: the header's desktop call-to-action button stayed visible below the 56rem breakpoint because the shared `.cg-action { display: inline-flex }` rule was declared later in the stylesheet than the mobile "hide" rule for `.cg-site-header__action`, winning the cascade tie — this squeezed the site name into wrapping onto a second line that visually overlapped the page content beneath the sticky header. The hide rule now chains the parent class to outrank `.cg-action` regardless of source order, and the site name gets `white-space: nowrap`/`flex-shrink: 0` as a second line of defence.
