import type { EmbedBlock } from '@cogenta/blocks'
import {
  aspectRatio,
  embedFrameTitle,
  type HtmlElement,
  h,
  type RenderContext,
  renderEmbedPreview,
} from '@cogenta/theme-kit'
import { arrowWords, section } from '../layout.js'

/**
 * A film about the food bank, a recording of the annual meeting, a post from
 * a partner: eight columns of the reading width.
 *
 * Nothing here contacts a third party before the visitor consents: when
 * `consentRequired` is set, or the provider has no cookie-free frame (a map,
 * a post), a notice takes the frame's place. The notice is a short card
 * inside a hairline, not an empty frame kept at the video's ratio: without a
 * script there is nothing to load into that frame later, and a large blank
 * rectangle on a page is a hole. A label, one sentence, and one arrow link to
 * the original. No preconnect, no poster fetched from the provider, no
 * consent button (this theme ships no script).
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
      // bluesky, mastodon, other: a post embed is a script tag and a map is
      // a third-party page, neither of which this theme loads. The notice is
      // the rendering.
      return null
  }
}

function notice(block: EmbedBlock, ctx: RenderContext, reason: string): HtmlElement {
  return h(
    'div',
    { class: 'ca-embed__notice' },
    renderEmbedPreview(ctx, block.url, 'ca-embed'),
    h('p', { class: 'ca-embed__label' }, ctx.t('embed.label')),
    h('p', { class: 'ca-embed__reason' }, reason),
    h(
      'a',
      {
        class: 'ca-arrow-link ca-embed__link',
        href: ctx.link(block.url),
        rel: 'noopener noreferrer nofollow',
      },
      arrowWords(
        block.provider === 'other'
          ? ctx.t('embed.openOther')
          : ctx.t('embed.open', { provider: block.provider }),
      ),
    ),
  )
}

export function renderEmbed(block: EmbedBlock, ctx: RenderContext): HtmlElement {
  const source = block.consentRequired ? null : frameSource(block.provider, block.url)
  // Without a ratio the frame would collapse and shift the layout as it loads.
  const ratio = aspectRatio(block.ratio) ?? '16 / 9'

  return section(
    'div',
    'embed',
    'ca-embed',
    {
      'data-provider': block.provider,
      'data-consent': block.consentRequired ? 'required' : 'not-required',
      'data-frame': source === null ? 'notice' : 'player',
    },
    'div',
    source === null
      ? notice(
          block,
          ctx,
          block.consentRequired
            ? ctx.t('embed.consentRequired', { provider: block.provider })
            : ctx.t('embed.unsupported', { provider: block.provider }),
        )
      : h(
          'div',
          { class: 'ca-embed__frame', style: `aspect-ratio:${ratio}` },
          h('iframe', {
            class: 'ca-embed__player',
            src: source,
            // A frame with no accessible name is announced as "frame" and
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
