import { z } from 'zod'
import {
  CACHE_DRIVERS,
  DATABASE_DRIVERS,
  EMBEDDINGS_PROVIDERS,
  IMAGE_GENERATION_PROVIDERS,
  PAYMENT_DRIVERS,
  QUEUE_DRIVERS,
  RATE_LIMIT_DRIVERS,
  STORAGE_DRIVERS,
  VECTOR_DRIVERS,
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
    /**
     * Which page answers a URL that matches nothing (L14 task 2).
     *
     * A path, not a template name: the "custom 404" a site really wants is a
     * page its editors wrote — with the site's own blocks, links and wording —
     * and this codebase already has exactly one way to turn a path into a
     * rendered page. So the 404 body is a real entry, editable in the admin
     * like any other, and a site that has not written one still gets the plain
     * refusal it got before.
     */
    notFoundPath: z
      .string()
      .startsWith('/', { error: 'notFoundPath must be a site-relative path starting with "/"' })
      .default('/404'),
  })
  .refine((site) => site.locales.includes(site.defaultLocale), {
    error: 'defaultLocale must be one of the configured locales',
    path: ['defaultLocale'],
  })

const databaseSchema = z.strictObject({
  driver: z.enum(DATABASE_DRIVERS).optional(),
  url: nonEmpty,
  // Modest by default: shared hosting allows very few connections, and
  // exhausting them takes the site down rather than slowing it.
  poolSize: z.number().int().positive().max(100).default(5),
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

const rateLimitSchema = z.strictObject({
  driver: z.enum(RATE_LIMIT_DRIVERS).default('auto'),
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

/**
 * CORS, off unless a site names an origin (L10 task 6).
 *
 * There is no `enabled` flag on purpose: the list of allowed origins *is* the
 * switch, so "CORS is on" and "these origins may read it" cannot drift apart.
 * `'*'` is accepted and refused in the same breath as credentials — a wildcard
 * with credentials is rejected by every browser, and silently emitting the
 * pair would look configured while doing nothing.
 */
const corsSchema = z
  .strictObject({
    /** Exact origins (`https://app.example.com`), or the single value `*`. Empty means CORS is off. */
    origins: z.array(nonEmpty).default([]),
    methods: z.array(nonEmpty).default(['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE']),
    headers: z.array(nonEmpty).default(['content-type', 'authorization']),
    /** Allows a browser to send cookies and `Authorization`. Never valid with `*`. */
    credentials: z.boolean().default(false),
    /** Seconds a browser may cache a preflight. */
    maxAge: z.number().int().nonnegative().max(86_400).default(600),
  })
  .refine((cors) => !(cors.credentials && cors.origins.includes('*')), {
    error: 'credentials cannot be combined with the "*" origin — every browser refuses that pair',
    path: ['credentials'],
  })

const securitySchema = z.strictObject({
  cors: corsSchema.prefault({}),
  /**
   * `Content-Security-Policy`, verbatim.
   *
   * A string rather than a builder: a CSP is a deployment decision that
   * depends on which analytics, fonts and embeds a site actually uses, and a
   * builder that covers half of them produces a policy nobody can predict
   * from reading the config. `false` sends no header at all — for the site
   * that already sets one at its reverse proxy.
   */
  csp: z.union([nonEmpty, z.literal(false)]).optional(),
  /**
   * `Strict-Transport-Security`, in seconds. `0` disables it.
   *
   * Off by default, and that is not timidity: HSTS on a host that is not yet
   * fully HTTPS locks browsers out of it for `maxAge` seconds with no way to
   * undo it from the server side. It is the one header a wrong default can
   * take a site offline with.
   */
  hstsMaxAge: z.number().int().nonnegative().max(63_072_000).default(0),
  hstsIncludeSubDomains: z.boolean().default(true),
  /** How long a public page may be cached, in seconds. */
  pageMaxAge: z.number().int().nonnegative().max(86_400).default(60),
})

/**
 * The log of public URLs that answered a 404 (fiche 12 task 1).
 *
 * On by default, because an unresolved 404 is the daily nuisance no CMS
 * should make an editor discover by luck. Everything it keeps is bounded on
 * purpose: `maxPaths` is the hard cap on distinct paths tracked at once — an
 * anonymous scanner can produce thousands of unique URLs a minute, and
 * without a ceiling this log would be a disk-exhaustion vector any visitor
 * could trigger — and `retainDays` is how long a path is kept since it was
 * last requested. Neither an IP address nor a user agent is ever a field
 * here, on any path: `AGENTS.md` § Logs forbids personal data outright, and
 * the path plus its referrer already answer the only question this log
 * exists for ("what should I redirect?").
 */
const notFoundLogSchema = z.strictObject({
  enabled: z.boolean().default(true),
  maxPaths: z.number().int().positive().max(100_000).default(2000),
  retainDays: z.number().int().positive().max(3650).default(30),
})

/**
 * Outbound content-lifecycle webhooks (L14 task 1).
 *
 * Only the destinations live here. The shared signing secret never does: it
 * comes from `COGENTA_WEBHOOK_SECRET` like every other secret (rule R7), and
 * with no secret set the site sends nothing at all rather than sending
 * unsigned requests — an unsigned webhook is an unauthenticated instruction
 * arriving at somebody else's server.
 */
const webhooksSchema = z.strictObject({
  /** Absolute `http(s)` URLs. Empty — the default — means no webhook is sent. */
  endpoints: z.array(z.url()).default([]),
})

/**
 * Analytics events retention (fiche 27 task 3).
 *
 * 400 days by default — long enough that "compare this year to last year" (a
 * real question a site owner asks) still has data on both sides, short
 * enough that the events table cannot grow forever on a busy site. `cogenta
 * serve` purges past this every day; there is no way to disable purging
 * outright, only to choose how long to keep.
 */
const analyticsSchema = z.strictObject({
  retainDays: z.number().int().positive().max(3650).default(400),
})

const embeddingsSchema = z.strictObject({
  provider: z.enum(EMBEDDINGS_PROVIDERS).default('local'),
  model: nonEmpty.default('all-MiniLM-L6-v2'),
  dimensions: z.number().int().positive().default(384),
})

/**
 * Image generation (L18 task 4).
 *
 * No default provider and no default model: unlike a cache, there is no
 * service-free way to draw a picture, so a site either names a vendor or does
 * not have the feature. `IMAGE_GENERATION_PROVIDERS` is a closed enum for the
 * same reason `CACHE_DRIVERS` is — a typo must be an error at startup, not a
 * `PROVIDER_UNKNOWN` the first time an editor presses the button.
 */
const imageGenerationSchema = z.strictObject({
  provider: z.enum(IMAGE_GENERATION_PROVIDERS),
  model: nonEmpty,
  baseUrl: nonEmpty.optional(),
})

/**
 * Where embeddings live (L18 tasks 1/5).
 *
 * Deliberately carries no `dimensions`: that belongs to `embeddings`, and a
 * second copy here could drift from it — which is precisely the failure the
 * vector store refuses at `upsert` time.
 */
const vectorSchema = z.strictObject({
  driver: z.enum(VECTOR_DRIVERS).default('auto'),
  path: nonEmpty.default('./.cogenta/vectors'),
  table: nonEmpty.default('cogenta_vectors'),
})

/**
 * Seller details for invoicing (contract E, ADR-0024).
 *
 * No defaults at all, unlike every other optional section: a guessed legal
 * name or a blank address would produce an invoice that looks real and is
 * not, which is worse than the feature being off. `cogenta serve` only mounts
 * the invoice router once a site has filled this in.
 */
const billingSchema = z.strictObject({
  legalName: nonEmpty,
  address: z.array(nonEmpty).min(1),
  taxId: nonEmpty.optional(),
  footer: nonEmpty.optional(),
})

/**
 * The scheduled-task clock (fiche 28 task 5).
 *
 * `'internal'` (the default) is `cogenta serve`'s own `setInterval` loop —
 * the same shape every other recurring job in this codebase has always
 * used, and the right choice for a process that stays up. `'external-cron'`
 * is `docs/hebergement-mutualise.md`'s target: a host that recycles the
 * process between requests, where an in-memory timer never fires reliably.
 * In that mode `cogenta serve` registers every task but never ticks its own
 * clock — only `cogenta cron`, called from the panel's own cron, drains due
 * tasks. The admin screen reads this setting to say which mode is active,
 * rather than guessing from whether a tick has happened recently.
 */
const schedulerSchema = z.strictObject({
  mode: z.enum(['internal', 'external-cron']).default('internal'),
})

/**
 * Scheduled full-site backups, riding the same clock as every other
 * maintenance task (fiche 28 task 1's "sauvegarde planifiée", reusing
 * `@cogenta/export`'s `createBackup` — the exact function `cogenta backup
 * create` already calls by hand). Off by default: a backup file is
 * unbounded disk usage a site did not ask for, and `dir` defaults to
 * `.cogenta/backups` — the same directory the manual command writes to, so
 * `cogenta backup list` shows scheduled and manual backups side by side.
 */
const backupSchema = z.strictObject({
  enabled: z.boolean().default(false),
  intervalHours: z
    .number()
    .int()
    .positive()
    .max(24 * 30)
    .default(24),
  /** Files kept before the oldest is pruned. */
  keep: z.number().int().positive().max(365).default(10),
  dir: nonEmpty.default('.cogenta/backups'),
})

/**
 * The writing assistant's spending cap (fiche 30 task 3).
 *
 * A non-null default rather than "unlimited": the lot's own pitfall is exact
 * — "le coût est invisible jusqu'à la facture", and a service billed per token
 * left uncapped by default is the wrong default for a CMS that ships with AI
 * off. One million tokens a month is generous for a single site's editors
 * while still being a real ceiling, not a decoration.
 */
const assistantSchema = z.strictObject({
  monthlyTokenLimit: z.number().int().positive().default(1_000_000),
})

/**
 * OpenTelemetry tracing (fiche L22 task 5). No `otlpHeaders` field, on
 * purpose (rule R7, `SECRET_KEYS` in `env.ts` refuses it before this schema
 * even parses) — those come from `COGENTA_OTLP_HEADERS`/
 * `OTEL_EXPORTER_OTLP_HEADERS` only. `otlpEndpoint` absent means local
 * collection only: the recent-events buffer behind the admin's
 * "Exploitation" screen always works with nothing configured here (R1).
 */
const observabilitySchema = z.strictObject({
  serviceName: nonEmpty.default('cogenta'),
  otlpEndpoint: z.url().optional(),
})

/**
 * Contract E's payment gateway choice (fiche 34 task 3).
 *
 * No `secretKey` or `webhookSecret` field, on purpose (rule R7, same shape as
 * `llmSchema`'s missing `apiKey`): Stripe's credentials come from
 * `COGENTA_PAYMENT_STRIPE_SECRET_KEY`/`COGENTA_PAYMENT_STRIPE_WEBHOOK_SECRET`
 * only, and `SECRET_KEYS` (`env.ts`) refuses either one written here before
 * this schema is even parsed. `testMode` defaults `true`: a shop that has not
 * deliberately flipped it to production cannot silently start taking real
 * money, matching the fiche's "le mode test doit être criant".
 */
const paymentSchema = z.strictObject({
  driver: z.enum(PAYMENT_DRIVERS).default('auto'),
  testMode: z.boolean().default(true),
  manualInstructions: nonEmpty.optional(),
})

/**
 * Google Search Console OAuth (fiche 70 task 4, ADR-0032). No fields at all —
 * the app's own OAuth client id/secret are both secrets (rule R7) and come
 * from `COGENTA_SEARCH_CONSOLE_CLIENT_ID`/`COGENTA_SEARCH_CONSOLE_CLIENT_SECRET`
 * only, refused here by `SECRET_KEYS` (`env.ts`) exactly like `payment`'s own
 * Stripe/PayPal keys. Everything per-site — whether a site has connected, and
 * which GSC property it queries — lives in the database
 * (`@cogenta/schema`'s `search-console-store.ts`), never here: this section
 * exists only so the *installation* can offer the connector at all.
 */
const searchConsoleSchema = z.strictObject({})

// `prefault` rather than `default`: an omitted section is parsed as `{}` so the
// per-field defaults inside it apply, instead of being replaced wholesale.
export const configSchema = z.strictObject({
  site: siteSchema,
  database: databaseSchema,
  cache: cacheSchema.prefault({}),
  queue: queueSchema.prefault({}),
  rateLimit: rateLimitSchema.prefault({}),
  storage: storageSchema.prefault({}),
  security: securitySchema.prefault({}),
  notFoundLog: notFoundLogSchema.prefault({}),
  webhooks: webhooksSchema.prefault({}),
  analytics: analyticsSchema.prefault({}),
  llm: llmSchema.optional(),
  embeddings: embeddingsSchema.prefault({}),
  imageGeneration: imageGenerationSchema.optional(),
  vector: vectorSchema.prefault({}),
  billing: billingSchema.optional(),
  scheduler: schedulerSchema.prefault({}),
  backup: backupSchema.prefault({}),
  assistant: assistantSchema.prefault({}),
  payment: paymentSchema.prefault({}),
  observability: observabilitySchema.prefault({}),
  searchConsole: searchConsoleSchema.prefault({}),
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
