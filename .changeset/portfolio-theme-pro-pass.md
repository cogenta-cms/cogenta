---
'@cogenta/theme-portfolio': minor
---

L25 Annexe pro pass on `theme-portfolio` (brutalist-editorial, electric
violet accent) — the same identity, raised to `theme@1.4` and given a real
project grid, working navigation, and a genuinely flat dark mode.

**Chrome (`theme@1.4`)**: `renderChrome` now uses every 1.4 field — a real
desktop `<nav>` plus a CSS-only mobile menu (checkbox + `<label>`, no
JavaScript, same mechanism `theme-saas` uses), `headerAction` as a filled
button ("Let's talk"), and a footer that adds `tagline`, `renderSocialLinks`
and `footerNote` beside the existing large closing statement and branding
credit. **A real, verified bug found and fixed while testing this in a
browser**: the desktop `.cg-site-header__nav { display: flex }` rule was
declared *after* the `@media (max-width: 56rem)` block that hides it below
the breakpoint; with identical specificity, the later declaration always
wins regardless of the media query, so the mobile nav rendered permanently
open, overlapping the hero, at every width below 896px. Fixed by declaring
the default before the override (the correct source order for two rules of
equal specificity); a CSS-source regression test locks the order in.

**`collectionList`**: `grid`/`carousel` layouts now render full-bleed
project cards (`entryImage`, 4:3, one column at 360px, two from 1280px) with
the entry's own raw `role`/`year` fields as a meta line, and a flat offset
`translate()` + hard shadow on hover/focus — never a blur. `list` keeps the
theme's original numbered-index rows unchanged. **A second real bug found
by screenshot**: `.cg-collection__items` (an `<ol>`) never suppressed the
browser's own decimal marker, so every entry — on every layout, since
before this pass — showed a native "1." beside this theme's own "01" index
badge; fixed with `list-style: none`.

**`featureGrid`**: items now render their `icon` (`theme@1.4`'s
`renderIcon`) above the existing numbered-index treatment, rather than
carrying `data-icon` with no visual glyph at all.

**Project pages**: `renderPage` now draws `renderEntryHeader` (title, cover,
excerpt from `summary`) for an entry-backed page. `role`/`year` are not
threaded to a page's own render under the current `theme@1.4` contract
(`PageEntryMeta` has no room for a collection's custom fields, and
`toVocabularyBlocks` never populates `page.blocks` for a collection with
no `blocks`/`richText` field) — worked around in-scope by giving `project`
an optional `blocks` field and seeding one auto-built, flat "Role / Year"
panel (a `prose` block with `variant.background: "muted"`) per project.
**A third real bug found by screenshot**: that panel's own first paragraph
("Role Art direction") inherited the theme's editorial drop-cap on its
first letter, rendering a giant serif "R"; fixed by opting any
background-variant `prose` block out of the drop cap.

**Dark-mode elevation rebuilt from a glow into a flat shadow (L25 D5,
binding)**: `--cg-elevation-{1,2,3}` used to pair a hairline ring with a
soft `0 0 Nrem` accent-tinted blur in dark mode — a glow, the exact
"100% AI" register the product owner ruled out. Both dark-mode branches now
draw the *same hard, zero-blur offset geometry* light mode's own
`shadow.sm`/`shadow.md` use, recoloured in `--cg-line-strong` (the
brighter-than-surface line this palette already uses for depth). The now
unused `--cg-accent-glow` token is removed.

**Also fixed**: `theme.config.ts`'s stale `theme@1.1` header comment and
`collections: ['article', 'page']` (the blueprint's real collection is
`project`, not `article`) are corrected; `.cg-main` gains `overflow-x: clip`
matching the other L25 themes.

Verified: `typecheck`, `build`, and the full test suite — 314/314 (was 294)
— including new tests for the mobile-menu source-order fix, the `<ol>`
marker fix, the drop-cap fix, `entryImage`/`role`/`year` grid cards, and
`renderIcon` in `featureGrid`. A real site (`portfolio` blueprint,
`create-cogenta`) was scaffolded, served, and inspected in a real browser
at 360/768/1280 on the home, a project and the about page, with the mobile
menu actually opened — all three bugs above were found this way, not by
reading the code.
