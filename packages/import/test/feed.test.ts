import { describe, expect, it } from 'vitest'
import { feedToRecords } from '../src/feed.js'

const RSS = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Example blog</title>
    <item>
      <title>First post</title>
      <link>https://example.com/first</link>
      <guid>https://example.com/?p=1</guid>
      <pubDate>Mon, 01 Jan 2024 00:00:00 +0000</pubDate>
      <description>Hello, world.</description>
    </item>
    <item>
      <title>Second post</title>
      <link>https://example.com/second</link>
      <guid>https://example.com/?p=2</guid>
      <pubDate>Tue, 02 Jan 2024 00:00:00 +0000</pubDate>
      <description>Another one.</description>
    </item>
  </channel>
</rss>`

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example blog</title>
  <entry>
    <title>An entry</title>
    <link rel="alternate" href="https://example.com/entry"/>
    <id>urn:uuid:1</id>
    <published>2024-01-01T00:00:00Z</published>
    <summary>An Atom entry.</summary>
  </entry>
</feed>`

describe('feedToRecords', () => {
  it('reads every RSS 2.0 item into a stable-id record', () => {
    const records = feedToRecords(RSS)
    expect(records).toHaveLength(2)
    expect(records[0]).toEqual({
      sourceId: 'https://example.com/?p=1',
      values: {
        title: 'First post',
        link: 'https://example.com/first',
        description: 'Hello, world.',
        publishedAt: 'Mon, 01 Jan 2024 00:00:00 +0000',
      },
    })
  })

  it('reads an Atom entry, resolving the alternate link and the id', () => {
    const records = feedToRecords(ATOM)
    expect(records).toEqual([
      {
        sourceId: 'urn:uuid:1',
        values: {
          title: 'An entry',
          link: 'https://example.com/entry',
          description: 'An Atom entry.',
          publishedAt: '2024-01-01T00:00:00Z',
        },
      },
    ])
  })

  it('falls back to the item index when no guid or id is present', () => {
    const xml = `<rss version="2.0"><channel><item><title>No guid</title></item></channel></rss>`
    const records = feedToRecords(xml)
    expect(records[0]?.sourceId).toBe('1')
  })
})
