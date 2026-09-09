import { extractDocumentText } from '../documents/extract-text.js'
import type { DataItem } from '../identity/context.js'
import type { ChatImagePart } from '../providers/types.js'

/**
 * Shared between `propose-theme.ts` (mode 1 — pick an installed theme and
 * fill its tokens) and `generate-sandbox-theme.ts` (mode 2 — write a fully
 * custom theme into a sandbox): both need the exact same split of an
 * attachment into R8-guarded document text versus a multimodal image block,
 * and a drifted second copy is exactly the class of bug this extraction
 * avoids.
 */

export interface ThemeCreatorAttachment {
  readonly filename: string
  readonly mimeType: string
  readonly data: Uint8Array
}

export interface ProcessedAttachments {
  readonly documentData: readonly DataItem[]
  readonly imageParts: readonly ChatImagePart[]
  readonly warnings: readonly string[]
  readonly contributedFilenames: readonly string[]
}

function base64Of(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

/**
 * Splits attachments into what `assembleContext`'s `data` channel can carry
 * (document text — R8) and what a multimodal content block carries (images).
 *
 * An attached image is always forwarded — this deliberately does not ask any
 * static "does this provider support vision" declaration first. Which
 * vendors and models accept an inline image changes on their own schedule,
 * outside this codebase's control; hard-coding a per-vendor allow/deny list
 * here would silently go stale the day a vendor adds (or drops) support.
 * Instead, the request is simply sent with the image attached, and if the
 * vendor's own API rejects it, that failure surfaces as a normal job error —
 * shown to the operator, logged, and the run stops there. That is real
 * information about what actually happened, not a guess made ahead of time.
 */
export function processAttachments(
  attachments: readonly ThemeCreatorAttachment[],
): ProcessedAttachments {
  const documentData: DataItem[] = []
  const imageParts: ChatImagePart[] = []
  const warnings: string[] = []
  const contributedFilenames: string[] = []

  for (const attachment of attachments) {
    let text: string | undefined
    let documentWarnings: readonly string[] = []
    try {
      const extracted = extractDocumentText({
        filename: attachment.filename,
        bytes: Buffer.from(attachment.data),
      })
      text = extracted.text
      documentWarnings = extracted.warnings
    } catch {
      text = undefined
    }

    if (text !== undefined) {
      documentData.push({ source: attachment.filename, content: text })
      contributedFilenames.push(attachment.filename)
      for (const warning of documentWarnings) warnings.push(`${attachment.filename}: ${warning}`)
      continue
    }

    if (attachment.mimeType.startsWith('image/')) {
      imageParts.push({
        type: 'image',
        mediaType: attachment.mimeType,
        data: base64Of(attachment.data),
      })
      continue
    }

    warnings.push(`${attachment.filename}: could not be read as a document or an image`)
  }

  return { documentData, imageParts, warnings, contributedFilenames }
}
