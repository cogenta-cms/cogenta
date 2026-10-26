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
import {
  checkComplexity,
  complexityError,
  DEFAULT_GRAPHQL_LIMITS,
  type GraphQLLimits,
} from './complexity.js'
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
  /**
   * The per-document budget (root fields, selections, depth). Any field left
   * out keeps its default; see `complexity.ts` for what each one counts.
   */
  readonly limits?: Partial<GraphQLLimits> | undefined
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

  // Before validation, not after: validation grows with the document too, so
  // the budget is the first thing a large document meets. A document over it is
  // refused here, and no resolver — no store read — has run.
  const violation = checkComplexity(document, request.operationName, resolveLimits(options.limits))
  if (violation !== undefined) return { errors: [complexityError(violation).toJSON()] }

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

/** An explicit `undefined` in the options must not erase a default. */
function resolveLimits(limits: Partial<GraphQLLimits> | undefined): GraphQLLimits {
  return {
    maxRootFields: limits?.maxRootFields ?? DEFAULT_GRAPHQL_LIMITS.maxRootFields,
    maxSelections: limits?.maxSelections ?? DEFAULT_GRAPHQL_LIMITS.maxSelections,
    maxDepth: limits?.maxDepth ?? DEFAULT_GRAPHQL_LIMITS.maxDepth,
  }
}
