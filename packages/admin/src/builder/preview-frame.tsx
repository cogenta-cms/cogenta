import { type JSX, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../ui/cn.js'
import type { PreviewHandlers } from './preview-dom.js'
import { setChromeVisible, setSelectedBlock, wirePreview } from './preview-dom.js'
import type { Viewport } from './viewports.js'
import { VIEWPORT_WIDTHS } from './viewports.js'

/**
 * The real page, in an iframe, with the builder wired into it (L16 tasks 1
 * and 6).
 *
 * `srcDoc` rather than a `src` pointing at a preview URL. Two things follow,
 * and both are needed:
 *
 * - the document is same-origin with the admin, so the builder can read and
 *   listen to it directly instead of shipping a script into the page and
 *   talking to it over `postMessage` — a script inside the previewed page is a
 *   second thing that can be wrong about the page;
 * - the HTML is exactly the string the server returned, put in a frame with no
 *   round trip in between, so what an editor is looking at is what
 *   `POST /api/builder/render` produced and nothing else.
 *
 * The frame is a real viewport, so the responsive sizes below are real too: a
 * page at 375 CSS pixels resolves the theme's own media queries at 375 CSS
 * pixels. Nothing here scales, crops or simulates.
 */
export function PreviewFrame({
  html,
  viewport,
  selectedKey,
  chromeVisible,
  handlers,
  title,
}: {
  readonly html: string | null
  readonly viewport: Viewport
  readonly selectedKey: string | null
  readonly chromeVisible: boolean
  readonly handlers: PreviewHandlers
  readonly title: string
}): JSX.Element {
  const { t } = useTranslation()
  const frame = useRef<HTMLIFrameElement | null>(null)
  const dispose = useRef<(() => void) | null>(null)

  // The handlers are read through a ref so that a parent re-render — which
  // happens on every keystroke of an inline edit — does not tear down and
  // rebuild every listener in the preview, losing the caret with them.
  const latest = useRef(handlers)
  latest.current = handlers

  const wire = useCallback((): void => {
    dispose.current?.()
    dispose.current = null
    const doc = frame.current?.contentDocument ?? null
    if (doc === null) return
    dispose.current = wirePreview(doc, {
      onSelect: (key) => latest.current.onSelect(key),
      onMove: (key, index) => latest.current.onMove(key, index),
      onInsert: (type, index) => latest.current.onInsert(type, index),
      onInlineEdit: (key, field, text) => latest.current.onInlineEdit(key, field, text),
    })
  }, [])

  // Only on unmount: every other teardown happens in `wire`, immediately
  // before the next one is set up.
  useEffect(() => () => dispose.current?.(), [])

  // Selection and chrome are attributes on an already-wired document, never a
  // reason to re-wire — see `setSelectedBlock`'s own note.
  useEffect(() => {
    const doc = frame.current?.contentDocument ?? null
    if (doc !== null) setSelectedBlock(doc, chromeVisible ? selectedKey : null)
  }, [selectedKey, chromeVisible])

  useEffect(() => {
    const doc = frame.current?.contentDocument ?? null
    if (doc !== null) setChromeVisible(doc, chromeVisible)
  }, [chromeVisible])

  return (
    <div className="flex justify-center overflow-auto rounded-lg border border-border bg-muted p-4">
      <iframe
        ref={frame}
        // The document is the site's own HTML, produced by the site's own
        // renderer for a signed-in editor of this very site. It is not third
        // party content, and sandboxing it would break the theme's own
        // stylesheet link for no gain in a page the editor is authoring.
        title={title}
        srcDoc={html ?? ''}
        onLoad={wire}
        className={cn(
          'h-[70vh] w-full border-0 bg-white transition-[max-width] duration-200',
          'rounded-md shadow-card',
        )}
        style={{ maxWidth: VIEWPORT_WIDTHS[viewport] }}
      />
      {html === null && <p className="sr-only">{t('builder.previewLoading')}</p>}
    </div>
  )
}
