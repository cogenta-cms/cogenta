import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MediaAsset } from '../../src/api/media-client.js'
import { ImageEditor } from '../../src/media/image-editor.js'

/**
 * L39: the editor sends a quarter turn and a crop in fractions of the turned
 * picture, works with the keyboard alone, and offers to restore an edited image.
 * jsdom decodes no image, so a stand-in `Image` reports a 1600×900 picture.
 */

const ASSET: MediaAsset = {
  id: 'media-1',
  kind: 'image',
  filename: 'site.jpg',
  mimeType: 'image/jpeg',
  size: 1000,
  width: 1600,
  height: 900,
  alt: 'Un poste électrique',
  decorative: false,
  decorativeJustification: null,
  focal: null,
  tags: [],
  contentHash: 'abc',
  folderId: null,
  createdAt: '2026-09-17T10:00:00.000Z',
  createdBy: null,
}

let requests: { url: string; body: unknown }[]

beforeEach(() => {
  requests = []
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 1600
      naturalHeight = 900
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    },
  )
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => undefined }),
  )
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/file')) {
        requests.push({ url: String(url), body: null })
        return new Response(new Blob(['x']))
      }
      requests.push({
        url: String(url),
        body: init?.body === undefined ? null : JSON.parse(String(init.body)),
      })
      return Response.json({ data: { ...ASSET, edited: !String(url).endsWith('/restore') } })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the image editor', () => {
  it('loads the untouched original, and sends a turn and a frame of the turned picture', async () => {
    const onDone = vi.fn()
    render(<ImageEditor token="t" asset={ASSET} onDone={onDone} onCancel={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByRole('slider', { name: 'Cadre de recadrage' })).toBeDefined(),
    )
    expect(requests[0]?.url).toContain('/api/media/media-1/file?v=abc&original=1')

    fireEvent.click(screen.getByRole('button', { name: '↻ Pivoter à droite' }))
    fireEvent.click(screen.getByRole('button', { name: 'Carré' }))
    fireEvent.click(screen.getByRole('button', { name: 'Appliquer' }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    const sent = requests.find((request) => request.url.endsWith('/edit'))?.body as {
      rotate: number
      crop: { x: number; y: number; width: number; height: number }
    }
    expect(sent.rotate).toBe(90)
    // Turned, the picture is 900×1600: a square frame is its full width.
    expect(sent.crop.width).toBe(1)
    expect(sent.crop.height * 1600).toBeCloseTo(900, 0)
  })

  it('moves and resizes the frame with the keyboard alone', async () => {
    render(<ImageEditor token="t" asset={ASSET} onDone={vi.fn()} onCancel={vi.fn()} />)
    const frame = await screen.findByRole('slider', { name: 'Cadre de recadrage' })
    fireEvent.keyDown(frame, { key: 'ArrowLeft', shiftKey: true })
    fireEvent.keyDown(frame, { key: 'ArrowRight' })
    expect(frame.getAttribute('aria-valuetext')).toBe(
      'À 1 % du bord gauche et 0 % du haut, 99 % de large, 100 % de haut',
    )
  })

  it('offers to restore the original of an edited image, and only then', async () => {
    const onDone = vi.fn()
    const { rerender } = render(
      <ImageEditor token="t" asset={ASSET} onDone={onDone} onCancel={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: 'Rétablir l’original' })).toBeNull()
    rerender(
      <ImageEditor
        token="t"
        asset={{ ...ASSET, edited: true }}
        onDone={onDone}
        onCancel={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Rétablir l’original' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(requests.some((request) => request.url.endsWith('/restore'))).toBe(true)
  })
})
