import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCommentStore, ensureCommentsTables } from '@cogenta/comments'
import { createDatabaseRegistry, createLocalStorage, createLogger } from '@cogenta/core'
import { afterEach, describe, expect, it } from 'vitest'
import { wpPage, wpPost } from '../../src/wordpress/collections.js'
import { importWordPress } from '../../src/wordpress/import.js'

/**
 * Fiche 15 task 7 (ADR-0025): WordPress comments imported through contract
 * F's real store, checking exactly what the fiche asks to be checked —
 * status, threading, and pages (silently dropped entirely before this task,
 * a real independent bug fixed alongside it).
 */

const XML = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:wfw="http://wellformedweb.org/CommentAPI/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
  <title>Example Blog</title>
  <link>http://example.com</link>
  <description>test</description>
  <language>en-US</language>
  <wp:wxr_version>1.2</wp:wxr_version>
  <wp:base_site_url>http://example.com</wp:base_site_url>
  <wp:base_blog_url>http://example.com</wp:base_blog_url>
  <wp:author>
    <wp:author_id>1</wp:author_id>
    <wp:author_login><![CDATA[admin]]></wp:author_login>
    <wp:author_email>admin@example.com</wp:author_email>
    <wp:author_display_name><![CDATA[Admin]]></wp:author_display_name>
  </wp:author>
  <item>
    <title>Hello, Cogenta</title>
    <link>http://example.com/2026/01/01/hello-cogenta/</link>
    <pubDate>Fri, 01 Jan 2026 12:00:00 +0000</pubDate>
    <dc:creator><![CDATA[admin]]></dc:creator>
    <guid isPermaLink="false">http://example.com/?p=1</guid>
    <content:encoded><![CDATA[<!-- wp:paragraph --><p>Hello.</p><!-- /wp:paragraph -->]]></content:encoded>
    <excerpt:encoded><![CDATA[]]></excerpt:encoded>
    <wp:post_id>1</wp:post_id>
    <wp:post_date_gmt>2026-01-01 12:00:00</wp:post_date_gmt>
    <wp:comment_status>open</wp:comment_status>
    <wp:post_name>hello-cogenta</wp:post_name>
    <wp:status>publish</wp:status>
    <wp:post_parent>0</wp:post_parent>
    <wp:post_type>post</wp:post_type>
    <wp:comment>
      <wp:comment_id>1</wp:comment_id>
      <wp:comment_author><![CDATA[Jane Reader]]></wp:comment_author>
      <wp:comment_author_email>jane@example.com</wp:comment_author_email>
      <wp:comment_date_gmt>2026-01-02 00:00:00</wp:comment_date_gmt>
      <wp:comment_content><![CDATA[Nice post, see <a href="http://example.com">this</a>!]]></wp:comment_content>
      <wp:comment_approved>1</wp:comment_approved>
      <wp:comment_parent>0</wp:comment_parent>
    </wp:comment>
    <wp:comment>
      <wp:comment_id>2</wp:comment_id>
      <wp:comment_author><![CDATA[The Author]]></wp:comment_author>
      <wp:comment_author_email></wp:comment_author_email>
      <wp:comment_date_gmt>2026-01-02 01:00:00</wp:comment_date_gmt>
      <wp:comment_content><![CDATA[Thanks Jane!]]></wp:comment_content>
      <wp:comment_approved>1</wp:comment_approved>
      <wp:comment_parent>1</wp:comment_parent>
    </wp:comment>
    <wp:comment>
      <wp:comment_id>3</wp:comment_id>
      <wp:comment_author><![CDATA[Awaiting Moderation]]></wp:comment_author>
      <wp:comment_author_email>hold@example.com</wp:comment_author_email>
      <wp:comment_date_gmt>2026-01-02 02:00:00</wp:comment_date_gmt>
      <wp:comment_content><![CDATA[Still pending.]]></wp:comment_content>
      <wp:comment_approved>0</wp:comment_approved>
      <wp:comment_parent>0</wp:comment_parent>
    </wp:comment>
    <wp:comment>
      <wp:comment_id>4</wp:comment_id>
      <wp:comment_author><![CDATA[Trashed One]]></wp:comment_author>
      <wp:comment_author_email>trashed@example.com</wp:comment_author_email>
      <wp:comment_date_gmt>2026-01-02 03:00:00</wp:comment_date_gmt>
      <wp:comment_content><![CDATA[Removed.]]></wp:comment_content>
      <wp:comment_approved>trash</wp:comment_approved>
      <wp:comment_parent>0</wp:comment_parent>
    </wp:comment>
    <wp:comment>
      <wp:comment_id>5</wp:comment_id>
      <wp:comment_author><![CDATA[Orphan Reply]]></wp:comment_author>
      <wp:comment_author_email>orphan@example.com</wp:comment_author_email>
      <wp:comment_date_gmt>2026-01-02 04:00:00</wp:comment_date_gmt>
      <wp:comment_content><![CDATA[Replying to something missing.]]></wp:comment_content>
      <wp:comment_approved>1</wp:comment_approved>
      <wp:comment_parent>999</wp:comment_parent>
    </wp:comment>
  </item>
  <item>
    <title>About</title>
    <link>http://example.com/about-us/</link>
    <dc:creator><![CDATA[admin]]></dc:creator>
    <content:encoded><![CDATA[<p>About us.</p>]]></content:encoded>
    <excerpt:encoded><![CDATA[]]></excerpt:encoded>
    <wp:post_id>4</wp:post_id>
    <wp:post_date_gmt>2026-01-01 00:00:00</wp:post_date_gmt>
    <wp:post_name>about</wp:post_name>
    <wp:status>publish</wp:status>
    <wp:post_type>page</wp:post_type>
    <wp:comment>
      <wp:comment_id>6</wp:comment_id>
      <wp:comment_author><![CDATA[Page Commenter]]></wp:comment_author>
      <wp:comment_author_email>page@example.com</wp:comment_author_email>
      <wp:comment_date_gmt>2026-01-03 00:00:00</wp:comment_date_gmt>
      <wp:comment_content><![CDATA[A comment on the About page.]]></wp:comment_content>
      <wp:comment_approved>1</wp:comment_approved>
      <wp:comment_parent>0</wp:comment_parent>
    </wp:comment>
  </item>
