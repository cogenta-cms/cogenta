import type { ErrorCode } from '@cogenta/core'
import {
  type DocumentNode,
  type FragmentDefinitionNode,
  GraphQLError,
  Kind,
  type OperationDefinitionNode,
  type SelectionSetNode,
} from 'graphql'

/**
 * A per-document budget, checked on the parsed document before anything runs.
 *
 * Pagination (`limit` ≤ 100) and relation expansion (`depth` ≤ 2) bound what
 * one *field* costs. Nothing bounded how many fields one *document* may ask
 * for, and GraphQL makes that cheap to inflate: aliases repeat a root field
 * under new names, and fragments repeat a whole subtree by name. A document
 * of 500 aliased list fields is a few kilobytes on the wire and several
 * seconds of work (measured: about 8 ms per aliased list field with two
 * levels of relations, on a real SQLite store), and an HTTP rate limit counts
 * requests, not the work inside one.
 *
 * Three numbers, each counted on the expanded document:
 *
 * - root fields of the operation, aliases included — the multiplier that
 *   actually reaches the database, one query per root field;
 * - field selections in total — a repeated fragment spread is counted every
 *   time it is spread, so `...A ...A ...A` costs three times `A`;
 * - depth — fragments and inline fragments are not a level.
 *
 * It is a pure walk over the syntax tree: no schema, no variables, no
 * dependency (R9). It therefore also runs on a document that has not been
 * validated yet, which is the point — validation itself costs more as the
 * document grows, so the budget is checked first. An unknown or cyclic
 * fragment is counted as empty here and rejected by validation afterwards.
 */

export interface GraphQLLimits {
  /** Root selections of one operation, aliases included. */
  readonly maxRootFields: number
  /** Field selections of one operation after fragment expansion. */
  readonly maxSelections: number
  /** Nesting of fields. */
  readonly maxDepth: number
}

/**
 * Measured, not guessed (see the numbers above): 20 root fields is about
 * 200 ms and 1000 selections about a second of work on the reference
 * machine, and the admin and the repository's own examples stay far below
 * both. The same values are the defaults of the `graphql.limits` config
 * section in `@cogenta/core`.
 */
export const DEFAULT_GRAPHQL_LIMITS: GraphQLLimits = Object.freeze({
  maxRootFields: 20,
  maxSelections: 1000,
  maxDepth: 12,
})

/**
 * Introspection is exempt from the three limits above — a full introspection
 * query (GraphiQL's, `getIntrospectionQuery()`) nests `ofType` seven levels
 * and is legitimate — but not from every limit: its subtree gets a fixed
 * budget of its own, generous for the real query and still a ceiling for a
 * repeated-fragment bomb under `__schema`. Each aliased `__schema` / `__type`
 * still counts as a root field.
 */
const INTROSPECTION_MAX_SELECTIONS = 2000
const INTROSPECTION_MAX_DEPTH = 20

export type ComplexityRule = 'rootFields' | 'selections' | 'depth' | 'introspection'

export interface ComplexityViolation {
  readonly rule: ComplexityRule
  readonly limit: number
  readonly actual: number
}

interface Measure {
  /** Field selections, repeated spreads counted every time. */
  readonly selections: number
  /** Levels of fields below this selection set. */
  readonly depth: number
}

interface RootMeasure {
  readonly rootFields: number
  readonly selections: number
  readonly depth: number
  readonly introspectionSelections: number
  readonly introspectionDepth: number
}

const ZERO: Measure = { selections: 0, depth: 0 }
const INTROSPECTION_ROOTS: ReadonlySet<string> = new Set(['__schema', '__type'])

export function checkComplexity(
  document: DocumentNode,
  operationName: string | undefined,
  limits: GraphQLLimits,
): ComplexityViolation | undefined {
  const fragments = new Map<string, FragmentDefinitionNode>()
  const operations: OperationDefinitionNode[] = []
  for (const definition of document.definitions) {
    if (definition.kind === Kind.FRAGMENT_DEFINITION) {
      fragments.set(definition.name.value, definition)
    } else if (definition.kind === Kind.OPERATION_DEFINITION) {
      operations.push(definition)
    }
  }

  // Only the operation that will run is measured. When it cannot be told
  // (no name and several operations, or a name that matches nothing) execution
  // is going to refuse the request anyway: measure them all, so that refusal
  // is never a way around the budget.
  const named =
    operationName === undefined
      ? []
      : operations.filter((operation) => operation.name?.value === operationName)
  const measured = named.length > 0 ? named : operations

  try {
    const walker = createWalker(fragments)
    for (const operation of measured) {
      const violation = firstViolation(walker.measureRoot(operation.selectionSet), limits)
      if (violation !== undefined) return violation
    }
    return undefined
  } catch (error) {
    // A document nested deeply enough to overflow the stack is, by definition,
    // deeper than any limit that can be configured.
    if (error instanceof RangeError) {
      return { rule: 'depth', limit: limits.maxDepth, actual: Number.POSITIVE_INFINITY }
    }
    throw error
  }
}

function firstViolation(
  measure: RootMeasure,
  limits: GraphQLLimits,
): ComplexityViolation | undefined {
  if (measure.rootFields > limits.maxRootFields) {
    return { rule: 'rootFields', limit: limits.maxRootFields, actual: measure.rootFields }
  }
  if (measure.depth > limits.maxDepth) {
    return { rule: 'depth', limit: limits.maxDepth, actual: measure.depth }
  }
  if (measure.selections > limits.maxSelections) {
    return { rule: 'selections', limit: limits.maxSelections, actual: measure.selections }
  }
  if (
    measure.introspectionSelections > INTROSPECTION_MAX_SELECTIONS ||
    measure.introspectionDepth > INTROSPECTION_MAX_DEPTH
  ) {
    return {
      rule: 'introspection',
      limit: INTROSPECTION_MAX_SELECTIONS,
      actual: measure.introspectionSelections,
    }
  }
  return undefined
}

