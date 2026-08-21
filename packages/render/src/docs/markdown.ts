/**
 * Markdown → HTML for Cogenta's own documentation (L22 task 7).
 *
 * `packages/admin/src/rich-text/markdown.ts` already converts Markdown to a
 * Slate document, but that grammar is shaped by the rich-text *editor* (marks
 * round-trip through a specific `CustomElement` union, an internal link has
 * no `href` at all, media is a void with a private `cogenta-media:` scheme).
 * Documentation pages are plain files under `docs-site/content/`, never
 * touched by that editor, and need things the editor grammar doesn't have —
 * tables, ordered/unordered list nesting driven by indentation, fenced code
 * blocks with a language tag, heading anchors for a table of contents. A
 * second small hand-written scanner, in the same spirit as the first
 * (R9 — no Markdown dependency for either), is a better fit than bending one
 * grammar to two unrelated jobs.
 *
 * This module is pure and has no Node built-in or DOM dependency, which is
 * what lets it run in two different places from one source: a Node build
 * script (`docs-site/build/generate.mjs`, for the statically published site)
 * and `@cogenta/admin`'s browser bundle (`/admin/documentation`, already a
 * devDependency of that package). Same function, same output, both times —
 * the property the task explicitly asks for ("jamais deux copies qui
 * divergent").
 */

export interface MarkdownHeading {
  readonly level: number
  readonly text: string
  readonly id: string
}

export interface MarkdownDocument {
  readonly meta: Readonly<Record<string, string>>
  readonly html: string
  readonly headings: readonly MarkdownHeading[]
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;')
}

/** A minimal `key: value` block between two `---` lines. No nesting, no lists, no quoting — the only shapes `docs-site/content/**` actually uses (title, tree, order). A real YAML parser would be a bigger dependency than every page's frontmatter combined (R9). */
export function parseFrontmatter(source: string): {
  readonly meta: Readonly<Record<string, string>>
  readonly body: string
} {
  const normalized = source.replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) return { meta: {}, body: normalized }

  const end = normalized.indexOf('\n---\n', 4)
  if (end === -1) return { meta: {}, body: normalized }

  const meta: Record<string, string> = {}
  for (const line of normalized.slice(4, end).split('\n')) {
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    const value = line.slice(colon + 1).trim()
    if (key !== '') meta[key] = value
  }

  return { meta, body: normalized.slice(end + 5) }
}

function slugify(text: string, seen: Map<string, number>): string {
  const base =
    text
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '') // strip combining accents left by NFD
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'

  const count = seen.get(base) ?? 0
  seen.set(base, count + 1)
  return count === 0 ? base : `${base}-${count}`
}

// ---------------------------------------------------------------------------
// Inline grammar: escapes, `code`, **strong**, _em_/*em*, [text](url), images.
// ---------------------------------------------------------------------------

function renderInline(text: string): string {
  let out = ''
  let i = 0

  while (i < text.length) {
    const ch = text[i]

    if (ch === '\\' && i + 1 < text.length) {
      out += escapeHtml(text[i + 1] ?? '')
      i += 2
      continue
    }

    if (ch === '`') {
      const end = text.indexOf('`', i + 1)
      if (end !== -1) {
        out += `<code>${escapeHtml(text.slice(i + 1, end))}</code>`
        i = end + 1
        continue
      }
    }

    if (text.startsWith('**', i)) {
      const end = text.indexOf('**', i + 2)
      if (end !== -1) {
        out += `<strong>${renderInline(text.slice(i + 2, end))}</strong>`
        i = end + 2
        continue
      }
    }

    if ((ch === '_' || ch === '*') && text[i + 1] !== ' ') {
      const marker = ch
      const end = text.indexOf(marker, i + 1)
      if (end !== -1 && end > i + 1) {
        out += `<em>${renderInline(text.slice(i + 1, end))}</em>`
        i = end + 1
        continue
      }
    }

    if (ch === '!' && text[i + 1] === '[') {
      const image = matchLinkLike(text, i + 1)
      if (image !== null) {
        out += `<img src="${escapeAttr(image.href)}" alt="${escapeAttr(image.label)}" loading="lazy">`
        i = image.end
        continue
      }
    }

    if (ch === '[') {
      const link = matchLinkLike(text, i)
      if (link !== null) {
        const external = /^[a-z][a-z0-9+.-]*:/i.test(link.href) || link.href.startsWith('//')
        const rel = external ? ' rel="noopener noreferrer"' : ''
        out += `<a href="${escapeAttr(link.href)}"${rel}>${renderInline(link.label)}</a>`
        i = link.end
        continue
      }
    }

    out += escapeHtml(ch ?? '')
    i += 1
  }

  return out
}

