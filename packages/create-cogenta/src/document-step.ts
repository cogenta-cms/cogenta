import { readFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { type ExtractedDocument, extractDocumentText } from '@cogenta/agents'
import type { Output } from '@cogenta/cli'
import { isCogentaError } from '@cogenta/core'
import type { Prompter } from './prompts.js'

/**
 * L19 task 6, first half — "une étape optionnelle avant le scaffold :
 * « avez-vous un document de spécification à téléverser ? »".
 *
 * Optional in the strongest sense (R2): the default answer is no, a
 * non-interactive `--yes` run therefore never enters it, and a run with no
 * LLM provider configured is never even asked the question. A site
 * scaffolded without a document is byte-for-byte the site this installer
 * produced before L19 existed.
 *
 * A file that cannot be read is reported and skipped, not fatal. Somebody
 * uploading three documents, one of which is a scan, should get a plan from
 * the other two and a clear line about the third — not a failed install.
 */

export interface CollectDocumentsOptions {
  readonly prompter: Prompter
  readonly out: Output
  /** Where a relative path typed by the user is resolved from. */
  readonly cwd: string
  /** How many files to accept in one go. */
  readonly maxDocuments?: number
}

export interface CollectDocumentsResult {
  readonly documents: readonly ExtractedDocument[]
  /** One line per file that could not be read, in the words the reader used. */
  readonly failures: readonly string[]
}

const DEFAULT_MAX_DOCUMENTS = 5

/** Splits what a human types into paths, tolerating commas, quotes and stray spaces. */
export function parsePathList(input: string): readonly string[] {
  return input
    .split(',')
    .map((piece) => piece.trim().replace(/^["']|["']$/g, ''))
    .filter((piece) => piece !== '')
}

export async function readDocuments(
  paths: readonly string[],
  cwd: string,
): Promise<CollectDocumentsResult> {
  const documents: ExtractedDocument[] = []
  const failures: string[] = []

  for (const path of paths) {
    const absolute = isAbsolute(path) ? path : resolve(cwd, path)
    try {
      const bytes = await readFile(absolute)
      documents.push(extractDocumentText({ filename: path, bytes }))
    } catch (error) {
      if (isCogentaError(error)) {
        failures.push(
          `${path}: ${error.message}${error.hint === undefined ? '' : ` ${error.hint}`}`,
        )
      } else {
        failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  return { documents, failures }
}

export async function collectDocuments(
  options: CollectDocumentsOptions,
): Promise<CollectDocumentsResult> {
  const wanted = await options.prompter.confirm(
    'Do you have a specification document to read (a brief, a cahier des charges, a spec)? PDF, DOCX, Markdown or plain text',
    false,
  )
  if (!wanted) return { documents: [], failures: [] }

  const typed = await options.prompter.text('Path(s) to the document(s), separated by commas', '')
  const paths = parsePathList(typed).slice(0, options.maxDocuments ?? DEFAULT_MAX_DOCUMENTS)
  if (paths.length === 0) {
    options.out.detail('No path given — carrying on without a document.')
    return { documents: [], failures: [] }
  }

  const result = await readDocuments(paths, options.cwd)
  for (const document of result.documents) {
    options.out.ok(
      `Read ${document.filename} (${document.format}, ${document.characters} characters).`,
    )
    for (const warning of document.warnings) options.out.warn(`${document.filename}: ${warning}`)
  }
  for (const failure of result.failures) options.out.bad(failure)

  return result
}
