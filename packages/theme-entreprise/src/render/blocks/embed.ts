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
 * Nothing here contacts a third party before the visitor has consented.
 *
 * When `consentRequired` is true the block renders a notice and an outbound
 * link: no `<iframe>`, no `<script>`, no preconnect, no poster fetched from
 * the provider. An embed that "only" loads a thumbnail has already handed
 * the visitor's IP address to the provider, which is the transfer consent
 * was supposed to gate.
 *
 * The theme ships no consent button, because it ships no JavaScript:
 * granting consent is a site-wide decision for the consent layer, not a
 * block. The notice is the honest rendering until that layer exists. It
 * holds the same eight central columns and the same ratio the frame would,
 * so the page does not reflow when consent is later granted.
 */

/** `null` means "this provider has no embeddable frame we trust". */
function frameSource(provider: EmbedBlock['provider'], rawUrl: string): string | null {
  const url = URL.parse(rawUrl)
  if (url === null) return null
  const segments = url.pathname.split('/').filter((segment) => segment !== '')

  switch (provider) {
    case 'youtube': {
      // `youtube-nocookie.com` is the privacy-preserving host, and the only
      // one this theme points an iframe at.
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
      // bluesky, mastodon, other: a post embed is a script tag, which this
      // theme does not load. The notice is the rendering.
      return null
  }
}

function consentNotice(block: EmbedBlock, ctx: RenderContext, reason: string): HtmlElement {
  return h(
    'div',
    { class: 'cg-embed__notice' },
    renderEmbedPreview(ctx, block.url, 'cg-embed'),
    h('p', { class: 'cg-embed__provider', 'aria-hidden': 'true' }, block.provider),
    h('p', { class: 'cg-embed__reason' }, reason),
    h(
      'a',
      {
        class: 'cg-embed__link',
        href: ctx.link(block.url),
        rel: 'noopener noreferrer nofollow',
      },
      ctx.t('embed.open', { provider: block.provider }),
    ),
  )
}

export function renderEmbed(block: EmbedBlock, ctx: RenderContext): HtmlElement {
  const source = block.consentRequired ? null : frameSource(block.provider, block.url)
  // Video providers are 16:9 unless the editor framed them otherwise; without
  // a ratio the frame would collapse and shift the layout as it loads.
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
      { class: 'cg-embed__frame-box' },
      source === null
        ? consentNotice(
            block,
            ctx,
            block.consentRequired
              ? ctx.t('embed.consentRequired', { provider: block.provider })
              : ctx.t('embed.unsupported', { provider: block.provider }),
          )
        : h('iframe', {
            class: 'cg-embed__frame',
            src: source,
            // An iframe with no accessible name is announced as "frame" and
            // nothing else (WCAG 4.1.2).
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
