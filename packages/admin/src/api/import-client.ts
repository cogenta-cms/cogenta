import { authHeader, request } from './http.js'

/**
 * `/api/import/wordpress` — the admin's counterpart to `cogenta import
 * wordpress` on a terminal. The wire shape is `ImportReportLike` from
 * `@cogenta/api`'s `import-router.ts`, copied by hand for the same reason
 * every other client module in this directory copies its shape: this is a
 * browser bundle and that package is Node code.
 */

export interface ImportSkippedItem {
  readonly type: string
  readonly wpId: string
  readonly title: string
  readonly reason: string
}

export interface ImportUnconvertedBlock {
  readonly source: string
  readonly reason: string
  readonly postTitle: string
}

export interface WordPressImportReport {
  readonly imported: {
    readonly posts: number
    readonly pages: number
    readonly categories: number
    readonly tags: number
    readonly media: number
    readonly authors: number
    readonly comments: number
  }
  readonly redirectsCreated: number
  readonly skipped: readonly ImportSkippedItem[]
  readonly unconvertedBlocks: readonly ImportUnconvertedBlock[]
  readonly warnings: readonly string[]
}

/**
 * Reads a file the browser handed us into the base64 the API takes.
 *
 * `FileReader.readAsDataURL` rather than `file.arrayBuffer()` +
 * chunked `btoa` (the approach `site-plan-client.ts`'s `toUploadedDocument`
 * uses): both produce the same bytes in a real browser, but only
 * `FileReader` is implemented end-to-end by the jsdom this admin's tests run
 * under, which is what makes the upload path here verifiable by a real test
 * rather than asserted on faith.
 */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const comma = result.indexOf(',')
      resolve(comma === -1 ? result : result.slice(comma + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'))
    reader.readAsDataURL(file)
  })
}

export async function importWordPressExport(
  token: string,
  file: File,
): Promise<WordPressImportReport> {
  const data = await toBase64(file)
  return request('/api/import/wordpress', {
    method: 'POST',
    headers: { ...authHeader(token), 'content-type': 'application/json' },
    body: JSON.stringify({ filename: file.name, data }),
  })
}
