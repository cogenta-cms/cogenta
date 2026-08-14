import type {
  EmbedBlock,
  GalleryBlock,
  MediaFigureBlock,
  ProseBlock,
  QuoteBlock,
} from '@cogenta/blocks'
import type { RichTextDocument } from '@cogenta/schema'
import { type ContentSegment, splitContentSegments } from './gutenberg.js'
import { htmlToRichText } from './html-to-richtext.js'

/**
 * A block produced by this converter. Shaped exactly like the vocabulary
 * (contract B) except that `media`/`gallery.items[].media` momentarily hold
 * the *source URL* of the image rather than a `MediaAsset` id — `import.ts`
 * downloads every referenced URL once, across the whole import, and
 * `resolveMediaReferences` below substitutes the real ids afterwards. This
 * keeps content conversion (pure, synchronous, heavily tested) separate from
 * media download (network, best-effort, graceful on failure).
 */
export type DraftBlock =
  | (Omit<ProseBlock, '_key' | '_version'> & { readonly _key: string })
  | (Omit<MediaFigureBlock, '_key' | '_version' | 'media'> & {
      readonly _key: string
      readonly media: string
    })
  | (Omit<QuoteBlock, '_key' | '_version'> & { readonly _key: string })
  | (Omit<GalleryBlock, '_key' | '_version' | 'items'> & {
      readonly _key: string
      readonly items: readonly { readonly _key: string; readonly media: string }[]
    })
  | (Omit<EmbedBlock, '_key' | '_version'> & { readonly _key: string })

export interface ContentConversionNote {
  /** The Gutenberg block name, or an HTML tag name, that could not be represented. */
  readonly source: string
  readonly reason: string
}

export interface ContentConversionResult {
  readonly blocks: readonly DraftBlock[]
  readonly notes: readonly ContentConversionNote[]
}

let keyCounter = 0
function nextKey(prefix: string): string {
  keyCounter += 1
  return `import-${prefix}-${keyCounter}`
}

function firstAttr(html: string, name: string): string | null {
  const match = new RegExp(`${name}=["']([^"']*)["']`, 'i').exec(html)
  return match?.[1] ?? null
}

function extractImageUrls(html: string): { readonly url: string; readonly alt: string }[] {
  const found: { url: string; alt: string }[] = []
  const imgPattern = /<img\b[^>]*>/gi
  let match: RegExpExecArray | null = imgPattern.exec(html)
  while (match !== null) {
    const src = firstAttr(match[0], 'src')
    if (src !== null) found.push({ url: src, alt: firstAttr(match[0], 'alt') ?? '' })
    match = imgPattern.exec(html)
  }
  return found
}

function proseFrom(document: RichTextDocument): DraftBlock | null {
  if (document.length === 0) return null
  return { _key: nextKey('prose'), _type: 'prose', body: document }
}

const YOUTUBE = /youtu\.?be/i
const VIMEO = /vimeo\.com/i
const DAILYMOTION = /dailymotion\.com/i
const SPOTIFY = /spotify\.com/i
const SOUNDCLOUD = /soundcloud\.com/i
const BLUESKY = /bsky\.app/i
const MASTODON = /mastodon\.[a-z.]+/i

function embedProviderFor(url: string): EmbedBlock['provider'] {
  if (YOUTUBE.test(url)) return 'youtube'
  if (VIMEO.test(url)) return 'vimeo'
  if (DAILYMOTION.test(url)) return 'dailymotion'
  if (SPOTIFY.test(url)) return 'spotify'
  if (SOUNDCLOUD.test(url)) return 'soundcloud'
  if (BLUESKY.test(url)) return 'bluesky'
  if (MASTODON.test(url)) return 'mastodon'
  return 'other'
}

