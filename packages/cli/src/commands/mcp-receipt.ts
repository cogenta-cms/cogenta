/**
 * What the audit record of an MCP tool call keeps so that the call can be
 * undone later (L42, R6).
 *
 * `withAudit` stores the call's input and output in the record's `diff`. The
 * output of a reversible tool is its *receipt*: `revert(receipt)` reads
 * `undo`, an id or a few scalars from it and nothing else. The audit log
 * bounds one record (`AUDIT_DIFF_MAX_BYTES`, 64 KiB) and, past that, replaces
 * the whole `diff` by a marker, which would lose the receipt together with
 * the call's origin and tool name — a long article is enough to get there,
 * since the output is the whole entry.
 *
 * So a diff that is getting large keeps what an undo needs and sheds what it
 * does not: the input (the version history of the entry still holds what was
 * written) and every nested value of the output but `undo`. The outputs are
 * content, term and media identifiers, versions and dates — no secret.
 */

/** Below the audit log's own bound, to leave room for the fields it adds. */
const SOFT_LIMIT_BYTES = 48 * 1024
const MAX_SCALAR_STRING = 1024
const MAX_UNDO_BYTES = 4 * 1024

function sizeOf(value: unknown): number {
  const text = JSON.stringify(value)
  return text === undefined ? 0 : Buffer.byteLength(text, 'utf8')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The scalar top-level fields of a tool output, plus its `undo` when small. */
function receiptOf(output: unknown): unknown {
  if (!isRecord(output)) return sizeOf(output) <= MAX_SCALAR_STRING ? output : null
  const kept: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(output)) {
    if (key === 'undo') {
      if (sizeOf(value) <= MAX_UNDO_BYTES) kept[key] = value
    } else if (
      value === null ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      (typeof value === 'string' && value.length <= MAX_SCALAR_STRING)
    ) {
      kept[key] = value
    }
  }
  return kept
}

/**
 * The diff to record for one MCP call: unchanged while it is small, and the
 * compact receipt form when it is not (`receiptCompacted: true`).
 */
export function boundedMcpDiff(diff: Readonly<Record<string, unknown>>): Record<string, unknown> {
  if (sizeOf(diff) <= SOFT_LIMIT_BYTES) return { ...diff }
  const { input: _input, output, ...rest } = diff
  return {
    ...rest,
    input: { omitted: 'too-large' },
    ...(output === undefined ? {} : { output: receiptOf(output) }),
    receiptCompacted: true,
  }
}
