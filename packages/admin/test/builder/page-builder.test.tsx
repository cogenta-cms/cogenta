import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { type JSX, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContentBlock } from '../../src/api/content-client.js'
import { PageBuilder } from '../../src/builder/page-builder.js'

/**
 * The builder as an editor actually drives it (L16).
 *
 * `fetch` is stubbed with a renderer that echoes the block list it was sent —
 * *not* to pretend blocks render, but because what this file has to prove is
 * the admin's half: which list the builder sends, in what order, and what it
 * hands back to the entry form. That the returned HTML is the real page is
 * proven where it can be, against a real server, in
 * `packages/cli/test/serve-builder.test.ts`.
 */

const START: readonly ContentBlock[] = [
  { key: 'k-hero', type: 'hero', data: { title: 'A CMS that runs itself' } },
  { key: 'k-cta', type: 'cta', data: { title: 'Try it' } },
]

/** The shape `@cogenta/theme-canonical` really serialises, for the keys it is given. */
function pageFor(blocks: readonly ContentBlock[]): string {
  const sections = blocks
    .map(
      (block) =>
        `<section class="cg-block" data-block="${block.type}" data-block-key="${block.key}">` +
        `<h2 data-field="title">${String(block.data['title'] ?? '')}</h2></section>`,
    )
    .join('')
  return `<!doctype html><html lang="en"><head><title>Page</title></head><body><main class="cg-main" id="cg-main">${sections}</main></body></html>`
}

let sentBlocks: (readonly ContentBlock[])[] = []

beforeEach(() => {
  sentBlocks = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        blocks: Record<string, readonly ContentBlock[]>
      }
      const zone = body.blocks['body'] ?? []
      sentBlocks = [...sentBlocks, zone]
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { html: pageFor(zone) } }),
      } as unknown as Response
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Mounts the builder with the parent state the entry editor really gives it. */
function Harness({
  onChange,
  initial = START,
}: {
  onChange?: (blocks: readonly ContentBlock[]) => void
  readonly initial?: readonly ContentBlock[]
}): JSX.Element {
  const [blocks, setBlocks] = useState<readonly ContentBlock[]>(initial)
  return (
    <PageBuilder
      token="token"
      collection="page"
      entryId="entry-1"
      zone="body"
      blocks={blocks}
      onBlocksChange={(next) => {
        setBlocks(next)
        onChange?.(next)
      }}
    />
  )
}

