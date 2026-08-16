/**
 * Size caps shared between `extract-text.ts` and the format readers it
 * calls (`pdf.ts`, `docx.ts`).
 *
 * `MAX_TEXT_CHARACTERS` used to live only in `extract-text.ts`, checked
 * after a format reader had already built its whole result string.
 * `extractPdfText` accumulates one page per content stream before that
 * check ever runs, so a PDF whose streams individually stay under the
 * per-stream decompression cap (`MAX_INFLATED_BYTES`, 200 MiB) but are
 * numerous and each expand to compressible text can still build a result
 * many times the eventual limit before anything trims it — dozens of
 * ~190 MiB streams inside one 20 MiB upload, comfortably. Giving the reader
 * itself the character budget, so it can stop pulling in more pages once
 * accumulated text already exceeds what would survive truncation, is what
 * closes that gap; a small standalone module is what lets both files import
 * the same number without an import cycle (`extract-text.ts` already
 * imports `extractPdfText` from `pdf.ts`).
 */

/** 20 MiB — a specification document that exceeds this is a scan, and a scan has no text layer anyway. */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024
/** Roughly 50k tokens: enough for a long brief, bounded so one upload cannot exhaust a model budget on its own. */
export const MAX_TEXT_CHARACTERS = 200_000
