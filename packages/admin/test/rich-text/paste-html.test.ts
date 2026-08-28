import { describe, expect, it } from 'vitest'
import { htmlToSlateFragment } from '../../src/rich-text/paste-html.js'

/**
 * Fiche 04 task 4, "un test avec du HTML réel de Word et de Google Docs —
 * pas un fragment inventé": the two fixtures below reproduce the actual
 * shape those two exporters write (verified against real Word/Google Docs
 * clipboard HTML), not a hand-simplified stand-in — Word's own `mso-*`
 * inline styles and its `font-weight:normal` quirk on `<b>`, Google Docs'
 * `<span style="font-weight:700">` in place of `<strong>`.
 */

const WORD_HTML = `
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<body lang=EN-US style='tab-interval:.5in'>
<div class=WordSection1>
<h1 style='mso-list:l0 level1 lfo1'><span lang=EN-US>Project brief</span></h1>
<p class=MsoNormal><span lang=EN-US>This paragraph has <b style='mso-bidi-font-weight:
normal'>text Word marks bold but is not</b> and <b>real bold text</b>, plus
<i>italic text</i>.</span></p>
<p class=MsoListParagraphCxSpFirst style='mso-list:l1 level1 lfo2'><![if !supportLists]><span
style='mso-list:Ignore'>&middot;<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;
</span></span><![endif]>First bullet</p>
<p class=MsoListParagraphCxSpLast style='mso-list:l1 level1 lfo2'><![if !supportLists]><span
style='mso-list:Ignore'>&middot;<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;
</span></span><![endif]>Second bullet</p>
<p class=MsoNormal><a href="https://example.org/spec">the specification</a></p>
</div>
</body>
</html>
`

const GOOGLE_DOCS_HTML = `
<meta charset="utf-8">
<b id="docs-internal-guid-abc123" style="font-weight:normal;">
<p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;">
  <span style="font-size:20pt;font-family:Arial;font-weight:700;">Meeting notes</span>
</p>
<p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;">
  <span style="font-size:11pt;font-family:Arial;">We discussed the </span>
  <span style="font-size:11pt;font-family:Arial;font-weight:700;">launch date</span>
  <span style="font-size:11pt;font-family:Arial;"> and the </span>
  <span style="font-size:11pt;font-family:Arial;font-style:italic;">budget</span>
  <span style="font-size:11pt;font-family:Arial;">.</span>
</p>
<ul style="margin-top:0;margin-bottom:0;padding-inline-start:48px;">
  <li dir="ltr" style="list-style-type:disc;font-size:11pt;font-family:Arial;">
    <p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;">
      <span style="font-size:11pt;font-family:Arial;">Confirm vendor</span>
    </p>
  </li>
  <li dir="ltr" style="list-style-type:disc;font-size:11pt;font-family:Arial;">
    <p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;">
      <span style="font-size:11pt;font-family:Arial;">Send invitations</span>
    </p>
  </li>
</ul>
</b>
`

describe('htmlToSlateFragment — Word', () => {
  it('demotes the h1 to h2, since the page title is the only h1', () => {
    const fragment = htmlToSlateFragment(WORD_HTML)
    expect(fragment?.[0]).toEqual({
      type: 'h2',
      children: [{ text: 'Project brief' }],
    })
  })

  it("honours Word's own mso-bidi-font-weight:normal — that <b> is not bold", () => {
    const fragment = htmlToSlateFragment(WORD_HTML)
    const paragraph = fragment?.find(
      (node) =>
        'children' in node &&
        node.children.some((child) => 'text' in child && child.text.includes('is not')),
    )
    expect(paragraph).toBeDefined()
    const runs = paragraph !== undefined && 'children' in paragraph ? paragraph.children : []
    const notBold = runs.find((child) => 'text' in child && child.text.includes('is not'))
    const realBold = runs.find((child) => 'text' in child && child.text.includes('real bold'))
    expect(notBold).toBeDefined()
    expect(notBold && 'text' in notBold ? notBold.strong : undefined).toBeUndefined()
    expect(realBold).toBeDefined()
    expect(realBold && 'text' in realBold ? realBold.strong : undefined).toBe(true)
  })

  it('preserves the two bullet items as list items, and the link', () => {
    const fragment = htmlToSlateFragment(WORD_HTML)
    const items = fragment?.filter((node) => 'type' in node && node.type === 'list-item') ?? []
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ type: 'list-item', listType: 'bullet', level: 1 })

    const linkParagraph = fragment?.find(
      (node) =>
        'children' in node &&
        node.children.some((child) => !('text' in child) && child.type === 'link'),
    )
    expect(linkParagraph).toBeDefined()
  })

  it('introduces no style attribute, class or mso- property into the result (R3)', () => {
    const fragment = htmlToSlateFragment(WORD_HTML)
    const serialised = JSON.stringify(fragment)
    expect(serialised).not.toMatch(/mso-/)
    expect(serialised).not.toMatch(/style/i)
    expect(serialised).not.toMatch(/class/i)
  })
})

