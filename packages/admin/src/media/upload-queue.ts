import { useCallback, useRef, useState } from 'react'
import { ApiError } from '../api/client.js'
import { type MediaAsset, uploadMediaMultipart } from '../api/media-client.js'

/**
 * Real multipart upload with a bounded pool of concurrent transfers (fiche
 * 05 task 1 — audit `05-mediatheque.md` §6 T01).
 *
 * `upload-form.tsx`'s per-file alt-text form (fiche 46 task 7's own
 * documented reason: WCAG 1.1.1 does not relax for a batch) still collects
 * metadata for one file at a time — that is a human filling in a form, and
 * nothing here changes it. What changes is that submitting a file's
 * metadata no longer *waits* for its bytes to finish crossing the network
 * before the form can move on to the next file: `enqueue()` hands the
 * upload to this pool and returns immediately, so up to
 * `MAX_CONCURRENT_UPLOADS` transfers run at once while the human keeps
 * typing the next one's description.
 */
export const MAX_CONCURRENT_UPLOADS = 3

export type UploadQueueStatus = 'pending' | 'uploading' | 'done' | 'failed'

export interface UploadQueueItem {
  readonly id: string
  readonly filename: string
  readonly status: UploadQueueStatus
  /** Bytes sent so far, `0..1`. Only meaningful while `status === 'uploading'`. */
  readonly progress: number
  /** Present (and meaningful) only while `status === 'failed'`; `undefined` otherwise, explicitly — a retry must be able to clear a previous message, not just leave it stale. */
  readonly error: string | undefined
  readonly asset?: MediaAsset
}

export interface UploadMetadata {
  readonly alt?: string
  readonly decorative?: boolean
  readonly decorativeJustification?: string
  readonly tags?: readonly string[]
}

interface QueuedUpload {
  readonly id: string
  readonly file: File
  readonly metadata: UploadMetadata
}

export interface UploadQueue {
  readonly items: readonly UploadQueueItem[]
  /** Adds a file to the pool and returns its queue id immediately — the upload itself runs in the background. */
  enqueue(file: File, metadata: UploadMetadata): string
  /** Re-attempts one failed upload, without disturbing the others. */
  retry(id: string): void
  /** Removes one entry from the visible list. A retry is always possible again afterwards only by re-selecting the file — this drops its record entirely. */
  dismiss(id: string): void
}

function nextId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function useUploadQueue(
  token: string,
  onUploaded: (asset: MediaAsset) => void,
  concurrency: number = MAX_CONCURRENT_UPLOADS,
): UploadQueue {
  const [items, setItems] = useState<readonly UploadQueueItem[]>([])
  // The file kept for the whole life of its entry (including after a
  // failure, so `retry()` has something to resend) — a `File` object has no
  // business living in React state, which re-renders and diffs it for no
  // reason.
  const files = useRef<Map<string, QueuedUpload>>(new Map())
  const waiting = useRef<string[]>([])
  const running = useRef(0)

  const patch = useCallback((id: string, next: Partial<UploadQueueItem>): void => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...next } : item)))
  }, [])

  const pump = useCallback((): void => {
    while (running.current < concurrency && waiting.current.length > 0) {
      const id = waiting.current.shift()
      if (id === undefined) break
      const queued = files.current.get(id)
      if (queued === undefined) continue
      running.current += 1
      patch(id, { status: 'uploading', progress: 0, error: undefined })

      uploadMediaMultipart(token, queued.file, queued.metadata, (loaded, total) => {
        patch(id, { progress: total > 0 ? loaded / total : 0 })
      })
        .then((asset) => {
          patch(id, { status: 'done', progress: 1, asset })
          files.current.delete(id)
          onUploaded(asset)
        })
        .catch((caught: unknown) => {
          patch(id, {
            status: 'failed',
            error: caught instanceof ApiError ? caught.message : 'Could not upload this file.',
          })
        })
        .finally(() => {
          running.current -= 1
          pump()
        })
    }
  }, [concurrency, onUploaded, patch, token])

  const enqueue = useCallback(
    (file: File, metadata: UploadMetadata): string => {
      const id = nextId()
      files.current.set(id, { id, file, metadata })
      waiting.current.push(id)
      setItems((current) => [
        ...current,
        { id, filename: file.name, status: 'pending', progress: 0, error: undefined },
      ])
      pump()
      return id
    },
    [pump],
  )

  const retry = useCallback(
    (id: string): void => {
      if (!files.current.has(id)) return
      if (waiting.current.includes(id)) return
      waiting.current.push(id)
      patch(id, { status: 'pending', progress: 0, error: undefined })
      pump()
    },
    [patch, pump],
  )

  const dismiss = useCallback((id: string): void => {
    setItems((current) => current.filter((item) => item.id !== id))
    files.current.delete(id)
    waiting.current = waiting.current.filter((candidate) => candidate !== id)
  }, [])

  return { items, enqueue, retry, dismiss }
}
