import { CogentaError } from '@cogenta/core'
import type { Actor } from '../types.js'

export type MediaPermission = 'media.read' | 'media.write'

/** Media grants are shared by HTTP routes and the MCP runtime manifest. */
export function canAccessMedia(actor: Actor, permission: MediaPermission): boolean {
  const writers = actor.roles.some((role) => role === 'admin' || role === 'editor')
  if (permission === 'media.write') return writers
  return writers || actor.roles.includes('viewer')
}

export function assertMediaAccess(actor: Actor, permission: MediaPermission): void {
  if (actor.id === null) {
    throw new CogentaError({
      code: 'UNAUTHENTICATED',
      message: 'Sign in to access media.',
      hint: 'Send a bearer token from a valid session.',
    })
  }
  if (!canAccessMedia(actor, permission)) {
    throw new CogentaError({
      code: 'FORBIDDEN',
      message: `Access denied: your roles do not grant ${permission}.`,
      hint:
        permission === 'media.write'
          ? 'Ask an administrator to grant the editor role.'
          : 'Ask an administrator to grant the viewer role.',
    })
  }
}
