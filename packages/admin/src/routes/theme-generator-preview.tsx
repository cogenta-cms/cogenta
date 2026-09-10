import { type JSX, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import {
  previewTheme,
  previewThemeGallery,
  type ThemeGenerateCandidate,
} from '../api/theme-client.js'
import { previewSandbox } from '../api/theme-sandbox-client.js'

/**
 * One AI-generated theme candidate's live preview, inside the theme
 * generator workshop.
 *
 * Same real-server-render discipline as `ThemeGalleryPreview` (the theme
 * gallery's own preview, L24 task 5) and the visual page builder (L16)
 * before it: an iframe on a real render, never a screenshot and never a
 * React reimplementation of the twelve blocks.
 *
 * Three real pages a candidate can end up rendered on:
 *
 * - A `sandbox` candidate: `previewSandbox` (`GET
 *   /api/theme/sandbox/:id/preview`) — the same real, isolated-worker render
 *   the "Gérer les thèmes locaux" screen's own "Aperçu" button already uses,
 *   pointed at the sandbox this candidate's own agent run just wrote.
 * - A `tokens` candidate targeting the theme already active (or naming none
 *   at all — the common case, since most candidates adjust the theme already
 *   running): `previewTheme` (`POST /api/theme/preview`) — the site's own
 *   real home page, with the candidate's tokens overlaid.
 * - A `tokens` candidate targeting a *different* installed theme package:
 *   `previewThemeGallery` (`POST /api/theme/gallery-preview`, widened in L26
 *   task 5 to take an optional `tokens` field) — the gallery's fixed demo
 *   page, rendered through that theme with the candidate's own tokens, not
 *   the theme's own on-disk default.
 */
const CANDIDATE_PREVIEW_VIEWPORT_WIDTH = 1280
const DEFAULT_UNSCALED_HEIGHT = 800

export function ThemeCandidatePreview({
  token,
  candidate,
  activeThemeName,
  className,
  interactive = false,
}: {
  readonly token: string
  readonly candidate: ThemeGenerateCandidate
  /** The theme package currently rendering the public site — decides which of the tokens-candidate preview endpoints above this candidate actually needs. */
  readonly activeThemeName: string
  /** The frame's own box — the card grid keeps the default thumbnail height, the enlarged modal passes a taller one. */
  readonly className?: string
  /**
   * `true` in the enlarged/compare modal: the frame becomes scrollable and
   * reachable, and stops being `aria-hidden`. A thumbnail stays inert on
   * purpose — a card-sized, scaled-down copy of a whole page is decoration,
   * and a screen reader walking into it finds a second document's worth of
   * headings it can do nothing with.
   */
  readonly interactive?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const container = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)
  const [unscaledHeight, setUnscaledHeight] = useState(DEFAULT_UNSCALED_HEIGHT)

  const targetsActiveTheme =
    candidate.kind === 'tokens' &&
    (candidate.themeName === undefined || candidate.themeName === activeThemeName)

  /**
   * What this preview is *of*, as a stable string — the thing that has to
   * change for a re-fetch to be worth doing.
   *
   * Keying the fetch on `candidate.id` alone was wrong the moment this screen
   * became a conversation, and a live run showed it: asking for "nettement
   * plus sombre" produced a genuinely darker theme, the panel's own summary
   * updated to say so, and the thumbnail kept showing the previous cream one
   * — because a refined candidate keeps its id (a token candidate's id is its
   * design direction, a sandbox candidate's is its sandbox) while its
   * *content* is exactly what changed. Deriving the key from the content
   * fixes both shapes at once, and keeps the original reason for excluding
   * `candidate.tokens` from the dependency list intact: this is a string, so
   * a fresh-but-equal object from the server does not re-trigger anything.
   */
  const previewIdentity =
    candidate.kind === 'sandbox'
      ? `sandbox:${candidate.sandboxId}:${candidate.filesWritten.join(',')}:${candidate.rationale.length}`
      : `tokens:${candidate.themeName ?? ''}:${JSON.stringify(candidate.tokens)}`

  useEffect(() => {
    let cancelled = false
    setHtml(null)
    setError(null)
    const load =
      candidate.kind === 'sandbox'
        ? previewSandbox(token, candidate.sandboxId).then((result) =>
            result.ok ? result.html : Promise.reject(new Error(result.error)),
          )
        : targetsActiveTheme
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
    // `previewIdentity` above is the content key: a string, so a fresh-but-
    // equal `candidate.tokens` object from the server re-triggers nothing,
    // while a genuinely changed theme re-fetches even though the candidate
    // kept its id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, previewIdentity, candidate.kind, targetsActiveTheme, activeThemeName, t])

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
      className={`relative w-full overflow-hidden rounded-md border border-border bg-white ${className ?? 'h-56'}`}
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
          {...(interactive ? {} : { tabIndex: -1, 'aria-hidden': true as const })}
          className={interactive ? 'border-0' : 'pointer-events-none border-0'}
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
