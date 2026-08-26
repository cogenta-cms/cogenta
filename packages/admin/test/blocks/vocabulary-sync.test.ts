import type { AnyBlockField } from '@cogenta/blocks'
import { VOCABULARY } from '@cogenta/blocks'
import { describe, expect, it } from 'vitest'
import {
  BLOCK_VOCABULARY,
  type ItemFieldDefinition,
  type ItemFieldKind,
} from '../../src/blocks/vocabulary.js'

/**
 * The decision fiche 03 ("Décisions à prendre") asked for: keep
 * `packages/admin/src/blocks/vocabulary.ts` as a hand-written copy — never
 * served from `/api/schema`, which sends no block manifest at all — but
 * prove the copy has not drifted from `packages/blocks/src/vocabulary.ts`,
 * the real contract B, instead of trusting a comment to keep them in sync.
 *
 * Serving the vocabulary from an endpoint was the fiche's other option. It
 * was not taken: contract B is frozen (`blocks@1.0`), so a manifest route
 * would be new server surface for a shape that never changes at runtime,
 * and the admin already has a working, hand-authored copy that just needed
 * this test to stop drifting silently. If contract B ever gains a
 * thirteenth block or reopens for editing, revisit that trade then.
 *
 * The check does not introspect Zod internals (which would pin this test to
 * an exact Zod version's shape) — it feeds synthetic values, built from what
 * the admin copy *says* each field looks like, through the real validator
 * `defineBlock` produces, and asserts they are accepted. A field the admin
 * renamed, dropped, or mis-typed relative to contract B fails this the same
 * way a real save would.
 */

function realBlock(name: string) {
  const found = VOCABULARY.find((block) => block.name === name)
  if (found === undefined) throw new Error(`contract B has no block named "${name}"`)
  return found
}

function sampleForItemField(itemField: ItemFieldDefinition): unknown {
  return sampleFor(itemField.kind, itemField.options)
}

function sampleFor(kind: ItemFieldKind, options: Readonly<Record<string, unknown>>): unknown {
  switch (kind) {
    case 'text':
      return 'sample'
    case 'richText':
      return []
    case 'media':
      return '01920000-0000-7000-8000-000000000000'
    case 'select': {
      const choices = options['options'] as readonly { readonly value: string }[]
      return choices[0]?.value ?? ''
    }
    case 'link':
      return { href: 'https://example.test/' }
    case 'boolean':
      return true
    case 'number':
      return 1
    case 'color':
      return '#112233'
    case 'relation':
      return '01920000-0000-7000-8000-000000000000'
    case 'json': {
      // Opaque by construction — no shape to introspect the way the other
      // kinds have. A required `json` item field must carry an explicit
      // `options.sample` (e.g. `[]` for an array-shaped field like
      // `pricingTable.tiers[].features`) rather than guess one generically,
      // which would silently pass for an array-shaped field and just as
      // silently fail for an object-shaped one.
      if ('sample' in options) return options['sample']
      throw new Error(
        `item field "${kind}" is required but declares no options.sample for vocabulary-sync.test.ts to use`,
      )
    }
    default:
      throw new Error(`vocabulary-sync.test.ts has no sample builder for item field kind "${kind}"`)
  }
}

describe('the admin copy of contract B matches the real vocabulary', () => {
  it('declares exactly the same block names', () => {
    expect(BLOCK_VOCABULARY.map((block) => block.name).sort()).toEqual(
      [...VOCABULARY].map((block) => block.name).sort(),
    )
  })

  for (const adminBlock of BLOCK_VOCABULARY) {
    describe(`block "${adminBlock.name}"`, () => {
      const contractBlock = realBlock(adminBlock.name)

      it('declares exactly the same field names', () => {
        expect(adminBlock.fields.map((field) => field.name).sort()).toEqual(
          Object.keys(contractBlock.schema).sort(),
        )
      })

      // `contractBlock.schema` is typed as the union of every block's exact
      // field map (from a `readonly [...]` tuple of specific `defineBlock`
      // calls), which TypeScript cannot index by an arbitrary string — this
      // widens it to the shape every block's schema actually is at runtime,
      // a `Record` of named fields, for the loop below only.
      const schema = contractBlock.schema as Record<string, AnyBlockField>

      for (const adminField of adminBlock.fields) {
        const contractField = schema[adminField.name]

        it(`"${adminField.name}" matches contract B's required/localized flags`, () => {
          expect(contractField).toBeDefined()
          if (contractField === undefined) return
          expect(adminField.required).toBe(contractField.required)
          expect(adminField.localized).toBe(contractField.localized)
        })

        const isList =
          adminField.kind === 'json' &&
          (adminField.options as { readonly list?: boolean }).list === true

        if (isList) {
          it(`"${adminField.name}" is an f.list(...) on both sides, with the same item shape`, () => {
            expect(contractField?.kind).toBe('json')
            expect((contractField?.options as { readonly list?: boolean } | undefined)?.list).toBe(
              true,
            )

            const items = (adminField.options as { readonly items: readonly ItemFieldDefinition[] })
              .items
            const keyed = (adminField.options as { readonly keyed?: boolean }).keyed ?? true
            const sample: Record<string, unknown> = {}
            for (const itemField of items) {
              // An optional item field is left out of the sample rather than
              // given a guessed value: some carry a format constraint no
              // generic sample can satisfy for every kind (`logos.items[].url`
              // is `z.url()`), and "not provided" is exactly what "optional"
              // means on both sides anyway.
              if (!itemField.required) continue
              sample[itemField.name] = sampleForItemField(itemField)
            }
            if (keyed) sample._key = 'k1'

            const result = contractField?.zod.safeParse([sample])
            expect(
              result?.success,
              result?.success === false ? JSON.stringify(result.error.issues) : undefined,
            ).toBe(true)
          })
        } else {
          it(`"${adminField.name}" is the same simple kind on both sides`, () => {
            expect(adminField.kind).toBe(contractField?.kind)
          })
        }
      }
    })
  }
})
