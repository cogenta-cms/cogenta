import { createHash } from 'node:crypto'
import type { PluginBlockProvision, ResolvedPlugin } from '@cogenta/plugins'
import type { HtmlElement, HtmlNode } from '@cogenta/theme-kit'

/**
 * L32 step 2 — the markup a plugin's block produces, and everything that has
 * to be true before it reaches a page.
 *
 * The plugin returns a **tree**, never a string: `@cogenta/theme-kit`'s node
 * shape is already plain JSON, so it crosses the sandbox boundary with
 * nothing invented, and it has no `raw()` escape hatch by construction. What
 * arrives is still checked here — a plugin is third-party code and the tree
 * it sends is data from outside (R8) — against a tag and attribute
 * allowlist, a depth limit and a size limit. `<script>`, `on*` and
 * `javascript:` cannot survive that check, so a plugin cannot reach the admin
 * session from the site's own origin.
 *
 * Rendering runs in the permission-restricted child process L31 built, with
 * exactly the capabilities the plugin was granted — none, for a block that
 * only needs its own data.
 */

/** The handler a plugin exposes to render one of its blocks. */
export const PLUGIN_BLOCK_HANDLER = 'onRenderBlock'
/** And the one it exposes to render one of its widgets (L32 step 4). */
export const PLUGIN_WIDGET_HANDLER = 'onRenderWidget'

/**
 * What a plugin block may emit. Structural elements and text; no form
 * controls (a public page's form would post somewhere), no `script`,
 * `style`, `iframe`, `object` or `link`.
 */
export const PLUGIN_BLOCK_TAGS: ReadonlySet<string> = new Set([
  'section',
  'div',
  'article',
  'aside',
  'header',
  'footer',
  'nav',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'span',
  'strong',
  'em',
  'small',
  'mark',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'figure',
  'figcaption',
  'img',
  'picture',
  'source',
  'video',
  'audio',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'caption',
  'a',
  'time',
  'blockquote',
  'cite',
  'code',
  'pre',
  'hr',
  'br',
  'abbr',
  'details',
  'summary',
  'progress',
  'meter',
])

/**
 * Attributes a plugin may set. `class` is allowed — a plugin styles with the
 * theme's own classes or its own, and CSS cannot exfiltrate a session; `id`
 * is not, because a duplicate id breaks the page's own anchors.
 */
export const PLUGIN_BLOCK_ATTRIBUTES: ReadonlySet<string> = new Set([
  'class',
  'href',
  'src',
  'srcset',
  'sizes',
  'alt',
  'title',
  'width',
  'height',
  'loading',
  'decoding',
  'datetime',
  'colspan',
  'rowspan',
  'scope',
  'lang',
  'dir',
  'open',
  'value',
  'max',
  'min',
  'controls',
  'poster',
  'type',
  'rel',
  'target',
])

/** Deep enough for a real component, shallow enough that nothing recurses into a page freeze. */
export const MAX_PLUGIN_BLOCK_DEPTH = 24
/** Past this, a "block" is a denial of service with markup. */
export const MAX_PLUGIN_BLOCK_NODES = 2000
export const MAX_PLUGIN_BLOCK_TEXT = 100_000

export interface PluginBlockCheck {
  readonly ok: boolean
  readonly node?: HtmlElement
  readonly problem?: string
}

function safeUrl(value: string): boolean {
  const trimmed = value.trim().toLowerCase()
  if (trimmed.startsWith('javascript:') || trimmed.startsWith('vbscript:')) return false
  // `data:` is allowed only for an image, which is what a generated chart or
  // a QR code needs; `data:text/html` would be a document on this origin.
  if (trimmed.startsWith('data:')) return trimmed.startsWith('data:image/')
  return true
}

/**
 * Checks a tree a plugin sent, and returns it only if every node in it is
 * something a page may hold. Never repairs: a block that emitted a script is
 * a block whose author must be told, not one whose output is quietly edited
 * into something else.
 */
export function checkPluginBlockNode(value: unknown): PluginBlockCheck {
  let nodes = 0
  let text = 0

  function walk(node: unknown, depth: number, path: string): string | null {
    if (depth > MAX_PLUGIN_BLOCK_DEPTH) {
      return `${path}: nested deeper than ${MAX_PLUGIN_BLOCK_DEPTH}`
    }
    nodes += 1
    if (nodes > MAX_PLUGIN_BLOCK_NODES) return `more than ${MAX_PLUGIN_BLOCK_NODES} nodes`
    if (typeof node !== 'object' || node === null) return `${path}: is not a node`
    const record = node as Record<string, unknown>

    if (record['kind'] === 'text') {
      if (typeof record['value'] !== 'string') return `${path}: a text node needs a string value`
      text += record['value'].length
      return text > MAX_PLUGIN_BLOCK_TEXT ? `more than ${MAX_PLUGIN_BLOCK_TEXT} characters` : null
    }
    if (record['kind'] !== 'element') return `${path}: unknown node kind`

    const tag = record['tag']
    if (typeof tag !== 'string' || !PLUGIN_BLOCK_TAGS.has(tag)) {
      return `${path}: "${String(tag)}" is not a tag a block may use`
    }
    const attrs = record['attrs']
    if (attrs !== undefined) {
      if (typeof attrs !== 'object' || attrs === null) return `${path}: attrs must be an object`
      for (const [name, attribute] of Object.entries(attrs as Record<string, unknown>)) {
        if (!PLUGIN_BLOCK_ATTRIBUTES.has(name)) {
          return `${path}: "${name}" is not an attribute a block may set`
        }
        if (attribute === undefined || typeof attribute === 'boolean') continue
        if (typeof attribute !== 'string' && typeof attribute !== 'number') {
          return `${path}: "${name}" must be a string, a number or a boolean`
        }
        if (
          (name === 'href' || name === 'src' || name === 'poster' || name === 'srcset') &&
          typeof attribute === 'string' &&
          !safeUrl(attribute)
        ) {
          return `${path}: "${name}" points somewhere a block may not point`
        }
      }
    }
    const children = record['children']
    if (children !== undefined) {
      if (!Array.isArray(children)) return `${path}: children must be an array`
      for (const [index, child] of children.entries()) {
        const problem = walk(child, depth + 1, `${path}.children[${index}]`)
        if (problem !== null) return problem
      }
    }
    return null
  }

  const problem = walk(value, 0, 'block')
  if (problem !== null) return { ok: false, problem }
  const root = value as HtmlNode
  if (root.kind !== 'element') return { ok: false, problem: 'a block must render an element' }
  return { ok: true, node: root }
}

