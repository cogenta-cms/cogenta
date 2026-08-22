import type { Action, LinkTarget as BlockLinkTarget } from '@cogenta/blocks'
import type { RenderContext } from './contract.js'
import { type HtmlElement, h } from './html.js'

/**
 * A target is resolved through `ctx.link` in every case, including an external
 * `href`: the context is the only thing that knows the locale prefix and the
 * site's base URL, and duplicating that reasoning here is how a theme starts
 * emitting broken links in a sub-path deployment.
 */
export function href(ctx: RenderContext, target: BlockLinkTarget): string {
  return 'href' in target ? ctx.link(target.href) : ctx.link(target)
}

/** A link that leaves the site gets the protection; a same-site one must not. */
function isExternal(ctx: RenderContext, url: string): boolean {
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) return false
  const site = URL.parse(ctx.site.url)
  const target = URL.parse(url)
  if (site === null || target === null) return false
  return site.host !== target.host
}

export function actionLink(ctx: RenderContext, action: Action): HtmlElement {
  const url = href(ctx, action.target)
  const external = isExternal(ctx, url)
  return h(
    'a',
    {
      class: 'cg-action',
      // `emphasis` is a semantic intent, so it stays an attribute the skin reads
      // rather than a class the block dictated. Default `secondary`: promoting
      // an unstated action to primary is a decision the editor did not make.
      'data-emphasis': action.emphasis ?? 'secondary',
      href: url,
      rel: external ? 'noopener noreferrer' : undefined,
    },
    action.label,
  )
}

/**
 * A list, not a row of loose anchors: a screen reader then announces "list, 2
 * items" and the actions are navigable as a group.
 */
export function actionList(
  ctx: RenderContext,
  actions: readonly Action[] | undefined,
  label: string,
): HtmlElement | null {
  if (actions === undefined || actions.length === 0) return null
  return h(
    'ul',
    { class: 'cg-actions', 'aria-label': label },
    actions.map((action) => h('li', {}, actionLink(ctx, action))),
  )
}
