import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EmbedAssist } from '../../src/blocks/embed-assist.js'

vi.mock('../../src/auth/auth-context.js', () => ({
  useAuth: () => ({ state: { status: 'authenticated', token: 'token-1' } }),
}))

/** L38: pasting an address recognises the service, sets the proportions left unset, and previews it. */

const PREVIEW = {
  url: 'https://www.youtube.com/watch?v=abc',
  provider: 'youtube',
  status: 'ok',
  title: 'Inspection d’un poste électrique',
  authorName: 'Norvane',
  ratio: '16:9',
  thumbnailPath: `/_cogenta/embeds/${'a'.repeat(64)}`,
  thumbnailWidth: 480,
  thumbnailHeight: 360,
}

let posted: unknown[]

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  posted = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      posted.push(JSON.parse(String(init?.body)))
      return Response.json({ data: PREVIEW })
    }),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the embed block assistant', () => {
  it('fills the service and the unset proportions, and shows the preview', async () => {
    const onChange = vi.fn()
    const { container } = render(
      <EmbedAssist
        data={{ url: PREVIEW.url, provider: 'other', consentRequired: true }}
        onChange={onChange}
      />,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    await waitFor(() => expect(screen.getByText(PREVIEW.title)).toBeDefined())
    expect(posted).toEqual([{ url: PREVIEW.url }])
    expect(onChange).toHaveBeenCalledWith({
      url: PREVIEW.url,
      provider: 'youtube',
      ratio: '16:9',
      consentRequired: true,
    })
    expect(container.querySelector('img')?.getAttribute('src')).toBe(PREVIEW.thumbnailPath)
  })

  it('never overrides proportions the editor chose', async () => {
    const onChange = vi.fn()
    render(
      <EmbedAssist
        data={{ url: PREVIEW.url, provider: 'youtube', ratio: '4:3', consentRequired: false }}
        onChange={onChange}
      />,
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    await waitFor(() => expect(screen.getByText(PREVIEW.title)).toBeDefined())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('asks nothing for a text that is not a web address', async () => {
    render(<EmbedAssist data={{ url: 'pas une adresse' }} onChange={vi.fn()} />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(posted).toHaveLength(0)
  })
})
