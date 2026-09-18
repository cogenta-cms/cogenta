---
'@cogenta/starters': minor
---

Replace the blog blueprint's AI-generated cover photos with real, credited ones.

The five photographs `photo-assets.ts` bundled for the `blog` blueprint at L25 were
generated once via Replicate — convincing at a glance, but depicting nothing real, with
no verifiable licence today (the key that generated them no longer exists). They are
replaced with five real photographs from Wikimedia Commons and Flickr, each under CC0,
the public domain, or a Creative Commons Attribution licence (never ShareAlike, never
NonCommercial) — the same discipline `@cogenta/theme-entreprise`'s `vitrine` blueprint
already keeps for its own twenty-two photographs.

A new seeded "Photo credits" page (`blog-credits.ts`, linked from the footer) lists the
title, author, licence and source of every photograph, satisfying attribution licences
without inventing a second crediting mechanism. Alt text for all five images is rewritten
to describe what the new photographs actually show.
