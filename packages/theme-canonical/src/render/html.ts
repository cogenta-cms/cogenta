/**
 * A minimal, dependency-free HTML tree and serialiser.
 *
 * Why the theme's markup is built here rather than written inline in the
 * `.astro` files:
 *
 * 1. It is testable without an Astro toolchain — the twelve blocks get real
 *    snapshot tests, and the heading outline and the `alt` rule get asserted on
 *    the actual output rather than on a reading of the source.
 * 2. There is **no way to emit raw HTML**. A block stores semantic data only
 *    (rule R3); with no `raw()` escape hatch, a string that arrives in a block
 *    field cannot become markup, whatever it contains.
 *
 * The `.astro` components in `src/blocks/` are the contract-D entry points and
 * stay thin on purpose: one call each, so the two never drift.
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
    out += ` ${name}="${escapeAttribute(String(value))}"`
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
