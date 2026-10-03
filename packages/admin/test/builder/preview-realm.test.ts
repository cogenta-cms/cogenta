import { afterEach, describe, expect, it, vi } from 'vitest'
import { wirePreview } from '../../src/builder/preview-dom.js'

/**
 * The preview is an `<iframe>`, and that is the whole point of this file.
 *
 * Every other test in this directory builds its document with `DOMParser`,
 * which produces one in the *same* realm as the test. `node instanceof
 * Element` is true there, so the guards read as correct — while in the real
 * builder the event target comes from the iframe's realm, where `Element` is a
 * different constructor and the check was false for every node it was ever
 * handed. Clicking a block never selected it; the drop guard never matched.
 *
 * A single-realm fixture cannot see that, no matter how faithful its markup
 * is. So this one pays for a real iframe.
 */
const PAGE = `<!doctype html><html><body>
<main>
<section data-block="hero" data-block-key="k-hero"><h1 data-field="title">A title</h1></section>
<div data-block="prose" data-block-key="k-prose"><p>Body <a href="/elsewhere">link</a></p></div>
</main>
</body></html>`

const frames: HTMLIFrameElement[] = []

/** The iframe's own `MouseEvent`, so an event is born in the realm it is dispatched in. */
function mouseEventIn(doc: Document): typeof MouseEvent {
  const view = doc.defaultView
  if (view === null) throw new Error('the preview document has no window')
  return (view as unknown as { MouseEvent: typeof MouseEvent }).MouseEvent
}

function previewInItsOwnRealm(): Document {
  const frame = document.createElement('iframe')
  document.body.append(frame)
  frames.push(frame)
  const doc = frame.contentDocument
  if (doc === null) throw new Error('the iframe has no document')
  doc.open()
  doc.write(PAGE)
  doc.close()
  return doc
}

afterEach(() => {
  for (const frame of frames.splice(0)) frame.remove()
})

describe('driving a preview that lives in another realm', () => {
  it('is really another realm — the measurement this whole file rests on', () => {
    const doc = previewInItsOwnRealm()
    const block = doc.querySelector('[data-block-key="k-hero"]')
    expect(block).not.toBeNull()

    // The admin window's `Element`, which is what `instanceof Element` means
    // inside `preview-dom.ts`.
    expect(block instanceof Element).toBe(false)
    // And the node is an element all the same, by the test every realm agrees
    // on.
    expect(block?.nodeType).toBe(1)
  })

  it('selects the block a click landed in', () => {
    const doc = previewInItsOwnRealm()
    const onSelect = vi.fn()
    const cleanup = wirePreview(doc, {
      onSelect,
      onMove: vi.fn(),
      onInsert: vi.fn(),
      onInlineEdit: vi.fn(),
    })

    doc
      .querySelector<HTMLElement>('[data-field="title"]')
      ?.dispatchEvent(new (mouseEventIn(doc))('click', { bubbles: true }))

    expect(onSelect).toHaveBeenCalledWith('k-hero')
    cleanup()
  })

  it('keeps a link in the preview from navigating away from the builder', () => {
    const doc = previewInItsOwnRealm()
    const cleanup = wirePreview(doc, {
      onSelect: vi.fn(),
      onMove: vi.fn(),
      onInsert: vi.fn(),
      onInlineEdit: vi.fn(),
    })

    const event = new (mouseEventIn(doc))('click', { bubbles: true, cancelable: true })
    doc.querySelector('a')?.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    cleanup()
  })
})
