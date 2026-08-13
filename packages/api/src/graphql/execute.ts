import type { Logger } from '@cogenta/core'
import {
  type DocumentNode,
  execute,
  GraphQLError,
  type GraphQLFormattedError,
  type GraphQLSchema,
  parse,
  recommendedRules,
  specifiedRules,
  validate,
} from 'graphql'
import type { AccessContext } from '../types.js'
import { createRequestContext } from './context.js'
import { documentError, scrubError } from './errors.js'
import type { ContentGateway } from './gateway.js'

/**
 * The transport: document in, answer out.
 *
 * The pipeline is written out rather than hidden behind `graphql()` for one
 * reason — the error handling differs by phase, and it has to. Parse and
 * validation run **before** a single variable is coerced, so their messages can
 * only quote the document the caller just sent and are safe to return verbatim;
 * everything from variable coercion onwards can carry a value, so it is
 * scrubbed to a code and a fixed sentence (see `errors.ts`).
 */

export interface GraphQLRequest {
  readonly query: string
  readonly variables?: Readonly<Record<string, unknown>> | undefined
  readonly operationName?: string | undefined
}

export interface GraphQLTransportOptions {
  readonly schema: GraphQLSchema
  readonly gateway: ContentGateway
  readonly access: AccessContext
  /** Where the unscrubbed failure goes. Nothing is written to stdout directly. */
  readonly logger?: Logger
}

export interface GraphQLResponse {
  readonly data?: Readonly<Record<string, unknown>> | null
  readonly errors?: readonly GraphQLFormattedError[]
}

const RULES = [...specifiedRules, ...recommendedRules]

export async function executeGraphQL(
  request: GraphQLRequest,
  options: GraphQLTransportOptions,
): Promise<GraphQLResponse> {
  let document: DocumentNode
  try {
    document = parse(request.query)
  } catch (error) {
    if (error instanceof GraphQLError) return { errors: [documentError(error).toJSON()] }
    return { errors: [scrubError(error, options.logger).toJSON()] }
  }

  const problems = validate(options.schema, document, RULES)
  if (problems.length > 0) {
    return { errors: problems.map((problem) => documentError(problem).toJSON()) }
  }

  const result = await execute({
    schema: options.schema,
    document,
    // A fresh context per request: the dataloaders it holds cache entries read
    // under this actor's permissions, and must not outlive them.
    contextValue: createRequestContext(options.gateway, options.access),
    variableValues: request.variables === undefined ? undefined : { ...request.variables },
    operationName: request.operationName ?? undefined,
  })

  const errors = result.errors?.map((error) => scrubError(error, options.logger).toJSON())

  return {
    data: result.data ?? null,
    ...(errors === undefined || errors.length === 0 ? {} : { errors }),
  }
}
