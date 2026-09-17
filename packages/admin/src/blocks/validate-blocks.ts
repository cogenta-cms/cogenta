import type { TFunction } from 'i18next'
import type { BlockZones, ContentBlock } from '../api/content-client.js'
import { blockLabel } from './localize-block-fields.js'
import { BLOCK_VOCABULARY, type ItemFieldDefinition, startingBlockData } from './vocabulary.js'

/**
 * What stops a page from saving, found before the request (L36 audit).
 *
 * The server refuses a block contract B rejects, and says so in the terms of
 * the contract (`actions.0.target: Invalid input`). An editor needs to know
 * which block, which field, and what to do — so the common cases are checked
 * here, in the admin's own words, and anything this misses still comes back
 * from the server and is described by `describeBlockRefusal`.
 *
 * Only the frozen vocabulary is checked: a plugin block's rules live in its
 * manifest, which the server applies.
 */

export interface BlockProblem {
  /** The block to select so the editor lands on the field. */
  readonly key: string
  readonly message: string
}

type Shape = Pick<ItemFieldDefinition, 'name' | 'kind' | 'required' | 'options' | 'admin'>

/**
 * Blank the way the server reads it — `null` and `''` are dropped before
 * validation — and no stricter: an admin that refused what the server would
 * store would block a save for nothing.
 */
function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

function linkIncomplete(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return true
  const target = value as Record<string, unknown>
  if ('collection' in target) return typeof target['id'] !== 'string' || target['id'] === ''
  return typeof target['href'] !== 'string' || target['href'] === ''
}

function fieldName(shape: Shape, t: TFunction): string {
  return shape.admin?.label ?? t(`blockFields.${shape.name}`, { defaultValue: shape.name })
}

/** The first problem in one value, as `[path, reason]`, or `null`. */
function check(shape: Shape, value: unknown, t: TFunction): [string, string] | null {
  const name = fieldName(shape, t)
  if (shape.kind === 'link') {
    // An emptied address is dropped by the server like any empty value, so an
    // optional link left blank is simply absent.
    const emptiedAddress =
      value !== null &&
      typeof value === 'object' &&
      !('collection' in value) &&
      linkIncomplete(value)
    const absent = isBlank(value) || emptiedAddress
    if (absent && !shape.required) return null
    return linkIncomplete(value) ? [name, t('blockValidation.linkIncomplete')] : null
  }
  if (shape.kind === 'json' && shape.options['list'] === true) {
    const list = Array.isArray(value) ? (value as readonly unknown[]) : []
    const min = typeof shape.options['min'] === 'number' ? shape.options['min'] : 0
    const max = shape.options['max']
    if (list.length < min) return [name, t('blockValidation.tooFew', { count: min })]
    if (typeof max === 'number' && list.length > max) {
      return [name, t('blockValidation.tooMany', { count: max })]
    }
    const items = (shape.options['items'] ?? []) as readonly ItemFieldDefinition[]
    for (const [index, item] of list.entries()) {
      const record = (item ?? {}) as Record<string, unknown>
      for (const itemShape of items) {
        const found = check(itemShape, record[itemShape.name], t)
        if (found !== null) {
          const position = t('blockValidation.item', { position: index + 1 })
          return [`${name} › ${position} › ${found[0]}`, found[1]]
        }
      }
    }
    return null
  }
  if (shape.kind === 'json' && shape.options['object'] === true) {
    const present = value !== null && typeof value === 'object' && Object.keys(value).length > 0
    if (!present) return shape.required ? [name, t('blockValidation.required')] : null
    const record = value as Record<string, unknown>
    for (const member of (shape.options['items'] ?? []) as readonly ItemFieldDefinition[]) {
      const found = check(member, record[member.name], t)
      if (found !== null) return [`${name} › ${found[0]}`, found[1]]
    }
    return null
  }
  if (shape.required && isBlank(value)) return [name, t('blockValidation.required')]
  if (shape.kind === 'number' && typeof value === 'number') {
    const { min, max } = shape.options
    if (typeof min === 'number' && value < min) {
      return [name, t('blockValidation.numberMin', { min })]
    }
    if (typeof max === 'number' && value > max) {
      return [name, t('blockValidation.numberMax', { max })]
    }
  }
  return null
}

export function findBlockProblems(
  blocks: readonly ContentBlock[],
  t: TFunction,
): readonly BlockProblem[] {
  const problems: BlockProblem[] = []
  for (const [index, block] of blocks.entries()) {
    const definition = BLOCK_VOCABULARY.find((candidate) => candidate.name === block.type)
    if (definition === undefined) continue
    for (const field of definition.fields) {
      const found = check(field, block.data[field.name], t)
      if (found === null) continue
      problems.push({
        key: block.key,
        message: t('blockValidation.problem', {
          position: index + 1,
          block: blockLabel(definition, t),
          field: found[0],
          reason: found[1],
        }),
      })
      break
    }
  }
  return problems
}

/**
 * The server's `BLOCK_INVALID` refusal (`Block "cta" (home-cta) is invalid:
 * actions.0.target: …`) in the editor's words, or `null` when the message is
 * not one.
 */
export function describeBlockRefusal(
  message: string,
  blocks: readonly ContentBlock[],
  t: TFunction,
): BlockProblem | null {
  const match = /\(([^)]*)\) is invalid:\s*([^:\n]+):/u.exec(message)
  if (match === null) return null
  const [, key = '', path = ''] = match
  const index = blocks.findIndex((block) => block.key === key)
  const block = blocks[index]
  if (block === undefined) return null
  const definition = BLOCK_VOCABULARY.find((candidate) => candidate.name === block.type)
  const readable = path
    .trim()
    .split('.')
    .map((segment) =>
      /^\d+$/u.test(segment)
        ? t('blockValidation.item', { position: Number(segment) + 1 })
        : t(`blockFields.${segment}`, { defaultValue: segment }),
    )
    .join(' › ')
  return {
    key,
    message: t('blockValidation.problem', {
      position: index + 1,
      block: definition === undefined ? block.type : blockLabel(definition, t),
      field: readable,
      reason: t('blockValidation.invalid'),
    }),
  }
}

function meaningful(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.values(value).some(meaningful)
  return true
}

/**
 * A new entry's zones without the blocks nobody wrote in — the starting set a
 * page opens with (`settings.general.defaultBlocks`) left as it came. Saving
 * one would be refused (an empty text block has no text), and it holds
 * nothing to keep.
 */
export function withoutUntouchedBlocks(zones: BlockZones): BlockZones {
  const next: Record<string, readonly ContentBlock[]> = {}
  for (const [zone, blocks] of Object.entries(zones)) {
    next[zone] = blocks.filter((block) => {
      const starting = startingBlockData(block.type)
      return Object.entries(block.data).some(
        ([name, value]) => meaningful(value) && value !== starting[name],
      )
    })
  }
  return next
}
