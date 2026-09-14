import type { EmbedBlock } from '@cogenta/blocks'
import { aspectRatio, type HtmlElement, h, type RenderContext } from '@cogenta/theme-kit'

/**
 * A recorded walkthrough, a talk, a post: embedded in the hairline frame.
 *
 * Nothing here contacts a third party before the visitor has consented. When
 * `consentRequired` is true (and for a provider this theme cannot embed) the
 * frame holds a short notice and a link to the original instead: no
 * `<iframe>`, no `<script>`, no preconnect, no poster fetched from the
 * provider.
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
    { class: 'cd-embed__notice' },
    h('p', { class: 'cd-embed__reason' }, reason),
    h(
      'a',
      {
        class: 'cd-arrow-link cd-embed__link',
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

  return h(
    'div',
    {
      class: 'cd-section cd-embed',
      'data-block': 'embed',
      'data-provider': block.provider,
      'data-consent': block.consentRequired ? 'required' : 'not-required',
    },
    h(
      'div',
      { class: 'cd-container cd-embed__inner' },
      h(
        'div',
        { class: 'cd-embed__frame cd-frame', style: `aspect-ratio:${ratio}` },
        source === null
          ? notice(
              block,
              ctx,
              block.consentRequired
                ? ctx.t('embed.consentRequired', { provider: block.provider })
                : ctx.t('embed.unsupported', { provider: block.provider }),
            )
          : h('iframe', {
              class: 'cd-embed__iframe',
              src: source,
              title: ctx.t('embed.title', { provider: block.provider }),
              loading: 'lazy',
              referrerpolicy: 'strict-origin-when-cross-origin',
              allow:
                'accelerometer; clipboard-write; encrypted-media; picture-in-picture; fullscreen',
              allowfullscreen: true,
            }),
      ),
    ),
  )
}
