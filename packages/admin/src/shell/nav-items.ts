import type { ContentAction } from '../schema/types.js'

/**
 * The seven top-level sections of the sidebar, in the order fiche 35 task 1
 * settles on — content first (what every role touches most), settings last.
 *
 * `openByDefault` is the fiche's own recommendation (§8): **Content** open,
 * everything else collapsed, with the actual open/closed state then
 * remembered per browser (task 2) — this is only the state a fresh browser
 * starts from.
 */
export type NavGroupId =
  | 'content'
  | 'appearance'
  | 'commerce'
  | 'ai'
  | 'accounts'
  | 'ops'
  | 'settings'

export interface NavGroup {
  readonly id: NavGroupId
  readonly labelKey: string
  readonly openByDefault: boolean
}

export const NAV_GROUPS: readonly NavGroup[] = [
  { id: 'content', labelKey: 'nav.groups.content', openByDefault: true },
  { id: 'appearance', labelKey: 'nav.groups.appearance', openByDefault: false },
  { id: 'commerce', labelKey: 'nav.groups.commerce', openByDefault: false },
  { id: 'ai', labelKey: 'nav.groups.ai', openByDefault: false },
  { id: 'accounts', labelKey: 'nav.groups.accounts', openByDefault: false },
  { id: 'ops', labelKey: 'nav.groups.ops', openByDefault: false },
  { id: 'settings', labelKey: 'nav.groups.settings', openByDefault: false },
]

/**
 * The condition an item's own visibility is decided by (fiche 35 task 1: "a
 * permission, a feature switch, or a capability"). A closed union so
 * `nav-visibility.ts` can switch over it exhaustively rather than trusting a
 * loosely-shaped predicate — the same reason this list stays a plain data
 * module (ADR-0019's `labelKey` choice, this file's own long-standing
 * comment): it cannot call a hook, so what decides visibility has to be data
 * too, evaluated at render time in `nav-visibility.ts`.
 */
export type NavCondition =
  | { readonly kind: 'always' }
  | { readonly kind: 'role'; readonly role: string }
  /** Any role at all (not `public`-only) — the same courtesy check the commerce screens already make client-side. */
  | { readonly kind: 'anyRole' }
  /** At least one collection in the schema grants this actor this action. */
  | {
      readonly kind: 'collectionAction'
      readonly action: ContentAction
      /** Only count a collection that actually keeps a trash (`trash !== false`). */
      readonly trashableOnly?: true
    }
  /** The site declares at least one taxonomy. */
  | { readonly kind: 'taxonomiesPresent' }
  /** An AI provider is configured and offers this specific tool. */
  | { readonly kind: 'assistantTool'; readonly tool: string }
  /**
   * The shop has ever held a product, or this actor is `admin` — an admin
   * always sees the group that lets them add the first product; nobody else
   * sees an empty shop's menu (the fiche's own example bug, §2).
   */
  | { readonly kind: 'commerceActiveOrAdmin' }

/** Field names of `@cogenta/api`'s `ShellStatus` — kept identical so a badge item can index it directly. */
export type NavBadgeKey =
  | 'trash'
  | 'commerceOrdersPending'
  | 'marketplaceUpdates'
  | 'commentsPending'

export interface NavItem {
  readonly to: string
  /** A key into `i18n/locales/*.json`'s `nav` section, resolved at render time. */
  readonly labelKey: string
  readonly group: NavGroupId
  readonly visibleWhen: NavCondition
  /** Which field of `ShellStatus` (fiche 35 task 3) this entry's badge reads, if any. */
  readonly badge?: NavBadgeKey
}

