export interface NavItem {
  readonly to: string
  /** A key into `i18n/locales/*.json`'s `nav` section, resolved at render time. */
  readonly labelKey: string
}

/**
 * The top-level sections of the admin, in the order the sidebar shows them.
 *
 * Driven by data rather than one `<Link>` per section so a role that cannot
 * see a section (once permissions land, task 4) removes it by filtering this
 * list, not by editing markup in two places. `labelKey` rather than a literal
 * label for the same reason (ADR-0019): this list is a module-level constant,
 * outside any component, so it cannot call `useTranslation()` itself.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', labelKey: 'nav.dashboard' },
  { to: '/collections', labelKey: 'nav.collections' },
  { to: '/taxonomies', labelKey: 'nav.taxonomies' },
  { to: '/menus', labelKey: 'nav.menus' },
  { to: '/trash', labelKey: 'nav.trash' },
  { to: '/media', labelKey: 'nav.media' },
  { to: '/audit', labelKey: 'nav.audit' },
  { to: '/agents', labelKey: 'nav.agents' },
  { to: '/site-plan', labelKey: 'nav.sitePlan' },
  { to: '/users', labelKey: 'nav.users' },
  { to: '/api-keys', labelKey: 'nav.apiKeys' },
  { to: '/profile', labelKey: 'nav.profile' },
  { to: '/settings', labelKey: 'nav.settings' },
]
