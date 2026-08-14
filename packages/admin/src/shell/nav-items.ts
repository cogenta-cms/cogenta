export interface NavItem {
  readonly to: string
  readonly label: string
}

/**
 * The top-level sections of the admin, in the order the sidebar shows them.
 *
 * Driven by data rather than one `<Link>` per section so a role that cannot
 * see a section (once permissions land, task 4) removes it by filtering this
 * list, not by editing markup in two places.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Tableau de bord' },
  { to: '/collections', label: 'Contenus' },
  { to: '/media', label: 'Médiathèque' },
  { to: '/audit', label: "Journal d'audit" },
  { to: '/settings', label: 'Paramètres' },
]
