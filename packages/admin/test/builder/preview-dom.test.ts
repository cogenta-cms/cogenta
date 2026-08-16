import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import {
  BLOCK_KEY_MIME,
  BLOCK_TYPE_MIME,
  setChromeVisible,
  setSelectedBlock,
  wirePreview,
} from '../../src/builder/preview-dom.js'

/**
 * The markup here is copied from what `@cogenta/theme-canonical` really
 * serialises — the same classes, the same `data-block`, the same
 * `data-block-key` and `data-field` attributes, in the same nesting. It is not
 * a convenient simplification: this file's whole job is to prove the builder
 * can drive the *real* page, so a fixture that made the page easier to drive
 * would prove nothing.
 */
const PAGE = `<!doctype html>
<html lang="en"><head><title>A page</title></head>
<body>
<a class="cg-skip-link" href="#cg-main">Skip to content</a>
<header class="cg-site-header"><div class="cg-site-header__inner"><a class="cg-site-header__home" href="/">Test site</a></div></header>
<main class="cg-main" id="cg-main">
<section class="cg-block cg-hero" data-block="hero" data-block-key="k-hero"><div class="cg-hero__body"><p class="cg-hero__eyebrow" data-field="eyebrow">Architecture</p><h1 class="cg-hero__title" data-field="title">A CMS that runs itself</h1></div></section>
<div class="cg-block cg-prose" data-block="prose" data-block-key="k-prose"><p>Body text.</p></div>
<section class="cg-block cg-cta" data-block="cta" data-block-key="k-cta"><h2 class="cg-cta__title" data-field="title">Try it</h2><ul class="cg-actions"><li><a class="cg-action" href="/install">Install</a></li></ul></section>
</main>
<footer class="cg-site-footer"><div class="cg-site-footer__inner">Test site</div></footer>
</body></html>`

function parse(): Document {
  return new DOMParser().parseFromString(PAGE, 'text/html')
}

/** A `DataTransfer` good enough for the two formats the builder uses. */
function transfer(entries: Readonly<Record<string, string>> = {}): DataTransfer {
  const store = new Map(Object.entries(entries))
  return {
    getData: (format: string) => store.get(format) ?? '',
    setData: (format: string, data: string) => {
      store.set(format, data)
    },
    dropEffect: 'none',
    effectAllowed: 'all',
  } as unknown as DataTransfer
}

function drag(element: Element, type: string, dataTransfer: DataTransfer): void {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
  element.dispatchEvent(event)
}

interface Handlers {
  onSelect: Mock<(key: string) => void>
  onMove: Mock<(key: string, toIndex: number) => void>
  onInsert: Mock<(type: string, atIndex: number) => void>
  onInlineEdit: Mock<(key: string, field: string, text: string) => void>
}

let doc: Document
let handlers: Handlers
let dispose: () => void

beforeEach(() => {
  doc = parse()
  handlers = {
    onSelect: vi.fn<(key: string) => void>(),
    onMove: vi.fn<(key: string, toIndex: number) => void>(),
    onInsert: vi.fn<(type: string, atIndex: number) => void>(),
    onInlineEdit: vi.fn<(key: string, field: string, text: string) => void>(),
  }
  dispose = wirePreview(doc, handlers)
})

