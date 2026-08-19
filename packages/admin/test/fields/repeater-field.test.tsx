import { fireEvent, render, screen, within } from '@testing-library/react'
import { type JSX, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { blockDefinition } from '../../src/blocks/vocabulary.js'
import { RepeaterField } from '../../src/fields/repeater-field.js'
import type { SchemaField } from '../../src/schema/types.js'

/**
 * Fiche 03 task 2's own acceptance criterion: "ajouter trois fonctionnalités
 * à un bloc `features` sans jamais voir une accolade, et vérifier par un
 * test que la valeur enregistrée est identique, octet pour octet, à celle
 * que produisait la saisie JSON équivalente."
 *
 * The deep, three-item, add/fill/reorder/duplicate/remove version below
 * drives `stats` rather than `featureGrid` — same repeater, same mechanics,
 * but every one of `stats.items`' fields is plain text, so this test needs
 * no auth/schema context to render (`featureGrid.items` carries a `link`
 * field, which needs both — see the "every list-bearing block" suite at the
 * bottom, which covers `featureGrid` itself, without typing through `link`).
 */

function itemsFieldOf(blockName: string): SchemaField {
  const definition = blockDefinition(blockName)
  if (definition === undefined) throw new Error(`no such block: ${blockName}`)
  const field = definition.fields.find((candidate) => candidate.name === 'items')
  if (field === undefined) throw new Error(`block "${blockName}" has no "items" field`)
  return field
}

function actionsFieldOf(blockName: string): SchemaField {
  const definition = blockDefinition(blockName)
  if (definition === undefined) throw new Error(`no such block: ${blockName}`)
  const field = definition.fields.find((candidate) => candidate.name === 'actions')
  if (field === undefined) throw new Error(`block "${blockName}" has no "actions" field`)
  return field
}

/** A controlled harness, exactly like a real form: `onChange` re-renders with the new value. */
function Harness({
  field,
  initial,
  onCommit,
}: {
  readonly field: SchemaField
  readonly initial: unknown
  onCommit(value: unknown): void
}): JSX.Element {
  const [value, setValue] = useState(initial)
  return (
    <RepeaterField
      id="items"
      field={field}
      value={value}
      onChange={(next) => {
        setValue(next)
        onCommit(next)
      }}
    />
  )
}

/** Strips every `_key` (or renumbers them to a fixed placeholder) so the rest of an item can be compared byte-for-byte to a hand-authored equivalent. */
function withoutKeys(
  items: readonly Record<string, unknown>[],
): readonly Record<string, unknown>[] {
  return items.map(({ _key, ...rest }) => rest)
}

describe('RepeaterField — stats.items, a full session', () => {
  it('adds three items, fills them, reorders, duplicates and removes — the array stays exactly what the equivalent JSON would hold', () => {
    let latest: unknown = []
    const onCommit = vi.fn((value: unknown) => {
      latest = value
    })
    render(<Harness field={itemsFieldOf('stats')} initial={[]} onCommit={onCommit} />)

    function addItem(): void {
      fireEvent.click(screen.getByRole('button', { name: 'Ajouter un élément' }))
    }
    function fillLatestItem(fields: { value: string; unit?: string; label: string }): void {
      const items = screen.getAllByRole('listitem')
      const item = items[items.length - 1]
      if (item === undefined) throw new Error('expected at least one item')
      const scope = within(item)
      // `exact: false`: the label's accessible text includes the required
      // marker ("value *"), since `FieldWrapper` renders it as a nested
      // `<span>` inside the same `<label>`.
      fireEvent.change(scope.getByLabelText('value', { exact: false }), {
        target: { value: fields.value },
      })
      if (fields.unit !== undefined) {
        fireEvent.change(scope.getByLabelText('unit', { exact: false }), {
          target: { value: fields.unit },
        })
      }
      fireEvent.change(scope.getByLabelText('label', { exact: false }), {
        target: { value: fields.label },
      })
    }

    addItem()
    fillLatestItem({ value: '10k+', label: 'Sites déployés' })
    addItem()
    fillLatestItem({ value: '99.9', unit: '%', label: 'Disponibilité' })
    addItem()
    fillLatestItem({ value: '24', unit: 'h/24', label: 'Support' })

    const threeItems = latest as Record<string, unknown>[]
    expect(withoutKeys(threeItems)).toEqual([
      { value: '10k+', unit: '', label: 'Sites déployés' },
      { value: '99.9', unit: '%', label: 'Disponibilité' },
      { value: '24', unit: 'h/24', label: 'Support' },
    ])
    // `stats.items` is keyed (contract B's `statItemSchema` declares `_key`):
    // every item has one, and no two share it.
    const keys = threeItems.map((item) => item._key)
    expect(keys.every((key) => typeof key === 'string' && key.length > 0)).toBe(true)
    expect(new Set(keys).size).toBe(3)

    // Reorder: move the third item ("Support") to the front.
    fireEvent.click(screen.getByRole('button', { name: "Monter l'élément 3" }))
    fireEvent.click(screen.getByRole('button', { name: "Monter l'élément 2" }))
    let reordered = withoutKeys(latest as Record<string, unknown>[])
    expect(reordered.map((item) => item.label)).toEqual([
      'Support',
      'Sites déployés',
      'Disponibilité',
    ])

    // Duplicate the first item ("Support") — a fourth item, identical data, a fresh key.
    fireEvent.click(screen.getByRole('button', { name: "Dupliquer l'élément 1" }))
    const afterDuplicate = latest as Record<string, unknown>[]
    expect(afterDuplicate).toHaveLength(4)
    const [original, duplicate] = afterDuplicate
    if (original === undefined || duplicate === undefined) {
      throw new Error('expected the original item and its duplicate to both be present')
    }
    expect(withoutKeys([original, duplicate])).toEqual([
      { value: '24', unit: 'h/24', label: 'Support' },
      { value: '24', unit: 'h/24', label: 'Support' },
    ])
    expect(original._key).not.toBe(duplicate._key)

    // Remove the duplicate back out (position 2, the copy just inserted).
    fireEvent.click(screen.getByRole('button', { name: "Retirer l'élément 2" }))
    reordered = withoutKeys(latest as Record<string, unknown>[])
    expect(reordered.map((item) => item.label)).toEqual([
      'Support',
      'Sites déployés',
      'Disponibilité',
    ])

    // Exactly what a hand-typed JSON textarea would have produced for the
    // same three items, in the same order — the whole point of the fiche's
    // acceptance criterion.
    expect(reordered).toEqual([
      { value: '24', unit: 'h/24', label: 'Support' },
      { value: '10k+', unit: '', label: 'Sites déployés' },
      { value: '99.9', unit: '%', label: 'Disponibilité' },
    ])
  })
})

describe('RepeaterField — every list-bearing block of contract B', () => {
  // `faq` is covered separately, just below, with a single item rather than
  // two: `faq.items[].answer` is `richText`, and two Slate editors mounted
  // at once in jsdom hit a real `slate-react`/jsdom interaction bug
  // (`findPath` failing inside `useDecorations` — reproducible with plain
  // `RichTextEditor` render calls, nothing specific to `RepeaterField`) that
  // is an environment limitation of this test runner, not a defect in the
  // field being tested here.
  const LIST_FIELDS: readonly { readonly block: string; readonly field: SchemaField }[] = [
    { block: 'hero', field: actionsFieldOf('hero') },
    { block: 'featureGrid', field: itemsFieldOf('featureGrid') },
    { block: 'cta', field: actionsFieldOf('cta') },
    { block: 'gallery', field: itemsFieldOf('gallery') },
    { block: 'stats', field: itemsFieldOf('stats') },
    { block: 'logos', field: itemsFieldOf('logos') },
  ]

  for (const { block, field } of LIST_FIELDS) {
    it(`renders "${block}.${field.name}" and preserves the array on a pure reorder`, () => {
      const options = field.options as {
        readonly items: readonly { readonly name: string }[]
        readonly keyed?: boolean
      }
      const keyed = options.keyed ?? true

      function blank(index: number): Record<string, unknown> {
        const data: Record<string, unknown> = {}
        for (const itemField of options.items) data[itemField.name] = null
        if (keyed) data._key = `seed-${index}`
        return data
      }

      const initial = [blank(0), blank(1)]
      const onChange = vi.fn()
      render(<RepeaterField id="items" field={field} value={initial} onChange={onChange} />)

      // Two items, so exactly one is keyboard-reachable to move up (the
      // second) — proving the reorder is real without a single instance of
      // simulated drag-and-drop (fiche 03's own rule: dragging is never the
      // only way).
      const moveButtons = screen
        .getAllByRole('button')
        .filter((button) => /↑/.test(button.textContent ?? ''))
      const enabledMoveUp = moveButtons.at(-1)
      if (enabledMoveUp === undefined) throw new Error('expected a move-up button')
      fireEvent.click(enabledMoveUp)

      expect(onChange).toHaveBeenCalledWith([blank(1), blank(0)])
    })
  }

  it('renders "faq.items" without crashing, with its keyed item shape intact', () => {
    const field = itemsFieldOf('faq')
    const initial = [{ _key: 'seed-0', question: null, answer: null }]
    render(<RepeaterField id="items" field={field} value={initial} onChange={vi.fn()} />)

    expect(screen.getByRole('listitem')).toBeDefined()
    expect(screen.getByLabelText('question', { exact: false })).toBeDefined()
  })
})
