import { type JSX, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import { previewTheme, previewThemeGallery, type SkinCandidate } from '../api/theme-client.js'

/**
 * One AI-generated theme candidate's live preview, inside the theme
 * generator workshop.
 *
 * Same real-server-render discipline as `ThemeGalleryPreview` (the theme
 * gallery's own preview, L24 task 5) and the visual page builder (L16)
 * before it: an iframe on a real render, never a screenshot and never a
 * React reimplementation of the twelve blocks.
 *
 * Two real pages a candidate can end up rendered on, chosen by which theme
 * it targets:
 *
 * - Targets the theme already active (or names none at all — the common
 *   case, since most candidates adjust the theme already running):
 *   `previewTheme` (`POST /api/theme/preview`) — the site's own real home
 *   page, with the candidate's tokens overlaid.
 * - Targets a *different* installed theme package: `previewThemeGallery`
 *   (`POST /api/theme/gallery-preview`, widened in L26 task 5 to take an
 *   optional `tokens` field) — the gallery's fixed demo page, rendered
 *   through that theme with the candidate's own tokens, not the theme's own
 *   on-disk default.
 */
const CANDIDATE_PREVIEW_VIEWPORT_WIDTH = 1280
const DEFAULT_UNSCALED_HEIGHT = 800

export function ThemeCandidatePreview({
  token,
  candidate,
  activeThemeName,
}: {
  readonly token: string
  readonly candidate: SkinCandidate
  /** The theme package currently rendering the public site — decides which of the two preview endpoints above this candidate actually needs. */
  readonly activeThemeName: string
}): JSX.Element {
  const { t } = useTranslation()
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const container = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)
  const [unscaledHeight, setUnscaledHeight] = useState(DEFAULT_UNSCALED_HEIGHT)

  const targetsActiveTheme =
    candidate.themeName === undefined || candidate.themeName === activeThemeName

  useEffect(() => {
    let cancelled = false
    setHtml(null)
    setError(null)
    const load = targetsActiveTheme
      ? previewTheme(token, { tokens: candidate.tokens }).then((result) => result.html)
      : previewThemeGallery(token, candidate.themeName as string, candidate.tokens).then(
          (result) => result.html,
        )
    load
      .then((resolvedHtml) => {
        if (!cancelled) setHtml(resolvedHtml)
      })
      .catch((caught: unknown) => {
        if (cancelled) return
        setError(caught instanceof ApiError ? caught.message : t('themeGenerator.previewLoadError'))
      })
    return () => {
      cancelled = true
    }
    // `candidate.tokens` is a fresh object per render from the server
    // response, so it is deliberately not in this dependency list — only
    // identity-stable inputs decide when to re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, candidate.id, candidate.themeName, targetsActiveTheme, activeThemeName, t])

  useEffect(() => {
    const el = container.current

    function recompute(): void {
      if (el === null) return
      const { clientWidth, clientHeight } = el
      if (clientWidth <= 0 || clientHeight <= 0) return
      setScale(clientWidth / CANDIDATE_PREVIEW_VIEWPORT_WIDTH)
      setUnscaledHeight((clientHeight * CANDIDATE_PREVIEW_VIEWPORT_WIDTH) / clientWidth)
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
      className="relative h-56 w-full overflow-hidden rounded-md border border-border bg-white"
    >
      {error !== null && (
        <p className="flex h-full items-center justify-center px-2 text-center text-xs text-muted-foreground">
          {error}
        </p>
      )}
      {error === null && html === null && (
        <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
          {t('themeGenerator.previewLoading')}
        </p>
      )}
      {error === null && html !== null && (
        <iframe
          title={t('themeGenerator.previewTitle', { label: candidate.label })}
          srcDoc={html}
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none border-0"
          style={{
            width: CANDIDATE_PREVIEW_VIEWPORT_WIDTH,
            height: unscaledHeight,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        />
      )}
    </div>
  )
}
