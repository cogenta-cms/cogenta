import { isCogentaError } from '@cogenta/core'
import {
  type CollectionDefinition,
  type ContentAction,
  defineTaxonomy,
  type RolePermissionOverrides,
} from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import {
  assertAuthenticated,
  createPermissionLayer,
  previewCovers,
} from '../../src/access/index.js'
import type { AccessContext, Actor, Filter, QueryRequest } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'
import { article, COLLECTIONS, comment, page } from './collections.js'

const NOW = 1_760_000_000_000

const layer = createPermissionLayer({ collections: COLLECTIONS, now: () => NOW })

const ACTORS: Readonly<Record<string, Actor>> = {
  public: ANONYMOUS,
  viewer: { id: 'user-viewer', roles: ['viewer'] },
  editor: { id: 'user-editor', roles: ['editor'] },
  admin: { id: 'user-admin', roles: ['admin'] },
}

function contextFor(role: string): AccessContext {
  const actor = ACTORS[role]
  if (actor === undefined) throw new Error(`no fixture actor for role "${role}"`)
  return { actor }
}

/**
 * The matrix the spec requires: one expectation per role, per action, per
 * collection. Written out by hand rather than computed, because a table derived
 * from the same rules as the code under test proves nothing.
 */
type RoleRow = Readonly<Record<string, boolean>>
type ActionTable = Readonly<Record<ContentAction, RoleRow>>

const ARTICLE_MATRIX: ActionTable = {
  read: { public: true, viewer: true, editor: true, admin: true },
  create: { public: false, viewer: false, editor: true, admin: true },
  update: { public: false, viewer: false, editor: true, admin: true },
  delete: { public: false, viewer: false, editor: false, admin: true },
  publish: { public: false, viewer: false, editor: false, admin: true },
}

const PAGE_MATRIX: ActionTable = {
  read: { public: false, viewer: true, editor: true, admin: true },
  create: { public: false, viewer: false, editor: false, admin: true },
  update: { public: false, viewer: false, editor: true, admin: true },
  delete: { public: false, viewer: false, editor: false, admin: true },
  publish: { public: false, viewer: false, editor: false, admin: true },
}

const COMMENT_MATRIX: ActionTable = {
  read: { public: true, viewer: true, editor: true, admin: true },
  create: { public: true, viewer: true, editor: true, admin: true },
  update: { public: false, viewer: false, editor: true, admin: true },
  delete: { public: false, viewer: false, editor: false, admin: true },
  // `publish` is not declared on `comment`: an undeclared action is denied.
  publish: { public: false, viewer: false, editor: false, admin: false },
}

const MATRIX: readonly (readonly [CollectionDefinition, ActionTable])[] = [
  [article, ARTICLE_MATRIX],
  [page, PAGE_MATRIX],
  [comment, COMMENT_MATRIX],
]

/** Which roles may see content that is not published, per collection. */
const UNPUBLISHED_MATRIX: readonly (readonly [CollectionDefinition, RoleRow])[] = [
  [article, { public: false, viewer: false, editor: true, admin: true }],
  [page, { public: false, viewer: false, editor: true, admin: true }],
  [comment, { public: false, viewer: false, editor: true, admin: true }],
]

describe('the permission matrix of role, action and collection', () => {
  for (const [collection, table] of MATRIX) {
    for (const [action, row] of Object.entries(table) as [ContentAction, RoleRow][]) {
      for (const [role, expected] of Object.entries(row)) {
        it(`${role} ${expected ? 'may' : 'may not'} ${action} ${collection.name}`, () => {
          expect(layer.can(action, collection, contextFor(role)).allowed).toBe(expected)
        })
      }
    }
  }
})

describe('reading content that is not published', () => {
  for (const [collection, row] of UNPUBLISHED_MATRIX) {
    for (const [role, expected] of Object.entries(row)) {
      it(`${role} ${expected ? 'sees' : 'never sees'} unpublished ${collection.name}`, () => {
        expect(layer.canReadUnpublished(collection, contextFor(role)).allowed).toBe(expected)
      })
    }
  }

  it('refuses an anonymous actor even when the collection lets public create', () => {
    const decision = layer.canReadUnpublished(comment, contextFor('public'))
    expect(decision.allowed).toBe(false)
    expect(decision).toHaveProperty('reason', expect.stringContaining('public role'))
  })

  it('refuses an actor whose only role is public even when it is signed in', () => {
    const context: AccessContext = { actor: { id: 'user-anon-session', roles: ['public'] } }
    expect(layer.canReadUnpublished(article, context).allowed).toBe(false)
  })

  it('refuses public even on a site that mistakenly grants it update', () => {
    const misconfigured: CollectionDefinition = {
      ...article,
      permissions: { ...article.permissions, update: ['public', 'editor'] },
    }
    expect(layer.canReadUnpublished(misconfigured, contextFor('public')).allowed).toBe(false)
  })

  it('refuses a role that may read but may not author', () => {
    const decision = layer.canReadUnpublished(page, contextFor('viewer'))
    expect(decision.allowed).toBe(false)
  })
})

