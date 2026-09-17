import { type JSX, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type EmbedPreview, embedThumbnailSrc, resolveEmbed } from '../api/embeds-client.js'
import { useAuth } from '../auth/auth-context.js'

/**
 * What pasting an address into an embed block does (L38): the service is
 * recognised, the proportions are set when none were chosen, and a preview
 * shows what the block stands for. Nothing is forced — a provider the server
 * does not recognise, or one that does not answer, leaves the fields as the
 * editor set them.
 */

const DEBOUNCE_MS = 500

function isWebAddress(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false
  const url = URL.parse(value.trim())
  return url !== null && (url.protocol === 'https:' || url.protocol === 'http:')
}

export function EmbedAssist({
  data,
  onChange,
  disabled = false,
}: {
  readonly data: Readonly<Record<string, unknown>>
  onChange(data: Readonly<Record<string, unknown>>): void
  readonly disabled?: boolean
}): JSX.Element | null {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const url = data['url']
  const [state, setState] = useState<
    | { readonly kind: 'idle' }
    | { readonly kind: 'loading' }
    | { readonly kind: 'done'; readonly preview: EmbedPreview }
    | { readonly kind: 'error' }
  >({ kind: 'idle' })
  // The latest data, so a resolution that lands late fills what is there now.
  const latest = useRef(data)
  latest.current = data
  // Bumped by "refresh": a preview is kept thirty days, and a title changed at
  // the source would otherwise take until then to appear (L38's open point).
  const [refreshedAt, setRefreshedAt] = useState(0)

  useEffect(() => {
    if (token === null || !isWebAddress(url)) {
      setState({ kind: 'idle' })
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      setState({ kind: 'loading' })
      resolveEmbed(token, url.trim(), refreshedAt === 0 ? {} : { refresh: true })
        .then((preview) => {
          if (cancelled) return
          setState({ kind: 'done', preview })
          if (disabled) return
          const current = latest.current
          const next: Record<string, unknown> = { ...current }
          if (preview.provider !== 'other' && current['provider'] !== preview.provider) {
            next['provider'] = preview.provider
          }
          const ratio = current['ratio']
          if ((ratio === undefined || ratio === null || ratio === '') && preview.ratio !== null) {
            next['ratio'] = preview.ratio
          }
          if (next['provider'] !== current['provider'] || next['ratio'] !== current['ratio']) {
            onChange(next)
          }
        })
        .catch(() => {
          if (!cancelled) setState({ kind: 'error' })
        })
    }, DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // `onChange` is a new function on every render of the form, so it is read
    // through `latest`-style closure rather than listed: the address and the
    // session are what a resolution depends on.
  }, [url, token, disabled, refreshedAt])

  if (state.kind === 'idle') return null
  if (state.kind === 'loading') {
    return (
      <p className="m-0 text-sm text-muted-foreground" role="status">
        {t('embedAssist.loading')}
      </p>
    )
  }
  if (state.kind === 'error' || state.preview.status === 'failed') {
    return <p className="m-0 text-sm text-muted-foreground">{t('embedAssist.failed')}</p>
  }
  const { preview } = state
  if (preview.status === 'unsupported') {
    return (
      <p className="m-0 text-sm text-muted-foreground">
        {preview.provider === 'other'
          ? t('embedAssist.unknownProvider')
          : t('embedAssist.noPreview', { provider: t(`blockOptions.${preview.provider}`) })}
      </p>
    )
  }
  return (
    <figure
      className="m-0 flex flex-col gap-2 rounded-md border border-border p-3"
      aria-label={t('embedAssist.previewLabel')}
    >
      {preview.thumbnailPath !== null && (
        <img
          src={embedThumbnailSrc(preview.thumbnailPath)}
          alt=""
          className="aspect-video w-full rounded-sm object-cover"
        />
      )}
      <figcaption className="flex flex-col gap-0.5 text-sm">
        {preview.title !== null && <span className="font-medium">{preview.title}</span>}
        <span className="text-muted-foreground">
          {preview.authorName === null
            ? t(`blockOptions.${preview.provider}`)
            : t('embedAssist.byline', {
                provider: t(`blockOptions.${preview.provider}`),
                author: preview.authorName,
              })}
        </span>
      </figcaption>
      <button
        type="button"
        className="self-start text-sm underline"
        disabled={disabled}
        onClick={() => setRefreshedAt(Date.now())}
      >
        {t('embedAssist.refresh')}
      </button>
    </figure>
  )
}