/**
 * The full nav, one row per screen this admin actually routes to
 * (`src/app.tsx`) — nothing here names a screen that does not exist.
 *
 * Grouped and filtered per fiche 35 task 1: `nav-visibility.ts` turns this
 * list plus the signed-in actor's roles, the loaded schema, the assistant's
 * capabilities and `/api/shell-status` into what a given actor actually
 * sees. A group with zero visible items renders nothing at all — that is
 * what makes a shop-less site drop the whole **Boutique** heading rather
 * than showing it empty.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  // Content — open by default, the six entries every role that can see
  // anything at all sees first.
  { to: '/', labelKey: 'nav.dashboard', group: 'content', visibleWhen: { kind: 'always' } },
  {
    to: '/collections',
    labelKey: 'nav.collections',
    group: 'content',
    visibleWhen: { kind: 'collectionAction', action: 'read' },
  },
  { to: '/media', labelKey: 'nav.media', group: 'content', visibleWhen: { kind: 'always' } },
  {
    to: '/taxonomies',
    labelKey: 'nav.taxonomies',
    group: 'content',
    visibleWhen: { kind: 'taxonomiesPresent' },
  },
  { to: '/menus', labelKey: 'nav.menus', group: 'content', visibleWhen: { kind: 'always' } },
  {
    to: '/comments',
    labelKey: 'nav.comments',
    group: 'content',
    // The real gate is `comments.read` (ADR-0025), checked server-side by
    // `CommentsRouter` itself — `anyRole` here only decides whether the item
    // shows at all, the same courtesy `assistant` already uses, since
    // `NavCondition` has no member for a domain permission outside contract A.
    visibleWhen: { kind: 'anyRole' },
    badge: 'commentsPending',
  },
  {
    to: '/translations',
    labelKey: 'nav.translations',
    group: 'content',
    visibleWhen: { kind: 'always' },
  },
  {
    to: '/trash',
    labelKey: 'nav.trash',
    group: 'content',
    visibleWhen: { kind: 'collectionAction', action: 'delete', trashableOnly: true },
    badge: 'trash',
  },

  // Appearance — fiche 14 adds the theme/appearance screen itself; the
  // "Page builder" entry belongs here too, but it is reached from an entry
  // rather than the sidebar (L16), so it has no nav item of its own.
  {
    to: '/appearance',
    labelKey: 'nav.appearance',
    group: 'appearance',
    visibleWhen: { kind: 'role', role: 'admin' },
  },
  {
    to: '/redirects',
    labelKey: 'nav.redirects',
    group: 'appearance',
    visibleWhen: { kind: 'role', role: 'admin' },
  },
  {
    to: '/seo',
    labelKey: 'nav.seo',
    group: 'appearance',
    visibleWhen: { kind: 'role', role: 'admin' },
  },

  // Commerce — the whole group, not just its items, disappears on a shop
  // that has never sold anything (unless you are the admin who would add
  // the first product).
  {
    to: '/commerce/products',
    labelKey: 'nav.commerceProducts',
    group: 'commerce',
    visibleWhen: { kind: 'commerceActiveOrAdmin' },
  },
  {
    to: '/commerce/orders',
    labelKey: 'nav.commerceOrders',
    group: 'commerce',
    visibleWhen: { kind: 'commerceActiveOrAdmin' },
    badge: 'commerceOrdersPending',
  },
  {
    to: '/commerce/coupons',
    labelKey: 'nav.commerceCoupons',
    group: 'commerce',
    visibleWhen: { kind: 'commerceActiveOrAdmin' },
  },
  {
    to: '/commerce/subscriptions',
    labelKey: 'nav.commerceSubscriptions',
    group: 'commerce',
    visibleWhen: { kind: 'commerceActiveOrAdmin' },
  },
  // Store settings (fiche 34) — financial and legal configuration, `admin`
  // only regardless of whether the shop is active yet: setting up tax and
  // payment is what an admin does *before* the first sale, not after.
  {
    to: '/commerce/settings',
    labelKey: 'nav.commerceSettings',
    group: 'commerce',
    visibleWhen: { kind: 'role', role: 'admin' },
  },
  {
    to: '/commerce/tax',
    labelKey: 'nav.commerceTax',
    group: 'commerce',
    visibleWhen: { kind: 'role', role: 'admin' },
  },
  {
    to: '/commerce/shipping',
    labelKey: 'nav.commerceShipping',
    group: 'commerce',
    visibleWhen: { kind: 'role', role: 'admin' },
  },
  {
    to: '/commerce/payment',
    labelKey: 'nav.commercePayment',
    group: 'commerce',
    visibleWhen: { kind: 'role', role: 'admin' },
  },

  // AI — reduced to nothing (the whole group hidden) on a site with no
  // provider configured, per R2: the CMS works without AI, and this sidebar
  // does not dangle a link to a screen that can only ever say so.
  //
  // Fiche 30 task 2 consolidates chat and duplicate detection under one
  // "Assistant" overview screen (tabs, not separate nav entries) — the tabs
  // (AssistantChatRoute/DuplicatesRoute) keep their own capability check and
  // disappear on their own, so the umbrella nav entry itself is not gated on
  // one specific tool.
  {
    to: '/assistant',
    labelKey: 'nav.assistant',
    group: 'ai',
    visibleWhen: { kind: 'anyRole' },
  },
  {
    to: '/agents',
    labelKey: 'nav.agents',
    group: 'ai',
    visibleWhen: { kind: 'role', role: 'admin' },
  },
  {
    to: '/site-plan',
    labelKey: 'nav.sitePlan',
    group: 'ai',
    visibleWhen: { kind: 'role', role: 'admin' },
  },

  // Accounts
  {
    to: '/users',
    labelKey: 'nav.users',
    group: 'accounts',
    visibleWhen: { kind: 'role', role: 'admin' },
  },
  {
    to: '/api-keys',
    labelKey: 'nav.apiKeys',
    group: 'accounts',
    visibleWhen: { kind: 'role', role: 'admin' },
  },
  {
    to: '/roles',
    labelKey: 'nav.roles',
    group: 'accounts',
    visibleWhen: { kind: 'role', role: 'admin' },
  },

  // Ops — everything an admin uses to keep the site running, none of it
  // meaningful to any other role.
  {
    to: '/audit',
    labelKey: 'nav.audit',
    group: 'ops',
    visibleWhen: { kind: 'role', role: 'admin' },
  },
  {
    to: '/analytics',
    labelKey: 'nav.analytics',
    group: 'ops',
    visibleWhen: { kind: 'role', role: 'admin' },
  },
  {
    to: '/import',
    labelKey: 'nav.import',
    group: 'ops',
    visibleWhen: { kind: 'role', role: 'admin' },
  },
  {
    to: '/marketplace',
    labelKey: 'nav.marketplace',
    group: 'ops',
    visibleWhen: { kind: 'role', role: 'admin' },
    badge: 'marketplaceUpdates',
  },
  {
    to: '/ops-settings',
    labelKey: 'nav.opsSettings',
    group: 'ops',
    visibleWhen: { kind: 'role', role: 'admin' },
  },
  {
    to: '/health',
    labelKey: 'nav.health',
    group: 'ops',
    visibleWhen: { kind: 'role', role: 'admin' },
  },
  {
    to: '/tools',
    labelKey: 'nav.tools',
    group: 'ops',
    visibleWhen: { kind: 'role', role: 'admin' },
  },
  {
    to: '/scheduled',
    labelKey: 'nav.scheduled',
    group: 'ops',
    visibleWhen: { kind: 'role', role: 'admin' },
  },

  // Settings — personal preferences, open to whoever is signed in.
  { to: '/settings', labelKey: 'nav.settings', group: 'settings', visibleWhen: { kind: 'always' } },
  { to: '/profile', labelKey: 'nav.profile', group: 'settings', visibleWhen: { kind: 'always' } },
]
