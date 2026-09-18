---
'@cogenta/theme-entreprise': minor
---

Make collectionList read what an entry is, not only the layout an editor chose.

The block recycled one card template across four very different collections (solutions,
case studies, jobs, news) via `layout` alone, styled three ways in CSS — unlike this
theme's own other rich, content-aware blocks. Two real gaps this closed:

- **Open positions.** A job entry (`team`/`contract`, fields only a job has) was rendered
  with an ordinal number, an arrow-only link and a key-figure slot — none of which mean
  anything on a job listing, and its `team`/`location`/`contract` were never shown at
  all. It now gets its own row: title, a `team · location · contract` meta line, the
  summary, and an explicit "Apply" (a new `collectionString` local to this theme, EN/FR).
  The layout an editor picks no longer matters for a careers listing — it always reads
  as a plain vertical list, never a photo grid or a horizontally-scrolling row.
- **Case study attribution.** `client` and `location` were declared on every case study
  and read by nothing: whichever client a result belonged to was only ever findable by
  writing it into the summary's prose. An entry with either field now prints a credit
  line under its title, in the label face, the same way a caption credits a photograph.

Verified against a scaffolded site: the careers page, four case studies (each crediting
its own client), the solutions grid and the news list all render correctly, with no
change to the three collections that already worked.
