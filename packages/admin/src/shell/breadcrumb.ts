import type { CollectionSummary } from '../schema/types.js'
import { NAV_ITEMS } from './nav-items.js'

/**
 * One crumb: either a static, translatable label (`labelKey`, resolved by
 * the caller through `useTranslation`) or a literal one already resolved
 * from data (a collection's plural label) — `nav-items.ts`'s own
 * `labelKey`-not-a-literal reasoning (ADR-0019) applies here for the same
 * reason: this module is plain data/logic, not a component, so it cannot
 * call `useTranslation` itself.
 */
export interface BreadcrumbSegment {
  readonly labelKey?: string
  readonly label?: string
  /** Where this crumb links, when it is not the current page. */
  readonly to?: string
}

/**
 * Turns a pathname into the trail fiche 35 task 4 asks for
 * (`Collections › Articles › …`), and `documentTitleFor` turns that trail
 * into the string a browser tab shows — the fix for "every open tab is
 * called the same thing" (task 4's own example).
 *
 * Deliberately shallow: an individual entry's own title is not resolved
 * here (that would mean a second fetch of the very entry `entry-edit.tsx`
 * already loads for itself), so an entry route's last crumb names its
 * collection, not the entry. What this still fixes — five tabs reading
 * "Cogenta" and nothing else — is the problem the fiche actually names.
 */
export function breadcrumbFor(
  pathname: string,
  collections: readonly CollectionSummary[] | null,
): readonly BreadcrumbSegment[] {
  const parts = pathname.split('/').filter((part) => part.length > 0)
  if (parts.length === 0) return [{ labelKey: 'nav.dashboard' }]

  if (parts[0] === 'collections') {
    const segments: BreadcrumbSegment[] = [{ labelKey: 'nav.collections', to: '/collections' }]
    const name = parts[1]
    if (name === undefined) return segments
    const collection = collections?.find((candidate) => candidate.name === name)
    segments.push({
      label: collection?.labels.plural ?? name,
      to: `/collections/${encodeURIComponent(name)}`,
    })
    if (parts[2] === 'new') segments.push({ labelKey: 'breadcrumb.newEntry' })
    else if (parts[2] !== undefined) segments.push({ labelKey: 'breadcrumb.editEntry' })
    return segments
  }

  const item = matchNavItem(parts)
  return item === undefined ? [] : [{ labelKey: item.labelKey }]
}

/** Longest-prefix match against every declared route, so `/commerce/orders/abc` still resolves to "Commandes" rather than nothing. */
function matchNavItem(parts: readonly string[]) {
  for (let length = parts.length; length >= 1; length -= 1) {
    const candidate = `/${parts.slice(0, length).join('/')}`
    const found = NAV_ITEMS.find((navItem) => navItem.to === candidate)
    if (found !== undefined) return found
  }
  return undefined
}

/** `t` is `i18next`'s translate function — passed in rather than imported, so this stays a plain function `app-shell.tsx` can unit-test without rendering anything. */
export function documentTitleFor(
  segments: readonly BreadcrumbSegment[],
  t: (key: string) => string,
  brand: string,
): string {
  const labels = segments.map((segment) => segment.label ?? t(segment.labelKey ?? ''))
  return labels.length === 0 ? brand : `${labels.join(' › ')} — ${brand}`
}