/**
 * A stand-in for what a transport does with the layer's answers: the acceptance
 * criterion is about routes, so the criterion is tested on a read path, not on
 * a boolean.
 */
interface Entry {
  readonly id: string
  readonly status: 'draft' | 'published'
}

const ENTRIES: readonly Entry[] = [
  { id: 'entry-a', status: 'draft' },
  { id: 'entry-b', status: 'draft' },
  { id: 'entry-c', status: 'published' },
]

function serve(
  collection: CollectionDefinition,
  context: AccessContext,
  _request: QueryRequest,
): readonly Entry[] {
  layer.assert('read', collection, context)
  const unpublished = layer.canReadUnpublished(collection, context).allowed
  return ENTRIES.filter((entry) => {
    if (entry.status === 'published') return true
    if (context.preview !== undefined) {
      return previewCovers(context, collection, entry.id, () => NOW)
    }
    return unpublished
  })
}

describe('the public role on a read route', () => {
  const draftFilter: Filter = { field: 'status', operator: 'eq', value: 'draft' }

  it('returns no draft when the query asks for drafts explicitly', () => {
    const served = serve(article, contextFor('public'), {
      collection: 'article',
      filter: draftFilter,
    })
    expect(served.map((entry) => entry.id)).toEqual(['entry-c'])
  })

  it('returns no draft when the query combines filters that ask for drafts', () => {
    const served = serve(article, contextFor('public'), {
      collection: 'article',
      filter: { or: [draftFilter, { field: 'id', operator: 'in', value: ['entry-a', 'entry-b'] }] },
    })
    expect(served.every((entry) => entry.status === 'published')).toBe(true)
  })

  it('still returns drafts to an editor on the same route', () => {
    const served = serve(article, contextFor('editor'), { collection: 'article' })
    expect(served).toHaveLength(3)
  })
})

describe('a preview grant on a read route', () => {
  const grantForA: AccessContext = {
    actor: ANONYMOUS,
    preview: { collection: 'article', entryId: 'entry-a', expiresAt: NOW + 60_000 },
  }

  it('opens the granted draft to an anonymous visitor', () => {
    const served = serve(article, grantForA, { collection: 'article' })
    expect(served.map((entry) => entry.id)).toEqual(['entry-a', 'entry-c'])
  })

  it('does not open any other draft of the same collection', () => {
    expect(previewCovers(grantForA, article, 'entry-b', () => NOW)).toBe(false)
  })

  it('does not apply to another collection', () => {
    const context: AccessContext = { actor: ANONYMOUS, preview: grantForA.preview }
    expect(layer.canReadUnpublished(page, context).allowed).toBe(false)
    expect(previewCovers(context, page, 'entry-a', () => NOW)).toBe(false)
  })

  it('gives nothing once it has expired', () => {
    const expired: AccessContext = {
      actor: ANONYMOUS,
      preview: { collection: 'article', entryId: 'entry-a', expiresAt: NOW - 1 },
    }
    expect(layer.canReadUnpublished(article, expired).allowed).toBe(false)
    expect(previewCovers(expired, article, 'entry-a', () => NOW)).toBe(false)
    expect(serve(article, expired, { collection: 'article' }).map((entry) => entry.id)).toEqual([
      'entry-c',
    ])
  })

  it('opens a collection the actor could not otherwise read at all', () => {
    const context: AccessContext = {
      actor: ANONYMOUS,
      preview: { collection: 'page', entryId: 'entry-a', expiresAt: NOW + 60_000 },
    }
    expect(layer.can('read', page, context).allowed).toBe(true)
  })

  it('never grants anything beyond reading', () => {
    for (const action of ['create', 'update', 'delete', 'publish'] as const) {
      expect(layer.can(action, article, grantForA).allowed).toBe(false)
    }
  })
})

describe('assert', () => {
  it('is silent when the action is allowed', () => {
    expect(() => layer.assert('read', article, contextFor('public'))).not.toThrow()
  })

  it('throws a FORBIDDEN CogentaError naming the roles that would work', () => {
    try {
      layer.assert('delete', article, contextFor('editor'))
      expect.unreachable('assert should have refused')
    } catch (error) {
      if (!isCogentaError(error)) throw error
      expect(error.code).toBe('FORBIDDEN')
      expect(error.message).toContain('admin')
      expect(error.hint).toBeDefined()
    }
  })

  it('does not leak the actor identifier into the error details', () => {
    try {
      layer.assert('delete', article, contextFor('editor'))
      expect.unreachable('assert should have refused')
    } catch (error) {
      if (!isCogentaError(error)) throw error
      expect(JSON.stringify(error.details)).not.toContain('user-editor')
    }
  })
})

