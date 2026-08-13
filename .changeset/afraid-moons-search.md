---
'@cogenta/seo': minor
---

Add `@cogenta/seo`, the SEO floor of L3: sitemaps, `robots.txt`, JSON-LD, Open Graph and
Twitter Card, RSS and Atom, `hreflang`, canonicals, `llms.txt` and IndexNow. No new
dependency — XML is serialised in the package, escaping included.

**Sitemaps.** `buildSitemap` returns the files to write. Below the protocol limits that
is one `sitemap.xml`; above them it is an index plus numbered chunks, and the caller
writes what it gets either way. Both limits are enforced — 50 000 URLs *and* 50 MB per
file — because `xhtml:link` alternates make a multilingual site reach the byte cap long
before the URL cap.

**JSON-LD derived from the schema, never hand-written.** A collection named `article`
produces an `Article`, `page` a `WebPage`, `author` a `Person`; an unrecognised name falls
back to the shape of its fields. Field kinds and names map to properties (`title` →
`headline`, `excerpt` → `description`, `cover` → `ImageObject`, an `author` relation →
`Person`). Media and relation identifiers are resolved through injected callbacks, and an
identifier that cannot be resolved is **omitted** rather than emitted raw.

**`hreflang` from the translation family (ADR-0014).** The alternate set is computed once
per family and shared by every member, so reciprocity is structural rather than
emergent — two pages cannot disagree because they hold the same list. `x-default` names
the source entry, and is omitted entirely when the source is unpublished rather than
guessing a translation.

**Nothing unpublished ever leaves.** One gate — published status, published face, a
publication date that has passed, and a resolvable URL — is asked by the sitemap, the
feeds, the `hreflang` map, `llms.txt` and the metadata builder alike.

**IndexNow** returns a result rather than throwing on a failed ping: publishing an
article must not fail because a third-party endpoint is down. `fetch` is injected, and its
absence degrades to a no-op (rule R1).
