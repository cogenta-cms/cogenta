import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MediaPicker } from '../../src/fields/media-picker.js'

/**
 * `MediaPicker` (fiche 03 task 3): a `many: true` selection reorders with
 * real, labelled buttons — never drag-and-drop alone — and every asset id
 * in `value` gets resolved to a real filename, not left as a UUID.
 */

const TOKEN = 'test-token'

function asset(
  id: string,
  filename: string,
): {
  id: string
  kind: string
  filename: string
  mimeType: string
  size: number
  width: number | null
  height: number | null
  alt: string
  decorative: boolean
  decorativeJustification: string | null
  focal: null
  createdAt: string
  createdBy: string | null
} {
  return {
    id,
    kind: 'image',
    filename,
    mimeType: 'image/png',
    size: 10,
    width: null,
    height: null,
    alt: `Alt for ${filename}`,
    decorative: false,
    decorativeJustification: null,
    focal: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    createdBy: null,
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('MediaPicker — a many-valued gallery', () => {
  it('resolves each chosen id to its real filename, and reorders with real buttons', async () => {
    const assets: Record<string, ReturnType<typeof asset>> = {
      'media-1': asset('media-1', 'one.png'),
      'media-2': asset('media-2', 'two.png'),
    }
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
        const url = typeof input === 'string' ? input : input.toString()
        const match = /\/api\/media\/([^/?]+)$/u.exec(url)
        if (match?.[1] !== undefined) {
          const found = assets[match[1]]
          if (found !== undefined) return json(200, { data: found })
          return json(404, { error: { code: 'MEDIA_NOT_FOUND', message: 'No such asset.' } })
        }
        return json(200, { data: [], page: { hasMore: false, nextCursor: null } })
      }),
    )

    const onChange = vi.fn()
    render(
      <MediaPicker
        id="gallery"
        token={TOKEN}
        accept={['image']}
        many
        value={['media-1', 'media-2']}
        onChange={onChange}
      />,
    )

    await waitFor(() => expect(screen.getByText('one.png')).toBeDefined())
    expect(screen.getByText('two.png')).toBeDefined()

    // Real, labelled, keyboard-reachable buttons — never drag-only.
    fireEvent.click(screen.getByRole('button', { name: 'Descendre 1' }))
    expect(onChange).toHaveBeenCalledWith(['media-2', 'media-1'])
  })

  it('shows an honest placeholder for a reference the media library no longer has', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(404, { error: { code: 'MEDIA_NOT_FOUND', message: 'No such asset.' } }),
      ),
    )

    render(
      <MediaPicker
        id="cover"
        token={TOKEN}
        accept={['image']}
        many={false}
        value={['ghost-media']}
        onChange={vi.fn()}
      />,
    )

    await waitFor(() => expect(screen.getByText(/ghost-media/)).toBeDefined())
  })
})