interface LinkLikeMatch {
  readonly label: string
  readonly href: string
  readonly end: number
}

function matchLinkLike(text: string, start: number): LinkLikeMatch | null {
  if (text[start] !== '[') return null
  const closeBracket = text.indexOf(']', start + 1)
  if (closeBracket === -1 || text[closeBracket + 1] !== '(') return null
  const closeParen = text.indexOf(')', closeBracket + 2)
  if (closeParen === -1) return null
  return {
    label: text.slice(start + 1, closeBracket),
    href: text.slice(closeBracket + 2, closeParen),
    end: closeParen + 1,
  }
}

// ---------------------------------------------------------------------------
// Block grammar.
// ---------------------------------------------------------------------------

interface ListLine {
  readonly indent: number
  readonly ordered: boolean
  readonly text: string
}

const HEADING_LINE = /^(#{1,6})\s+(.*)$/
const FENCE_LINE = /^```\s*([\w-]*)\s*$/
const QUOTE_LINE = /^>\s?(.*)$/
const UL_LINE = /^( *)[-*+]\s+(.*)$/
const OL_LINE = /^( *)\d+\.\s+(.*)$/
const HR_LINE = /^(-{3,}|\*{3,}|_{3,})$/
const TABLE_SEP_LINE = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/

function splitTableRow(line: string): string[] {
  let trimmed = line.trim()
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1)
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1)
  return trimmed.split('|').map((cell) => cell.trim())
}

function renderList(lines: readonly ListLine[]): string {
  const tag = (lines[0]?.ordered ?? false) ? 'ol' : 'ul'
  const items: string[] = []
  let i = 0

  while (i < lines.length) {
    const item = lines[i]
    if (item === undefined) break
    const level = item.indent
    let html = renderInline(item.text)
    i += 1

    const nestedStart = i
    while (i < lines.length && (lines[i]?.indent ?? 0) > level) i += 1
    if (i > nestedStart) html += renderList(lines.slice(nestedStart, i))

    items.push(`<li>${html}</li>`)
  }

  return `<${tag}>${items.join('')}</${tag}>`
}

export function renderMarkdownToHtml(markdown: string): {
  readonly html: string
  readonly headings: readonly MarkdownHeading[]
} {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: string[] = []
  const headings: MarkdownHeading[] = []
  const seenIds = new Map<string, number>()
  let i = 0

  while (i < lines.length) {
    const line = lines[i] ?? ''

    if (line.trim() === '') {
      i += 1
      continue
    }

    const fence = FENCE_LINE.exec(line)
    if (fence !== null) {
      const lang = fence[1] ?? ''
      const codeLines: string[] = []
      i += 1
      while (i < lines.length && !FENCE_LINE.test(lines[i] ?? '') && (lines[i] ?? '') !== '```') {
        codeLines.push(lines[i] ?? '')
        i += 1
      }
      if (i < lines.length) i += 1 // closing fence
      const langAttr = lang === '' ? '' : ` class="language-${escapeAttr(lang)}"`
      blocks.push(`<pre><code${langAttr}>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
      continue
    }

    const heading = HEADING_LINE.exec(line)
    if (heading !== null) {
      const level = (heading[1] ?? '').length
      const text = (heading[2] ?? '').trim()
      const id = slugify(text, seenIds)
      blocks.push(`<h${level} id="${id}">${renderInline(text)}</h${level}>`)
      headings.push({ level, text, id })
      i += 1
      continue
    }

    if (HR_LINE.test(line.trim())) {
      blocks.push('<hr>')
      i += 1
      continue
    }

    // Table: a row followed by a separator row of the same column count.
    if (line.includes('|') && TABLE_SEP_LINE.test(lines[i + 1] ?? '')) {
      const headCells = splitTableRow(line)
      i += 2
      const bodyRows: string[][] = []
      while (i < lines.length && (lines[i] ?? '').includes('|') && (lines[i] ?? '').trim() !== '') {
        bodyRows.push(splitTableRow(lines[i] ?? ''))
        i += 1
      }
      const thead = `<thead><tr>${headCells.map((cell) => `<th>${renderInline(cell)}</th>`).join('')}</tr></thead>`
      const tbody = `<tbody>${bodyRows
        .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`)
        .join('')}</tbody>`
      blocks.push(`<table>${thead}${tbody}</table>`)
      continue
    }

    const quoteLines: string[] = []
    if (QUOTE_LINE.test(line)) {
      while (i < lines.length && QUOTE_LINE.test(lines[i] ?? '')) {
        quoteLines.push(QUOTE_LINE.exec(lines[i] ?? '')?.[1] ?? '')
        i += 1
      }
      blocks.push(`<blockquote><p>${renderInline(quoteLines.join(' '))}</p></blockquote>`)
      continue
    }

    if (UL_LINE.test(line) || OL_LINE.test(line)) {
      const listLines: ListLine[] = []
      while (i < lines.length) {
        const ulMatch = UL_LINE.exec(lines[i] ?? '')
        const olMatch = OL_LINE.exec(lines[i] ?? '')
        const match = ulMatch ?? olMatch
        if (match === null) break
        listLines.push({
          indent: Math.floor((match[1] ?? '').length / 2),
          ordered: olMatch !== null,
          text: match[2] ?? '',
        })
        i += 1
      }
      blocks.push(renderList(listLines))
      continue
    }

    const paragraphLines = [line]
    i += 1
    while (i < lines.length) {
      const next = lines[i] ?? ''
      if (
        next.trim() === '' ||
        HEADING_LINE.test(next) ||
        FENCE_LINE.test(next) ||
        QUOTE_LINE.test(next) ||
        UL_LINE.test(next) ||
        OL_LINE.test(next) ||
        HR_LINE.test(next.trim())
      ) {
        break
      }
      paragraphLines.push(next)
      i += 1
    }
    blocks.push(`<p>${renderInline(paragraphLines.join(' ').trim())}</p>`)
  }

  return { html: blocks.join('\n'), headings }
}

