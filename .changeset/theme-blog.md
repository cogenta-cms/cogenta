---
'@cogenta/theme-blog': minor
---

Add `@cogenta/theme-blog`, a reading-first personal/professional blog theme built on
the `@cogenta/theme-kit` contract (`theme@1.4`) every theme implements against (L25).

A masthead, not a marketing template: a magazine-cover hero for the featured post,
serif reading typography (Fraunces for display headings, Source Serif 4 for the
running text, Inter Tight for UI/meta), an image-forward "Latest" grid (3/2/1 columns
at 1280/768/360), an editorial "From the archive" list with small thumbnails, a sticky
header with a zero-JavaScript `<details>` disclosure for the mobile nav and a second,
always-native `<nav>` shown in its place from `56rem` (a closed `<details>`'s
non-summary content cannot be forced to lay out by an author `display` override in
current Chrome — verified against a real browser — so one panel cannot serve both
breakpoints), and a three-column footer (brand + tagline, nav, social links + credit).

All seventeen contract-B blocks get their own layout — never a recolour of another
theme. `renderEntryHeader`/`entryImage`/`renderSocialLinks`/`renderIcon` (theme@1.4) are
used throughout: a post page shows its taxonomy terms as an eyebrow, byline, reading
time and 16:9 cover; every card shows its entry's cover image when one is set. Zero
client JavaScript, zero literal colour in CSS (verified by test), a genuine dark mode
("deep ink", never inverted grey) designed with `light-dark()`/`oklch(from …)`, WCAG AA
contrast computed by test in both schemes, 210 tests. No new npm dependency (fonts via
Google Fonts `@import`, as every other Cogenta theme already does).
