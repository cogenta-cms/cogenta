import type { EmbedPreview, RenderContext } from './contract.js'
import { type HtmlElement, h } from './html.js'
import { renderImageSource } from './media.js'

/**
 * The shared parts of an embed block that a preview enriches (contract D
 * `theme@1.9`, L38). A theme keeps its own frame and card layout, and calls
 * these for the two things every theme should say the same way.
 */

function previewOf(ctx: RenderContext, url: string): EmbedPreview | undefined {
  return ctx.embedPreview?.(url)
}

/**
 * The accessible name of the player: « YouTube : Inspection d'un poste » when
 * the title is known, the generic « Contenu YouTube intégré » otherwise.
 */
export function embedFrameTitle(ctx: RenderContext, provider: string, url: string): string {
  const title = previewOf(ctx, url)?.title
  return title === undefined
    ? ctx.t('embed.title', { provider })
    : ctx.t('embed.titled', { provider, title })
}

/**
 * The thumbnail, title and author of what the card stands for, or `null` when
 * the host has no preview. Safe before consent: the thumbnail is served by the
 * site, never fetched from the provider.
 */
export function renderEmbedPreview(
  ctx: RenderContext,
  url: string,
  className = 'cg-embed',
): HtmlElement | null {
  const preview = previewOf(ctx, url)
  if (preview === undefined || (preview.title === undefined && preview.thumbnail === undefined)) {
    return null
  }
  return h(
    'div',
    { class: `${className}__preview` },
    preview.thumbnail === undefined
      ? null
      : renderImageSource(preview.thumbnail, {
          className: `${className}__thumbnail`,
          sizes: '(min-width: 48rem) 40rem, 100vw',
        }),
    preview.title === undefined ? null : h('p', { class: `${className}__title` }, preview.title),
    preview.authorName === undefined
      ? null
      : h(
          'p',
          { class: `${className}__author` },
          ctx.t('embed.by', { author: preview.authorName }),
        ),
  )
}
