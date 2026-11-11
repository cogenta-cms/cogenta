import { describe, expect, it } from 'vitest'
import { htmlToRichText } from '../../src/wordpress/html-to-richtext.js'

/** Each span of the first block as `[text, marks without link keys]`. */
function spans(html: string): [string, string[]][] {
  const [block] = htmlToRichText(html).document
  if (block === undefined || block._type !== 'block') throw new Error('expected a text block')
  return block.children.map((child) => [
    child.text,
    child.marks.filter((mark) => !mark.startsWith('link-')),
  ])
}

describe('htmlToRichText marks', () => {
  it('keeps bold, italic and code on the words they wrap', () => {
    expect(
      spans('<p>Run <code>npm ci</code>, then <strong>stop</strong> or <em>wait</em>.</p>'),
    ).toEqual([
      ['Run ', []],
      ['npm ci', ['code']],
      [', then ', []],
      ['stop', ['strong']],
      [' or ', []],
      ['wait', ['em']],
      ['.', []],
    ])
  })

  it('reads the legacy b and i spellings as the same marks', () => {
    expect(spans('<p><b>bold</b> and <i>italic</i></p>')).toEqual([
      ['bold', ['strong']],
      [' and ', []],
      ['italic', ['em']],
    ])
  })

  it('keeps nested marks and closes only the one that ends', () => {
    expect(spans('<p><strong>all <em>both</em> bold</strong> plain</p>')).toEqual([
      ['all ', ['strong']],
      ['both', ['strong', 'em']],
      [' bold', ['strong']],
      [' plain', []],
    ])
  })

  it('ignores a closing tag that closes nothing', () => {
    expect(spans('<p><strong>kept</strong></em> after</p>')).toEqual([
      ['kept', ['strong']],
      [' after', []],
    ])
  })

  it('keeps a mark inside a link', () => {
    const [block] = htmlToRichText(
      '<p><a href="https://example.com/">read <strong>this</strong></a></p>',
    ).document
    if (block === undefined || block._type !== 'block') throw new Error('expected a text block')
    const link = block.markDefs[0]
    expect(link?._type === 'link' ? link.href : undefined).toBe('https://example.com/')
    expect(block.children.map((child) => [child.text, child.marks])).toEqual([
      ['read ', [link?._key]],
      ['this', ['strong', link?._key]],
    ])
  })
})
