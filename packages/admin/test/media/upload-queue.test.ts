import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MediaAsset } from '../../src/api/media-client.js'
import { useUploadQueue } from '../../src/media/upload-queue.js'

/**
 * `useUploadQueue` (fiche 05 task 1, audit `05-mediatheque.md` §6 T01) — the
 * bounded-concurrency pool behind the admin's real multipart upload. Network
 * transport itself (`uploadMediaMultipart`) is mocked here so the pool's own
 * scheduling can be driven and asserted on deterministically: which upload
 * starts when is exactly the thing a real XHR round trip cannot answer
 * reliably in a unit test.
 */

const uploadMediaMultipart = vi.fn()
vi.mock('../../src/api/media-client.js', () => ({
  uploadMediaMultipart: (...args: unknown[]) => uploadMediaMultipart(...args),
}))

interface Gate {
  readonly promise: Promise<MediaAsset>
  resolve(asset: MediaAsset): void
  reject(error: unknown): void
}

function gate(): Gate {
  let resolve!: (asset: MediaAsset) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<MediaAsset>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function stubAsset(id: string): MediaAsset {
  return {
    id,
    kind: 'image',
    filename: `${id}.png`,
    mimeType: 'image/png',
    size: 10,
    width: null,
    height: null,
    alt: '',
    decorative: true,
    decorativeJustification: null,
    focal: null,
    tags: [],
    contentHash: `hash-${id}`,
    folderId: null,
    createdAt: '2026-03-01T00:00:00.000Z',
    createdBy: null,
  }
}

function file(name: string): File {
  return new File(['bytes'], name, { type: 'image/png' })
}

afterEach(() => {
  uploadMediaMultipart.mockReset()
})

describe('useUploadQueue', () => {
  it('runs no more than three uploads at once, the rest waiting their turn', async () => {
    const gates = Array.from({ length: 5 }, () => gate())
    let started = 0
    uploadMediaMultipart.mockImplementation(() => gates[started++]?.promise)

    const { result } = renderHook(() => useUploadQueue('token', vi.fn()))

    act(() => {
      for (let i = 0; i < 5; i += 1) result.current.enqueue(file(`f${i}`), {})
    })

    await waitFor(() => expect(uploadMediaMultipart).toHaveBeenCalledTimes(3))
    expect(result.current.items.filter((item) => item.status === 'uploading')).toHaveLength(3)
    expect(result.current.items.filter((item) => item.status === 'pending')).toHaveLength(2)

    act(() => gates[0]?.resolve(stubAsset('a')))
    await waitFor(() => expect(uploadMediaMultipart).toHaveBeenCalledTimes(4))
    expect(result.current.items.filter((item) => item.status === 'uploading')).toHaveLength(3)
    expect(result.current.items.filter((item) => item.status === 'pending')).toHaveLength(1)
  })

  it('one file failing does not cancel or block the others', async () => {
    const gates = Array.from({ length: 3 }, () => gate())
    let started = 0
    uploadMediaMultipart.mockImplementation(() => gates[started++]?.promise)
    const onUploaded = vi.fn()

    const { result } = renderHook(() => useUploadQueue('token', onUploaded))

    act(() => {
      for (let i = 0; i < 3; i += 1) result.current.enqueue(file(`f${i}`), {})
    })
    await waitFor(() => expect(uploadMediaMultipart).toHaveBeenCalledTimes(3))

    act(() => gates[0]?.reject(new Error('network blip')))
    await waitFor(() => {
      const failed = result.current.items.find((item) => item.status === 'failed')
      expect(failed).toBeDefined()
    })

    act(() => gates[1]?.resolve(stubAsset('b')))
    act(() => gates[2]?.resolve(stubAsset('c')))

    await waitFor(() => {
      expect(result.current.items.filter((item) => item.status === 'done')).toHaveLength(2)
    })
    expect(onUploaded).toHaveBeenCalledTimes(2)
    // The failed item is still there, not silently dropped.
    expect(result.current.items.filter((item) => item.status === 'failed')).toHaveLength(1)
  })

  it('retry() re-attempts only the one failed upload, without disturbing finished ones', async () => {
    const first = gate()
    const retryAttempt = gate()
    uploadMediaMultipart.mockImplementationOnce(() => first.promise)
    const onUploaded = vi.fn()

    const { result } = renderHook(() => useUploadQueue('token', onUploaded))

    let id = ''
    act(() => {
      id = result.current.enqueue(file('broken'), {})
    })
    await waitFor(() => expect(uploadMediaMultipart).toHaveBeenCalledTimes(1))
    act(() => first.reject(new Error('gone')))
    await waitFor(() => {
      expect(result.current.items.find((item) => item.id === id)?.status).toBe('failed')
    })

    uploadMediaMultipart.mockImplementationOnce(() => retryAttempt.promise)
    act(() => result.current.retry(id))
    await waitFor(() => expect(uploadMediaMultipart).toHaveBeenCalledTimes(2))
    expect(result.current.items.find((item) => item.id === id)?.status).toBe('uploading')

    act(() => retryAttempt.resolve(stubAsset('recovered')))
    await waitFor(() => {
      expect(result.current.items.find((item) => item.id === id)?.status).toBe('done')
    })
    expect(onUploaded).toHaveBeenCalledTimes(1)
  })
})
