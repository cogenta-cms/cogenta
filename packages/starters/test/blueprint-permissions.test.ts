import type { CollectionDefinition, ContentAction } from '@cogenta/schema'
import { describe, expect, it } from 'vitest'
import { BLUEPRINT_CONTENT_PACKS } from '../src/blueprints/content-packs.js'

/**
 * Every shipped blueprint has to grant the five content actions to somebody.
 *
 * `CollectionPermissions` is a `Partial<Record<ContentAction, …>>`, and an
 * action nobody declares normalises to `{ roles: [], own: false }` — nobody,
 * not even an admin. That is the right default for a permission system (deny
 * unless granted), and it is why TypeScript cannot help: omitting `publish`
 * is a perfectly well-typed way to ship a collection whose content can never
 * leave draft.
 *
 * Five of the nine blueprints did exactly that. A site scaffolded from
 * `vitrine`, `saas`, `association` or `documentation`, or a Page on `blog`,
 * offered no way to publish anything an editor wrote: the status control had
 * only "Draft", and `POST …/publish` answered `403 — collection "page" grants
 * "publish" to no role`. Nobody noticed because seeded demo content is
 * written straight into the store, bypassing the permission layer entirely,
 * so the demo site looked complete while the first hand-written entry was
 * stuck.
 *
 * This is the check nothing performed. It runs over every blueprint we ship,
 * so forgetting an action on a new one is a failing test rather than a site
 * a person cannot use.
 */

const REQUIRED: readonly ContentAction[] = ['read', 'create', 'update', 'delete', 'publish']

function rolesFor(collection: CollectionDefinition, action: ContentAction): readonly string[] {
  const rule = collection.permissions?.[action]
  if (rule === undefined) return []
  // `in`, not `Array.isArray`: the latter narrows to a mutable `any[]` and
  // loses the `readonly string[]` half of the union.
  return 'roles' in rule ? rule.roles : rule
}

describe('every blueprint we ship', () => {
  for (const [blueprint, pack] of Object.entries(BLUEPRINT_CONTENT_PACKS)) {
    describe(blueprint, () => {
      for (const collection of pack.collections) {
        for (const action of REQUIRED) {
          it(`grants "${action}" on "${collection.name}" to at least one role`, () => {
            expect(rolesFor(collection, action)).not.toEqual([])
          })
        }
      }
    })
  }

  // The rule above is only worth as much as its reading of an undeclared
  // action, so this pins that reading rather than trusting it.
  it('reads an undeclared action as granting nothing, which is what makes the rule above matter', () => {
    const undeclared: CollectionDefinition = {
      name: 'nothing_declared',
      labels: { singular: 'Thing', plural: 'Things' },
      fields: { title: { kind: 'text', options: {} } },
      permissions: { read: ['public'] },
    }
    expect(rolesFor(undeclared, 'publish')).toEqual([])
  })
})
