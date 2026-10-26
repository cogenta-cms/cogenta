import { type JSX, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Field, Select } from '../ui/index.js'

/**
 * The site itself, in the Widgets screen, so a widget is judged where it
 * lands rather than in a second tab (L30 D5).
 *
 * `src` on the real page, not a second rendering path: the admin and the site
 * share an origin under `cogenta serve` (the site sends
 * `X-Frame-Options: SAMEORIGIN`), so the frame shows exactly what a visitor
 * gets, from the same server, with the same theme and the same visibility
 * rules — including the ones that hide a widget here and show it there. A
 * widget is saved the moment the editor closes, so there is no unsaved state
 * to preview: `version` changes after every write, and the frame reloads.
 *
 * The frame's own width is a real CSS width, never a percentage, so the
 * theme's media queries resolve at the width the button names; only
 * `transform: scale()` shrinks how it paints when the panel is narrower
 * (same decision as the page builder's preview, `builder/preview-frame.tsx`).
 */

const WIDTHS = { desktop: 1440, tablet: 768, mobile: 390 } as const

type Viewport = keyof typeof WIDTHS

/** A page of the site worth previewing, as the site itself advertises it. */
export interface PreviewTarget {
  readonly path: string
  readonly label: string
}

const LOC = /<loc>([^<]+)<\/loc>/gu

function pathsOf(xml: string, origin: string): readonly string[] {
  const out: string[] = []
  for (const match of xml.matchAll(LOC)) {
    const raw = match[1]?.trim()
    if (raw === undefined || raw === '') continue
    try {
      const url = new URL(raw)
      if (url.origin !== origin) continue
      out.push(`${url.pathname}${url.search}`)
    } catch {
      // A sitemap that is not a list of absolute URLs is not one this reads.
    }
  }
  return out
}

const TITLE_SEPARATORS = [' — ', ' | ', ' – ', ' - ']

/** The text of a page's `<title>`, or `null` when the page has none. */
export function titleOf(html: string): string | null {
  try {
    const title = new DOMParser().parseFromString(html, 'text/html').title.trim()
    return title === '' ? null : title
  } catch {
    return null
  }
}

/**
 * Titles end with the site's name (« Contact — Atelier Norvane »), which
 * says nothing in a list of that site's pages. A suffix shared by at least
 * two titles is the site's name; it is dropped from all of them.
 */
export function stripSharedSuffix(titles: readonly (string | null)[]): (string | null)[] {
  const counts = new Map<string, number>()
  const suffixOf = (title: string): string | null => {
    for (const separator of TITLE_SEPARATORS) {
      const at = title.lastIndexOf(separator)
      if (at > 0) return title.slice(at)
    }
    return null
  }
  for (const title of titles) {
    const suffix = title === null ? null : suffixOf(title)
    if (suffix !== null) counts.set(suffix, (counts.get(suffix) ?? 0) + 1)
  }
  return titles.map((title) => {
    if (title === null) return null
    const suffix = suffixOf(title)
    if (suffix === null || (counts.get(suffix) ?? 0) < 2) return title
    return title.slice(0, title.length - suffix.length)
  })
}

/**
 * The site's own sitemap is the honest list of its public pages: it is built
 * from the live content by the same server, so it never names a page that
 * 404s. A site that serves a sitemap index answers with fragments; the first
 * fragment is enough to fill a menu of examples. Each entry is named by the
 * page's own title rather than its address, and the home page appears once
 * (« / » and the `/home` page it is served from are the same page).
 */
