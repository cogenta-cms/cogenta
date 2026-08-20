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
  { to: '/commerce/products', labelKey: 'nav.commerceProducts' },
  { to: '/commerce/orders', labelKey: 'nav.commerceOrders' },
  { to: '/commerce/coupons', labelKey: 'nav.commerceCoupons' },
  { to: '/commerce/subscriptions', labelKey: 'nav.commerceSubscriptions' },
  { to: '/redirects', labelKey: 'nav.redirects' },
  { to: '/trash', labelKey: 'nav.trash' },
  { to: '/assistant', labelKey: 'nav.assistant' },
  { to: '/media', labelKey: 'nav.media' },
  { to: '/import', labelKey: 'nav.import' },
  { to: '/audit', labelKey: 'nav.audit' },
  { to: '/analytics', labelKey: 'nav.analytics' },
  { to: '/agents', labelKey: 'nav.agents' },
  { to: '/site-plan', labelKey: 'nav.sitePlan' },
  { to: '/marketplace', labelKey: 'nav.marketplace' },
  { to: '/users', labelKey: 'nav.users' },
  { to: '/api-keys', labelKey: 'nav.apiKeys' },
  { to: '/profile', labelKey: 'nav.profile' },
  { to: '/settings', labelKey: 'nav.settings' },
  { to: '/ops-settings', labelKey: 'nav.opsSettings' },
]
