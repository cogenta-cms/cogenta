import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app.js'
import { installMockFetch, VALID_TOKEN } from '../helpers/mock-fetch.js'

const USAGE_MATCH = {
  collection: 'article',
  entryId: 'entry-1',
  locale: 'fr',
  title: 'Le pain de seigle',
  at: 'coverImage',
} as const

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('cogenta.session.token', VALID_TOKEN)
})

afterEach(() => {
  window.history.pushState(null, '', '/')
  vi.unstubAllGlobals()
})

/**
 * This list is read by someone with their finger over Delete, deciding
 * whether to. It said "article · <uuid> ·" — the entry unnamed, the place
 * unnamed, a separator with nothing after it, and no way to go and look.
 */
describe('where a medium is used', () => {
  it('names the entry, links to it, and says where in words', async () => {
    installMockFetch({ mediaSeedCount: 1, mediaUsage: { 'media-seed-1': [USAGE_MATCH] } })
    window.history.pushState(null, '', '/media')
    render(<App />)

    fireEvent.click(
      (await screen.findAllByRole('button', { name: /seed-1\.png/ }))[0] as HTMLElement,
    )

    const link = await screen.findByRole('link', { name: 'Le pain de seigle' })
    expect(link).toHaveProperty('pathname', '/collections/article/entry-1')
    // `coverImage` is a field, so it is named the way the entry's own form
    // names it.
    expect(await screen.findByText(/dans Image de couverture/)).toBeDefined()
  })

  it('shows a block path as it stands, rather than inventing a name for it', async () => {
    installMockFetch({
      mediaSeedCount: 1,
      mediaUsage: {
        'media-seed-1': [{ ...USAGE_MATCH, at: 'blocks.blocks[2].mediaFigure' }],
      },
    })
    window.history.pushState(null, '', '/media')
    render(<App />)

    fireEvent.click(
      (await screen.findAllByRole('button', { name: /seed-1\.png/ }))[0] as HTMLElement,
    )

    expect(await screen.findByText(/dans blocks\.blocks\[2\]\.mediaFigure/)).toBeDefined()
  })
})
