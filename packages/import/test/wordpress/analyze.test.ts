import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { analyzeWordPress } from '../../src/wordpress/analyze.js'

const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url))

describe('analyzeWordPress', () => {
  it('previews a WXR export with no database and no storage — a pure count', async () => {
    const xml = await readFile(`${FIXTURES}full-featured.xml`, 'utf8')

    const report = analyzeWordPress(xml)

    // `counts` is the raw total found in the document — 3 posts, one of
    // them trashed — so the preview screen can show "3 posts found, 1 will
    // be skipped" rather than silently reporting only what survives.
    expect(report.counts.posts).toBe(3)
    expect(report.counts.pages).toBe(1)
    expect(report.counts.categories).toBe(1)
    expect(report.counts.tags).toBe(1)
    expect(report.counts.comments).toBe(1)

    expect(report.collectionMapping).toEqual({ post: 'post', page: 'page' })
    expect(report.authors.map((author) => author.login).sort()).toEqual(['admin', 'ghost'])

    // The trashed post is named, with a reason, never silently dropped.
    expect(report.ignored).toContainEqual(
      expect.objectContaining({ type: 'post', wpId: '3', title: 'Trashed draft' }),
    )
    // The unapproved/spam comment is named too.
    expect(report.ignored.some((item) => item.type === 'comment')).toBe(true)

    // Media referenced by the content is seen without ever downloading it.
    expect(report.mediaUrls.some((url) => url.includes('gone.jpg'))).toBe(true)
    expect(report.mediaCount).toBeGreaterThan(0)

    expect(report.warnings.some((warning) => warning.includes('placeholder'))).toBe(true)
  })

  it('reports a slug conflict between two importable posts', () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0" xmlns:wp="http://wordpress.org/export/1.2/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <item>
    <title>First</title>
    <wp:post_id>1</wp:post_id>
    <wp:post_type>post</wp:post_type>
    <wp:status>publish</wp:status>
    <wp:post_name>same-slug</wp:post_name>
    <content:encoded><![CDATA[<p>a</p>]]></content:encoded>
  </item>
  <item>
    <title>Second</title>
    <wp:post_id>2</wp:post_id>
    <wp:post_type>post</wp:post_type>
    <wp:status>publish</wp:status>
    <wp:post_name>same-slug</wp:post_name>
    <content:encoded><![CDATA[<p>b</p>]]></content:encoded>
  </item>
</channel>
</rss>`

    const report = analyzeWordPress(xml)
    expect(report.slugConflicts).toEqual([{ kind: 'post', slug: 'same-slug', wpIds: ['1', '2'] }])
  })
})
