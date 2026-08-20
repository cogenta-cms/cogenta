import { CogentaError } from '@cogenta/core'

/**
 * Contract F's own permission vocabulary — same reasoning as
 * `@cogenta/commerce`'s `admin/permissions.ts` (ADR-0025): contract A's five
 * frozen actions do not stretch to "mark spam" or "reply as the site". A
 * comment is not a collection entry, so it earns its own namespace rather
 * than borrowing one that would mean something slightly different here.
 */
export const COMMENT_PERMISSIONS = [
  /** See the moderation queue: pending, approved, spam, trash. */
  'comments.read',
  /** Approve, reject, mark spam, restore, bulk-act. */
  'comments.moderate',
  /** Post a reply from the admin, published as the signed-in account. */
  'comments.reply',
  /** A real, irreversible purge — separate from moderate on purpose (destructive). */
  'comments.purge',
  /** Change site/collection/entry discussion settings. */
  'comments.settings',
] as const
export type CommentPermission = (typeof COMMENT_PERMISSIONS)[number]

export const DEFAULT_COMMENT_ROLES: Readonly<Record<string, readonly CommentPermission[]>> = {
  admin: COMMENT_PERMISSIONS,
  editor: ['comments.read', 'comments.moderate', 'comments.reply'],
  viewer: ['comments.read'],
}

/** Who is asking. Never trusted: what the transport resolved, not a claim. */
export interface CommentActor {
  readonly id: string | null
  readonly roles: readonly string[]
}

export const COMMENT_ANONYMOUS: CommentActor = Object.freeze({ id: null, roles: Object.freeze([]) })

export interface CommentPermissionLayer {
  can(permission: CommentPermission, actor: CommentActor): boolean
  /** Throws `FORBIDDEN`, or `UNAUTHENTICATED` when nobody is signed in. */
  assert(permission: CommentPermission, actor: CommentActor): void
  readonly roles: Readonly<Record<string, readonly CommentPermission[]>>
}

export interface CommentPermissionOptions {
  readonly roles?: Readonly<Record<string, readonly CommentPermission[]>>
}

/** The single gate (R4): a route declares what it needs, this layer decides. */
export function createCommentPermissions(
  options: CommentPermissionOptions = {},
): CommentPermissionLayer {
  const roles = options.roles ?? DEFAULT_COMMENT_ROLES

  function can(permission: CommentPermission, actor: CommentActor): boolean {
    return actor.roles.some((role) => (roles[role] ?? []).includes(permission))
  }

  return {
    can,
    roles,
    assert: (permission, actor) => {
      if (can(permission, actor)) return
      if (actor.id === null) {
        throw new CogentaError({
          code: 'UNAUTHENTICATED',
          message: 'This part of the moderation queue needs you to be signed in.',
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
