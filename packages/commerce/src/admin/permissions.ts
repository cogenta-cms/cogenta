import { CogentaError } from '@cogenta/core'

/**
 * Contract E's own permission vocabulary.
 *
 * Contract A's five actions (`read`, `create`, `update`, `delete`, `publish`)
 * are frozen and they do not stretch to cover this domain: "refund an order"
 * is not an `update`, and "issue an invoice" is not a `publish`. Rather than
 * make those five words mean things they do not, commerce declares its own —
 * in its own namespace, so the two can never be confused for one another.
 *
 * Deliberately coarse. Six permissions, not thirty: a shop has a person who
 * looks after the catalogue, a person who packs orders, and a person who is
 * allowed to move money. Splitting further invents roles nobody staffs.
 */
export const COMMERCE_PERMISSIONS = [
  /** See products, orders, customers. The read-only back office. */
  'commerce.read',
  /** Create and edit products, variants, prices, stock, tax and shipping rules. */
  'commerce.catalog.write',
  /** Move an order along: mark shipped, delivered, cancelled. */
  'commerce.order.write',
  /** Mark a payment received, or record one that failed. Money in. */
  'commerce.payment.settle',
  /** Money out. Separate from settling on purpose. */
  'commerce.order.refund',
  /** Issue an invoice. Separate because the number it burns is irreversible. */
  'commerce.invoice.issue',
] as const
export type CommercePermission = (typeof COMMERCE_PERMISSIONS)[number]

/**
 * Which roles hold which permission, by default.
 *
 * `admin` holds everything. `editor` gets the catalogue, because a product
 * page is content work. Nobody else touches money: refunding is the one
 * action here that moves funds out of the business with no counter-signature,
 * so it stays with `admin` until a site says otherwise.
 */
export const DEFAULT_COMMERCE_ROLES: Readonly<Record<string, readonly CommercePermission[]>> = {
  admin: COMMERCE_PERMISSIONS,
  editor: ['commerce.read', 'commerce.catalog.write'],
  shopkeeper: [
    'commerce.read',
    'commerce.catalog.write',
    'commerce.order.write',
    'commerce.payment.settle',
    'commerce.invoice.issue',
  ],
  viewer: ['commerce.read'],
}

/** Who is asking. Never trusted: what the transport resolved, not a claim. */
export interface CommerceActor {
  readonly id: string | null
  readonly roles: readonly string[]
}

export const COMMERCE_ANONYMOUS: CommerceActor = Object.freeze({
  id: null,
  roles: Object.freeze([]),
})

export interface CommercePermissionLayer {
  can(permission: CommercePermission, actor: CommerceActor): boolean
  /** Throws `FORBIDDEN`, or `UNAUTHENTICATED` when nobody is signed in. */
  assert(permission: CommercePermission, actor: CommerceActor): void
}

export interface CommercePermissionOptions {
  /** Overrides the defaults entirely, per role. */
  readonly roles?: Readonly<Record<string, readonly CommercePermission[]>>
}

/**
 * The single gate. R4: a route declares what it needs, the layer decides — the
 * check is never written inside the thing being protected.
 */
export function createCommercePermissions(
  options: CommercePermissionOptions = {},
): CommercePermissionLayer {
  const roles = options.roles ?? DEFAULT_COMMERCE_ROLES

  function can(permission: CommercePermission, actor: CommerceActor): boolean {
    return actor.roles.some((role) => (roles[role] ?? []).includes(permission))
  }

  return {
    can,
    assert: (permission, actor) => {
      if (can(permission, actor)) return

      // Told apart on purpose: "sign in" and "you may never do this" send a
      // person to different places, and conflating them makes an admin chase
      // a login problem that is actually a role problem.
      if (actor.id === null) {
        throw new CogentaError({
          code: 'UNAUTHENTICATED',
          message: 'This part of the shop needs you to be signed in.',
          hint: 'Sign in and try again.',
          details: { permission },
        })
      }
      throw new CogentaError({
        code: 'FORBIDDEN',
        message: 'Your account is not allowed to do that.',
        hint: `It needs the ${permission} permission. An administrator can grant it.`,
        details: { permission },
      })
    },
  }
}
