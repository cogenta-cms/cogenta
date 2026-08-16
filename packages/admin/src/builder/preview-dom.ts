/**
 * Everything the builder does *inside* the preview document (L16 tasks 2 and 3).
 *
 * It takes a `Document` rather than an iframe, and returns the function that
 * undoes everything it did. Two consequences, both deliberate:
 *
 * - it is testable against a document parsed from the very HTML the server
 *   returns, with no iframe, no layout and no timing to wait for;
 * - it can only touch the live DOM. Nothing here rewrites the HTML that was
 *   rendered, so what the fidelity test compares is unaffected by anything in
 *   this file.
 *
 * The editing chrome it adds — an outline on hover, an outline on the selected
 * block, a caret in a text node — is exactly that: chrome, added after the
 * page rendered, removed by the returned disposer, and never stored. It uses
 * `outline` rather than `border`, so it cannot move a single pixel of the page
 * it is drawn over. `setChromeVisible` turns it off entirely, which is how an
 * editor checks the real thing.
 */

/** The drag payload for a block already on the page. */
export const BLOCK_KEY_MIME = 'application/x-cogenta-block-key'
/** The drag payload for a block being added from the library. */
export const BLOCK_TYPE_MIME = 'application/x-cogenta-block-type'

/** Where the chrome stylesheet is put, so the disposer can find it again. */
const CHROME_STYLE_ID = 'cogenta-builder-chrome'

const CHROME_CSS = `
[data-block-key]{outline:2px dashed transparent;outline-offset:-2px;cursor:grab}
[data-block-key]:hover{outline-color:color-mix(in oklab,currentColor 35%,transparent)}
[data-block-key][data-cg-selected]{outline:2px solid currentColor;outline-offset:-2px}
[data-block-key][data-cg-drop-target]{outline:2px solid currentColor;outline-offset:4px}
[data-field]{outline:1px dotted transparent;outline-offset:2px}
[data-field]:hover{outline-color:color-mix(in oklab,currentColor 45%,transparent)}
[data-field][contenteditable]{outline:2px solid currentColor;outline-offset:2px;cursor:text}
`

export interface PreviewHandlers {
  /** A block was clicked. The detail panel follows this. */
  onSelect(key: string): void
  /** A block already on the page was dropped at `toIndex`. */
  onMove(key: string, toIndex: number): void
  /** A block from the library was dropped at `atIndex`. */
  onInsert(type: string, atIndex: number): void
  /** A text node was edited in place and left. */
  onInlineEdit(key: string, field: string, text: string): void
}

interface DragLike {
  readonly dataTransfer?: {
    getData(format: string): string
    setData(format: string, data: string): void
    dropEffect?: string
    effectAllowed?: string
  } | null
  preventDefault(): void
}

function blockElements(doc: Document): readonly HTMLElement[] {
  return [...doc.querySelectorAll<HTMLElement>('[data-block-key]')]
}

function keyOf(element: HTMLElement): string {
  return element.dataset['blockKey'] ?? ''
}

/** The block an arbitrary node sits inside, or `null` for the page frame. */
function blockOf(node: EventTarget | null): HTMLElement | null {
  if (node === null || !(node instanceof Element)) return null
  return node.closest<HTMLElement>('[data-block-key]')
}

/**
 * Whether *this* node is the one being edited.
 *
 * The attribute, not `isContentEditable`: that property is also true for every
 * descendant of an editable host, so a `<span>` inside an open field would
 * answer yes and commit the wrong node. It also happens to be what makes this
 * testable — jsdom implements the attribute and not the property.
 */
function isEditingOpen(element: HTMLElement): boolean {
  return element.hasAttribute('contenteditable')
}

/**
 * Opens a text node for editing, in plain-text mode where the engine has it.
 *
 * `plaintext-only` is what stops a paste from bringing markup into the node in
 * the first place. Reading `textContent` on the way out makes it impossible to
 * store any regardless (R3) — this is the belt to that brace. An engine that
 * does not know the value applies the attribute's invalid-value default
 * instead, which is not editable at all, so the fallback is not cosmetic:
 * without it the field would simply refuse to open.
 */
function openEditing(element: HTMLElement): void {
  element.setAttribute('contenteditable', 'plaintext-only')
  if (element.isContentEditable !== true) element.setAttribute('contenteditable', 'true')
}

/**
 * Marks one block as the selected one.
 *
 * Separate from `wirePreview` because selection changes far more often than
 * the document does: re-wiring every listener to move an outline would throw
 * away the caret of an inline edit in progress.
 */
export function setSelectedBlock(doc: Document, key: string | null): void {
  for (const element of blockElements(doc)) {
    if (key !== null && keyOf(element) === key) element.setAttribute('data-cg-selected', '')
    else element.removeAttribute('data-cg-selected')
  }
}

export function setChromeVisible(doc: Document, visible: boolean): void {
  const style = doc.getElementById(CHROME_STYLE_ID)
  if (style !== null) style.textContent = visible ? CHROME_CSS : ''
  if (!visible) {
    for (const element of blockElements(doc)) {
      element.removeAttribute('data-cg-selected')
      element.removeAttribute('data-cg-drop-target')
    }
  }
}