describe('driving the real rendered page from the builder (L16 task 2)', () => {
  it('finds every block the theme rendered, by the key contract B minted', () => {
    const keys = [...doc.querySelectorAll('[data-block-key]')].map(
      (element) => (element as HTMLElement).dataset['blockKey'],
    )
    expect(keys).toEqual(['k-hero', 'k-prose', 'k-cta'])
  })

  it('selects the block a click landed in, whatever was clicked inside it', () => {
    doc.querySelector('.cg-hero__title')?.dispatchEvent(new Event('click', { bubbles: true }))
    expect(handlers.onSelect).toHaveBeenCalledWith('k-hero')
  })

  it('selects nothing when the click was on the page frame, not a block', () => {
    doc.querySelector('.cg-site-footer')?.dispatchEvent(new Event('click', { bubbles: true }))
    expect(handlers.onSelect).not.toHaveBeenCalled()
  })

  it('never follows a link in the preview, which would replace the document', () => {
    const link = doc.querySelector('.cg-action')
    const event = new Event('click', { bubbles: true, cancelable: true })
    link?.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('never submits a form from inside the preview', () => {
    const event = new Event('submit', { bubbles: true, cancelable: true })
    doc.querySelector('main')?.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('makes every block draggable, and stops when the wiring is disposed', () => {
    const blocks = [...doc.querySelectorAll<HTMLElement>('[data-block-key]')]
    expect(blocks.every((element) => element.draggable)).toBe(true)
    dispose()
    expect(blocks.some((element) => element.draggable)).toBe(false)
  })

  it('carries the dragged block’s key, and reports the position it was dropped on', () => {
    const source = doc.querySelector('[data-block-key="k-cta"]')
    const target = doc.querySelector('[data-block-key="k-hero"]')
    const data = transfer()

    drag(source as Element, 'dragstart', data)
    expect(data.getData(BLOCK_KEY_MIME)).toBe('k-cta')

    drag(target as Element, 'drop', data)
    expect(handlers.onMove).toHaveBeenCalledWith('k-cta', 0)
  })

  it('accepts the drop at all, which needs dragover to be prevented', () => {
    // A dragover that is not prevented makes the browser reject the drop
    // silently — the single most common reason a hand-rolled drag does
    // nothing whatsoever.
    const target = doc.querySelector('[data-block-key="k-prose"]') as HTMLElement
    const event = new Event('dragover', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: transfer() })
    target.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(target.hasAttribute('data-cg-drop-target')).toBe(true)
  })

  it('inserts a block dropped from the library at the position dropped on', () => {
    const target = doc.querySelector('[data-block-key="k-prose"]')
    drag(target as Element, 'drop', transfer({ [BLOCK_TYPE_MIME]: 'quote' }))
    expect(handlers.onInsert).toHaveBeenCalledWith('quote', 1)
    expect(handlers.onMove).not.toHaveBeenCalled()
  })

  it('appends when the drop landed on the page rather than on a block', () => {
    const main = doc.querySelector('main')
    drag(main as Element, 'drop', transfer({ [BLOCK_TYPE_MIME]: 'quote' }))
    expect(handlers.onInsert).toHaveBeenCalledWith('quote', 3)
  })

  it('moves to the end when an existing block is dropped on the page frame', () => {
    const main = doc.querySelector('main')
    drag(main as Element, 'drop', transfer({ [BLOCK_KEY_MIME]: 'k-hero' }))
    expect(handlers.onMove).toHaveBeenCalledWith('k-hero', 2)
  })

  it('ignores a drop carrying neither of the two formats it understands', () => {
    const target = doc.querySelector('[data-block-key="k-hero"]')
    drag(target as Element, 'drop', transfer({ 'text/plain': 'https://example.com' }))
    expect(handlers.onMove).not.toHaveBeenCalled()
    expect(handlers.onInsert).not.toHaveBeenCalled()
  })
})

describe('editing text in place, in the page itself (L16 task 3)', () => {
  it('opens only on a field the theme marked, and reports what was typed', () => {
    const title = doc.querySelector<HTMLElement>('[data-block-key="k-hero"] [data-field="title"]')
    title?.dispatchEvent(new Event('dblclick', { bubbles: true }))
    expect(title?.getAttribute('contenteditable')).toBeTruthy()

    if (title !== null && title !== undefined) title.textContent = 'Edited in place'
    title?.dispatchEvent(new Event('blur', { bubbles: false }))

    expect(handlers.onInlineEdit).toHaveBeenCalledWith('k-hero', 'title', 'Edited in place')
  })

  it('reports the field name the theme wrote, not a guess from the class', () => {
    const eyebrow = doc.querySelector<HTMLElement>('[data-field="eyebrow"]')
    eyebrow?.dispatchEvent(new Event('dblclick', { bubbles: true }))
    eyebrow?.dispatchEvent(new Event('blur', { bubbles: false }))
    expect(handlers.onInlineEdit).toHaveBeenCalledWith('k-hero', 'eyebrow', 'Architecture')
  })

  it('offers nothing to edit in a block with no plain-text field', () => {
    const prose = doc.querySelector('[data-block-key="k-prose"]')
    expect(prose?.querySelector('[data-field]')).toBeNull()
  })

  it('reads text, never markup — there is no path from the preview to a stored tag', () => {
    const title = doc.querySelector<HTMLElement>('[data-field="title"]')
    title?.dispatchEvent(new Event('dblclick', { bubbles: true }))
    // What a paste of rich content would leave behind in the node.
    if (title !== null && title !== undefined) {
      title.innerHTML = '<b>bold</b> and <i>italic</i>'
    }
    title?.dispatchEvent(new Event('blur', { bubbles: false }))
    expect(handlers.onInlineEdit).toHaveBeenCalledWith('k-hero', 'title', 'bold and italic')
  })

  it('commits on Enter instead of storing a line break the field cannot express', () => {
    const title = doc.querySelector<HTMLElement>('[data-field="title"]')
    title?.dispatchEvent(new Event('dblclick', { bubbles: true }))
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    title?.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('abandons the edit on Escape, leaving the block data alone', () => {
    const title = doc.querySelector<HTMLElement>('[data-field="title"]')
    title?.dispatchEvent(new Event('dblclick', { bubbles: true }))
    if (title !== null && title !== undefined) title.textContent = 'Never committed'
    title?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    title?.dispatchEvent(new Event('blur', { bubbles: false }))
    expect(handlers.onInlineEdit).not.toHaveBeenCalled()
  })

  it('says nothing when a node is left without ever having been opened', () => {
    doc.querySelector<HTMLElement>('[data-field="title"]')?.dispatchEvent(new Event('blur'))
    expect(handlers.onInlineEdit).not.toHaveBeenCalled()
  })
})

describe('the editing chrome the builder draws over the page', () => {
  it('marks the selected block, and only that one', () => {
    setSelectedBlock(doc, 'k-cta')
    expect(doc.querySelectorAll('[data-cg-selected]')).toHaveLength(1)
    expect(doc.querySelector('[data-cg-selected]')?.getAttribute('data-block-key')).toBe('k-cta')

    setSelectedBlock(doc, null)
    expect(doc.querySelectorAll('[data-cg-selected]')).toHaveLength(0)
  })

  it('can be turned off entirely, so an editor sees the page as a visitor will', () => {
    setSelectedBlock(doc, 'k-cta')
    setChromeVisible(doc, false)
    expect(doc.getElementById('cogenta-builder-chrome')?.textContent).toBe('')
    expect(doc.querySelectorAll('[data-cg-selected]')).toHaveLength(0)

    setChromeVisible(doc, true)
    expect(doc.getElementById('cogenta-builder-chrome')?.textContent).not.toBe('')
  })

  it('never touches the rendered page’s own markup', () => {
    // Everything the builder adds lives in attributes prefixed `data-cg-` and
    // in one `<style>` it owns. Strip those and the body is the document the
    // server sent, character for character — which is what makes the fidelity
    // guarantee survive a whole editing session.
    setSelectedBlock(doc, 'k-hero')
    const body = doc.body.innerHTML
      .replace(/ draggable="(?:true|false)"/gu, '')
      .replace(/ data-cg-[a-z-]+=""/gu, '')
    expect(body).toBe(parse().body.innerHTML)
  })

  it('removes its stylesheet and its marks when disposed', () => {
    setSelectedBlock(doc, 'k-hero')
    dispose()
    expect(doc.getElementById('cogenta-builder-chrome')).toBeNull()
    expect(doc.querySelectorAll('[data-cg-selected]')).toHaveLength(0)
  })

  it('stops listening once disposed, so a replaced preview cannot fire twice', () => {
    dispose()
    doc.querySelector('.cg-hero__title')?.dispatchEvent(new Event('click', { bubbles: true }))
    expect(handlers.onSelect).not.toHaveBeenCalled()
  })
})
