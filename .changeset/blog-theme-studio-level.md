---
'@cogenta/theme-blog': minor
---

Bring the blog theme to the same completeness as `@cogenta/theme-magazine`, in its own quieter register.

`collectionList` now reads five forms from the block's own layout and title, the same
discipline `@cogenta/theme-magazine` already keeps: `list` untitled stays the theme's
signature year-grouped **index**, unchanged; `list` titled is a new ungrouped **digest**
for a curated shelf; `grid` untitled is a new **front** (a lead essay with its picture
and standfirst, a row of secondaries underneath); `grid` titled is a new **rail** (a
lead beside a column of briefs); `carousel` is a new **strip** (essays side by side,
scrolling on a narrow screen). The taxonomy-term archive page is rewritten to the same
front composition instead of a flat chronological list, so a subject page reads as
another chapter of the same publication.

A new shared `Story` card (`renderStory`, `storyFromEntry`, `storyFromArchive`) backs
every form: a small-caps topic, a serif headline, margin-style dates — blog's own
register, not a copy of magazine's red kicker and display sans. `entryTopic` reads a
plain-text field (`topic`/`kicker`/`category`/`subject`/`section`), never the
`category` taxonomy relation, which stores an id a reader can't be shown.

The essay body gains a drop cap (`initial-letter`, guarded by `@supports`) on the
opening paragraph — a typographic enhancement already used by `@cogenta/theme-magazine`,
newly available here because a `richText`-only body is unambiguously a single opening
block.
