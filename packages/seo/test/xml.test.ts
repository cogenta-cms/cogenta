import { describe, expect, it } from 'vitest'
import {
  escapeXmlAttribute,
  escapeXmlText,
  renderXmlDocument,
  stripIllegalXmlChars,
} from '../src/xml.js'
import { parseXml, XmlParseError } from './xml-parser.js'

describe('the test parser', () => {
  it('rejects the malformed documents the escaper exists to prevent', () => {
    expect(() => parseXml('<a>x & y</a>')).toThrow(XmlParseError)
    expect(() => parseXml('<a>a < b</a>')).toThrow(XmlParseError)
    expect(() => parseXml('<a href=x />')).toThrow(XmlParseError)
    expect(() => parseXml('<a><b></a>')).toThrow(XmlParseError)
    expect(() => parseXml('<a/><b/>')).toThrow(XmlParseError)
    expect(() => parseXml('<a>&nbsp;</a>')).toThrow(XmlParseError)
  })

  it('accepts a well-formed document and resolves its references', () => {
    const root = parseXml('<a href="x&amp;y">1 &lt; 2</a>')
    expect(root.attributes.href).toBe('x&y')
    expect(root.text).toBe('1 < 2')
  })
})

describe('XML escaping', () => {
  it('produces a parsable document from a title full of markup characters', () => {
    const nasty = `Tom & Jerry <script>alert("x")</script> 'quoted'`
    const document = renderXmlDocument({ name: 'title', text: nasty })

    expect(parseXml(document).text).toBe(nasty)
  })

  it('produces a parsable document from a URL containing an ampersand', () => {
    const url = 'https://example.com/search?q=cats&page=2&sort=new'
    const document = renderXmlDocument({ name: 'loc', text: url })

    expect(document).toContain('&amp;page=2')
    expect(parseXml(document).text).toBe(url)
  })

  it('round-trips every markup character through an attribute value', () => {
    const value = `a & b < c > d " e ' f`
    const document = renderXmlDocument({ name: 'link', attributes: { href: value } })

    expect(parseXml(document).attributes.href).toBe(value)
  })

  it('keeps attribute whitespace intact, which normalisation would otherwise eat', () => {
    const value = 'first line\nsecond\tline'
    const document = renderXmlDocument({ name: 'link', attributes: { title: value } })

    // A literal newline would come back as a space; the character reference survives.
    expect(document).toContain('&#10;')
    expect(parseXml(document).attributes.title).toBe(value)
  })

  it('removes control characters XML cannot represent at all', () => {
    const withNul = `before${String.fromCharCode(0)}after${String.fromCharCode(8)}`
    expect(stripIllegalXmlChars(withNul)).toBe('beforeafter')

    const document = renderXmlDocument({ name: 'title', text: withNul })
    expect(parseXml(document).text).toBe('beforeafter')
  })

  it('keeps a tab, a newline and a carriage return in text, which XML allows', () => {
    expect(stripIllegalXmlChars('a\tb\nc\rd')).toBe('a\tb\nc\rd')
  })

  it('escapes the same character once, never twice', () => {
    expect(escapeXmlText('&amp;')).toBe('&amp;amp;')
    expect(escapeXmlAttribute('&')).toBe('&amp;')
  })

  it('refuses an element name that would produce an unparsable document', () => {
    expect(() => renderXmlDocument({ name: '1bad', text: 'x' })).toThrow(
      /not a usable XML element or attribute name/,
    )
    expect(() => renderXmlDocument({ name: 'a b', text: 'x' })).toThrow()
  })

  it('drops null children so a conditional element needs no array surgery', () => {
    const document = renderXmlDocument({
      name: 'root',
      children: [{ name: 'kept', text: '1' }, null, undefined],
    })

    expect(parseXml(document).children).toHaveLength(1)
  })

  it('declares UTF-8, without which a conforming parser assumes US-ASCII', () => {
    expect(renderXmlDocument({ name: 'a', text: 'é' })).toMatch(
      /^<\?xml version="1\.0" encoding="UTF-8"\?>/,
    )
  })
})