function createWalker(fragments: ReadonlyMap<string, FragmentDefinitionNode>): {
  measureRoot(set: SelectionSetNode): RootMeasure
} {
  // A fragment's measure does not depend on where it is spread (depth is
  // relative), so each is computed once however many times it is spread: a
  // fragment that spreads a fragment ten times, ten levels deep, expands to
  // 10^10 selections and costs ten lookups here.
  const fragmentMeasures = new Map<string, Measure>()
  const rootFragmentMeasures = new Map<string, RootMeasure>()
  const inProgress = new Set<string>()

  function measureSet(set: SelectionSetNode): Measure {
    let selections = 0
    let depth = 0
    for (const selection of set.selections) {
      let part: Measure
      if (selection.kind === Kind.FIELD) {
        const below =
          selection.selectionSet === undefined ? ZERO : measureSet(selection.selectionSet)
        part = { selections: 1 + below.selections, depth: 1 + below.depth }
      } else if (selection.kind === Kind.INLINE_FRAGMENT) {
        part = measureSet(selection.selectionSet)
      } else {
        part = measureFragment(selection.name.value)
      }
      selections += part.selections
      depth = Math.max(depth, part.depth)
    }
    return { selections, depth }
  }

  function measureFragment(name: string): Measure {
    const known = fragmentMeasures.get(name)
    if (known !== undefined) return known
    const definition = fragments.get(name)
    if (definition === undefined || inProgress.has(name)) return ZERO
    inProgress.add(name)
    const measure = measureSet(definition.selectionSet)
    inProgress.delete(name)
    fragmentMeasures.set(name, measure)
    return measure
  }

  function measureRootSet(set: SelectionSetNode): RootMeasure {
    let rootFields = 0
    let selections = 0
    let depth = 0
    let introspectionSelections = 0
    let introspectionDepth = 0
    for (const selection of set.selections) {
      let part: RootMeasure
      if (selection.kind === Kind.FIELD) {
        const below =
          selection.selectionSet === undefined ? ZERO : measureSet(selection.selectionSet)
        part = INTROSPECTION_ROOTS.has(selection.name.value)
          ? {
              rootFields: 1,
              selections: 0,
              depth: 0,
              introspectionSelections: 1 + below.selections,
              introspectionDepth: 1 + below.depth,
            }
          : {
              rootFields: 1,
              selections: 1 + below.selections,
              depth: 1 + below.depth,
              introspectionSelections: 0,
              introspectionDepth: 0,
            }
      } else if (selection.kind === Kind.INLINE_FRAGMENT) {
        part = measureRootSet(selection.selectionSet)
      } else {
        part = measureRootFragment(selection.name.value)
      }
      rootFields += part.rootFields
      selections += part.selections
      depth = Math.max(depth, part.depth)
      introspectionSelections += part.introspectionSelections
      introspectionDepth = Math.max(introspectionDepth, part.introspectionDepth)
    }
    return { rootFields, selections, depth, introspectionSelections, introspectionDepth }
  }

  function measureRootFragment(name: string): RootMeasure {
    const known = rootFragmentMeasures.get(name)
    if (known !== undefined) return known
    const empty: RootMeasure = {
      rootFields: 0,
      selections: 0,
      depth: 0,
      introspectionSelections: 0,
      introspectionDepth: 0,
    }
    const definition = fragments.get(name)
    if (definition === undefined || inProgress.has(`root:${name}`)) return empty
    inProgress.add(`root:${name}`)
    const measure = measureRootSet(definition.selectionSet)
    inProgress.delete(`root:${name}`)
    rootFragmentMeasures.set(name, measure)
    return measure
  }

  return { measureRoot: measureRootSet }
}

/**
 * The refusal. Every number in the message comes from the document the caller
 * just sent (a count of its own selections) or from the server's own limits,
 * so — like a validation error — it is safe to return as written.
 */
export function complexityError(violation: ComplexityViolation): GraphQLError {
  const code = 'GRAPHQL_QUERY_TOO_COMPLEX' satisfies ErrorCode
  const actual = Number.isFinite(violation.actual) ? String(violation.actual) : 'too many'
  const subject: Record<ComplexityRule, string> = {
    rootFields: `${actual} root fields (aliases included) where at most ${violation.limit} are allowed`,
    selections: `${actual} field selections after expanding fragments where at most ${violation.limit} are allowed`,
    depth: `a depth of ${actual} where at most ${violation.limit} is allowed`,
    introspection: `an introspection selection of ${actual} fields where at most ${violation.limit} are allowed`,
  }
  const hint: Record<ComplexityRule, string> = {
    rootFields:
      'Split the request into several smaller ones, or ask the site administrator to raise graphql.limits.maxRootFields.',
    selections:
      'Ask for fewer fields, avoid spreading the same fragment many times, or ask the site administrator to raise graphql.limits.maxSelections.',
    depth: 'Flatten the query, or ask the site administrator to raise graphql.limits.maxDepth.',
    introspection: 'Run the standard introspection query once instead of repeating it.',
  }
  return new GraphQLError(`This query is too complex: it has ${subject[violation.rule]}.`, {
    extensions: { code, hint: hint[violation.rule], rule: violation.rule, limit: violation.limit },
  })
}
