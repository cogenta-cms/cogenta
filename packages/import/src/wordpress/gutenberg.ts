/**
 * Splits WordPress post content into its top-level pieces.
 *
 * Since WordPress 5.0, `content:encoded` is HTML interleaved with Gutenberg
 * block comments (`<!-- wp:paragraph -->…<!-- /wp:paragraph -->`); content
 * from the classic editor, or a site that never touched the block editor, is
 * just HTML with no such comments. Both are handled: a document with block
 * comments is split at the top level only (a block nested inside a
 * `wp:group`/`wp:columns` container is not descended into — the container
 * itself is reported as unconverted, its children are not individually
 * salvaged); a document with none is returned as one `html` segment.
 */

export interface GutenbergBlockSegment {
  readonly kind: 'block'
  /** e.g. `"paragraph"`, `"core-embed/youtube"`, `"my-plugin/custom"`. */
  readonly name: string
  readonly attrs: Readonly<Record<string, unknown>>
  readonly innerHtml: string
}

export interface HtmlSegment {
  readonly kind: 'html'
  readonly html: string
}

export type ContentSegment = GutenbergBlockSegment | HtmlSegment

const BLOCK_COMMENT = /<!--\s*(\/)?wp:([a-zA-Z0-9][\w/-]*)\s*({[^}]*})?\s*(\/)?-->/g

function parseAttrs(raw: string | undefined): Record<string, unknown> {
  if (raw === undefined) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** Splits `content:encoded` into top-level Gutenberg blocks, or one HTML segment when it uses none. */
export function splitContentSegments(content: string): readonly ContentSegment[] {
  if (!content.includes('<!-- wp:')) {
    return content.trim().length === 0 ? [] : [{ kind: 'html', html: content }]
  }

  const segments: ContentSegment[] = []
  let cursor = 0
  let depth = 0
  let currentName: string | null = null
  let currentAttrs: Record<string, unknown> = {}
  let currentInnerStart = 0

  BLOCK_COMMENT.lastIndex = 0
  let match: RegExpExecArray | null = BLOCK_COMMENT.exec(content)

  while (match !== null) {
    const isClose = match[1] === '/'
    const name = match[2] ?? ''
    const attrsRaw = match[3]
    const selfClosed = match[4] === '/'

    if (depth === 0 && !isClose) {
      // Anything between the previous top-level block and this one is loose
      // HTML (or whitespace) — kept as its own segment rather than dropped.
      const between = content.slice(cursor, match.index).trim()
      if (between.length > 0) segments.push({ kind: 'html', html: between })

      if (selfClosed) {
        segments.push({ kind: 'block', name, attrs: parseAttrs(attrsRaw), innerHtml: '' })
        cursor = match.index + match[0].length
      } else {
        currentName = name
        currentAttrs = parseAttrs(attrsRaw)
        currentInnerStart = match.index + match[0].length
        depth = 1
      }
    } else if (!isClose && !selfClosed && name === currentName) {
      // A same-named nested block (e.g. wp:group inside wp:group) — tracked
      // only to find the matching close comment; its own children are not
      // separately extracted (see module doc).
      depth += 1
    } else if (isClose && name === currentName) {
      depth -= 1
      if (depth === 0) {
        const innerHtml = content.slice(currentInnerStart, match.index)
        segments.push({ kind: 'block', name: currentName, attrs: currentAttrs, innerHtml })
        cursor = match.index + match[0].length
        currentName = null
        currentAttrs = {}
      }
    }

    match = BLOCK_COMMENT.exec(content)
  }

  const tail = content.slice(cursor).trim()
  if (tail.length > 0) segments.push({ kind: 'html', html: tail })

  return segments
}
