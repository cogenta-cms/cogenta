import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { run } from '../src/index.js'

const MINIMAL_WXR = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0"
  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
  <title>CLI Test Blog</title>
  <link>http://cli-test.example.com</link>
  <description>fixture</description>
  <wp:wxr_version>1.2</wp:wxr_version>
  <wp:base_site_url>http://cli-test.example.com</wp:base_site_url>
  <wp:base_blog_url>http://cli-test.example.com</wp:base_blog_url>
  <wp:author>
    <wp:author_id>1</wp:author_id>
    <wp:author_login><![CDATA[admin]]></wp:author_login>
    <wp:author_email>admin@cli-test.example.com</wp:author_email>
    <wp:author_display_name><![CDATA[Admin]]></wp:author_display_name>
  </wp:author>
  <item>
    <title>A post with no media</title>
    <link>http://cli-test.example.com/a-post-with-no-media/</link>
    <dc:creator><![CDATA[admin]]></dc:creator>
    <content:encoded><![CDATA[<!-- wp:paragraph --><p>Just text, nothing to download.</p><!-- /wp:paragraph -->]]></content:encoded>
    <excerpt:encoded><![CDATA[]]></excerpt:encoded>
    <wp:post_id>1</wp:post_id>
    <wp:post_date_gmt>2026-01-01 00:00:00</wp:post_date_gmt>
    <wp:post_name>a-post-with-no-media</wp:post_name>
    <wp:status>publish</wp:status>
    <wp:post_type>post</wp:post_type>
  </item>
</channel>
</rss>
`

async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cogenta-cli-import-'))
  await writeFile(
    join(root, 'cogenta.config.mjs'),
    `export default {
  site: { name: 'Test site', url: 'https://example.com' },
  database: { url: ${JSON.stringify(join(root, 'site.db'))} },
  cache: { path: ${JSON.stringify(join(root, 'cache'))} },
  storage: { path: ${JSON.stringify(join(root, 'media'))} },
}
`,
    'utf8',
  )
  return root
}

let written: string[]
const write = (text: string): void => {
  written.push(text)
}
const output = (): string => written.join('')

describe('cogenta import wordpress', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
    written = []
  })

  it('imports a WXR file and prints a report, exiting zero even with nothing unconverted', async () => {
    written = []
    const root = await project()
    dirs.push(root)
    const file = join(root, 'export.xml')
    await writeFile(file, MINIMAL_WXR, 'utf8')

    const code = await run({
      argv: ['import', 'wordpress', file, '--cwd', root],
      stdout: write,
      env: {},
    })

    expect(code).toBe(0)
    expect(output()).toContain('WordPress import')
    expect(output()).toContain('1 posts, 0 pages')
  })

  it('exits 2 when no file is given', async () => {
    written = []
    const root = await project()
    dirs.push(root)
    let errText = ''
    const code = await run({
      argv: ['import', 'wordpress'],
      stdout: write,
      stderr: (text) => {
        errText += text
      },
      env: {},
      // no --cwd on purpose: usage error happens before the config is read
    })

    expect(code).toBe(2)
    expect(errText).toContain('file path is required')
  })

  it('exits 1 when the file does not exist', async () => {
    written = []
    const root = await project()
    dirs.push(root)
    let errText = ''
    const code = await run({
      argv: ['import', 'wordpress', join(root, 'missing.xml'), '--cwd', root],
      stdout: write,
      stderr: (text) => {
        errText += text
      },
      env: {},
    })

    expect(code).toBe(1)
    expect(errText).toContain('Could not read')
  })
})
