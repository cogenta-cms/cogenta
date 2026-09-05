---
'@cogenta/theme-association': minor
---

Wire the manual light/dark/system toggle (`renderThemeToggle`, `@cogenta/theme-kit`) into the header. Fix a real layout bug found while verifying it: `.cg-impact__items`'s fixed `repeat(4, 1fr)` desktop column count, reused by an event's own "When / Where" panel (only two items), left two ghost columns of empty space — switched to `repeat(auto-fit, minmax(9rem, 1fr))` so two items stretch to fill the row exactly as four items already did.
