import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app.js'
import { installMockFetch, VALID_TOKEN } from '../helpers/mock-fetch.js'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('cogenta.session.token', VALID_TOKEN)
  installMockFetch()
})

afterEach(() => {
  window.history.pushState(null, '', '/')
  vi.unstubAllGlobals()
})

/**
 * The upload screen printed "Types acceptés : image/avif, …, application/pdf"
 * — a closed whitelist the server has never enforced. A `.txt`, a `.docx` and
 * a CSV all upload fine and not one of them is on that list, which is
 * deliberate: a media library has every reason to hold them. What is really
 * checked is an image's own bytes.
 */
describe('what the upload screen promises about file types', () => {
  it('states the rule that is enforced, and does not call it a list of accepted types', async () => {
    window.history.pushState(null, '', '/media')
    render(<App />)

    const note = await screen.findByText(/Une image doit être en/)
    expect(note.textContent).toContain('image/avif')
    expect(note.textContent).toContain('image/png')
    // The half that used to be missing: everything else is allowed.
    expect(note.textContent).toMatch(/Tout autre fichier est accepté/)
    expect(note.textContent).not.toMatch(/Types acceptés/)
  })
})