/**
 * Attaches the builder's behaviour to an already-rendered preview document.
 *
 * Returns a disposer. It is called before every re-wire and on unmount, so a
 * preview that re-renders twenty times during a session does not accumulate
 * twenty sets of listeners on the twenty documents it replaced.
 */
export function wirePreview(doc: Document, handlers: PreviewHandlers): () => void {
  const cleanups: (() => void)[] = []

  function on<K extends string>(
    target: EventTarget,
    type: K,
    listener: (event: Event) => void,
  ): void {
    target.addEventListener(type, listener)
    cleanups.push(() => target.removeEventListener(type, listener))
  }

  const style = doc.createElement('style')
  style.id = CHROME_STYLE_ID
  style.textContent = CHROME_CSS
  doc.head.append(style)
  cleanups.push(() => style.remove())

  // A preview is not a place to browse: following a link would replace the
  // document the builder is wired to with one it knows nothing about, and
  // submitting a form would post the site's own form from inside the admin.
  on(doc, 'click', (event) => {
    const element = event.target
    if (element instanceof Element && element.closest('a') !== null) event.preventDefault()
    const block = blockOf(event.target)
    if (block !== null) handlers.onSelect(keyOf(block))
  })
  on(doc, 'submit', (event) => {
    event.preventDefault()
  })

  const blocks = blockElements(doc)

  for (const [index, element] of blocks.entries()) {
    element.draggable = true

    on(element, 'dragstart', (event) => {
      const drag = event as unknown as DragLike
      drag.dataTransfer?.setData(BLOCK_KEY_MIME, keyOf(element))
      if (drag.dataTransfer !== null && drag.dataTransfer !== undefined) {
        drag.dataTransfer.effectAllowed = 'move'
      }
    })

    on(element, 'dragover', (event) => {
      const drag = event as unknown as DragLike
      // Without `preventDefault` on dragover the browser refuses the drop
      // outright — the single most common reason a hand-rolled drag does
      // nothing at all.
      drag.preventDefault()
      element.setAttribute('data-cg-drop-target', '')
    })

    on(element, 'dragleave', () => element.removeAttribute('data-cg-drop-target'))

    on(element, 'drop', (event) => {
      const drag = event as unknown as DragLike
      drag.preventDefault()
      element.removeAttribute('data-cg-drop-target')
      const movedKey = drag.dataTransfer?.getData(BLOCK_KEY_MIME) ?? ''
      if (movedKey !== '') {
        handlers.onMove(movedKey, index)
        return
      }
      const newType = drag.dataTransfer?.getData(BLOCK_TYPE_MIME) ?? ''
      if (newType !== '') handlers.onInsert(newType, index)
    })

    on(element, 'dragend', () => element.removeAttribute('data-cg-drop-target'))

    for (const editable of element.querySelectorAll<HTMLElement>('[data-field]')) {
      const field = editable.dataset['field'] ?? ''
      if (field === '') continue

      on(editable, 'dblclick', () => {
        openEditing(editable)
        editable.focus()
      })

      on(editable, 'blur', () => {
        if (!isEditingOpen(editable)) return
        editable.removeAttribute('contenteditable')
        handlers.onInlineEdit(keyOf(element), field, editable.textContent ?? '')
      })

      on(editable, 'keydown', (event) => {
        if (!isEditingOpen(editable)) return
        const key = (event as KeyboardEvent).key
        // Enter commits rather than inserting a line break: these are
        // single-line contract-B text fields, and a stored newline would be a
        // rendering decision the field has no way to express.
        if (key === 'Enter') {
          event.preventDefault()
          editable.blur()
        }
        if (key === 'Escape') {
          event.preventDefault()
          // Dropped without committing: the next render restores the node from
          // the block data, which never changed.
          editable.removeAttribute('contenteditable')
          editable.blur()
        }
      })
    }
  }

  // The page frame outside every block is the "put it at the end" target —
  // otherwise a page's last position is only reachable by dropping onto the
  // block that currently holds it, which reads as replacing it.
  const main = doc.querySelector<HTMLElement>('main') ?? doc.body
  on(main, 'dragover', (event) => {
    if (blockOf(event.target) !== null) return
    ;(event as unknown as DragLike).preventDefault()
  })
  on(main, 'drop', (event) => {
    if (blockOf(event.target) !== null) return
    const drag = event as unknown as DragLike
    drag.preventDefault()
    const movedKey = drag.dataTransfer?.getData(BLOCK_KEY_MIME) ?? ''
    if (movedKey !== '') {
      handlers.onMove(movedKey, blocks.length - 1)
      return
    }
    const newType = drag.dataTransfer?.getData(BLOCK_TYPE_MIME) ?? ''
    if (newType !== '') handlers.onInsert(newType, blocks.length)
  })

  return () => {
    for (const cleanup of cleanups.splice(0)) cleanup()
    for (const element of blocks) {
      element.draggable = false
      element.removeAttribute('data-cg-selected')
      element.removeAttribute('data-cg-drop-target')
    }
  }
}