describe('the page builder, driven the way an editor drives it', () => {
  it('lists the page’s blocks in order, by their human names', async () => {
    render(<Harness />)
    const outline = screen.getByRole('list', { name: 'Blocs de la page' })
    const items = within(outline).getAllByRole('listitem')
    expect(items[0]?.textContent).toContain('Héros')
    expect(items[1]?.textContent).toContain('Appel à action')
  })

  it('asks the server to render the page, and only the block list', async () => {
    render(<Harness />)
    await waitFor(() => expect(sentBlocks).toHaveLength(1))
    expect(sentBlocks[0]).toEqual(START)
  })

  it('moves a block down and hands the new order to the entry form', async () => {
    const onChange = vi.fn<(blocks: readonly ContentBlock[]) => void>()
    render(<Harness onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Descendre le bloc 1' }))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]?.[0]?.map((block) => block.key)).toEqual(['k-cta', 'k-hero'])
  })

  it('undoes the move, and redoes it, from the toolbar', async () => {
    const onChange = vi.fn<(blocks: readonly ContentBlock[]) => void>()
    render(<Harness onChange={onChange} />)

    const undo = screen.getByRole('button', { name: 'Annuler' })
    const redo = screen.getByRole('button', { name: 'Rétablir' })
    expect((undo as HTMLButtonElement).disabled).toBe(true)
    expect((redo as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Descendre le bloc 1' }))
    await waitFor(() => expect((undo as HTMLButtonElement).disabled).toBe(false))

    fireEvent.click(undo)
    await waitFor(() =>
      expect(onChange.mock.calls.at(-1)?.[0]?.map((block) => block.key)).toEqual([
        'k-hero',
        'k-cta',
      ]),
    )

    fireEvent.click(redo)
    await waitFor(() =>
      expect(onChange.mock.calls.at(-1)?.[0]?.map((block) => block.key)).toEqual([
        'k-cta',
        'k-hero',
      ]),
    )
  })

  it('adds a block from the library, and selects it so its fields are there to fill', async () => {
    const onChange = vi.fn<(blocks: readonly ContentBlock[]) => void>()
    render(<Harness onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: /^Citation/u }))

    const added = onChange.mock.calls.at(-1)?.[0] ?? []
    expect(added).toHaveLength(3)
    expect(added[2]?.type).toBe('quote')
    // The detail panel is now showing that block rather than the empty state.
    expect(screen.queryByText(/Sélectionnez un bloc/u)).toBeNull()
  })

  it('narrows the library by search and by category', async () => {
    render(<Harness />)

    fireEvent.change(screen.getByLabelText('Rechercher un bloc'), { target: { value: 'galerie' } })
    expect(screen.getByRole('button', { name: /^Galerie/u })).not.toBeNull()
    expect(screen.queryByRole('button', { name: /^Citation/u })).toBeNull()

    fireEvent.change(screen.getByLabelText('Rechercher un bloc'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Texte' }))
    expect(screen.getByRole('button', { name: /^Citation/u })).not.toBeNull()
    expect(screen.queryByRole('button', { name: /^Galerie/u })).toBeNull()
  })

  it('says so plainly when nothing matches, rather than showing a guess', async () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('Rechercher un bloc'), { target: { value: 'zzzz' } })
    expect(screen.getByText(/Aucun bloc ne correspond/u)).not.toBeNull()
  })

  it('removes a block', async () => {
    const onChange = vi.fn<(blocks: readonly ContentBlock[]) => void>()
    render(<Harness onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Retirer le bloc 2' }))
    expect(onChange.mock.calls.at(-1)?.[0]?.map((block) => block.key)).toEqual(['k-hero'])
  })

  it('offers the three preview widths, one of them chosen at a time', async () => {
    render(<Harness />)
    const group = screen.getByRole('group', { name: "Largeur d'aperçu" })
    const desktop = within(group).getByRole('button', { name: 'Ordinateur' })
    const mobile = within(group).getByRole('button', { name: 'Mobile' })

    expect(desktop.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(mobile)
    expect(mobile.getAttribute('aria-pressed')).toBe('true')
    expect(desktop.getAttribute('aria-pressed')).toBe('false')
  })

  it('lays the frame out at a real width, so the theme’s own media queries apply (L20 audit point 10)', async () => {
    const { container } = render(<Harness />)
    const frame = container.querySelector('iframe')
    // "Ordinateur" is a real desktop width — never a percentage of whatever
    // room the panel happens to have — so the theme's own desktop media
    // queries see a genuine desktop viewport, not a guess.
    expect(frame?.style.width).toBe('1440px')

    fireEvent.click(screen.getByRole('button', { name: 'Mobile' }))
    expect(frame?.style.width).toBe('375px')
  })

  it('never lets the frame report a narrower layout width than its real target, even scaled down', async () => {
    const { container } = render(<Harness />)
    const wrapper = container.querySelector('.overflow-auto') as HTMLElement
    const frame = container.querySelector('iframe') as HTMLIFrameElement

    // A panel narrower than "Ordinateur"'s real 1440px target (L20 audit
    // point 10) — jsdom never lays anything out for real, so the width has
    // to be forced the same way a real, narrow admin window would produce it.
    Object.defineProperty(wrapper, 'clientWidth', { configurable: true, value: 720 })
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      paddingLeft: '0px',
      paddingRight: '0px',
    } as CSSStyleDeclaration)
    fireEvent(window, new Event('resize'))

    // The frame's own *layout* width — what the theme's media queries
    // resolve against — must still read the real, unscaled 1440.
    expect(frame.style.width).toBe('1440px')
    // Only the display shrinks, and it shrinks enough to actually fit —
    // this is what stands between the panel and a horizontal scrollbar.
    expect(frame.style.transform).toBe('scale(0.5)')

    vi.restoreAllMocks()
  })

  it('re-renders the page after an edit, with the edited list', async () => {
    render(<Harness />)
    await waitFor(() => expect(sentBlocks).toHaveLength(1))
    fireEvent.click(screen.getByRole('button', { name: 'Descendre le bloc 1' }))
    await waitFor(() => expect(sentBlocks).toHaveLength(2))
    expect(sentBlocks[1]?.map((block) => block.key)).toEqual(['k-cta', 'k-hero'])
  })

  it('reports a preview failure instead of showing a stale page as if it were current', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: { code: 'FORBIDDEN', message: 'Not your collection.' } }),
      })) as unknown as typeof fetch,
    )
    render(<Harness />)
    expect(await screen.findByText('Not your collection.')).not.toBeNull()
  })
})

