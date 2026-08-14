import { describe, expect, it } from 'vitest'
import {
  children,
  firstChild,
  parseXmlDocument,
  textOf,
  textOfChild,
} from '../../src/wordpress/xml.js'

describe('parseXmlDocument', () => {
  it('parses elements, attributes and nested children', () => {
    const root = parseXmlDocument('<rss version="2.0"><channel><title>Hi</title></channel></rss>')
    expect(root.name).toBe('rss')
    expect(root.attrs['version']).toBe('2.0')
    const channel = firstChild(root, 'channel')
    expect(channel).not.toBeNull()
    expect(textOfChild(channel as NonNullable<typeof channel>, 'title')).toBe('Hi')
  })

  it('keeps a namespaced tag name as one opaque string', () => {
    const root = parseXmlDocument('<item><wp:post_id>42</wp:post_id></item>')
    expect(textOfChild(root, 'wp:post_id')).toBe('42')
  })

  it('does not decode entities inside CDATA', () => {
    const root = parseXmlDocument('<content:encoded><![CDATA[<p>A &amp; B</p>]]></content:encoded>')
    expect(textOf(root)).toBe('<p>A &amp; B</p>')
  })

  it('decodes the five standard entities and numeric references in plain text', () => {
    const root = parseXmlDocument(
      '<title>Tom &amp; Jerry &lt;3&gt; &#233;t&#x65; &quot;q&quot;</title>',
    )
    expect(textOf(root)).toBe('Tom & Jerry <3> éte "q"')
  })

  it('handles self-closing tags with attributes', () => {
    const root = parseXmlDocument('<wp:comment_meta key="rating" value="5" />')
    expect(root.name).toBe('wp:comment_meta')
    expect(root.attrs).toEqual({ key: 'rating', value: '5' })
    expect(root.children).toHaveLength(0)
  })

  it('skips comments and the XML prolog', () => {
    const root = parseXmlDocument('<?xml version="1.0"?>\n<!-- a comment --><root>ok</root>')
    expect(root.name).toBe('root')
    expect(textOf(root)).toBe('ok')
  })

  it('collects repeated child elements in document order', () => {
    const root = parseXmlDocument('<channel><item>a</item><item>b</item></channel>')
    expect(children(root, 'item').map((el) => textOf(el))).toEqual(['a', 'b'])
  })

  it('accepts a DOCTYPE with no ENTITY declaration', () => {
    const root = parseXmlDocument('<!DOCTYPE rss><rss>ok</rss>')
    expect(textOf(root)).toBe('ok')
  })

  it('rejects a DOCTYPE declaring an ENTITY', () => {
    expect(() =>
      parseXmlDocument(
        '<!DOCTYPE rss [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><rss>&xxe;</rss>',
      ),
    ).toThrowError(/ENTITY/)
  })

  it('rejects a mismatched closing tag', () => {
    expect(() => parseXmlDocument('<a><b></a></b>')).toThrow()
  })
})