export interface PluginBlockRenderRequest {
  readonly type: string
  readonly key: string
  readonly values: Readonly<Record<string, unknown>>
  readonly locale: string
}

export interface PluginBlockRenderOutcome {
  /** What the theme is handed, keyed by the block's contract B `_key`. */
  readonly nodes: Record<string, HtmlElement>
  /** Blocks whose fallback the caller should put in their place instead. */
  readonly degrade: readonly string[]
}

export interface PluginBlockRenderer {
  render(requests: readonly PluginBlockRenderRequest[]): Promise<PluginBlockRenderOutcome>
  /** Which plugin provides this block, if any — `undefined` for a vocabulary block. */
  provisionOf(type: string): PluginBlockProvision | undefined
}

export interface PluginBlockRendererOptions {
  readonly plugins: readonly ResolvedPlugin[]
  /**
   * Which of a manifest's provisions this renderer answers for, and which
   * handler it calls. Blocks and widgets differ in exactly these two values
   * and in nothing else — the process, the allowlist, the cache and the
   * failure policy are one implementation on purpose, so a hole closed for
   * one cannot stay open for the other.
   */
  readonly kind?: 'blocks' | 'widgets'
  /** Runs a plugin handler. Injected so this file spawns nothing itself. */
  readonly invoke: (
    plugin: string,
    handler: string,
    input: unknown,
  ) => Promise<{ readonly ok: boolean; readonly value?: unknown; readonly error?: string }>
  /** Told about a block that could not render, so the site's own logger says it. */
  readonly onProblem?: (problem: { plugin: string; block: string; reason: string }) => void
  /** How many rendered blocks to keep. A page is a handful; a busy site a few hundred. */
  readonly cacheSize?: number
}

export const DEFAULT_PLUGIN_BLOCK_CACHE = 500

/**
 * A plugin block rendered on every visit would be a forked process per block
 * per request. The rendered tree is therefore kept against the exact inputs
 * that produced it — the plugin, its version, the block type, its stored
 * values and the locale. Editing the block changes the digest, so a stale
 * render cannot survive an edit.
 */
function cacheKey(plugin: ResolvedPlugin, request: PluginBlockRenderRequest): string {
  return createHash('sha256')
    .update(
      [
        plugin.manifest.name,
        plugin.manifest.version,
        request.type,
        request.locale,
        JSON.stringify(request.values),
      ].join('\n'),
    )
    .digest('hex')
}

export function createPluginBlockRenderer(
  options: PluginBlockRendererOptions,
): PluginBlockRenderer {
  const kind = options.kind ?? 'blocks'
  const handler = kind === 'blocks' ? PLUGIN_BLOCK_HANDLER : PLUGIN_WIDGET_HANDLER
  const provisions = new Map<string, { plugin: ResolvedPlugin; provision: PluginBlockProvision }>()
  for (const plugin of options.plugins) {
    const declared =
      kind === 'blocks'
        ? (plugin.manifest.provides.blocks ?? [])
        : ((plugin.manifest.provides.widgets ?? []) as readonly PluginBlockProvision[])
    for (const provision of declared) {
      if (!provisions.has(provision.name)) provisions.set(provision.name, { plugin, provision })
    }
  }

  const cache = new Map<string, HtmlElement>()
  const limit = options.cacheSize ?? DEFAULT_PLUGIN_BLOCK_CACHE

  function remember(key: string, node: HtmlElement): void {
    // Oldest out first: a Map iterates in insertion order, which is the whole
    // of the eviction policy this needs.
    if (cache.size >= limit) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(key, node)
  }

  return {
    provisionOf: (type) => provisions.get(type)?.provision,

    async render(requests) {
      const nodes: Record<string, HtmlElement> = {}
      const degrade: string[] = []

      for (const request of requests) {
        const owner = provisions.get(request.type)
        if (owner === undefined) continue

        const key = cacheKey(owner.plugin, request)
        const cached = cache.get(key)
        if (cached !== undefined) {
          nodes[request.key] = cached
          continue
        }

        const result = await options.invoke(owner.plugin.manifest.name, handler, {
          type: request.type,
          values: request.values,
          locale: request.locale,
        })
        if (!result.ok) {
          degrade.push(request.key)
          options.onProblem?.({
            plugin: owner.plugin.manifest.name,
            block: request.type,
            reason: result.error ?? 'the plugin failed',
          })
          continue
        }
        const checked = checkPluginBlockNode(result.value)
        if (!checked.ok || checked.node === undefined) {
          degrade.push(request.key)
          options.onProblem?.({
            plugin: owner.plugin.manifest.name,
            block: request.type,
            reason: checked.problem ?? 'the plugin returned something that is not markup',
          })
          continue
        }
        remember(key, checked.node)
        nodes[request.key] = checked.node
      }

      return { nodes, degrade }
    },
  }
}
