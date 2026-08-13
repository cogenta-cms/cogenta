import { z } from 'zod'
import {
  CACHE_DRIVERS,
  DATABASE_DRIVERS,
  EMBEDDINGS_PROVIDERS,
  QUEUE_DRIVERS,
  STORAGE_DRIVERS,
} from './types.js'

const nonEmpty = z.string().min(1)

// Every object is strict: a typo in a key is an error, never a silently ignored
// setting. Config drift between staging and production is the daily pain this
// project exists to remove (ADR-0010).
const siteSchema = z
  .strictObject({
    name: nonEmpty,
    url: z.url(),
    locales: z.array(nonEmpty).min(1).default(['en']),
    defaultLocale: nonEmpty.default('en'),
  })
  .refine((site) => site.locales.includes(site.defaultLocale), {
    error: 'defaultLocale must be one of the configured locales',
    path: ['defaultLocale'],
  })

const databaseSchema = z.strictObject({
  driver: z.enum(DATABASE_DRIVERS).optional(),
  url: nonEmpty,
})

const cacheSchema = z.strictObject({
  driver: z.enum(CACHE_DRIVERS).default('auto'),
  url: nonEmpty.optional(),
  path: nonEmpty.default('./.cogenta/cache'),
})

const queueSchema = z.strictObject({
  driver: z.enum(QUEUE_DRIVERS).default('auto'),
  url: nonEmpty.optional(),
})

const storageSchema = z.strictObject({
  driver: z.enum(STORAGE_DRIVERS).default('auto'),
  bucket: nonEmpty.optional(),
  region: nonEmpty.optional(),
  endpoint: nonEmpty.optional(),
  path: nonEmpty.default('./.cogenta/media'),
  baseUrl: nonEmpty.default('/media'),
})

const llmSchema = z.strictObject({
  provider: nonEmpty,
  model: nonEmpty,
  baseUrl: nonEmpty.optional(),
})

const embeddingsSchema = z.strictObject({
  provider: z.enum(EMBEDDINGS_PROVIDERS).default('local'),
  model: nonEmpty.default('all-MiniLM-L6-v2'),
  dimensions: z.number().int().positive().default(384),
})

// `prefault` rather than `default`: an omitted section is parsed as `{}` so the
// per-field defaults inside it apply, instead of being replaced wholesale.
export const configSchema = z.strictObject({
  site: siteSchema,
  database: databaseSchema,
  cache: cacheSchema.prefault({}),
  queue: queueSchema.prefault({}),
  storage: storageSchema.prefault({}),
  llm: llmSchema.optional(),
  embeddings: embeddingsSchema.prefault({}),
})

export type ParsedConfig = z.infer<typeof configSchema>

/**
 * Renders Zod issues as `field: reason`, one per line, so the user sees every
 * problem at once instead of fixing them one restart at a time.
 */
export function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.map(String).join('.')
      return `  ${path === '' ? '(root)' : path}: ${issue.message}`
    })
    .join('\n')
}