describe('the declared role set', () => {
  it('accepts a role the site invented, because the set is open', () => {
    const custom: CollectionDefinition = {
      ...article,
      permissions: { ...article.permissions, publish: ['redactor_in_chief'] },
    }
    const customLayer = createPermissionLayer({
      roles: ['public', 'viewer', 'editor', 'admin', 'redactor_in_chief'],
      collections: [custom],
    })
    const context: AccessContext = { actor: { id: 'u', roles: ['redactor_in_chief'] } }
    expect(customLayer.can('publish', custom, context).allowed).toBe(true)
  })

  it('rejects a collection granting a role the site never declared', () => {
    const typo: CollectionDefinition = {
      ...article,
      permissions: { ...article.permissions, publish: ['admn'] },
    }
    try {
      createPermissionLayer({ collections: [typo] })
      expect.unreachable('an undeclared role is a configuration error')
    } catch (error) {
      if (!isCogentaError(error)) throw error
      expect(error.code).toBe('CONFIG_INVALID')
      expect(error.message).toContain('admn')
    }
  })

  it('refuses an actor carrying a role the collection does not grant', () => {
    const context: AccessContext = { actor: { id: 'u', roles: ['ghost'] } }
    expect(layer.can('publish', article, context).allowed).toBe(false)
  })
})

describe('assertAuthenticated', () => {
  it('throws UNAUTHENTICATED for an anonymous actor', () => {
    try {
      assertAuthenticated(contextFor('public'))
      expect.unreachable('an anonymous actor is not authenticated')
    } catch (error) {
      if (!isCogentaError(error)) throw error
      expect(error.code).toBe('UNAUTHENTICATED')
    }
  })

  it('is silent for a signed-in actor', () => {
    expect(() => assertAuthenticated(contextFor('editor'))).not.toThrow()
  })
})

/**
 * Fiche 63, ADR-0028: role permission overrides in the database. The whole
 * contract is one sentence — checked before `collection.permissions`, never
 * after — so every test here proves the direction, not merely that an
 * override "does something".
 */
