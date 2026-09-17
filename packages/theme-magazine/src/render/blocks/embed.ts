import type { EmbedBlock } from '@cogenta/blocks'
import {
  aspectRatio,
  embedFrameTitle,
  type HtmlElement,
  h,
  type RenderContext,
  renderEmbedPreview,
} from '@cogenta/theme-kit'
import { section } from '../layout.js'

/**
 * Nothing here contacts a third party before the visitor consents: when
 * `consentRequired` is set, or the provider has no cookie-free frame source,
 * a notice and an outbound link render instead of an `<iframe>`. No
 * preconnect, no thumbnail fetched from the provider.
 *
 * The frame and the notice both take the reading column at the block's
 * ratio. The notice holds the place the player will take: a hairline frame,
 * the provider named in small capitals, one sentence, one arrow link.
 */
function frameSource(provider: EmbedBlock['provider'], rawUrl: string): string | null {
  const url = URL.parse(rawUrl)
  if (url === null) return null
  const segments = url.pathname.split('/').filter((segment) => segment !== '')

  switch (provider) {
    case 'youtube': {
      const id = url.hostname.endsWith('youtu.be')
        ? segments[0]
        : (url.searchParams.get('v') ?? segments[1])
      return id === undefined || id === null ? null : `https://www.youtube-nocookie.com/embed/${id}`
    }
    case 'vimeo': {
      const id = segments.find((segment) => /^\d+$/.test(segment))
      return id === undefined ? null : `https://player.vimeo.com/video/${id}`
    }
    case 'dailymotion': {
      const id = url.hostname.endsWith('dai.ly') ? segments[0] : segments[segments.length - 1]
      return id === undefined ? null : `https://geo.dailymotion.com/player.html?video=${id}`
    }
    case 'spotify': {
      const [kind, id] = segments
      return kind === undefined || id === undefined
        ? null
        : `https://open.spotify.com/embed/${kind}/${id}`
    }
    case 'soundcloud':
      return `https://w.soundcloud.com/player/?url=${encodeURIComponent(rawUrl)}`
    default:
      return null
  }
}

function notice(block: EmbedBlock, ctx: RenderContext, reason: string): HtmlElement {
  return h(
    'div',
    { class: 'cg-embed__notice' },
    renderEmbedPreview(ctx, block.url, 'cg-embed'),
    h('p', { class: 'cg-embed__label' }, ctx.t('embed.label')),
    h('p', { class: 'cg-embed__reason' }, reason),
    h(
      'a',
      {
        class: 'cg-arrow-link cg-embed__link',
        href: ctx.link(block.url),
        rel: 'noopener noreferrer nofollow',
      },
      ctx.t('embed.open', { provider: block.provider }),
    ),
  )
}

export function renderEmbed(block: EmbedBlock, ctx: RenderContext): HtmlElement {
  const source = block.consentRequired ? null : frameSource(block.provider, block.url)
  const ratio = aspectRatio(block.ratio) ?? '16 / 9'

  return section(
    'div',
    'embed',
    'cg-embed',
    {
      'data-provider': block.provider,
      'data-consent': block.consentRequired ? 'required' : 'not-required',
      style: `--cg-ratio:${ratio}`,
    },
    'div',
    h(
      'div',
      { class: 'cg-embed__frame' },
      source === null
        ? notice(
            block,
            ctx,
            block.consentRequired
              ? ctx.t('embed.consentRequired', { provider: block.provider })
              : ctx.t('embed.unsupported', { provider: block.provider }),
          )
        : h('iframe', {
            class: 'cg-embed__player',
            src: source,
            title: embedFrameTitle(ctx, block.provider, block.url),
            loading: 'lazy',
            referrerpolicy: 'strict-origin-when-cross-origin',
            allow:
              'accelerometer; clipboard-write; encrypted-media; picture-in-picture; fullscreen',
            allowfullscreen: true,
          }),
    ),
  )
}