export async function loadPreviewTargets(homeLabel: string): Promise<readonly PreviewTarget[]> {
  const origin = window.location.origin
  const home: PreviewTarget = { path: '/', label: homeLabel }
  try {
    const response = await fetch('/sitemap.xml')
    if (!response.ok) return [home]
    let paths = pathsOf(await response.text(), origin)
    const fragment = paths.find((path) => path.endsWith('.xml'))
    if (fragment !== undefined) {
      const inner = await fetch(fragment)
      paths = inner.ok ? pathsOf(await inner.text(), origin) : []
    }
    const seen = new Set<string>(['/', '/home'])
    const others: string[] = []
    for (const path of paths) {
      if (path.endsWith('.xml') || seen.has(path)) continue
      seen.add(path)
      others.push(path)
      if (others.length >= 30) break
    }
    const titles = await Promise.all(
      others.map(async (path) => {
        try {
          const page = await fetch(path)
          return page.ok ? titleOf(await page.text()) : null
        } catch {
          return null
        }
      }),
    )
    const cleaned = stripSharedSuffix(titles)
    return [home, ...others.map((path, at) => ({ path, label: cleaned[at] ?? path }))]
  } catch {
    return [home]
  }
}

/** The preview URL: the page itself, plus a parameter that defeats any cache on reload. */
export function previewUrl(path: string, version: number): string {
  const url = new URL(path, window.location.origin)
  url.searchParams.set('cg-preview', String(version))
  return `${url.pathname}${url.search}${url.hash}`
}

export interface WidgetPreviewProps {
  /** Bumped after every write, so the frame shows the site as it now is. */
  readonly version: number
  readonly targets: readonly PreviewTarget[]
  readonly path: string
  onPathChange(path: string): void
}

export function WidgetPreview({
  version,
  targets,
  path,
  onPathChange,
}: WidgetPreviewProps): JSX.Element {
  const { t } = useTranslation()
  const container = useRef<HTMLDivElement | null>(null)
  const [viewport, setViewport] = useState<Viewport>('desktop')
  const [scale, setScale] = useState(1)

  const fit = useCallback(() => {
    const width = container.current?.clientWidth ?? 0
    if (width === 0) return
    setScale(Math.min(1, width / WIDTHS[viewport]))
  }, [viewport])

  useEffect(() => {
    fit()
    if (typeof ResizeObserver === 'undefined') return
    const element = container.current
    if (element === null) return
    const observer = new ResizeObserver(fit)
    observer.observe(element)
    return () => observer.disconnect()
  }, [fit])

  return (
    <section
      aria-labelledby="widgets-preview"
      className="min-w-0 flex flex-col gap-3 order-3 self-start rounded-xl border border-border bg-card p-4 lg:order-none lg:col-span-2 xl:sticky xl:top-4 xl:col-span-1"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="widgets-preview" className="m-0 text-base font-semibold">
          {t('widgets.preview.heading')}
        </h2>
        <div className="flex min-w-0 max-w-full flex-wrap items-end gap-2">
          <Field label={t('widgets.preview.page')} className="min-w-0 max-w-full">
            {(control) => (
              <Select
                {...control}
                className="w-auto min-w-0 max-w-full sm:max-w-[18rem]"
                value={path}
                onChange={(event) => onPathChange(event.target.value)}
              >
                {targets.map((target) => (
                  <option key={target.path} value={target.path}>
                    {target.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <fieldset
            className="m-0 flex gap-1 border-0 p-0"
            aria-label={t('widgets.preview.viewport')}
          >
            {(Object.keys(WIDTHS) as Viewport[]).map((name) => (
              <Button
                key={name}
                type="button"
                size="sm"
                variant={viewport === name ? 'secondary' : 'ghost'}
                aria-pressed={viewport === name}
                onClick={() => setViewport(name)}
              >
                {t(`widgets.preview.${name}`)}
              </Button>
            ))}
          </fieldset>
          <a
            className="text-sm underline"
            href={path}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
          >
            {t('widgets.preview.open')}
          </a>
        </div>
      </div>
      <div
        ref={container}
        className="min-w-0 max-w-full overflow-hidden rounded-md border border-border bg-background"
        style={{ height: `${Math.round(720 * scale)}px` }}
      >
        <iframe
          key={`${path}-${version}`}
          title={t('widgets.preview.frameTitle')}
          src={previewUrl(path, version)}
          className="border-0 bg-background"
          style={{
            inlineSize: `${WIDTHS[viewport]}px`,
            blockSize: '720px',
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        />
      </div>
      <p className="m-0 text-xs text-muted-foreground">{t('widgets.preview.help')}</p>
    </section>
  )
}
