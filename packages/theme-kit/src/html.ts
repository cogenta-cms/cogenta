/**
 * A minimal, dependency-free HTML tree and serialiser.
 *
 * Why a theme's markup is built here rather than written inline as template
 * strings:
 *
 * 1. It is testable without a bundler — the vocabulary's blocks get real
 *    snapshot tests, and rules like "exactly one `h1`" or "every `<img>` has
 *    `alt`" are asserted on the actual output rather than on a reading of the
 *    source.
 * 2. There is **no way to emit raw HTML**. A block stores semantic data only
 *    (rule R3); with no `raw()` escape hatch, a string that arrives in a
 *    block field cannot become markup, whatever it contains.
 */

export type AttributeValue = string | number | boolean | undefined

export type Attributes = Readonly<Record<string, AttributeValue>>

export interface HtmlElement {
  readonly kind: 'element'
  readonly tag: string
  readonly attrs: Attributes
  readonly children: readonly HtmlNode[]
}

export interface HtmlText {
  readonly kind: 'text'
  readonly value: string
}

export type HtmlNode = HtmlElement | HtmlText

/** Anything a caller may pass as a child. `null`/`false` drop out, so a
 * conditional child reads as `condition && node` without a wrapper. */
export type Child = HtmlNode | string | null | false | undefined | readonly Child[]

/**
 * Elements that carry no children and no closing tag. Serialising `<img>` with
 * one would produce markup no parser agrees on.
 */
const VOID_ELEMENTS: ReadonlySet<string> = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])

export function text(value: string): HtmlText {
  return { kind: 'text', value }
}

function flatten(children: readonly Child[], into: HtmlNode[]): void {
  for (const child of children) {
    if (child === null || child === false || child === undefined) continue
    if (typeof child === 'string') {
      into.push(text(child))
      continue
    }
    if (Array.isArray(child)) {
      flatten(child as readonly Child[], into)
      continue
    }
    into.push(child as HtmlNode)
  }
}

export function h(tag: string, attrs: Attributes = {}, ...children: readonly Child[]): HtmlElement {
  const collected: HtmlNode[] = []
  flatten(children, collected)
  return { kind: 'element', tag, attrs, children: collected }
}

/**
 * `&` first, or every following replacement would be escaped twice.
 * `<` and `>` cover text; the quotes are escaped in attributes only, where they
 * are the ones that can break out.
 */
export function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Attributes a browser follows or loads: a script scheme in one of them runs. */
const URL_ATTRIBUTES = new Set([
  'href',
  'src',
  'action',
  'formaction',
  'poster',
  'cite',
  'xlink:href',
])
const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel'])

/**
 * A URL attribute's value, or `#` when its scheme could run script.
 *
 * The last wall, at the one place every theme and every plugin tree turns
 * into HTML (security review of 2026-10-21): an editor's `javascript:` link
 * in a call to action, a rich-text link, an embed or a logo was written as
 * is and ran on the site's origin — the admin's too — at the first click.
 * Relative URLs and fragments pass; so do http(s), mailto and tel, and a
 * `data:image/` source. Browsers ignore whitespace and control characters
 * around a scheme (`java\tscript:`), so the scheme is read without them.
 */
export function safeUrlAttribute(name: string, value: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: that is the point
  const probe = value.replace(/[\u0000-\u0020\u007f]/gu, '').toLowerCase()
  const scheme = /^([a-z][a-z0-9+.-]*):/u.exec(probe)?.[1]
  if (scheme === undefined || SAFE_SCHEMES.has(scheme)) return value
  if (scheme === 'data' && name !== 'href' && probe.startsWith('data:image/')) return value
  return '#'
}

function serializeAttributes(attrs: Attributes): string {
  let out = ''
  // Insertion order, not sorted: it is deterministic already, and an author
  // reading a snapshot expects the order they wrote.
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue
    if (value === true) {
      out += ` ${name}`
      continue
    }
    const text = URL_ATTRIBUTES.has(name.toLowerCase())
      ? safeUrlAttribute(name.toLowerCase(), String(value))
      : String(value)
    out += ` ${name}="${escapeAttribute(text)}"`
  }
  return out
}

export function serialize(node: HtmlNode): string {
  if (node.kind === 'text') return escapeText(node.value)
  const open = `<${node.tag}${serializeAttributes(node.attrs)}>`
  if (VOID_ELEMENTS.has(node.tag)) return open
  return `${open}${node.children.map(serialize).join('')}</${node.tag}>`
}

export function serializeAll(nodes: readonly HtmlNode[]): string {
  return nodes.map(serialize).join('')
}