describe('what a whole visual session hands back (L16 acceptance)', () => {
  it('only ever emits contract-B blocks — a key, a type, and semantic data', async () => {
    const emitted: (readonly ContentBlock[])[] = []
    render(<Harness onChange={(blocks) => emitted.push(blocks)} />)

    // A session: reorder, add, remove, reorder again.
    fireEvent.click(screen.getByRole('button', { name: 'Descendre le bloc 1' }))
    fireEvent.click(screen.getByRole('button', { name: /^Citation/u }))
    fireEvent.click(screen.getByRole('button', { name: 'Retirer le bloc 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Descendre le bloc 1' }))

    expect(emitted.length).toBeGreaterThan(3)
    for (const blocks of emitted) {
      for (const block of blocks) {
        expect(Object.keys(block).sort()).toEqual(['data', 'key', 'type'])
        expect(typeof block.key).toBe('string')
        expect(typeof block.type).toBe('string')
      }
      // Nothing anywhere in a builder-produced list is markup, a class, a
      // width or a coordinate. The whole list is searched rather than each
      // field, so a field this test never thought of is covered too (R3).
      const serialised = JSON.stringify(blocks)
      expect(serialised).not.toMatch(/<[a-z]/iu)
      expect(serialised).not.toContain('style')
      expect(serialised).not.toContain('class')
      expect(serialised).not.toMatch(/"(?:top|left|width|height|x|y)":/u)
    }
  })

  it('lets an editor pick a per-block visual variant, written through updateBlockData', async () => {
    const onChange = vi.fn<(blocks: readonly ContentBlock[]) => void>()
    render(<Harness onChange={onChange} />)

    const outline = screen.getByRole('list', { name: 'Blocs de la page' })
    fireEvent.click(within(outline).getByRole('button', { name: /Héros/u }))
    fireEvent.change(screen.getByLabelText('Fond'), { target: { value: 'muted' } })

    const last = onChange.mock.calls.at(-1)?.[0] ?? []
    const hero = last.find((block) => block.key === 'k-hero')
    expect(hero?.data['variant']).toEqual({ background: 'muted' })
    // The block's own fields travelled untouched alongside the new variant.
    expect(hero?.data['title']).toBe('A CMS that runs itself')
  })

  it('clears an axis back to "theme default" rather than storing an explicit default token', async () => {
    const onChange = vi.fn<(blocks: readonly ContentBlock[]) => void>()
    render(<Harness onChange={onChange} />)

    const outline = screen.getByRole('list', { name: 'Blocs de la page' })
    fireEvent.click(within(outline).getByRole('button', { name: /Héros/u }))
    fireEvent.change(screen.getByLabelText('Fond'), { target: { value: 'muted' } })
    fireEvent.change(screen.getByLabelText('Fond'), { target: { value: '' } })

    const last = onChange.mock.calls.at(-1)?.[0] ?? []
    const hero = last.find((block) => block.key === 'k-hero')
    // No `variant` key at all — not `{}` — once every axis is back to default.
    expect(Object.keys(hero?.data ?? {})).not.toContain('variant')
  })

  it('keeps every key stable through a whole session — no block is re-minted by moving', async () => {
    const emitted: (readonly ContentBlock[])[] = []
    render(<Harness onChange={(blocks) => emitted.push(blocks)} />)

    fireEvent.click(screen.getByRole('button', { name: 'Descendre le bloc 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Monter le bloc 2' }))

    const last = emitted.at(-1) ?? []
    expect(last.map((block) => block.key)).toEqual(['k-hero', 'k-cta'])
    // And the data travelled with the key, not with the position.
    expect(last[0]?.data['title']).toBe('A CMS that runs itself')
  })
})
