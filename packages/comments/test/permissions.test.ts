import { describe, expect, it } from 'vitest'
import { createCommentPermissions, DEFAULT_COMMENT_ROLES } from '../src/permissions.js'

describe('CommentPermissionLayer', () => {
  const layer = createCommentPermissions()

  it('grants admin every permission', () => {
    for (const permission of DEFAULT_COMMENT_ROLES['admin'] ?? []) {
      expect(layer.can(permission, { id: 'u1', roles: ['admin'] })).toBe(true)
    }
  })

  it('an editor can moderate and reply but not purge or change settings', () => {
    const actor = { id: 'u2', roles: ['editor'] }
    expect(layer.can('comments.moderate', actor)).toBe(true)
    expect(layer.can('comments.reply', actor)).toBe(true)
    expect(layer.can('comments.purge', actor)).toBe(false)
    expect(layer.can('comments.settings', actor)).toBe(false)
  })

  it('a viewer can only read', () => {
    const actor = { id: 'u3', roles: ['viewer'] }
    expect(layer.can('comments.read', actor)).toBe(true)
    expect(layer.can('comments.moderate', actor)).toBe(false)
  })

  it('a role with no entry grants nothing', () => {
    expect(layer.can('comments.read', { id: 'u4', roles: ['nonexistent'] })).toBe(false)
  })

  it('assert throws UNAUTHENTICATED for an anonymous actor, FORBIDDEN otherwise', () => {
    expect(() => layer.assert('comments.moderate', { id: null, roles: [] })).toThrowError(
      expect.objectContaining({ code: 'UNAUTHENTICATED' }),
    )
    expect(() => layer.assert('comments.moderate', { id: 'u5', roles: ['viewer'] })).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    )
    expect(() => layer.assert('comments.read', { id: 'u5', roles: ['viewer'] })).not.toThrow()
  })

  it('a custom role map overrides the defaults entirely', () => {
    const custom = createCommentPermissions({ roles: { moderator: ['comments.moderate'] } })
    expect(custom.can('comments.moderate', { id: 'u6', roles: ['moderator'] })).toBe(true)
    expect(custom.can('comments.moderate', { id: 'u7', roles: ['admin'] })).toBe(false)
  })
})
