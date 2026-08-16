import { collectionInputSchema } from '@cogenta/schema'
import { z } from 'zod'
import type { ProviderClient } from '../providers/types.js'
import { extractJsonObject } from './json.js'
import type { ContentModelProposal, DemoEntry, SiteBrief } from './types.js'

/**
 * "Du contenu de démonstration cohérent avec le besoin exprimé, pas un texte
 * générique" — the last clause of L19's "Proposition de plan de site".
 *
 * The entries are validated against the very schema the accepted collections
 * declare (`collectionInputSchema`, contract A), so a demo entry that would
 * not save is dropped here rather than blowing up at seed time. An entry
 * that fails is reported, not silently repaired: a demo entry is content the
 * human will read and edit, and quietly inventing a value for a required
 * field they never saw proposed is exactly the kind of helpfulness this lot
 * cannot afford.
 */

const EntrySchema = z.object({
  collection: z.string().min(1),
  values: z.record(z.string(), z.unknown()),
})

const ResponseSchema = z.object({
  entries: z.array(EntrySchema).max(40),
})

export interface ProposeDemoContentOptions {
  readonly client: ProviderClient
  readonly model: string
  readonly brief: SiteBrief
  readonly contentModel: ContentModelProposal
  /** Entries asked for per collection. Defaults to 3. */
  readonly perCollection?: number
  readonly maxAttempts?: number
}

export interface DemoContentRejection {
  readonly collection: string
  readonly reason: string
}

export type ProposeDemoContentResult =
  | {
      readonly ok: true
      readonly entries: readonly DemoEntry[]
      readonly rejected: readonly DemoContentRejection[]
      readonly attempts: number
    }
  | { readonly ok: false; readonly attempts: number; readonly reason: string }

const DEFAULT_MAX_ATTEMPTS = 2
const MAX_TOKENS = 4000

function describeCollections(contentModel: ContentModelProposal): string {
  return contentModel.collections
    .map((collection) => {
      const fields = Object.entries(collection.definition.fields)
        .map(([name, field]) => {
          const required = field.required === true ? ', required' : ''
          const options =
            Object.keys(field.options).length === 0 ? '' : ` ${JSON.stringify(field.options)}`
          return `    - ${name}: ${field.kind}${required}${options}`
        })
        .join('\n')
      return `  "${collection.definition.name}" (${collection.rationale})\n${fields}`
    })
    .join('\n')
}

function buildPrompt(options: ProposeDemoContentOptions, correction: string | undefined): string {
  const perCollection = options.perCollection ?? 3
  const lines = [
    'You are writing demonstration content for a brand-new Cogenta CMS site, so its owner sees the site working with something recognisable rather than "Lorem ipsum".',
    '',
    `Activity: ${options.brief.activity}`,
    `Audience: ${options.brief.audience}`,
    `Tone: ${options.brief.tone}`,
    `Write in: ${options.brief.languages[0] ?? 'en'}`,
    '',
    'Collections and their fields:',
    describeCollections(options.contentModel),
    '',
    `Write up to ${perCollection} entries per collection.`,
    '',
    'Reply with a single JSON object:',
    '{ "entries": [{ "collection": "project", "values": { "title": "…", "slug": "…" } }] }',
    '',
    'Rules:',
    '- Use only the field names listed above. An unknown field makes the entry unusable.',
    '- Fill every required field.',
    '- A "slug" value must be lowercase words joined by hyphens.',
    '- A "richText" or "blocks" value is hard to write by hand — leave those fields out unless you are sure of the shape.',
    '- Write content that fits the activity above. Never generic filler.',
    '- Reply with ONLY the JSON object. No prose, no markdown fence.',
  ]
  if (correction !== undefined) {
    lines.push(
      '',
      `Your previous attempt was rejected: ${correction}`,
      'Reply again with ONLY the corrected JSON object.',
    )
  }
  return lines.join('\n')
}

export async function proposeDemoContent(
  options: ProposeDemoContentOptions,
): Promise<ProposeDemoContentResult> {
  if (options.contentModel.collections.length === 0) {
    return { ok: true, entries: [], rejected: [], attempts: 0 }
  }

  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const schemas = new Map(
    options.contentModel.collections.map((collection) => [
      collection.definition.name,
      collectionInputSchema(collection.definition),
    ]),
  )

  let correction: string | undefined
  let lastReason = 'no attempt was made'

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let content: string | null
    try {
      const response = await options.client.chat({
        model: options.model,
        messages: [{ role: 'user', content: buildPrompt(options, correction) }],
        maxTokens: MAX_TOKENS,
      })
      content = response.content
    } catch (error) {
      lastReason = `model call failed: ${error instanceof Error ? error.message : String(error)}`
      correction = lastReason
      continue
    }

    let candidate: unknown
    try {
      candidate = extractJsonObject(content)
    } catch {
      lastReason = 'the model did not return a JSON object'
      correction =
        'Your previous response was not a single JSON object. Reply with ONLY the JSON object.'
      continue
    }

    const parsed = ResponseSchema.safeParse(candidate)
    if (!parsed.success) {
      lastReason = parsed.error.issues[0]?.message ?? 'the entries were not in the expected shape'
      correction = lastReason
      continue
    }

    const entries: DemoEntry[] = []
    const rejected: DemoContentRejection[] = []
    for (const entry of parsed.data.entries) {
      const schema = schemas.get(entry.collection)
      if (schema === undefined) {
        rejected.push({
          collection: entry.collection,
          reason: 'no such collection is in the accepted content model',
        })
        continue
      }
      const validated = schema.safeParse(entry.values)
      if (!validated.success) {
        rejected.push({
          collection: entry.collection,
          reason:
            validated.error.issues
              .slice(0, 3)
              .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
              .join('; ') || 'the values did not match the collection schema',
        })
        continue
      }
      entries.push({ collection: entry.collection, values: entry.values })
    }

    return { ok: true, entries, rejected, attempts: attempt }
  }

  return { ok: false, attempts: maxAttempts, reason: lastReason }
}
