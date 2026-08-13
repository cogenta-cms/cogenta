import { CogentaError } from '@cogenta/core'
import type { z } from 'zod'

/**
 * Every error this package throws names the block, and — when the failure is a
 * validation failure — the field. "Invalid block" alone is useless to an editor
 * looking at twenty blocks on a page.
 */

/** Renders Zod issues as `field: reason`, one per line, so nothing is hidden. */
export function formatBlockIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.map(String).join('.')
      return `  ${path === '' ? '(block)' : path}: ${issue.message}`
    })
    .join('\n')
}

export function invalidBlockDefinition(name: string, reason: string): CogentaError {
  return new CogentaError({
    code: 'BLOCK_DEFINITION_INVALID',
    message: `Block "${name}" cannot be defined: ${reason}`,
    hint: 'A block manifest follows contract B: name, version, schema, runtime, fallback, a11y.',
    details: { block: name },
  })
}

export function invalidBlock(
  name: string,
  key: string | undefined,
  error: z.ZodError,
): CogentaError {
  // An unrecognised key carries an empty path — the offending name is in
  // `keys`. Reporting it is the whole point here: the field a theme tried to
  // smuggle in is exactly what the author needs to see.
  const fields = error.issues.flatMap((issue) =>
    issue.code === 'unrecognized_keys' ? issue.keys : [issue.path.map(String).join('.')],
  )
  return new CogentaError({
    code: 'BLOCK_INVALID',
    message: `Block "${name}"${key === undefined ? '' : ` (${key})`} is invalid:\n${formatBlockIssues(error)}`,
    hint: 'A block stores semantic data only: no HTML, no CSS class, no style value (rule R3).',
    details: { block: name, key, fields },
  })
}

export function unknownBlock(name: string, known: readonly string[]): CogentaError {
  return new CogentaError({
    code: 'BLOCK_UNKNOWN',
    message: `Block "${name}" is not registered.`,
    hint: `Known blocks: ${known.join(', ')}. A theme-specific block must be registered before use, with a fallback.`,
    details: { block: name, known },
  })
}

export function blockMigrationFailed(
  name: string,
  from: string,
  to: string,
  reason: string,
): CogentaError {
  return new CogentaError({
    code: 'BLOCK_MIGRATION_FAILED',
    message: `Block "${name}" cannot be migrated from ${from} to ${to}: ${reason}`,
    hint: 'Register a migration for every version step, so stored content is never left in an ambiguous state.',
    details: { block: name, from, to },
  })
}