/** Frontmatter + rendering, in one call — what every real caller wants. */
export function renderMarkdownDocument(source: string): MarkdownDocument {
  const { meta, body } = parseFrontmatter(source)
  const { html, headings } = renderMarkdownToHtml(body)
  return { meta, html, headings }
}

// ---------------------------------------------------------------------------
// Admin link adaptation.
// ---------------------------------------------------------------------------

export type DocTree = 'functional' | 'technical'

/** Where `docs-site/build/generate.mjs` puts a downloadable starter, keyed by the filename every content page links to. */
const DOWNLOAD_REPO_PATHS: Readonly<Record<string, string>> = {
  'theme-starter.zip': 'examples/theme-starter',
  'plugin-starter.zip': 'examples/plugin-starter',
}

const REPO_TREE_URL = 'https://github.com/cogenta-cms/cogenta/tree/main/'

/**
 * The one place the two publications of this documentation *legitimately*
 * differ: the statically generated site is a set of `.html` files on disk,
 * `/admin/documentation` is one single-page app screen. The Markdown source
 * and `renderMarkdownToHtml`'s output are identical either way — this
 * function only retargets the `href`s a static site needs and a SPA can't
 * use as written, run as a second pass over that same, unmodified HTML.
 *
 * Three shapes appear in `docs-site/content/**`, and only these three:
 *   - `../downloads/<file>.zip`               → a starter template
 *   - `(../)?(functional|technical)/<slug>.html(#hash)?` → a cross-tree page
 *   - `<slug>.html(#hash)?`                    → a same-tree page
 *
 * A link this function doesn't recognise (an external `https://…` URL, an
 * in-page `#hash`) is left untouched — this is a narrow, closed rewrite over
 * a grammar this same project authors, not a general HTML link resolver.
 *
 * `basePath` defaults to `/admin` — where `cogenta serve` actually mounts
 * the admin SPA — but is a parameter rather than a literal because the
 * admin's own local dev server (`pnpm dev` inside `packages/admin`, no
 * `cogenta serve` in front of it) serves the same screen at the root instead
 * (`vite.config.ts`'s own `base: command === 'build' ? '/admin/' : '/'`). The
 * caller passes `import.meta.env.BASE_URL` so a rewritten link works in both.
 */
export function adaptDocHtmlForAdmin(
  html: string,
  currentTree: DocTree,
  basePath = '/admin',
): string {
  const base = basePath.replace(/\/$/, '')
  return html
    .replace(/href="\.\.\/downloads\/([\w.-]+)"/g, (full, file: string) => {
      const repoPath = DOWNLOAD_REPO_PATHS[file]
      return repoPath === undefined
        ? full
        : `href="${REPO_TREE_URL}${repoPath}" rel="noopener noreferrer" target="_blank"`
    })
    .replace(
      /href="(?:\.\.\/)?(functional|technical)\/([\w-]+)\.html(#[\w-]+)?"/g,
      (_full, tree: string, slug: string, hash = '') =>
        `href="${base}/documentation/docs/${tree}/${slug}${hash}"`,
    )
    .replace(
      /href="([\w-]+)\.html(#[\w-]+)?"/g,
      (_full, slug: string, hash = '') =>
        `href="${base}/documentation/docs/${currentTree}/${slug}${hash}"`,
    )
}
