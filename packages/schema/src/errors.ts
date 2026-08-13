import { CogentaError } from '@cogenta/core'

/** One thing wrong with a definition, located by a dotted path. */
export interface SchemaIssue {
  /** `fields.title.max`, `permissions.read`, `routing.pattern`… */
  readonly path: string
  readonly message: string
}

/**
 * Every issue found in one definition, reported at once.
 *
 * Reporting the first problem only turns fixing a schema into a game of
 * whack-a-mole: one `cogenta generate` per typo. The path is what names the
 * offending field, which is the whole point of this error.
 */
export function schemaError(collection: string, issues: readonly SchemaIssue[]): CogentaError {
  const lines = issues.map((issue) => `  ${issue.path}: ${issue.message}`).join('\n')

  return new CogentaError({
    code: 'SCHEMA_INVALID',
    message: `Collection "${collection}" is not a valid schema:\n${lines}`,
    hint: 'Fix the fields listed above in the collection file, then run `cogenta generate` again.',
    details: { collection, issues },
  })
}
