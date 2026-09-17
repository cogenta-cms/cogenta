import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BlockForm } from '../../src/blocks/block-form.js'
import { BLOCK_VOCABULARY } from '../../src/blocks/vocabulary.js'

/**
 * L40 in the page builder: a list of contents can be ordered by a date the
 * listed collection declares, and cut at "now". Both controls only exist when
 * they mean something — a collection with no date offers neither.
 */

const EVENT = {
  name: 'event',
  labels: { singular: 'Événement', plural: 'Événements' },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
  fields: [
    {
      name: 'startsAt',
      kind: 'datetime' as const,
      required: false,
      localized: false,
      unique: false,
      hasCustomValidation: false,
      admin: { label: 'Début' },
      options: {},
    },
    {
      name: 'title',
      kind: 'text' as const,
      required: true,
      localized: false,
      unique: false,
      hasCustomValidation: false,
      options: {},
    },
  ],
}

const PAGE = {
  ...EVENT,
  name: 'page',
  labels: { singular: 'Page', plural: 'Pages' },
  fields: [EVENT.fields[1]],
}

vi.mock('../../src/schema/schema-context.js', () => ({
  useSchema: () => ({
    status: 'ready',
    schema: { collections: [EVENT, PAGE], taxonomies: [] },
  }),
}))

vi.mock('react-router', () => ({
  Link: ({ children }: { readonly children: React.ReactNode }) => <span>{children}</span>,
}))

const LIST = BLOCK_VOCABULARY.find((block) => block.name === 'collectionList')

function renderList(data: Readonly<Record<string, unknown>>, onChange = vi.fn()) {
  if (LIST === undefined) throw new Error('the vocabulary has no collectionList block')
  render(<BlockForm idPrefix="b1" definition={LIST} data={data} onChange={onChange} />)
  return onChange
}

describe('a list of contents, ordered by the collection’s own date', () => {
  it('offers the declared dates of the listed collection beside the system columns', () => {
    renderList({
      collection: 'event',
      layout: 'list',
      sort: { field: 'createdAt', direction: 'desc' },
    })

    const field = screen.getByLabelText(/Trier par/u) as HTMLSelectElement
    const options = [...field.options].map((option) => option.value)
    expect(options).toEqual(expect.arrayContaining(['createdAt', 'updatedAt', 'id', 'startsAt']))
    // The label an editor reads is the one the schema declares.
    expect([...field.options].find((option) => option.value === 'startsAt')?.textContent).toBe(
      'Début',
    )
  })

  it('offers no date when the listed collection declares none', () => {
    renderList({
      collection: 'page',
      layout: 'list',
      sort: { field: 'createdAt', direction: 'desc' },
    })

    const field = screen.getByLabelText(/Trier par/u) as HTMLSelectElement
    // The empty option is the select's own "choose one"; what matters is that
    // no field of this collection joins the three system columns.
    expect([...field.options].map((option) => option.value)).toEqual([
      '',
      'createdAt',
      'updatedAt',
      'id',
    ])
    expect(screen.queryByLabelText('Seulement à venir')).toBeNull()
  })

  it('shows "only what is still to come" once the list is ordered by a date, and writes the relative token', () => {
    const onChange = renderList({
      collection: 'event',
      layout: 'list',
      sort: { field: 'startsAt', direction: 'asc' },
    })

    const upcoming = screen.getByLabelText('Seulement à venir')
    expect((upcoming as HTMLInputElement).checked).toBe(false)

    fireEvent.click(upcoming)

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ filter: { startsAt: { gte: '$now' } } }),
    )
  })

  it('does not offer it when the list is ordered by a system column', () => {
    renderList({
      collection: 'event',
      layout: 'list',
      sort: { field: 'createdAt', direction: 'desc' },
    })

    expect(screen.queryByLabelText('Seulement à venir')).toBeNull()
  })
})
