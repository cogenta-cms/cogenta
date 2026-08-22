import { type JSX, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import { previewThemeGallery } from '../api/theme-client.js'

/**
 * One theme's visual preview in the appearance screen's theme gallery (fiche
 * L24 task 5) — the same "iframe on the real server render" decision the
 * visual page builder (fiche L16) already made, applied to a fixed demo page
 * rather than a real, unsaved entry: `POST /api/theme/gallery-preview` never
 * touches this site's content, so every card shows the identical demo page,
 * laid out by a different theme package.
 *
 * A real CSS-pixel viewport, scaled down with `transform: scale()` to fit the
 * card — never a screenshot and never a naively width-squashed iframe, which
 * would resolve the theme's media queries at the wrong width and show a
 * layout no visitor would ever actually see. `PreviewFrame`
 * (`packages/admin/src/builder/preview-frame.tsx`) established this pattern
 * for the page builder; this is the same technique at thumbnail scale,
 * cropped to the card's own height via `overflow: hidden` rather than
 * shrunk to fit it, so nothing here lies about the viewport it renders.
 */

/** A realistic desktop width — wide enough that a theme's grid/hero layout resolves the way a visitor's browser would, never a narrow, mobile-only view. */
const GALLERY_PREVIEW_VIEWPORT_WIDTH = 1280
/** Before the container has been measured once — avoids a first-paint layout jump. */
const DEFAULT_UNSCALED_HEIGHT = 800

export function ThemeGalleryPreview({
  token,
  themeName,
  label,
}: {
  readonly token: string
  /** The theme *package* name — what `POST /api/theme/gallery-preview` is called with. */
  readonly themeName: string
  /** The human-readable name shown to a screen reader — e.g. "Portfolio" rather than "@cogenta/theme-portfolio". */
  readonly label: string
}): JSX.Element {
  const { t } = useTranslation()
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const container = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)
  const [unscaledHeight, setUnscaledHeight] = useState(DEFAULT_UNSCALED_HEIGHT)

  useEffect(() => {
    let cancelled = false
    setHtml(null)
    setError(null)
    previewThemeGallery(token, themeName)
      .then((result) => {
        if (!cancelled) setHtml(result.html)
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        setError(caught instanceof ApiError ? caught.message : t('appearance.themePreviewError'))
      })
    return () => {
      cancelled = true
    }
  }, [token, themeName, t])

  // The card's own real box (its width comes from the responsive grid it
  // sits in, its height from the fixed Tailwind class below) decides both the
  // scale and the iframe's *unscaled* height, so the scaled result always
  // fills the card exactly — no letterboxing, no stretching.
  useEffect(() => {
    const el = container.current

    function recompute(): void {
      if (el === null) return
      const { clientWidth, clientHeight } = el
      if (clientWidth <= 0 || clientHeight <= 0) return
      setScale(clientWidth / GALLERY_PREVIEW_VIEWPORT_WIDTH)
      setUnscaledHeight((clientHeight * GALLERY_PREVIEW_VIEWPORT_WIDTH) / clientWidth)
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
  }, [])

  return (
    <div
      ref={container}
      className="relative h-40 w-full overflow-hidden rounded-md border border-border bg-white"
    >
      {error !== null && (
        <p className="flex h-full items-center justify-center px-2 text-center text-xs text-muted-foreground">
          {error}
        </p>
      )}
      {error === null && html === null && (
        <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
          {t('appearance.themePreviewLoading')}
        </p>
      )}
      {error === null && html !== null && (
        <iframe
          title={t('appearance.themePreviewTitle', { theme: label })}
          srcDoc={html}
          // Decorative in this context — the picker's own button, not this
          // frame, is what an admin uses to act on a theme. A screen reader
          // user gets the theme's name and description from the card's own
          // text, not from tabbing into a thumbnail of it.
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none border-0"
          style={{
            width: GALLERY_PREVIEW_VIEWPORT_WIDTH,
            height: unscaledHeight,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        />
      )}
    </div>
  )
}
