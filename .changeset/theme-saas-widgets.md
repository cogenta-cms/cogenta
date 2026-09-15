---
"@cogenta/theme-saas": minor
"@cogenta/starters": patch
---

The saas theme now sets widget areas in its own register (contract D `theme@1.6`): it exports `widgetAreas`, places the footer widget columns inside its footer on the same twelve columns, and styles the host's `cg-sidebar-layout` as a quiet side column beside changelog entries, feature pages, archives and search results, parted from the content by a hairline, with small semibold labels, dates and counts in Geist Mono, the column search as a hairline control and the call to action as the theme's one primary button; on a phone the column stacks under the content on the page's own gutters. Blocks inside the content column keep the page edges and a full reading measure, and the search page title keeps its style there. The saas blueprint seeds that column: a search box, the changelog by month, recently shipped releases, resource links and a demo call to action, each shown only where the page does not already list the same thing.
