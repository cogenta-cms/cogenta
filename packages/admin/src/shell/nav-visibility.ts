import { canPerform } from '../schema/permissions.js'
import type { SchemaDocument } from '../schema/types.js'
import {
  NAV_GROUPS,
  NAV_ITEMS,
  type NavCondition,
  type NavGroup,
  type NavItem,
} from './nav-items.js'

/**
 * Everything `isNavItemVisible` needs to answer "does this actor see this
 * entry" — fiche 35 task 1's three kinds of condition, each sourced from
 * wherever the shell already loads it (`SchemaProvider`, the assistant's own
 * capabilities, `/api/shell-status`). A field that has not loaded yet reads
 * as "hide it" rather than "show it" — the same direction every other
 * courtesy check in this admin already takes: a flash of an entry that then
 * disappears is worse than one appearing a beat late.
 */
export interface NavVisibilityContext {
  readonly roles: readonly string[]
  readonly collections: SchemaDocument['collections'] | null
  readonly taxonomiesPresent: boolean | null
  /** Tool names an AI provider currently offers — `null` while unknown, `[]` once known-and-none. */
  readonly assistantTools: readonly string[] | null
  readonly commerceActive: boolean | null
}

/** R4 reminder, same as `schema/permissions.ts`'s own: this is a courtesy, never the gate. The server checks everything again. */
export function isNavItemVisible(condition: NavCondition, ctx: NavVisibilityContext): boolean {
  switch (condition.kind) {
    case 'always':
      return true
    case 'role':
      return ctx.roles.includes(condition.role)
    case 'anyRole':
      return ctx.roles.length > 0
    case 'collectionAction': {
      if (ctx.collections === null) return false
      return ctx.collections.some((collection) => {
        if (condition.trashableOnly === true && collection.trash === false) return false
        return canPerform(condition.action, collection, ctx.roles)
      })
    }
    case 'taxonomiesPresent':
      return ctx.taxonomiesPresent === true
    case 'assistantTool':
      return ctx.assistantTools !== null && ctx.assistantTools.includes(condition.tool)
    case 'commerceActiveOrAdmin':
      return ctx.roles.length > 0 && (ctx.commerceActive === true || ctx.roles.includes('admin'))
  }
}

export interface VisibleNavGroup extends NavGroup {
  readonly items: readonly NavItem[]
}

/**
 * Every group that has at least one visible item, each already filtered to
 * only the items this actor sees — the shape `app-shell.tsx` renders
 * directly. A group with zero visible items is not in this list at all,
 * which is what makes a shop-less site drop the **Boutique** heading
 * entirely rather than render it empty (fiche 35 §2/§5).
 */
export function visibleNavGroups(ctx: NavVisibilityContext): readonly VisibleNavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: NAV_ITEMS.filter(
      (item) => item.group === group.id && isNavItemVisible(item.visibleWhen, ctx),
    ),
  })).filter((group) => group.items.length > 0)
}
