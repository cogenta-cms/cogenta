import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/app.js'
import { installMockFetch, VALID_TOKEN } from './helpers/mock-fetch.js'

const TOKEN_STORAGE_KEY = 'cogenta.session.token'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(TOKEN_STORAGE_KEY, VALID_TOKEN)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * L21 task 5's other half: a `blocks` field on a fresh entry pre-filled with
 * a configurable starting set (`content.newEntryDefaultBlocks`), instead of
 * the empty array it started with before this existed — so an MCP call or a
 * person opening a new page gets something real instead of a blank zone
 * nothing renders. Pure admin UX: no schema change, contract A's `blocks`
 * field still writes and reads exactly the array it always has.
 */
describe('a new entry starts with the configured default blocks', () => {
  it('pre-fills the blocks field with the registry default ("prose"), fully editable and removable', async () => {
    installMockFetch()
    window.history.pushState(null, '', '/collections/article/new')
    render(<App />)

    await screen.findByRole('heading', { name: 'Nouveau : Article' })

    const list = await screen.findByRole('list', { name: 'body' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(1)
    expect(within(items[0] as HTMLElement).getByText('Texte')).not.toBeNull()

    // Still an ordinary block: removable like any block a person added by hand.
    fireEvent.click(within(items[0] as HTMLElement).getByRole('button', { name: /Retirer/u }))
    expect(within(list).queryAllByRole('listitem')).toHaveLength(0)
  })

  it('honours a site-configured starting set, in order, including more than one block', async () => {
    installMockFetch({ siteSettings: { 'content.newEntryDefaultBlocks': 'hero, prose' } })
    window.history.pushState(null, '', '/collections/article/new')
    render(<App />)

    await screen.findByRole('heading', { name: 'Nouveau : Article' })

    const list = await screen.findByRole('list', { name: 'body' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0] as HTMLElement).getByText('Héros')).not.toBeNull()
    expect(within(items[1] as HTMLElement).getByText('Texte')).not.toBeNull()
  })

  it('starts empty when the site configures no starting blocks — a real opt-out, not a bug', async () => {
    installMockFetch({ siteSettings: { 'content.newEntryDefaultBlocks': '' } })
    window.history.pushState(null, '', '/collections/article/new')
    render(<App />)

    await screen.findByRole('heading', { name: 'Nouveau : Article' })

    const list = await screen.findByRole('list', { name: 'body' })
    expect(within(list).queryAllByRole('listitem')).toHaveLength(0)
  })

  it('ignores a starting-set entry the admin copy of contract B does not recognise, rather than crashing', async () => {
    installMockFetch({
      siteSettings: { 'content.newEntryDefaultBlocks': 'not-a-real-block, prose' },
    })
    window.history.pushState(null, '', '/collections/article/new')
    render(<App />)

    await screen.findByRole('heading', { name: 'Nouveau : Article' })

    const list = await screen.findByRole('list', { name: 'body' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(1)
    expect(within(items[0] as HTMLElement).getByText('Texte')).not.toBeNull()
  })

  it('does not count the pre-filled default as an edit the person made, until they actually touch something', async () => {
    // The autosave/dirty-guard baseline (`entry-edit.tsx`'s `baseline` state)
    // must match the pre-filled blocks, or a person would be warned about
    // "unsaved changes" on a page they never touched — proven through the
    // real guard (`use-dirty-guard.ts`), a click on an in-app link, rather
    // than asserting on internal state: leaving via the shell's own nav
    // must not open the "Quitter sans enregistrer ?" modal.
    installMockFetch()
    window.history.pushState(null, '', '/collections/article/new')
    render(<App />)

    await screen.findByRole('heading', { name: 'Nouveau : Article' })
    await screen.findByRole('list', { name: 'body' })

    // Two "Contenus" links coexist here (the sidebar nav and the
    // breadcrumb, both pointing at /collections) — the breadcrumb is
    // unambiguous by its own landmark.
    const breadcrumb = screen.getByRole('navigation', { name: "Fil d'Ariane" })
    fireEvent.click(within(breadcrumb).getByRole('link', { name: 'Contenus' }))
    expect(screen.queryByText('Quitter sans enregistrer ?')).toBeNull()
    await screen.findByRole('heading', { name: 'Contenus' })
  })
})
