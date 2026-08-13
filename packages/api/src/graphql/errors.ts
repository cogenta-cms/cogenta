import { CogentaError, type ErrorCode, isCogentaError, type Logger } from '@cogenta/core'
import { GraphQLError } from 'graphql'

/**
 * What a GraphQL client is allowed to be told.
 *
 * A GraphQL response is the most quoted, logged and screenshotted surface of a
 * CMS, so nothing that reaches it may carry a value: no bound parameter, no SQL,
 * no identifier the caller did not already have, no secret. That is enforced
 * **by construction** here rather than by review: the message and the hint of a
 * rendered error come from the table below, keyed by the stable error code, and
 * `details` is never copied out. An interpolated message written elsewhere in
 * the codebase therefore cannot leak through this transport.
 *
 * The full error — message, details and cause — goes to the logger instead,
 * where it belongs.
 */

interface PublicText {
  readonly message: string
  readonly hint: string
}

const PUBLIC_TEXT: Partial<Record<ErrorCode, PublicText>> = {
  FORBIDDEN: {
    message: 'You are not allowed to perform this operation.',
    hint: 'Sign in with an account that holds the required role, or ask an administrator for it.',
  },
  UNAUTHENTICATED: {
    message: 'This operation requires an authenticated caller.',
    hint: 'Send a valid session or API token with the request.',
  },
  PREVIEW_TOKEN_INVALID: {
    message: 'This preview token cannot be used.',
    hint: 'Ask the editor to generate a new preview link.',
  },
  PREVIEW_TOKEN_EXPIRED: {
    message: 'This preview token has expired.',
    hint: 'Ask the editor to generate a new preview link.',
  },
  QUERY_INVALID: {
    message: 'This query cannot be answered as written.',
    hint: 'Check the arguments against the schema: filters, sort, pagination cursor and depth.',
  },
  CONTENT_NOT_FOUND: {
    message: 'No entry matches this request.',
    hint: 'Check the identifier and the locale: an entry exists per language, each with its own id.',
  },
  CONTENT_INVALID: {
    message: 'The submitted content is not valid for this collection.',
    hint: 'Compare the input with the collection schema, field by field.',
  },
  CONTENT_CONFLICT: {
    message: 'This entry changed while the request was in flight.',
    hint: 'Reload the entry and apply the change again.',
  },
  CONTENT_SLUG_INVALID: {
    message: 'This slug is not usable.',
    hint: 'Use lowercase letters, digits and hyphens only.',
  },
  CONTENT_SLUG_TAKEN: {
    message: 'Another entry already uses this slug.',
    hint: 'Choose a different slug, or edit the entry that holds it.',
  },
  BLOCK_UNKNOWN: {
    message: 'This block type is not part of the vocabulary.',
    hint: 'Use one of the block types the schema declares.',
  },
  BLOCK_INVALID: {
    message: 'A submitted block does not match its schema.',
    hint: 'Compare the block payload with the definition of its type.',
  },
}

/** Deliberately says nothing: an unmapped code is, by definition, unaudited. */
const FALLBACK: PublicText = {
  message: 'The request could not be completed.',
  hint: 'Try again; if it persists, ask an administrator to check the server logs.',
}

const SAFE_CODE: ErrorCode = 'INTERNAL'

/**
 * The rendered form of one error.
 *
 * `extensions.code` is the contract clients branch on — it is stable, and it is
 * the reason the message is allowed to stay this vague.
 */
export function scrubError(error: unknown, logger?: Logger): GraphQLError {
  const original = originalOf(error)

  logger?.error('graphql operation failed', {
    error: original instanceof Error ? original : new Error(String(original)),
  })

  // An unmapped code is reported as INTERNAL rather than passed through: codes
  // such as `DB_UNREACHABLE` describe the infrastructure, and the shape of the
  // infrastructure is not the client's business either.
  const raw = isCogentaError(original) ? original.code : SAFE_CODE
  const text = PUBLIC_TEXT[raw]
  const code = text === undefined ? SAFE_CODE : raw

  return new GraphQLError((text ?? FALLBACK).message, {
    // Keeping the path tells the client *which field* failed without saying
    // anything about why, which is exactly the amount of detail that is safe.
    path: error instanceof GraphQLError ? (error.path ?? undefined) : undefined,
    extensions: { code, hint: (text ?? FALLBACK).hint },
  })
}

function originalOf(error: unknown): unknown {
  return error instanceof GraphQLError && error.originalError !== undefined
    ? error.originalError
    : error
}

/**
 * Parse and validation errors are rendered as written.
 *
 * They are produced before a single variable is coerced, so they can only quote
 * the document the caller just sent: field names, type names, positions. That
 * is the one class of error where being specific costs nothing and saves an
 * afternoon.
 */
export function documentError(error: GraphQLError): GraphQLError {
  return new GraphQLError(error.message, {
    nodes: error.nodes,
    positions: error.positions,
    source: error.source,
    extensions: { code: 'QUERY_INVALID' satisfies ErrorCode },
  })
}

export function queryInvalid(message: string, hint: string): CogentaError {
  return new CogentaError({ code: 'QUERY_INVALID', message, hint })
}
