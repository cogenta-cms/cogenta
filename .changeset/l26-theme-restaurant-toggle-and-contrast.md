---
'@cogenta/theme-restaurant': minor
---

Wire the manual light/dark/system toggle (`renderThemeToggle`, `@cogenta/theme-kit`) into the header. Fix a real contrast bug found while verifying it: the hero's secondary action button (e.g. "View the menu") used the global `--cg-ink` text color, unreadable once a photograph and its scrim sit behind it — now overridden to `--cg-canvas` specifically when the hero carries media, leaving the plain, light no-media hero untouched.