describe('database role permission overrides (fiche 63, ADR-0028)', () => {
  type Rule = { readonly roles: readonly string[]; readonly own?: boolean }

  function overridesFrom(
    collectionRules: Readonly<Record<string, Rule>> = {},
    taxonomyRules: Readonly<Record<string, Rule>> = {},
  ): RolePermissionOverrides {
    return {
      getCollectionRule: (collection, action) => {
        const rule = collectionRules[`${collection}:${action}`]
        return rule === undefined ? undefined : { roles: rule.roles, own: rule.own ?? false }
      },
      getTaxonomyRule: (taxonomy, action) => {
        const rule = taxonomyRules[`${taxonomy}:${action}`]
        return rule === undefined ? undefined : { roles: rule.roles, own: rule.own ?? false }
      },
    }
  }

  it('falls straight through to the file when the overlay has nothing for this target', () => {
    const withEmptyOverrides = createPermissionLayer({
      collections: COLLECTIONS,
      rolePermissionOverrides: overridesFrom(),
    })
    // Byte-for-byte the same answer as a layer with no overlay wired in at
    // all, for every cell of the matrix already proven above — an absent
    // override must never change a single decision.
    for (const [collection, table] of MATRIX) {
      for (const [action, row] of Object.entries(table) as [ContentAction, RoleRow][]) {
        for (const role of Object.keys(row)) {
          expect(withEmptyOverrides.can(action, collection, contextFor(role)).allowed).toBe(
            layer.can(action, collection, contextFor(role)).allowed,
          )
        }
      }
    }
  })

  it('a table override widens access the file alone would refuse', () => {
    // The file grants `article.create` to editor/admin only (see collections.ts).
    const widened = createPermissionLayer({
      collections: COLLECTIONS,
      rolePermissionOverrides: overridesFrom({ 'article:create': { roles: ['viewer'] } }),
    })
    expect(widened.can('create', article, contextFor('viewer')).allowed).toBe(true)
  })

  it('a table override REPLACES the file rule, it does not merge with it', () => {
    // The override names only "viewer" — editor, who the file alone would
    // still allow, is no longer granted once an override exists for this
    // exact (collection, action).
    const replaced = createPermissionLayer({
      collections: COLLECTIONS,
      rolePermissionOverrides: overridesFrom({ 'article:create': { roles: ['viewer'] } }),
    })
    expect(replaced.can('create', article, contextFor('editor')).allowed).toBe(false)
  })

  it('a table override can narrow access the file alone would grant — including for admin', () => {
    // The file grants `article.delete` to admin. An empty override roles
    // list is a deliberate "nobody", and it must actually win.
    const narrowed = createPermissionLayer({
      collections: COLLECTIONS,
      rolePermissionOverrides: overridesFrom({ 'article:delete': { roles: [] } }),
    })
    expect(narrowed.can('delete', article, contextFor('admin')).allowed).toBe(false)
  })

  it('never lets the file re-open a door the table already closed — priority is table, then file, never the reverse', () => {
    // Simulates exactly the scenario ADR-0028 names: a deployment regresses
    // `cogenta.schema.*` back to a wider rule, while the database override
    // (an admin's earlier, deliberate narrowing) is still in place.
    const regressedFile: CollectionDefinition = {
      ...article,
      permissions: { ...article.permissions, delete: ['editor', 'admin'] },
    }
    const guarded = createPermissionLayer({
      collections: [regressedFile],
      rolePermissionOverrides: overridesFrom({ 'article:delete': { roles: [] } }),
    })
    expect(guarded.can('delete', regressedFile, contextFor('admin')).allowed).toBe(false)
    expect(guarded.can('delete', regressedFile, contextFor('editor')).allowed).toBe(false)
  })

  it('carries "own" from the override, not from the file', () => {
    const ownOnly = createPermissionLayer({
      collections: COLLECTIONS,
      rolePermissionOverrides: overridesFrom({
        'article:update': { roles: ['editor'], own: true },
      }),
    })
    const context: AccessContext = { actor: { id: 'author-1', roles: ['editor'] } }
    expect(ownOnly.can('update', article, context, 'author-1').allowed).toBe(true)
    expect(ownOnly.can('update', article, context, 'someone-else').allowed).toBe(false)
  })

  it('an override also governs draft access, through the same effective rule', () => {
    // The file already lets "viewer" read `page`, but never author it
    // (`create` is admin-only) — so a viewer never sees a draft. An override
    // that grants `create` to "viewer" must be what `canReadUnpublished`
    // reasons about too, since it derives draft access from the very same
    // authoring actions `grantedRoles` now reads through the overlay.
    const withoutOverride = createPermissionLayer({ collections: COLLECTIONS })
    const context: AccessContext = { actor: { id: 'u', roles: ['viewer'] } }
    expect(withoutOverride.canReadUnpublished(page, context).allowed).toBe(false)

    const opened = createPermissionLayer({
      collections: COLLECTIONS,
      rolePermissionOverrides: overridesFrom({ 'page:create': { roles: ['viewer'] } }),
    })
    expect(opened.canReadUnpublished(page, context).allowed).toBe(true)
  })

  describe('the same priority on a taxonomy', () => {
    const category = defineTaxonomy({
      name: 'category',
      labels: { singular: { en: 'Category' } },
      permissions: { read: ['public'], create: ['editor'] },
    })

    it('falls back to the file when no override exists', () => {
      const withNoOverride = createPermissionLayer({
        collections: COLLECTIONS,
        rolePermissionOverrides: overridesFrom(),
      })
      expect(withNoOverride.canTerm('create', category, contextFor('editor')).allowed).toBe(true)
      expect(withNoOverride.canTerm('create', category, contextFor('viewer')).allowed).toBe(false)
    })

    it('a table override replaces the taxonomy file rule', () => {
      const widened = createPermissionLayer({
        collections: COLLECTIONS,
        rolePermissionOverrides: overridesFrom({}, { 'category:create': { roles: ['viewer'] } }),
      })
      expect(widened.canTerm('create', category, contextFor('viewer')).allowed).toBe(true)
      expect(widened.canTerm('create', category, contextFor('editor')).allowed).toBe(false)
    })

    it('a collection and a same-named taxonomy each read their own override', () => {
      const sameName = createPermissionLayer({
        collections: [{ ...article, name: 'category' }],
        rolePermissionOverrides: overridesFrom(
          { 'category:read': { roles: ['viewer'] } },
          { 'category:read': { roles: ['admin'] } },
        ),
      })
      expect(
        sameName.can('read', { ...article, name: 'category' }, contextFor('viewer')).allowed,
      ).toBe(true)
      expect(sameName.canTerm('read', category, contextFor('viewer')).allowed).toBe(false)
      expect(sameName.canTerm('read', category, contextFor('admin')).allowed).toBe(true)
    })
  })
})