</channel>
</rss>`

describe('importWordPress — comments through the real @cogenta/comments store (fiche 15 task 7)', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  async function withSite() {
    const dir = await mkdtemp(join(tmpdir(), 'cogenta-import-comments-'))
    dirs.push(dir)
    const logger = createLogger({ level: 'silent' })
    const selection = await createDatabaseRegistry({ logger }).select({
      driver: 'sqlite',
      url: join(dir, 'site.db'),
    })
    const storage = createLocalStorage({ path: join(dir, 'media') })
    await ensureCommentsTables(selection.instance)
    return { db: selection.instance, storage, dispose: selection.dispose }
  }

  it('imports every real status, real threading, and page comments — none silently dropped', async () => {
    const { db, storage, dispose } = await withSite()
    try {
      const comments = createCommentStore({ db })
      const report = await importWordPress(XML, { db, storage, comments })

      // All six comments accounted for — approved, a reply, pending, trash,
      // an orphan-parent one imported top-level, and the page's own.
      expect(report.imported.comments).toBe(6)

      const postId = (await createCommentStore({ db }).list({ collection: wpPost.name })).items
      const top = postId.find((c) => c.authorName === 'Jane Reader')
      expect(top).toBeDefined()
      expect(top?.status).toBe('approved')
      // The inline <a> was stripped to plain text (R3) — never stored as HTML.
      expect(top?.body).not.toContain('<a')
      expect(top?.body).toContain('this')
      expect(report.warnings.some((warning) => warning.includes('contained HTML'))).toBe(true)

      const reply = postId.find((c) => c.authorName === 'The Author')
      expect(reply?.parentId).toBe(top?.id)
      // No e-mail in the export — a valid placeholder was synthesised.
      expect(reply?.authorEmail).toMatch(/^the\.author@imported\.invalid$/u)

      const pending = postId.find((c) => c.authorName === 'Awaiting Moderation')
      expect(pending?.status).toBe('pending')

      const trashed = postId.find((c) => c.authorName === 'Trashed One')
      expect(trashed?.status).toBe('trash')

      const orphan = postId.find((c) => c.authorName === 'Orphan Reply')
      expect(orphan).toBeDefined()
      expect(orphan?.parentId).toBeNull()
      expect(
        report.warnings.some((warning) => warning.includes('does not exist in this export')),
      ).toBe(true)

      const pageComments = (await comments.list({ collection: wpPage.name })).items
      expect(pageComments).toHaveLength(1)
      expect(pageComments[0]?.authorName).toBe('Page Commenter')
    } finally {
      await dispose()
    }
  })

  it('without a comments store, falls back to the pre-fiche-15 behaviour unchanged (back-compat)', async () => {
    const { db, storage, dispose } = await withSite()
    try {
      const report = await importWordPress(XML, { db, storage })
      // Every approved (`'1'`) comment on the post, flat — the legacy
      // path's own known limits: no threading (a reply is written the same
      // as a top-level comment), pending/trash never imported, and pages
      // not supported at all (reported instead, checked below).
      expect(report.imported.comments).toBe(3)
      expect(
        report.warnings.some((warning) => warning.includes('legacy comment model only supports')),
      ).toBe(true)
    } finally {
      await dispose()
    }
  })
})
