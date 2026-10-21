import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../ui/index.js'

/**
 * The live preview of the site "Apparence" editor: an iframe on the server's
 * real render of the home page with the unsaved tokens laid over it (the same
 * decision the page builder made for content — never a second implementation
 * of the theme in React).
 *
 * The frame is sandboxed without `allow-scripts`. The HTML it shows is rendered
 * by theme code that may have been written by an agent or unpacked from an
 * archive; an unsandboxed `srcdoc` frame runs on the admin's own origin, next to
 * the session token in `localStorage`. `allow-same-origin` stays so the site's
 * stylesheet and its self-hosted fonts load exactly as they do for a visitor —
 * without scripts there is nothing that could use that origin.
 */

/**
 * The preview without its `<script>` elements. They could not run in the
 * sandbox anyway, and each one made the browser log "Blocked script execution"
 * on every refresh; removing them is the honest version of the same thing.
 */
export function withoutScripts(html: string): string {
  if (typeof DOMParser === 'undefined') return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  for (const script of Array.from(doc.querySelectorAll('script'))) script.remove()
  return `<!doctype html>${doc.documentElement.outerHTML}`
}

export function AppearancePreviewFrame({
  html,
  error,
  className,
}: {
  readonly html: string | null
  readonly error: string | null
  readonly className?: string
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {error !== null && (
        <p
          role="alert"
          className="m-0 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted">
        <iframe
          title={t('appearance.previewHeading')}
          srcDoc={html === null ? '' : withoutScripts(html)}
          sandbox="allow-same-origin"
          className={cn('block size-full border-0 bg-white', className)}
        />
        {html === null && error === null && (
          <p className="absolute inset-0 m-0 flex items-center justify-center text-sm text-muted-foreground">
            {t('appearance.previewLoading')}
          </p>
        )}
      </div>
    </div>
  )
}