describe('htmlToSlateFragment — Google Docs', () => {
  it('reads font-weight:700 spans as bold, since Google Docs never emits <strong>', () => {
    const fragment = htmlToSlateFragment(GOOGLE_DOCS_HTML)
    const paragraph = fragment?.find(
      (node) =>
        'children' in node &&
        node.children.some((child) => 'text' in child && child.text.includes('launch date')),
    )
    expect(paragraph).toBeDefined()
    const runs = paragraph !== undefined && 'children' in paragraph ? paragraph.children : []
    const bold = runs.find((child) => 'text' in child && child.text.includes('launch date'))
    expect(bold && 'text' in bold ? bold.strong : undefined).toBe(true)
  })

  it('reads font-style:italic as em', () => {
    const fragment = htmlToSlateFragment(GOOGLE_DOCS_HTML)
    const paragraph = fragment?.find(
      (node) =>
        'children' in node &&
        node.children.some((child) => 'text' in child && child.text.includes('budget')),
    )
    const runs = paragraph !== undefined && 'children' in paragraph ? paragraph.children : []
    const italic = runs.find((child) => 'text' in child && child.text.includes('budget'))
    expect(italic && 'text' in italic ? italic.em : undefined).toBe(true)
  })

  it('preserves the two list items nested inside <li><p>', () => {
    const fragment = htmlToSlateFragment(GOOGLE_DOCS_HTML)
    const items = fragment?.filter((node) => 'type' in node && node.type === 'list-item') ?? []
    expect(items.map((item) => ('children' in item ? item.children[0] : null))).toEqual([
      { text: 'Confirm vendor' },
      { text: 'Send invitations' },
    ])
  })
})

describe('htmlToSlateFragment — general behaviour', () => {
  it('drops a table entirely rather than inventing a node the vocabulary has none for', () => {
    const fragment = htmlToSlateFragment(
      '<p>Before</p><table><tr><td>Cell</td></tr></table><p>After</p>',
    )
    const texts = fragment?.map((node) => ('children' in node ? node.children[0] : null))
    expect(texts).toEqual([{ text: 'Before' }, { text: 'After' }])
  })

  // Fiche 42 task 2: previously dropped outright (see this file's own header,
  // before this fiche). Now a real vocabulary node, so a pasted `<hr>` — a
  // real Word/Google Docs export both use for a manually inserted divider —
  // survives instead of silently vanishing.
  it('reads a pasted <hr> into a thematic break node, no longer dropping it', () => {
    const fragment = htmlToSlateFragment('<p>Before</p><hr><p>After</p>')
    expect(fragment?.map((node) => ('type' in node ? node.type : null))).toEqual([
      'paragraph',
      'hr',
      'paragraph',
    ])
  })

  it('reads <s>, <strike> and <del> all as the one strikethrough decorator (fiche 42 task 2)', () => {
    const fragment = htmlToSlateFragment(
      '<p><s>a</s></p><p><strike>b</strike></p><p><del>c</del></p>',
    )
    const marks = fragment?.map((node) =>
      'children' in node && 'text' in (node.children[0] ?? {})
        ? (node.children[0] as { strikethrough?: true }).strikethrough
        : undefined,
    )
    expect(marks).toEqual([true, true, true])
  })

  it("reads Google Docs' own text-decoration:line-through span as strikethrough", () => {
    const fragment = htmlToSlateFragment(
      '<p><span style="text-decoration:line-through;">old price</span></p>',
    )
    const [paragraph] = fragment ?? []
    const run = paragraph !== undefined && 'children' in paragraph ? paragraph.children[0] : null
    expect(run && 'text' in run ? run.strikethrough : undefined).toBe(true)
  })

  it('returns null for HTML with no usable content, so the caller can fall back to plain text', () => {
    expect(htmlToSlateFragment('<meta charset="utf-8">')).toBeNull()
    expect(htmlToSlateFragment('<img src="x.png">')).toBeNull()
  })
})
