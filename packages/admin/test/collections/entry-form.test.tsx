import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EntryForm } from '../../src/collections/entry-form.js'
import { truncateAtWordBoundary } from '../../src/collections/word-count.js'
import type { RichTextDocument } from '../../src/rich-text/portable-text.js'
import type { CollectionSummary } from '../../src/schema/types.js'

/**
 * Fiche 44 — the excerpt field, mounted directly (same isolation
 * `seo-panel.test.tsx` already uses for the sibling motif this fiche
 * replicates): a self-contained component, its own fetch mock, no shared
 * harness to drift out of sync with the SEO panel's own suite.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data: body }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function field(
  name: string,
  kind: CollectionSummary['fields'][number]['kind'],
  options: Record<string, unknown> = {},
): CollectionSummary['fields'][number] {
  return {
    name,
    kind,
    required: false,
    localized: false,
    unique: false,
    hasCustomValidation: false,
    options,
  }
}

function paragraph(text: string): RichTextDocument[number] {
  return {
    _key: 'p1',
    _type: 'block',
    style: 'normal',
    children: [{ _key: 'p1-span', _type: 'span', text, marks: [] }],
    markDefs: [],
  }
}

/** Mirrors the `blog` blueprint's `post` collection after fiche 44 task 1's reorder — `body` before `excerpt`. */
const POST_COLLECTION: CollectionSummary = {
  name: 'post',
  labels: { singular: 'Post', plural: 'Posts' },
  permissions: {},
  fields: [
    field('title', 'text'),
    field('body', 'richText'),
    field('excerpt', 'text', { max: 40, multiline: true }),
    field('coverImage', 'media'),
  ],
}

const NO_PROVIDER = { available: false, tools: [] }

const SUMMARISE_TOOL = {
  tool: 'assist.summarise',
  label: 'Summarise',
  description: 'Summarise a passage.',
  cost: 'low',
  needs: [],
}

function fieldLabels(container: HTMLElement): readonly string[] {
  return Array.from(container.querySelectorAll('.field__label-row label')).map(
    (node) => node.textContent,
  ) as string[]
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('field render order (fiche 44 task 1)', () => {
  it('renders the excerpt field after the body field, following the schema order', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(NO_PROVIDER)),
    )
    const { container } = render(
      <EntryForm
        collection={POST_COLLECTION}
        values={{}}
        blocks={{}}
        onChange={vi.fn()}
        onBlocksChange={vi.fn()}
        token={null}
      />,
    )

    expect(fieldLabels(container)).toEqual(['title', 'body', 'excerpt', 'coverImage'])
  })
})

describe('default auto-fill from the body text (fiche 44 task 2)', () => {
  it('fills a never-touched excerpt with the start of the body text, truncated on a word', async () => {
    const bodyText =
      'The quick brown fox jumps over the lazy dog again and again until the sentence is long.'
    const onChange = vi.fn()
    render(
      <EntryForm
        collection={POST_COLLECTION}
        values={{ body: [paragraph(bodyText)] }}
        blocks={{}}
        onChange={onChange}
        onBlocksChange={vi.fn()}
        token={null}
      />,
    )

    const expected = truncateAtWordBoundary(bodyText, 40)
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('excerpt', expected))
    expect(expected.length).toBeLessThanOrEqual(40)
    expect(bodyText.startsWith(expected)).toBe(true)
  })

  it('never overwrites an excerpt the entry already has', () => {
    const onChange = vi.fn()
    render(
      <EntryForm
        collection={POST_COLLECTION}
        values={{
          body: [paragraph('A long body that would otherwise produce a different excerpt.')],
          excerpt: 'A hand-written excerpt.',
        }}
        blocks={{}}
        onChange={onChange}
        onBlocksChange={vi.fn()}
        token={null}
      />,
    )

    expect(onChange).not.toHaveBeenCalled()
  })

  it('does nothing on a collection with no richText field to summarise', () => {
    const onChange = vi.fn()
    const noBody: CollectionSummary = {
      ...POST_COLLECTION,
      fields: [field('title', 'text'), field('excerpt', 'text', { max: 40, multiline: true })],
    }
    render(
      <EntryForm
        collection={noBody}
        values={{}}
        blocks={{}}
        onChange={onChange}
        onBlocksChange={vi.fn()}
        token={null}
      />,
    )
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('R2 — the AI button, with and without a provider', () => {
  it('never appears without a session token, and the rest of the field still works', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(NO_PROVIDER)),
    )
    const onChange = vi.fn()
    render(
      <EntryForm
        collection={POST_COLLECTION}
        values={{ body: [paragraph('Some body text for the excerpt to draw from.')] }}
        blocks={{}}
        onChange={onChange}
        onBlocksChange={vi.fn()}
        token={null}
      />,
    )

    expect(screen.queryByRole('button', { name: "Générer l'extrait avec l'IA" })).toBeNull()
    fireEvent.change(screen.getByLabelText('excerpt'), { target: { value: 'Edited by hand.' } })
    expect(onChange).toHaveBeenCalledWith('excerpt', 'Edited by hand.')
  })

  it('never appears with a session token but no AI provider configured', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(NO_PROVIDER)),
    )
    render(
      <EntryForm
        collection={POST_COLLECTION}
        values={{ body: [paragraph('Some body text.')] }}
        blocks={{}}
        onChange={vi.fn()}
        onBlocksChange={vi.fn()}
        token="t"
      />,
    )

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: "Générer l'extrait avec l'IA" })).toBeNull()
    })
  })

  it('shows the button next to the excerpt field, and applies a suggestion only on click', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const href = String(url)
      if (href.endsWith('/run')) {
        return jsonResponse({ suggestions: ['A generated excerpt.'], applied: false })
      }
      if (href.includes('/api/assistant')) {
        return jsonResponse({ available: true, tools: [SUMMARISE_TOOL] })
      }
      return jsonResponse(NO_PROVIDER)
    })
    vi.stubGlobal('fetch', fetchMock)

    const onChange = vi.fn()
    render(
      <EntryForm
        collection={POST_COLLECTION}
        values={{
          body: [paragraph('Some body text.')],
          excerpt: 'Already set, so the auto-fill stays out of the way.',
        }}
        blocks={{}}
        onChange={onChange}
        onBlocksChange={vi.fn()}
        token="t"
      />,
    )

    const button = await screen.findByRole('button', { name: "Générer l'extrait avec l'IA" })
    fireEvent.click(button)

    const suggestion = await screen.findByText('A generated excerpt.')
    fireEvent.click(suggestion)

    expect(onChange).toHaveBeenCalledWith('excerpt', 'A generated excerpt.')
  })
})
