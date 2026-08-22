import type { EmbedBlock } from '@cogenta/blocks'
import { aspectRatio, type HtmlElement, h, type RenderContext } from '@cogenta/theme-kit'

/**
 * Nothing here contacts a third party before the visitor has consented.
 *
 * When `consentRequired` is true the block renders a self-contained card and
 * an outbound link — no `<iframe>`, no `<script>`, no preconnect, no poster
 * image fetched from the provider. An embed that "only" loads a thumbnail has
 * already handed the visitor's IP address and a cookie to the provider, which
 * is the exact transfer consent was supposed to gate.
 *
 * The theme ships no consent *button*, because it ships no JavaScript:
 * granting consent is a site-wide decision that belongs to the consent layer,
 * not to a block. Until that layer exists, the card is the honest rendering —
 * it says what would be loaded and lets the visitor go there deliberately.
 */

/** `null` means "this provider has no embeddable frame we trust". */
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
      // bluesky, mastodon, other: a post embed is a script tag, which this
      // theme does not load. The link card is the rendering.
      return null
  }
}

function consentCard(block: EmbedBlock, ctx: RenderContext, reason: string): HtmlElement {
  return h(
    'div',
    { class: 'ce-embed__placeholder' },
    h('span', { class: 'ce-embed__badge' }, block.provider),
    h('p', { class: 'ce-embed__notice' }, reason),
    h(
      'a',
      {
        class: 'ce-embed__link',
        href: ctx.link(block.url),
        rel: 'noopener noreferrer nofollow',
      },
      ctx.t('embed.open', { provider: block.provider }),
    ),
  )
}

export function renderEmbed(block: EmbedBlock, ctx: RenderContext): HtmlElement {
  const source = block.consentRequired ? null : frameSource(block.provider, block.url)
  // Video providers default to 16:9 unless the editor framed them otherwise;
  // without a ratio the frame would collapse and shift the layout as it
  // loads.
  const ratio = aspectRatio(block.ratio) ?? '16 / 9'

  return h(
    'div',
    {
      class: 'ce-block ce-embed',
      'data-block': 'embed',
      'data-provider': block.provider,
      'data-consent': block.consentRequired ? 'required' : 'not-required',
      style: `--ce-ratio:${ratio}`,
    },
    source === null
      ? consentCard(
          block,
          ctx,
          block.consentRequired
            ? ctx.t('embed.consentRequired', { provider: block.provider })
            : ctx.t('embed.unsupported', { provider: block.provider }),
        )
      : h('iframe', {
          class: 'ce-embed__frame',
          src: source,
          // An iframe with no accessible name is announced as "frame" and
          // nothing else — WCAG 4.1.2, and the single most common embed
          // defect.
          title: ctx.t('embed.title', { provider: block.provider }),
          loading: 'lazy',
          referrerpolicy: 'strict-origin-when-cross-origin',
          allow: 'accelerometer; clipboard-write; encrypted-media; picture-in-picture; fullscreen',
          allowfullscreen: true,
        }),
  )
}
