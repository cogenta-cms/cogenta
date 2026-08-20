import { type JSX, useCallback, useEffect, useRef, useState } from 'react'
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
 * The frame is a real viewport, so the responsive sizes are real too: a page
 * at 375 CSS pixels resolves the theme's own media queries at 375 CSS pixels
 * — including "Ordinateur", now a real 1440, not "whatever room the panel
 * has" (L20 audit point 10). The iframe's own `width` is never touched by
 * scaling: only a `transform: scale()` shrinks how it *paints* when that real
 * width would not fit the panel, exactly the way a device-preview tool zooms
 * out rather than lying about the viewport it is emulating. Scrollable
 * overflow is computed from an element's *painted* (post-transform) box, not
 * its layout box (CSS Transforms, §"Overflow"), which is what lets this avoid
 * the panel's own scrollbar without ever reporting a narrower page to the
 * theme than the mode names.
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
  const container = useRef<HTMLDivElement | null>(null)
  const dispose = useRef<(() => void) | null>(null)
  // 1 until proven otherwise: never scale up past the real size, and start
  // from "fits" so a viewport whose width is already available (or a test
  // environment with no real layout) never shows a needless shrink.
  const [scale, setScale] = useState(1)

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

  // Recomputes the scale whenever the target width or the panel's own real
  // width can have changed. `ResizeObserver` is the primary source (the
  // panel resizes with the window and with the side columns around it,
  // neither of which fires any React state change on its own); the `resize`
  // listener is the fallback for an environment without it. A same-turn call
  // covers the very first render.
  useEffect(() => {
    const el = container.current
    const target = VIEWPORT_WIDTHS[viewport]

    function recompute(): void {
      if (el === null) return
      const style = window.getComputedStyle(el)
      const horizontalPadding =
        Number.parseFloat(style.paddingLeft || '0') + Number.parseFloat(style.paddingRight || '0')
      const available = el.clientWidth - horizontalPadding
      setScale(available > 0 && target > available ? available / target : 1)
    }

    recompute()
    window.addEventListener('resize', recompute)
    const observer =
      el !== null && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(recompute) : null
    observer?.observe(el as HTMLDivElement)
    return () => {
      window.removeEventListener('resize', recompute)
      observer?.disconnect()
    }
  }, [viewport])

  return (
    <div
      ref={container}
      className="flex justify-center overflow-auto rounded-lg border border-border bg-muted p-4"
    >
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
          // `shrink-0`: this is a flex item, and a flex item shrinks by
          // default. That would quietly narrow the iframe's own *layout*
          // width to fit the panel — the exact lie about the viewport this
          // component exists to avoid. The `transform` below is the only
          // thing allowed to change how this paints.
          'h-[70vh] shrink-0 border-0 bg-white transition-transform duration-200',
          'rounded-md shadow-card',
        )}
        style={{
          width: VIEWPORT_WIDTHS[viewport],
          transform: scale === 1 ? undefined : `scale(${scale})`,
          transformOrigin: 'top center',
        }}
      />
      {html === null && <p className="sr-only">{t('builder.previewLoading')}</p>}
    </div>
  )
}