function convertSegment(segment: ContentSegment, notes: ContentConversionNote[]): DraftBlock[] {
  if (segment.kind === 'html') {
    const { document, unknownTags } = htmlToRichText(segment.html)
    for (const tag of unknownTags) {
      notes.push({
        source: `html:${tag}`,
        reason:
          'No rich-text mapping for this HTML tag; its content was kept as plain text where possible.',
      })
    }
    const prose = proseFrom(document)
    return prose === null ? [] : [prose]
  }

  const { name, innerHtml } = segment

  if (name === 'paragraph' || name === 'heading' || name === 'list' || name === 'list-item') {
    const { document, unknownTags } = htmlToRichText(innerHtml)
    for (const tag of unknownTags) {
      notes.push({
        source: `html:${tag}`,
        reason: 'No rich-text mapping for this HTML tag inside a Gutenberg block.',
      })
    }
    const prose = proseFrom(document)
    return prose === null ? [] : [prose]
  }

  if (name === 'quote' || name === 'pullquote') {
    const { document } = htmlToRichText(innerHtml)
    const text = document
      .filter((node): node is Extract<typeof node, { _type: 'block' }> => node._type === 'block')
      .flatMap((node) => node.children.map((child) => child.text))
      .join(' ')
      .trim()
    const cite = /<cite[^>]*>([\s\S]*?)<\/cite>/i
      .exec(innerHtml)?.[1]
      ?.replace(/<[^>]*>/g, '')
      .trim()
    if (text.length === 0) return []
    const block: DraftBlock = {
      _key: nextKey('quote'),
      _type: 'quote',
      text: text.slice(0, 1000),
      ...(cite === undefined || cite.length === 0 ? {} : { author: cite.slice(0, 160) }),
    }
    return [block]
  }

  if (name === 'image') {
    const [image] = extractImageUrls(innerHtml)
    if (image === undefined) {
      notes.push({
        source: `wp:${name}`,
        reason: 'An image block with no <img src> could be found in its markup.',
      })
      return []
    }
    const captionMatch = /<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i.exec(innerHtml)?.[1]
    const caption = captionMatch?.replace(/<[^>]*>/g, '').trim()
    const block: DraftBlock = {
      _key: nextKey('mediaFigure'),
      _type: 'mediaFigure',
      media: image.url,
      ...(caption === undefined || caption.length === 0 ? {} : { caption: caption.slice(0, 320) }),
    }
    return [block]
  }

  if (name === 'gallery') {
    const images = extractImageUrls(innerHtml)
    if (images.length === 0) {
      notes.push({
        source: `wp:${name}`,
        reason: 'A gallery block with no <img src> images could be found in its markup.',
      })
      return []
    }
    const block: DraftBlock = {
      _key: nextKey('gallery'),
      _type: 'gallery',
      items: images.map((image) => ({ _key: nextKey('galleryItem'), media: image.url })),
      layout: 'grid',
    }
    return [block]
  }

  if (name === 'embed' || name.startsWith('core-embed/') || name === 'embed/embed') {
    const url =
      firstAttr(innerHtml, 'src') ?? innerHtml.match(/https?:\/\/\S+/)?.[0]?.replace(/<[^>]*$/, '')
    if (url === undefined || url === null || url.length === 0) {
      notes.push({ source: `wp:${name}`, reason: 'An embed block with no discoverable URL.' })
      return []
    }
    const cleanUrl = url.replace(/["'<].*$/, '')
    const block: DraftBlock = {
      _key: nextKey('embed'),
      _type: 'embed',
      provider: embedProviderFor(cleanUrl),
      url: cleanUrl.slice(0, 2048),
      consentRequired: true,
    }
    return [block]
  }

  notes.push({
    source: `wp:${name}`,
    reason:
      'No block of the vocabulary (contract B) represents this Gutenberg block; it was dropped rather than stored as raw HTML.',
  })
  return []
}

/**
 * Converts a post's `content:encoded` into the block vocabulary (contract B),
 * best-effort. Everything that cannot be represented is named in `notes`
 * rather than silently dropped or coerced into `prose` as raw HTML (rule R3).
 */
export function convertContent(content: string): ContentConversionResult {
  const notes: ContentConversionNote[] = []
  const segments = splitContentSegments(content)
  const blocks = segments.flatMap((segment) => convertSegment(segment, notes))
  return { blocks, notes }
}

/** Every source URL a draft's blocks reference, so the caller can download them once, up front. */
export function mediaUrlsOf(blocks: readonly DraftBlock[]): readonly string[] {
  const urls = new Set<string>()
  for (const block of blocks) {
    if (block._type === 'mediaFigure') urls.add(block.media)
    if (block._type === 'gallery') for (const item of block.items) urls.add(item.media)
  }
  return [...urls]
}

/**
 * Substitutes real media ids for the source URLs `convertContent` left in
 * place. A block whose image never downloaded is dropped rather than written
 * with a dangling reference; a gallery that loses every item is dropped too.
 */
export function resolveMediaReferences(
  blocks: readonly DraftBlock[],
  urlToMediaId: ReadonlyMap<string, string>,
  notes: ContentConversionNote[],
): readonly DraftBlock[] {
  const resolved: DraftBlock[] = []

  for (const block of blocks) {
    if (block._type === 'mediaFigure') {
      const id = urlToMediaId.get(block.media)
      if (id === undefined) {
        notes.push({
          source: 'media',
          reason: `Image "${block.media}" could not be downloaded; the block was dropped.`,
        })
        continue
      }
      resolved.push({ ...block, media: id })
      continue
    }

    if (block._type === 'gallery') {
      const items = block.items
        .map((item) => {
          const id = urlToMediaId.get(item.media)
          if (id === undefined) return null
          return { ...item, media: id }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
      if (items.length === 0) {
        notes.push({
          source: 'media',
          reason: 'Every image in a gallery block failed to download; the block was dropped.',
        })
        continue
      }
      resolved.push({ ...block, items })
      continue
    }

    resolved.push(block)
  }

  return resolved
}
