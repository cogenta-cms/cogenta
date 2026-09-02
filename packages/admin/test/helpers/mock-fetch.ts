import { vi } from 'vitest'

export interface MockUser {
  readonly id: string
  readonly email: string
  readonly roles: readonly string[]
}

export const USER: MockUser = { id: 'user-1', email: 'alice@example.com', roles: ['editor'] }
export const VALID_TOKEN = 'valid-test-token'

/**
 * A miniature stand-in for `@cogenta/agents`' `parseSkillFile`/`renderSkillFile`
 * (L24 task 4) — this file imports nothing but `vitest`, so the mock backend
 * for `/api/agent-skills` reads/writes the same `---\nkey: value\n---\nbody`
 * shape by hand rather than pulling in the real package.
 */
function parseMockSkillContent(content: string): {
  name: string
  description: string
  instructions: string
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content)
  if (match === null) return { name: '', description: '', instructions: content.trim() }
  const [, frontmatter = '', body = ''] = match
  const fields: Record<string, string> = {}
  for (const line of frontmatter.split('\n')) {
    const separatorIndex = line.indexOf(':')
    if (separatorIndex === -1) continue
    fields[line.slice(0, separatorIndex).trim()] = line.slice(separatorIndex + 1).trim()
  }
  return {
    name: fields.name ?? '',
    description: fields.description ?? '',
    instructions: body.trim(),
  }
}

function renderMockSkillContent(name: string, description: string, instructions: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n${instructions}\n`
}

export const MOCK_SCHEMA = {
  contract: 'schema@2.0',
  taxonomies: [
    {
      name: 'topic',
      labels: { singular: { fr: 'Sujet', en: 'Topic' } },
      hierarchical: true,
      // `delete` is admin-only on purpose: it is what the role tests turn on.
      permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
    },
  ],
  collections: [
    {
      name: 'article',
      labels: { singular: 'Article', plural: 'Articles' },
      trash: { retainDays: 30 },
      permissions: {
        read: ['public'],
        create: ['editor'],
        update: ['editor'],
        delete: ['editor'],
        publish: ['editor'],
      },
      fields: [
        {
          name: 'title',
          kind: 'text',
          required: true,
          localized: false,
          unique: false,
          hasCustomValidation: false,
          options: {},
        },
        // A second plain-text field, deliberately not first — this is what a
        // regression on `assistFields` indexing by array position rather than
        // by field name would get wrong (`packages/admin/test/entry-edit.test.tsx`,
        // "identifies each assist field by its real name").
        {
          name: 'summary',
          kind: 'text',
          required: false,
          localized: false,
          unique: false,
          hasCustomValidation: false,
          options: {},
        },
        // Contract A's ordinary, optional field — declared so the scheduling
        // control has somewhere real to write a future publication date
        // (`packages/admin/test/entry-edit.test.tsx`, "scheduling a future publication").
        {
          name: 'publishedAt',
          kind: 'datetime',
          required: false,
          localized: false,
          unique: false,
          hasCustomValidation: false,
          options: {},
        },
        // A block zone, so the entry editor can offer both of its modes
        // (L16): without one there is nothing to compose visually and the
        // switch correctly does not appear at all.
        {
          name: 'body',
          kind: 'blocks',
          required: false,
          localized: false,
          unique: false,
          hasCustomValidation: false,
          options: { allow: '*' },
        },
      ],
    },
    {
      name: 'secret-memo',
      labels: { singular: 'Secret memo', plural: 'Secret memos' },
      permissions: { read: ['admin'] },
      fields: [],
    },
    // A second collection with a trash of its own (fiche 07 task 1, the
    // "All" tab): distinct `retainDays` from `article`'s, so the merged view
    // and its banner have something real to tell apart.
    {
      name: 'note',
      labels: { singular: 'Note', plural: 'Notes' },
      trash: { retainDays: 7 },
      permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['editor'] },
      fields: [
        {
          name: 'title',
          kind: 'text',
          required: true,
          localized: false,
          unique: false,
          hasCustomValidation: false,
          options: {},
        },
      ],
    },
    // The editorial workflow (`schema@2.1`, ADR-0027): `update` is
    // `own: true` for `contributor`, so this is also the fixture the
    // owner-permission tests exercise.
    {
      name: 'wf-article',
      labels: { singular: 'Workflow article', plural: 'Workflow articles' },
      workflow: { enabled: true },
      permissions: {
        read: ['public'],
        create: ['contributor'],
        update: { roles: ['contributor'], own: true },
        publish: ['editor'],
      },
      fields: [
        {
          name: 'title',
          kind: 'text',
          required: true,
          localized: false,
          unique: false,
          hasCustomValidation: false,
          options: {},
        },
      ],
    },
  ],
}

/** One entry sitting in the trash, for the screen that exists to show it. */
export const MOCK_TRASHED_ENTRY = {
  id: 'entry-trashed',
  status: 'published',
  // Orthogonal to `status` (ADR-0022): it was published when it was thrown
  // away, and restoring it must give that back.
  deletedAt: '2026-03-01T00:00:00.000Z',
  version: 3,
  createdAt: '2026-01-03T00:00:00.000Z',
  updatedAt: '2026-03-01T00:00:00.000Z',
  locale: 'en',
  translationOf: null,
  values: { title: 'Thrown away' },
  blocks: {},
}

/**
 * A second trashed `article`, whose `untrash`/`purge` routes below always
 * refuse it (fiche 07 task 2 — a bulk action reporting a real, named
 * failure). `untrash` answers 404 (a realistic race: someone else already
 * restored or purged it first — `CONTENT_NOT_TRASHED`/`CONTENT_NOT_FOUND` in
 * the real store, never `restrict`, which `@cogenta/schema`'s `store.ts`
 * only ever checks on `delete()`/`purge()`). `purge` answers 409
 * `CONTENT_REFERENCED`, the one this entry's own route really does raise —
 * matching the real server's message shape from `assertNotReferenced`.
 */
export const MOCK_TRASHED_BLOCKED_ENTRY = {
  id: 'entry-trashed-blocked',
  status: 'draft',
  deletedAt: '2026-03-02T00:00:00.000Z',
  version: 1,
  createdAt: '2026-01-04T00:00:00.000Z',
  updatedAt: '2026-03-02T00:00:00.000Z',
  locale: 'en',
  translationOf: null,
  values: { title: 'Still referenced elsewhere' },
  blocks: {},
}

/** One entry in `note`'s own trash (fiche 07 task 1, the "All" tab). */
export const MOCK_TRASHED_NOTE = {
  id: 'note-trashed',
  status: 'draft',
  deletedAt: '2026-03-03T00:00:00.000Z',
  version: 1,
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-03-03T00:00:00.000Z',
  locale: 'en',
  translationOf: null,
  values: { title: 'A note nobody kept' },
  blocks: {},
}

export const MOCK_ENTRIES = [
  {
    id: 'entry-1',
    status: 'published',
    version: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    createdBy: 'user-1',
    updatedBy: 'user-1',
    locale: 'en',
    translationOf: null,
    deletedAt: null,
    publishedAt: '2026-02-01T00:00:00.000Z',
    values: { title: 'First article', summary: 'A summary worth reading' },
    // The zone exists and is empty. Seeding a block here instead would put a
    // second field called `title` — the hero's — on every screen that renders
    // this entry, which is a fixture deciding what five unrelated tests can
    // query for. A builder test that wants a block adds one.
    blocks: { body: [] },
  },
  {
    id: 'entry-2',
    status: 'draft',
    version: 1,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    createdBy: USER.id,
    locale: 'en',
    translationOf: null,
    deletedAt: null,
    publishedAt: null,
    values: { title: 'Second article' },
    blocks: {},
  },
]

/**
 * `?counts=1` (fiche 01 "Liste de contenu", task 4) for the `article` mock
 * fixture — a status-by-status tally of `MOCK_ENTRIES`, trash excluded
 * (ADR-0022's default), narrowed to `published` only for a role with no
 * authoring permission on the collection. Mirrors
 * `ContentService.counts`'s own rule: a role that may not read drafts must
 * not learn how many exist.
 */
function articleCounts(rolesHeld: readonly string[]): Readonly<Partial<Record<string, number>>> {
  const all: Record<string, number> = { draft: 0, scheduled: 0, published: 0, archived: 0 }
  for (const entry of MOCK_ENTRIES) {
    if (entry.status in all) all[entry.status] = (all[entry.status] ?? 0) + 1
  }
  const permissions = MOCK_SCHEMA.collections[0]?.permissions as Readonly<
    Record<string, readonly string[]>
  >
  const canReadUnpublished = (['create', 'update', 'delete', 'publish'] as const).some((action) =>
    (permissions[action] ?? []).some((role) => rolesHeld.includes(role)),
  )
  return canReadUnpublished ? all : { published: all.published }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Mirrors `@cogenta/api`'s taxonomy router folding, for the `?q=` stub below. */
function foldForMockSearch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLowerCase()
}

interface MockTerm {
  id: string
  taxonomy: string
  parent: string | null
  slug: string
  labels: Readonly<Record<string, string>>
  position: number
  depth: number
  createdAt: string
  updatedAt: string
}

/**
 * Mirrors `@cogenta/schema`'s taxonomy store: a parent immediately before its
 * children, siblings ordered by `position` — computed here rather than kept
 * true by insertion order, so that a reorder through the tree's own buttons
 * is actually visible the next time the list is fetched.
 */
function flattenMockTerms(list: readonly MockTerm[]): MockTerm[] {
  const byParent = new Map<string | null, MockTerm[]>()
  for (const term of list) {
    const siblings = byParent.get(term.parent) ?? []
    siblings.push(term)
    byParent.set(term.parent, siblings)
  }
  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1))
  }

  const ordered: MockTerm[] = []
  const visit = (parentId: string | null): void => {
    for (const term of byParent.get(parentId) ?? []) {
      ordered.push(term)
      visit(term.id)
    }
  }
  visit(null)
  return ordered
}

/** A fixed, recognisable batch of ten codes — fiche 18 task 1's "shown once" screen has something real to render and a test can assert on. */
function mockRecoveryCodeBatch(): readonly string[] {
  return Array.from({ length: 10 }, (_, index) => `CODE${index}-AAAAA`)
}

/** Mirrors `mediaKindFor` (`api/media-client.ts`) — the mock has no import path to the real one. */
function mockMediaKindFor(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  return 'file'
}

/**
 * `POST /api/media` (upload) as this mock understands JSON `body.*` — a real
 * `multipart/form-data` upload (fiche 05 task 1: `uploadMediaMultipart`,
 * the admin's real transport since this fiche) carries the same fields as
 * `FormData` entries instead, so this reads either shape into the one this
 * route's own handler already expects, the same way the real server's
 * `normaliseMultipartUpload`/`legacyJsonUpload` both funnel into one
 * `NormalisedUpload`.
 */
interface MockUploadBody {
  kind: string | undefined
  filename: string | undefined
  mimeType: string | undefined
  alt: string | undefined
  decorative: boolean | undefined
  decorativeJustification: string | undefined
  tags: unknown
  focal: unknown
  folderId: unknown
}

function mockUploadBody(jsonBody: Record<string, unknown>, form: FormData | null): MockUploadBody {
  if (form === null) {
    return {
      kind: jsonBody['kind'] as string | undefined,
      filename: jsonBody['filename'] as string | undefined,
      mimeType: jsonBody['mimeType'] as string | undefined,
      alt: jsonBody['alt'] as string | undefined,
      decorative: jsonBody['decorative'] as boolean | undefined,
      decorativeJustification: jsonBody['decorativeJustification'] as string | undefined,
      tags: jsonBody['tags'],
      focal: jsonBody['focal'],
      folderId: jsonBody['folderId'],
    }
  }
  const file = form.get('file')
  const tagsField = form.get('tags')
  const kindField = form.get('kind')
  const altField = form.get('alt')
  const justificationField = form.get('decorativeJustification')
  return {
    kind:
      typeof kindField === 'string' && kindField !== ''
        ? kindField
        : file instanceof File
          ? mockMediaKindFor(file.type)
          : undefined,
    filename: file instanceof File ? file.name : undefined,
    mimeType: file instanceof File ? file.type : undefined,
    alt: typeof altField === 'string' ? altField : undefined,
    decorative: form.get('decorative') === 'true',
    decorativeJustification:
      typeof justificationField === 'string' ? justificationField : undefined,
    tags:
      typeof tagsField === 'string' && tagsField.length > 0
        ? tagsField
            .split(',')
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0)
        : undefined,
    focal: undefined,
    folderId: undefined,
  }
}

/**
 * A fetch stub that answers exactly the `/api/auth/*` shape the real server
 * returns — this is a network mock for a browser unit test, not the database
 * mock AGENTS.md forbids: the actual request/response wiring is exercised
 * end-to-end against a real server in `packages/cli/test/serve.test.ts`.
 */
export function installMockFetch(
  options: {
    readonly password?: string
    readonly requireTotp?: boolean
    /** When set, `/api/schema` reports these as `site.locales` (ADR-0014's translation family switcher only renders with 2+). */
    readonly siteLocales?: readonly string[]
    /** Overrides the signed-in user's roles — `['editor']` by default. */
    readonly roles?: readonly string[]
    /**
     * Seeds the `topic` taxonomy's terms, replacing the single default
     * "Cuisine" root. Lets a test set up a hierarchy (a parent and a child)
     * without leaving every other taxonomy test to cope with the extra term.
     */
    readonly taxonomyTerms?: readonly {
      id: string
      taxonomy: string
      parent: string | null
      slug: string
      labels: Readonly<Record<string, string>>
      position: number
      depth: number
      createdAt: string
      updatedAt: string
    }[]
    /** `?counts=1`'s per-term answer. Zero for every term not listed here. */
    readonly taxonomyUsage?: Readonly<Record<string, { own: number; withDescendants: number }>>
    /**
     * `GET /api/assistant`'s answer. Absent means `available: false, tools:
     * []` — the same "no AI provider configured" a real site with none
     * answers with, and the state most tests that never touch the assistant
     * want by default.
     */
    readonly assistant?: {
      readonly available: boolean
      readonly reason?: string
      readonly tools?: readonly {
        readonly tool: string
        readonly label: string
        readonly description: string
        readonly cost: string
        readonly needs: readonly string[]
      }[]
      /** Fiche 30 task 3. */
      readonly model?: string
      readonly usage?: {
        readonly tokensThisMonth: number
        readonly limit?: number
        readonly percentUsed?: number
        readonly nearLimit: boolean
        readonly overLimit: boolean
        readonly byTool: readonly {
          readonly tool: string
          readonly calls: number
          readonly tokens: number
        }[]
      }
      /** Fiche 30 task 6. */
      readonly vector?: {
        readonly driver: string
        readonly dimensions: number
        readonly count: number
        readonly lastIndexedAt: string | null
      }
    }
    /** `POST /api/assistant/run`'s answer, keyed by tool name — what each test's scripted provider "said". */
    readonly assistantRun?: Readonly<Record<string, unknown>>
    /**
     * Seeds `GET /api/providers` (and so the agent-creation form's provider
     * picker, fiche 55 task 3) with configured providers — empty by default,
     * same as a real site with none, which is exactly what
     * `providers.test.tsx`'s own tests need. A test that needs to save a new
     * agent (which now requires picking a configured, enabled provider)
     * seeds one here rather than every test paying for it.
     */
    readonly providers?: readonly {
      readonly provider: string
      readonly enabled: boolean
      readonly model: string
      readonly baseUrl?: string
      readonly maskedKey: string
      readonly updatedAt: string
    }[]
    /** What `GET /api/notices` answers with. Empty by default: most screens have nothing to recommend. */
    readonly notices?: readonly {
      id: string
      code: string
      severity: string
      dismissible: boolean
      action?: { code: string; href: string }
    }[]
    /** What `GET /api/notices/channels` answers with (L22 task 2's "Canaux" screen) — no channel linked by default. */
    readonly linkedChannels?: readonly {
      channelName: string
      channelUserId: string
      linkedAt: string
    }[]
    /** What `GET /api/webhooks-status` answers with — no endpoint configured by default. */
    readonly webhooksStatus?: {
      endpoints: readonly string[]
      signed: boolean
      disabledForMissingSecret: boolean
    }
    /** What `GET /api/updates/status` answers with (L22 task 9) — both packages up to date by default. */
    readonly updateStatus?: {
      readonly checkedAt: string
      readonly packages: readonly {
        readonly name: string
        readonly installed: string
        readonly latest: string | null
        readonly bump: string
        readonly updateAvailable: boolean
        readonly checkError: string | undefined
        readonly contractRisk: {
          readonly available: boolean
          readonly reason: string | undefined
          readonly scannedVersions: readonly string[]
          readonly warnings: readonly { readonly version: string; readonly excerpt: string }[]
        } | null
      }[]
      readonly updateAvailable: boolean
      readonly highestBump: string
      readonly contractRiskDetected: boolean
    }
    /** What `GET /api/updates/history` answers with — empty by default. */
    readonly updateHistory?: {
      readonly entries: readonly {
        readonly id: string
        readonly at: string
        readonly action: string
        readonly actorId: string | null
        readonly diff: Readonly<Record<string, unknown>> | null
      }[]
      readonly restorePoints: readonly {
        readonly path: string
        readonly createdAt: string
        readonly rows: number
        readonly tables: number
        readonly checksum: string
        readonly encrypted: boolean
        readonly triggeredByUpdate: boolean
      }[]
    }
    /** What `POST /api/updates/apply` answers with — `{kind: 'up-to-date'}` by default. */
    readonly updateApplyResult?: unknown
    /** What `GET /api/seo/diagnostics` answers with. A healthy, empty site by default. */
    readonly seoDiagnostics?: {
      readonly generatedAt?: string
      readonly sitemap?: {
        readonly totalUrls: number
        readonly collections: readonly {
          readonly name: string
          readonly included: boolean
          readonly reason: string | null
          readonly urlCount: number
        }[]
      }
      readonly robots?: {
        readonly content: string
        readonly allowIndexing: boolean
        readonly disallowsEverything: boolean
      }
      readonly content?: {
        readonly publishedCount: number
        readonly noindexCount: number
        readonly missingDescriptionCount: readonly {
          readonly collection: string
          readonly id: string
        }[]
        readonly tooLongTitleCount: readonly { readonly collection: string; readonly id: string }[]
        readonly duplicateTitles: readonly {
          readonly title: string
          readonly entries: readonly { readonly collection: string; readonly id: string }[]
        }[]
      }
      readonly anomalies?: readonly { readonly code: string; readonly message: string }[]
    }
    /** What `GET /api/seo/link-suggestions` answers with (fiche 70 task 2) — no orphans and no suggestions by default. Keyed by requested collection name; a collection with no entry here still gets the empty default rather than a 404. */
    readonly seoLinkSuggestions?: Readonly<
      Record<
        string,
        {
          readonly orphans: readonly {
            readonly collection: string
            readonly id: string
            readonly title: string
          }[]
          readonly suggestionsByEntry: Readonly<
            Record<
              string,
              readonly {
                readonly collection: string
                readonly id: string
                readonly title: string
                readonly sharedWordCount: number
              }[]
            >
          >
        }
      >
    >
    /** What `GET /api/seo/search-console/status` answers with (fiche 70 task 4) — not configured by default, the same "absent connector" R2 posture as `assistant`. */
    readonly searchConsoleStatus?: {
      readonly configured?: boolean
      readonly connected?: boolean
      readonly siteUrl?: string
      readonly connectedAt?: string
      readonly updatedAt?: string
    }
    /** What `GET /api/seo/search-console/metrics` answers with once connected — no rows by default. */
    readonly searchConsoleMetrics?: {
      readonly siteUrl?: string
      readonly windowDays?: number
      readonly rows?: readonly {
        readonly page: string
        readonly clicks: number
        readonly impressions: number
        readonly ctr: number
        readonly position: number
      }[]
    }
    /** What `GET /api/theme` answers with (fiche 14) — a fixed, valid file skin, no override, no gallery and no AI by default. */
    readonly theme?: {
      readonly fileTokens?: Record<string, unknown> | null
      readonly aiAvailable?: boolean
      readonly exportAvailable?: boolean
      readonly skins?: readonly {
        readonly id: string
        readonly displayName: string
        readonly description: string | null
        readonly submittedAt: string
        readonly tokens: Record<string, unknown> | null
      }[]
      readonly generateCandidates?: readonly {
        readonly id: string
        readonly label: string
        readonly rationale: string
        readonly tokens: Record<string, unknown>
      }[]
      /** The active theme *package* name (fiche L23), `null` for the built-in default. */
      readonly activeTheme?: string | null
      /** The theme packages this mocked instance can offer — the canonical default alone unless a test overrides it. */
      readonly availableThemes?: readonly {
        readonly name: string
        readonly label: string
        readonly description: string
        /** Omit to simulate an older server predating fiche 48's manifest fields — the gallery card must degrade, not crash. */
        readonly version?: string
        readonly author?: string | null
      }[]
      /**
       * Simulates a server process running code from before this field
       * existed (fiche L23 shipped it) — the key is genuinely absent from
       * the JSON payload, not merely an empty array. A live restart-required
       * version mismatch is exactly how this was first caught: a rebuilt
       * admin bundle talking to a `cogenta serve` process still running the
       * old `theme-router.js` it loaded at startup.
       */
      readonly omitAvailableThemesField?: boolean
    }
    /**
     * What `GET /api/config-status` answers with (fiche 23 task 5) — `null`
     * by default, the same "caller never wired a mirror" shape the real
     * router answers with.
     */
    readonly configStatus?: {
      readonly site: { readonly name: string; readonly url: string; readonly notFoundPath: string }
      readonly database: { readonly driver: string }
      readonly cache: { readonly driver: string }
      readonly queue: { readonly driver: string }
      readonly storage: {
        readonly driver: string
        readonly bucket: string | undefined
        readonly region: string | undefined
        readonly endpoint: string | undefined
      }
      readonly llm: { readonly provider: string; readonly model: string } | undefined
      readonly embeddings: { readonly provider: string; readonly model: string }
      readonly imageGeneration: { readonly provider: string; readonly model: string } | undefined
      readonly vector: { readonly driver: string }
      readonly billingConfigured: boolean
      readonly secretHygiene: {
        readonly databaseUrlHasCredentialsInFile: boolean
        readonly envFilePath: string | null
        readonly envFileReadableByOthers: boolean | null
      }
    }
    /**
     * Pre-seeds a site-scoped editorial setting's value (fiche 23), as if it
     * had already been written — keyed by the setting's registry key
     * (`general.title`, `reading.homePath`, …). Every setting not listed
     * here answers with its own registry default, `isDefault: true`.
     */
    readonly siteSettings?: Readonly<Record<string, unknown>>
    /** Seeds `/api/commerce/tax/rules` (fiche 34 task 1). Empty by default. */
    readonly commerceTaxRules?: readonly {
      id: string
      country: string | null
      region: string | null
      taxCategory: string
      name: string
      rateBp: number
      includedInPrice: boolean
      priority: number
      active: boolean
      createdAt: string
    }[]
    /** Seeds `/api/commerce/shipping/methods` (fiche 34 task 2). Empty by default. */
    readonly commerceShippingMethods?: readonly {
      id: string
      label: string
      country: string | null
      region: string | null
      kind: 'flat' | 'by_weight' | 'free'
      currency: string
      amountMinor: number
      perKgMinor: number
      freeOverMinor: number | null
      carrier: string | null
      position: number
      active: boolean
      createdAt: string
    }[]
    /**
     * Seeds `GET /api/commerce/products` (audit T-COM-02: the subscription
     * detail screen's "Change plan" panel picks a variant from this list —
     * without it, a test exercising that panel would first have to create a
     * product through the catalogue screen itself, which a role with only
     * `commerce.read` cannot do). Empty by default, like every other
     * commerce seed above.
     */
    readonly commerceProducts?: readonly {
      id: string
      handle: string
      title: string
      status: 'active' | 'archived'
      contentRef: { collection: string; entryId: string } | null
      imageMediaIds: string[]
      createdAt: string
      updatedAt: string
    }[]
    /** Seeds `readProduct`'s variant list for the products above. Empty by default. */
    readonly commerceVariants?: readonly {
      id: string
      productId: string
      sku: string
      title: string
      priceMinor: number
      currency: string
      onHand: number
      allowBackorder: boolean
      weightGrams: number
      taxCategory: string
      position: number
      lowStockThreshold: number | null
      compareAtPriceMinor: number | null
      saleStartsAt: string | null
      saleEndsAt: string | null
      widthMm: number | null
      heightMm: number | null
      depthMm: number | null
      imageMediaId: string | null
      createdAt: string
      updatedAt: string
    }[]
    /**
     * Overrides `/api/commerce/payment/drivers` (fiche 34 task 3). A driver
     * entry may carry extra JSON fields beyond what `PaymentDriverStatus`
     * declares — this is exactly the shape a security test uses to prove the
     * screen never renders a field it should not be reading, even if the
     * backend regressed and returned one.
     */
    readonly commercePaymentDrivers?: readonly Readonly<Record<string, unknown>>[]
    readonly commercePaymentTestMode?: boolean
    readonly commercePaymentWebhookUrl?: string | null
    /** `POST /api/commerce/payment/drivers/{name}/test-connection`'s answer, keyed by driver name. Defaults to `{ ok: true, message: null }`. */
    readonly commercePaymentTestResults?: Readonly<
      Record<string, { readonly ok: boolean; readonly message: string | null }>
    >
    /** Overrides for `GET /api/shell-status` (fiche 35 task 3) — badges and feature flags, quiet-site defaults otherwise. */
    readonly shellStatus?: {
      readonly trash?: number
      readonly commerceOrdersPending?: number | null
      readonly commerceActive?: boolean
      readonly marketplaceUpdates?: number | null
      readonly reviewPending?: number | null
      readonly commentsPending?: number | null
      readonly formSubmissionsUnread?: number | null
      readonly cogentaVersion?: string
    }
    /** Seeds `wf-article`'s one entry at a given review state (`schema@2.1`, ADR-0027) — default `'none'`. */
    readonly wfEntryReviewState?: 'none' | 'pending' | 'changes-requested' | 'approved'
    /** Seeds `/api/comments` (fiche 15) — the moderation queue's initial rows. */
    readonly comments?: readonly {
      readonly id: string
      readonly collection: string
      readonly entryId: string
      readonly authorName: string
      readonly authorEmail: string
      readonly body: string
      readonly status: 'pending' | 'approved' | 'spam' | 'trash'
      readonly createdAt?: string
    }[]
    /** Seeds `/api/forms` (contract G, ADR-0026 + fiche 47). */
    readonly forms?: readonly {
      readonly id: string
      readonly name: string
      readonly label: string
      readonly fields: readonly Record<string, unknown>[]
      readonly active: boolean
      readonly confirmationMessage: string
      readonly redirectTo: string | null
      readonly notifyEmails: readonly string[]
      readonly autoresponder: { readonly enabled: boolean; readonly body?: string }
      readonly retainDays: number
      readonly steps?: readonly Record<string, unknown>[]
      readonly notifyChannels?: readonly Record<string, unknown>[]
      readonly captcha?: {
        readonly enabled: boolean
        readonly siteKey?: string
        readonly secretKey?: string
      }
      readonly createdAt: string
      readonly updatedAt: string
    }[]
    /** Seeds `/api/forms/submissions` — see `form-submissions.tsx`. */
    readonly formSubmissions?: readonly {
      readonly id: string
      readonly formId: string
      readonly formName: string
      readonly values: Readonly<Record<string, unknown>>
      readonly consents: readonly Record<string, unknown>[]
      readonly status: 'new' | 'read' | 'archived' | 'spam'
      readonly ipHash: string | null
      readonly referrer: string | null
      readonly userAgent: string | null
      readonly submittedAt: string
    }[]
    /** What `GET /api/analytics/summary` answers with. All-zero by default, like a site nobody has visited yet. */
    readonly analyticsSummary?: {
      readonly totalViews?: number
      readonly uniqueVisitors?: number
      readonly topPages?: readonly {
        path: string
        views: number
        title?: string
        editHref?: string
      }[]
      readonly topReferrers?: readonly { domain: string; views: number }[]
      readonly deviceBreakdown?: readonly { device: string; views: number }[]
      readonly dailyViews?: readonly { day: string; views: number }[]
      readonly previousTotalViews?: number
      readonly previousUniqueVisitors?: number
      readonly previousDailyViews?: readonly { day: string; views: number }[]
      readonly viewsChangePercent?: number | null
      readonly retentionDays?: number | null
    }
    /** What `GET /api/analytics/page` answers with — the entry-edit sidebar stats (fiche 27 task 2). Absent means `views: 0, rank: null`, like a page nobody has visited yet. */
    readonly analyticsPageStats?: {
      readonly views?: number
      readonly previousViews?: number
      readonly changePercent?: number | null
      readonly rank?: number | null
      readonly rankedPages?: number
    }
    /** `GET /api/scheduled-tasks`'s `mode` (fiche 28 task 5) — `'internal'` by default. */
    readonly scheduledTasksMode?: 'internal' | 'external-cron'
    /** Overrides `GET /api/scheduled-tasks`'s task list (fiche 28 task 2) — a publish/trash-purge pair by default. */
    readonly scheduledTasks?: readonly Readonly<Record<string, unknown>>[]
    /** Seeds `GET /api/scheduled-tasks/queue` (fiche 28 task 2) — empty by default. */
    readonly scheduledTasksQueue?: readonly Readonly<Record<string, unknown>>[]
    /** Seeds the 404 log (fiche 12 task 1) — empty by default, like a freshly started site. */
    readonly notFound?: readonly {
      readonly path: string
      readonly hits: number
      readonly firstSeen: number
      readonly lastSeen: number
      readonly lastReferrer: string | null
    }[]
    /**
     * Fiche 21 task 3: what `GET`/`POST /api/audit/integrity` answers with.
     * A plain `'ok'` status by default, so a test that never touches this
     * screen's integrity panel does not have to think about it.
     */
    readonly auditIntegrity?: {
      readonly state: string
      readonly checkpoint: {
        readonly id: string
        readonly at: string
        readonly hash: string
      } | null
      readonly entriesChecked: number
      readonly lastCheckedAt: string | null
      readonly lastMode: string | null
      readonly lastFullCheckedAt: string | null
      readonly brokenAt: string | null
      readonly brokenEntryId: string | null
      readonly brokenMessage: string | null
    }
    /**
     * Overrides `GET /api/audit`'s two-entry default fixture (fiche 67
     * task 1) — for a test that needs to exercise real cursor pagination.
     * Each entry needs at least `id`/`at`; the mock paginates them exactly
     * the way `audit-router.ts` does (`limit`, `after` decoded as
     * `at id` base64url, newest first).
     */
    readonly auditEntries?: readonly Readonly<Record<string, unknown>>[]
    /** Fiche 21 task 1: what `GET /api/audit/{id}` answers with, for any id. */
    readonly auditDetail?: {
      readonly entry: Readonly<Record<string, unknown>>
      readonly actorKind: string
      readonly actorLabel: string | null
      readonly diff: Readonly<Record<string, unknown>> | null
      readonly diffUnavailable: string | null
    }
    /**
     * What `GET /api/trash-status` answers with (fiche 07 task 5) — a fixed,
     * already-swept state by default so the trash screen's banner has
     * something deterministic to show without every test having to pass it.
     */
    readonly trashStatus?: {
      readonly retainDaysByCollection?: Readonly<Record<string, number>>
      readonly lastRunAt?: string | null
      readonly lastPurged?: number | null
    }
    /**
     * Fiche 17 task 1's R1 fallback, made choosable per test: `false` (the
     * default, and what a site with no email transport actually reports)
     * means `POST /api/users` always takes the generated-password path, the
     * same as before this fiche — a test that wants to exercise the
     * invitation path opts in explicitly.
     */
    readonly invitationEmailAvailable?: boolean
    /**
     * Fiche 67 task 2: seeds this many synthetic image assets into the media
     * library before the test starts, so a test can exercise `media.tsx`'s
     * cursor pagination (`GET /api/media`'s `limit`/`after`, only respected
     * by this mock once this many items actually exist) without uploading
     * dozens of real files through the form one at a time. Zero by default,
     * the same empty library every media test saw before this fiche.
     */
    readonly mediaSeedCount?: number
    /**
     * Fiche 05 task 3: `GET .../usage` and `POST .../bulk-usage`'s answer
     * for a given media id — absent means "no usage" (`matches: []`), the
     * same empty-by-default a site with no `usage` source wired configures
     * on the real router.
     */
    readonly mediaUsage?: Readonly<
      Record<
        string,
        readonly { readonly collection: string; readonly entryId: string; readonly field: string }[]
      >
    >
    /**
     * `true` (the default) mocks a site with an `AgentRegistry` mounted, the
     * way this suite always has. `false` reproduces the real, honest shape
     * of `cogenta serve` today (L20 audit §1 point 5): no registry is ever
     * constructed, so `GET /api/agents` 404s through the generic
     * content-router fallback — the exact response `agents.tsx` must degrade
     * gracefully from instead of showing the raw wire text.
     */
    readonly agentsRegistryMounted?: boolean
    /**
     * What `GET /api/health-report` answers with — the "Santé" screen's
     * driver diagnostics (fiche 24 task 1). A single `database` check with no
     * `reasonCode` by default, so a test that never touches this screen does
     * not have to think about it; L20 audit §1 point 12's regression test
     * overrides `checks` to exercise every translated reason.
     */
    readonly healthReport?: {
      readonly checks?: readonly {
        readonly need: string
        readonly status: 'ok' | 'degraded' | 'down'
        readonly driver: string
        readonly tier: string
        readonly reason: string
        readonly reasonCode?: {
          readonly code: 'named' | 'first-available' | 'fallback'
          readonly skipped: readonly {
            readonly driver: string
            readonly tier: string
            readonly reasonCode: 'not-available' | 'not-available-error' | 'failed-to-start'
            readonly detail?: string
          }[]
        }
        readonly message?: string
      }[]
      readonly notes?: readonly string[]
      readonly problems?: readonly string[]
    }
    /**
     * What `GET /api/observability` answers with — the "Exploitation" >
     * Observability screen (fiche L22 task 5). Enabled with empty buffers by
     * default, so a test that never touches this screen does not have to
     * think about it.
     */
    readonly observability?: {
      readonly enabled?: boolean
      readonly traces?: readonly {
        readonly id: string
        readonly at: string
        readonly traceId: string
        readonly spanId: string
        readonly name: string
        readonly method?: string
        readonly path?: string
        readonly statusCode?: number
        readonly durationMs: number
        readonly ok: boolean
      }[]
      readonly logs?: readonly {
        readonly id: string
        readonly at: string
        readonly level: 'debug' | 'info' | 'warn' | 'error'
        readonly msg: string
        readonly fields?: Readonly<Record<string, unknown>>
      }[]
    }
    /**
     * Fiche 40 task 1/2: makes `POST /api/content/{collection}/{id}/preview`
     * answer the way a real server does when `COGENTA_PREVIEW_SIGNING_KEY`
     * is missing or too short (`packages/api/src/access/preview-token.ts`) —
     * `CONFIG_INVALID`, with the real `hint` text — instead of minting a
     * token. Off by default: most tests want the happy path already covered
     * by the plain `preview` branch below.
     */
    readonly previewSigningKeyMissing?: boolean
  } = {},
): void {
  const password = options.password ?? 'correct horse battery staple'
  const user = options.roles === undefined ? USER : { ...USER, roles: options.roles }
  const session = () => ({
    status: 'session',
    session: { id: 'session-1', token: VALID_TOKEN, expiresAt: '2030-01-01T00:00:00.000Z' },
    user,
  })

  // Media state lives per `installMockFetch()` call — each test starts with
  // an empty library and grows it through the same upload/edit/delete routes
  // the real server exposes, not through a shared module-level fixture.
  let securityAgentEnabled = true

  // Search Console connection state (fiche 70 task 4) — mutable across the
  // test's own requests, the same way `securityAgentEnabled` is just above,
  // so a test can prove the UI reacts to a real POST /disconnect rather than
  // only rendering a static fixture.
  let searchConsoleConnected = options.searchConsoleStatus?.connected ?? false

  // L22 task 1: a real, persistent (for the life of one test) agent
  // registry — `security` is the same fixed fixture every existing test
  // already asserts against, plus create/update/remove/run so the new
  // editable screen has something real to exercise.
  interface MockAgent {
    name: string
    tools: string[]
    autonomy: { default: string; overrides?: Record<string, string> }
    budget: Record<string, number>
    enabled: boolean
    skills?: string[]
    subagents?: string[]
    model?: { preferred: string; fallback?: string }
    builtin: boolean
  }
  const mockAgents: Record<string, MockAgent> = {
    security: {
      name: 'security',
      tools: ['deps.scan', 'deps.patch'],
      autonomy: { default: 'propose', overrides: { 'deps.scan': 'autonomous' } },
      budget: { tokensPerDay: 200_000, eurPerMonth: 10, callsPerHour: 30 },
      enabled: true,
      skills: ['cve-triage', 'security-report'],
      model: { preferred: 'claude-sonnet', fallback: 'local' },
      builtin: true,
    },
  }
  const mockAgentIdentities: Record<
    string,
    { role: string; objectives: string[]; style?: string }
  > = {
    security: { role: 'Scans dependencies for known CVEs.', objectives: ['Report findings.'] },
  }
  // Kept in sync with `mockAgents.security.enabled` for the pre-existing
  // enable/disable tests, which read `securityAgentEnabled` directly.
  const syncSecurityEnabled = (): void => {
    mockAgents.security = {
      ...(mockAgents.security as MockAgent),
      enabled: securityAgentEnabled,
    }
  }

  const mockProviders: {
    provider: string
    enabled: boolean
    model: string
    baseUrl?: string
    maskedKey: string
    updatedAt: string
  }[] =
    options.providers === undefined ? [] : options.providers.map((provider) => ({ ...provider }))
  // Mirrors `@cogenta/agents`' `KNOWN_PROVIDER_CATALOG` (fiche 56) closely
  // enough for the admin's catalog-driven form — this file imports nothing
  // but `vitest`, so it hand-copies the shape rather than the real data.
  const MOCK_PROVIDER_CATALOG = [
    {
      id: 'anthropic',
      label: 'Anthropic',
      wireFormat: 'anthropic',
      defaultBaseUrl: 'https://api.anthropic.com/v1/messages',
      knownModels: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'],
    },
    {
      id: 'openai',
      label: 'OpenAI',
      wireFormat: 'openai-compatible',
      defaultBaseUrl: 'https://api.openai.com/v1/chat/completions',
      knownModels: ['gpt-5.2-chat-latest', 'gpt-5', 'gpt-5-mini'],
    },
    {
      id: 'google',
      label: 'Google',
      wireFormat: 'google',
      defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
      knownModels: ['gemini-3.1-pro', 'gemini-3.7-flash', 'gemini-2.5-flash-lite'],
    },
    {
      id: 'openrouter',
      label: 'OpenRouter',
      wireFormat: 'openai-compatible',
      defaultBaseUrl: 'https://openrouter.ai/api/v1/chat/completions',
      knownModels: ['openai/gpt-5.2-chat-latest', 'anthropic/claude-sonnet-5'],
    },
    {
      id: 'deepseek',
      label: 'DeepSeek',
      wireFormat: 'openai-compatible',
      defaultBaseUrl: 'https://api.deepseek.com/chat/completions',
      knownModels: ['deepseek-v4-pro', 'deepseek-v4-flash'],
    },
    {
      id: 'qwen',
      label: 'Qwen (DashScope)',
      wireFormat: 'openai-compatible',
      defaultBaseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
      knownModels: ['qwen3-max', 'qwen-plus', 'qwen-turbo'],
    },
    {
      id: 'glm',
      label: 'GLM (Zhipu / Z.ai)',
      wireFormat: 'openai-compatible',
      defaultBaseUrl: 'https://api.z.ai/api/openai/v1/chat/completions',
      knownModels: ['glm-4.7', 'glm-4.6', 'glm-4.5-flash'],
    },
  ]
  const mockAgentSkills: {
    id: string
    name: string
    description: string
    instructions: string
    content: string
    enabledByDefault: boolean
    builtin: boolean
    createdAt: string
    updatedAt: string
  }[] = []
  // Fiche 57's reference-folder resources — keyed by skill id, one array per
  // skill, empty until a test uploads into it.
  const mockSkillResources: Record<string, { path: string; size: number; updatedAt: string }[]> = {}
  // Fiche 45's "Prompt Settings" screen — empty by default, like a fresh
  // site whose store the CLI has not seeded yet; a test that wants a
  // non-empty screen creates one through the same POST route the real
  // admin uses.
  const mockPromptTemplates: {
    id: string
    name: string
    description: string
    category: string
    template: string
    builtin: boolean
    createdAt: string
    updatedAt: string
  }[] = []

  // Site settings (fiche 23) — the registry's own defaults, hand-mirrored
  // here rather than imported (this file imports nothing but `vitest`, on
  // purpose: it is the admin's own idea of what the API answers, not a
  // second consumer of the real registry). `siteSettingsWrites` holds only
  // what a PATCH during this test actually changed, keyed by `key locale`
  // — a key never written stays at its registry default and `isDefault: true`.
  const SITE_SETTINGS_DEFAULTS: Readonly<
    Record<
      string,
      {
        group: string
        order: number
        uiType: string
        scope: 'site' | 'locale'
        value: unknown
        options?: readonly { readonly value: string; readonly label: string }[]
      }
    >
  > = {
    'general.title': { group: 'general', order: 0, uiType: 'string', scope: 'site', value: '' },
    'general.tagline': { group: 'general', order: 1, uiType: 'string', scope: 'locale', value: '' },
    'general.adminEmail': { group: 'general', order: 2, uiType: 'email', scope: 'site', value: '' },
    'general.timeZone': {
      group: 'general',
      order: 3,
      uiType: 'timeZone',
      scope: 'site',
      value: '',
    },
    'general.dateStyle': {
      group: 'general',
      order: 4,
      uiType: 'dateStyle',
      scope: 'site',
      value: 'medium',
    },
    'general.timeStyle': {
      group: 'general',
      order: 5,
      uiType: 'timeStyle',
      scope: 'site',
      value: 'short',
    },
    // L21 task 5's "blocs de départ" — mirrors
    // packages/schema/src/store/site-settings-registry.ts's
    // `content.newEntryDefaultBlocks`.
    'content.newEntryDefaultBlocks': {
      group: 'general',
      order: 6,
      uiType: 'string',
      scope: 'site',
      value: 'prose',
    },
    'reading.homePath': { group: 'reading', order: 0, uiType: 'path', scope: 'site', value: '' },
    'reading.postsPerPage': {
      group: 'reading',
      order: 1,
      uiType: 'number',
      scope: 'site',
      value: 10,
    },
    // Discussion (fiche 15 task 5, ADR-0025) — mirrors
    // packages/schema/src/store/site-settings-registry.ts's `discussion` group.
    'discussion.enabled': {
      group: 'discussion',
      order: 0,
      uiType: 'boolean',
      scope: 'site',
      value: true,
    },
    'discussion.moderationRequired': {
      group: 'discussion',
      order: 1,
      uiType: 'boolean',
      scope: 'site',
      value: true,
    },
    'discussion.allowAnonymous': {
      group: 'discussion',
      order: 2,
      uiType: 'boolean',
      scope: 'site',
      value: true,
    },
    'discussion.autoCloseDays': {
      group: 'discussion',
      order: 3,
      uiType: 'number',
      scope: 'site',
      value: 0,
    },
    'discussion.maxNestingDepth': {
      group: 'discussion',
      order: 4,
      uiType: 'number',
      scope: 'site',
      value: 5,
    },
    'discussion.notifyEmail': {
      group: 'discussion',
      order: 5,
      uiType: 'email',
      scope: 'site',
      value: '',
    },
    'media.maxUploadSizeMb': {
      group: 'media',
      order: 0,
      uiType: 'number',
      scope: 'site',
      value: 15,
    },
    'privacy.policyPath': { group: 'privacy', order: 0, uiType: 'path', scope: 'site', value: '' },
    'privacy.cookieBannerEnabled': {
      group: 'privacy',
      order: 1,
      uiType: 'boolean',
      scope: 'site',
      value: false,
    },
    'privacy.cookieBannerMessage': {
      group: 'privacy',
      order: 2,
      uiType: 'text',
      scope: 'site',
      value: '',
    },
    'privacy.dataRetentionNote': {
      group: 'privacy',
      order: 3,
      uiType: 'text',
      scope: 'site',
      value: '',
    },
    // Commerce (fiche 34 tasks 4-5) -- general store settings and the
    // invoice template, mirroring packages/schema/src/store/site-settings-registry.ts.
    'commerce.currency': {
      group: 'commerce',
      order: 0,
      uiType: 'string',
      scope: 'site',
      value: 'EUR',
    },
    'commerce.priceDisplay': {
      group: 'commerce',
      order: 1,
      uiType: 'select',
      scope: 'site',
      value: 'ttc',
      options: [
        { value: 'ttc', label: 'Tax-inclusive (TTC)' },
        { value: 'ht', label: 'Tax-exclusive (HT)' },
      ],
    },
    'commerce.countriesServed': {
      group: 'commerce',
      order: 2,
      uiType: 'text',
      scope: 'site',
      value: '',
    },
    'commerce.minOrderSubtotalMinor': {
      group: 'commerce',
      order: 3,
      uiType: 'number',
      scope: 'site',
      value: 0,
    },
    'commerce.allowBackorderDefault': {
      group: 'commerce',
      order: 4,
      uiType: 'boolean',
      scope: 'site',
      value: false,
    },
    'commerce.tosPagePath': {
      group: 'commerce',
      order: 5,
      uiType: 'path',
      scope: 'site',
      value: '',
    },
    'commerce.returnPolicyPagePath': {
      group: 'commerce',
      order: 6,
      uiType: 'path',
      scope: 'site',
      value: '',
    },
    'commerce.invoiceSeriesPrefix': {
      group: 'commerce',
      order: 7,
      uiType: 'string',
      scope: 'site',
      value: '',
    },
    'commerce.invoicePaymentTerms': {
      group: 'commerce',
      order: 8,
      uiType: 'text',
      scope: 'site',
      value: '',
    },
    'commerce.invoiceLanguage': {
      group: 'commerce',
      order: 9,
      uiType: 'string',
      scope: 'site',
      value: 'en',
    },
    // Branding (fiche L21 task 8) — mirrors
    // packages/schema/src/store/site-settings-registry.ts's `branding` group.
    'branding.showCogentaBranding': {
      group: 'branding',
      order: 0,
      uiType: 'boolean',
      scope: 'site',
      value: true,
    },
    'branding.customLogoMediaId': {
      group: 'branding',
      order: 1,
      uiType: 'media',
      scope: 'site',
      value: '',
    },
    // SEO (fiche 21 task 3) -- mirrors
    // packages/schema/src/store/site-settings-registry.ts's `seo` group.
    'seo.titleTemplate': {
      group: 'seo',
      order: 0,
      uiType: 'string',
      scope: 'site',
      value: '',
    },
    'seo.collectionTitleTemplates': {
      group: 'seo',
      order: 1,
      uiType: 'text',
      scope: 'site',
      value: {},
    },
    'seo.defaultMetaDescription': {
      group: 'seo',
      order: 2,
      uiType: 'text',
      scope: 'site',
      value: '',
    },
    'seo.sitemapCollectionSettings': {
      group: 'seo',
      order: 3,
      uiType: 'text',
      scope: 'site',
      value: {},
    },
    'seo.twitterHandle': {
      group: 'seo',
      order: 4,
      uiType: 'string',
      scope: 'site',
      value: '',
    },
    'seo.defaultSocialImageUrl': {
      group: 'seo',
      order: 5,
      uiType: 'path',
      scope: 'site',
      value: '',
    },
    // Fiche 50 tasks 2-5 — mirrors the six settings added to
    // packages/schema/src/store/site-settings-registry.ts's `seo` group.
    'seo.googleSiteVerification': {
      group: 'seo',
      order: 6,
      uiType: 'string',
      scope: 'site',
      value: '',
    },
    'seo.bingSiteVerification': {
      group: 'seo',
      order: 7,
      uiType: 'string',
      scope: 'site',
      value: '',
    },
    'seo.robotsCustomRules': {
      group: 'seo',
      order: 8,
      uiType: 'text',
      scope: 'site',
      value: '',
    },
    'seo.indexNowEnabled': {
      group: 'seo',
      order: 9,
      uiType: 'boolean',
      scope: 'site',
      value: false,
    },
    'seo.indexNowKey': {
      group: 'seo',
      order: 10,
      uiType: 'string',
      scope: 'site',
      value: '',
    },
    'seo.llmsTxtEnabled': {
      group: 'seo',
      order: 11,
      uiType: 'boolean',
      scope: 'site',
      value: false,
    },
    // Observability (fiche L22 task 5) — mirrors
    // packages/schema/src/store/site-settings-registry.ts's `observability` group.
    'observability.enabled': {
      group: 'observability',
      order: 0,
      uiType: 'boolean',
      scope: 'site',
      value: true,
    },
    'observability.logLevel': {
      group: 'observability',
      order: 1,
      uiType: 'select',
      scope: 'site',
      value: 'info',
      options: [
        { value: 'error', label: 'Error' },
        { value: 'warn', label: 'Warn' },
        { value: 'info', label: 'Info' },
        { value: 'debug', label: 'Debug' },
      ],
    },
    'navigation.sectionOrder': {
      group: 'navigation',
      order: 0,
      uiType: 'string',
      scope: 'site',
      value: '',
    },
    'navigation.hiddenSections': {
      group: 'navigation',
      order: 1,
      uiType: 'string',
      scope: 'site',
      value: '',
    },
    'navigation.itemOrder': {
      group: 'navigation',
      order: 2,
      uiType: 'string',
      scope: 'site',
      value: '',
    },
    'navigation.hiddenItems': {
      group: 'navigation',
      order: 3,
      uiType: 'string',
      scope: 'site',
      value: '',
    },
    // Fiche 59 — mirrors packages/schema/src/store/site-settings-registry.ts's
    // `channels.*BotName` entries.
    'channels.telegramBotName': {
      group: 'channels',
      order: 0,
      uiType: 'string',
      scope: 'site',
      value: '',
    },
    'channels.slackBotName': {
      group: 'channels',
      order: 1,
      uiType: 'string',
      scope: 'site',
      value: '',
    },
    'channels.discordBotName': {
      group: 'channels',
      order: 2,
      uiType: 'string',
      scope: 'site',
      value: '',
    },
  }
  const siteSettingsWrites = new Map<
    string,
    { readonly value: unknown; readonly updatedAt: string; readonly updatedBy: string | null }
  >()
  for (const [key, seeded] of Object.entries(options.siteSettings ?? {})) {
    siteSettingsWrites.set(`${key} `, {
      value: seeded,
      updatedAt: '2025-01-01T00:00:00.000Z',
      updatedBy: 'user-1',
    })
  }

  // `/api/theme` (fiche 14), stateful per `installMockFetch()` call: an
  // override saved by one request is what the next `GET` reports back —
  // the same "the screen's own round trip is what is under test" reasoning
  // `siteSettingsWrites` above already follows.
  const DEFAULT_THEME_TOKENS: Record<string, unknown> = {
    color: {
      bg: '#ffffff',
      fg: '#16181d',
      accent: '#1d4ed8',
      accentFg: '#ffffff',
      muted: '#f1f2f4',
      mutedFg: '#4b5057',
      border: '#d7dade',
    },
    font: {
      sans: 'ui-sans-serif, system-ui, sans-serif',
      serif: 'ui-serif, Georgia, serif',
      mono: 'ui-monospace, SFMono-Regular, monospace',
      scale: 1.25,
      baseSize: '1rem',
    },
    space: { unit: '0.25rem', density: 'comfortable' },
    radius: { sm: '2px', md: '6px', lg: '12px' },
    motion: { duration: '200ms', easing: 'cubic-bezier(0.2, 0, 0, 1)', reduced: true },
    shadow: { sm: '0 1px 2px rgba(0, 0, 0, 0.06)', md: '0 6px 20px rgba(0, 0, 0, 0.12)' },
  }
  let themeOverrides: {
    tokenOverrides: Record<string, unknown> | null
    additionalCss: string | null
    logoMediaId: string | null
    logoDarkMediaId: string | null
    faviconMediaId: string | null
    shareImageMediaId: string | null
    activeTheme: string | null
    updatedAt: string
    updatedBy: string | null
  } = {
    tokenOverrides: null,
    additionalCss: null,
    logoMediaId: null,
    logoDarkMediaId: null,
    faviconMediaId: null,
    shareImageMediaId: null,
    activeTheme: options.theme?.activeTheme ?? null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: null,
  }
  const availableThemes = options.theme?.availableThemes ?? [
    {
      name: '@cogenta/theme-canonical',
      label: 'Canonical',
      description: 'The reference theme: all twelve blocks, zero client JavaScript.',
      version: '1.1.0',
      author: 'Cogenta',
    },
  ]
  function themeEffectiveTokens(): Record<string, unknown> {
    const file = options.theme?.fileTokens ?? DEFAULT_THEME_TOKENS
    if (themeOverrides.tokenOverrides === null) return file
    const merged: Record<string, unknown> = { ...file }
    for (const [group, patch] of Object.entries(themeOverrides.tokenOverrides)) {
      merged[group] = {
        ...((file as Record<string, unknown>)[group] as Record<string, unknown> | undefined),
        ...(patch as Record<string, unknown>),
      }
    }
    return merged
  }

  // `/api/admin-theme` (L21 task 2), stateful per `installMockFetch()` call —
  // two fixed built-in templates (a reduced but real token set, not the
  // full ~29-token list `@cogenta/schema`'s own constants carry: this mock
  // only needs enough for the gallery and the personalisation form to
  // render and round-trip, not a byte-for-byte copy of the server data).
  const ADMIN_THEME_COLOR_TOKEN_KEYS = [
    'background',
    'foreground',
    'card',
    'cardForeground',
    'muted',
    'mutedForeground',
    'border',
    'input',
    'ring',
    'primary',
    'primaryForeground',
    'secondary',
    'secondaryForeground',
    'accent',
    'accentForeground',
    'destructive',
    'destructiveForeground',
    'destructiveSurface',
    'success',
    'successForeground',
    'successSurface',
    'warning',
    'warningForeground',
    'warningSurface',
    'info',
    'infoForeground',
    'infoSurface',
    'shadowCard',
    'shadowRaised',
    'shadowOverlay',
  ] as const
  function fillColorTokens(background: string, primary: string): Record<string, string> {
    return Object.fromEntries(
      ADMIN_THEME_COLOR_TOKEN_KEYS.map((key) => [
        key,
        key === 'background'
          ? background
          : key === 'primary' || key === 'ring'
            ? primary
            : '#888888',
      ]),
    )
  }
  const ADMIN_THEME_TEMPLATES = [
    {
      id: 'nightops',
      name: 'Nightops',
      description: 'A near-black console with one vivid signal-green accent.',
      light: fillColorTokens('#fafafa', '#16a34a'),
      dark: fillColorTokens('#0a0b0d', '#22c55e'),
      radius: { sm: '0.375rem', md: '0.5rem', lg: '0.75rem', xl: '1rem' },
      fontDisplay: 'space-grotesk',
      fontBody: 'space-grotesk',
    },
    {
      id: 'atelier',
      name: 'Atelier',
      description: 'Warm, unbleached paper and a burnt-orange accent.',
      light: fillColorTokens('#f2ede2', '#c23d0a'),
      dark: fillColorTokens('#14100b', '#ff7a3d'),
      radius: { sm: '0.125rem', md: '0.25rem', lg: '0.375rem', xl: '0.5rem' },
      fontDisplay: 'plex-mono',
      fontBody: 'plex-sans',
    },
  ]
  let adminTheme: {
    templateId: string
    overrides: Record<string, unknown>
    updatedAt: string | null
    updatedBy: string | null
  } = { templateId: 'nightops', overrides: {}, updatedAt: null, updatedBy: null }

  // The editorial workflow's one entry (`schema@2.1`, ADR-0027), stateful per
  // `installMockFetch()` call for the same reason the site-plan fixture below
  // is: a submit → approve cycle has to be a real sequence a test can watch,
  // not three independent stateless answers.
  let wfEntry: {
    id: string
    status: string
    version: number
    createdAt: string
    updatedAt: string
    locale: string
    translationOf: string | null
    deletedAt: string | null
    publishedAt: string | null
    reviewState: 'none' | 'pending' | 'changes-requested' | 'approved'
    assignedReviewer: string | null
    createdBy: string | null
    values: { title: string }
    blocks: Record<string, unknown>
  } = {
    id: 'wf-entry-1',
    status: 'draft',
    version: 1,
    createdAt: '2026-01-05T00:00:00.000Z',
    updatedAt: '2026-01-05T00:00:00.000Z',
    locale: 'en',
    translationOf: null,
    deletedAt: null,
    publishedAt: null,
    reviewState: 'none',
    assignedReviewer: null,
    createdBy: 'user-1',
    values: { title: 'Workflow draft' },
    blocks: {},
  }
  if (options.wfEntryReviewState !== undefined) {
    wfEntry = { ...wfEntry, reviewState: options.wfEntryReviewState }
  }

  // L19 site plans, stateful per `installMockFetch()` call: decisions merge
  // across requests and `apply` refuses an incomplete review, exactly as the
  // real router does. A mock that always said yes would make the screen's
  // whole reason for existing untestable.
  const planSections = [
    {
      id: 'brief',
      title: 'What we understood',
      description: 'A neighbourhood restaurant.',
      mode: 'each' as const,
      items: [
        {
          id: 'brief:constraint-0',
          section: 'brief',
          title: 'No blog',
          detail: 'Read from brief.md: \u201cPas de blog.\u201d',
        },
      ],
    },
    {
      id: 'contentModel',
      title: 'Content model',
      description: 'The collections.',
      mode: 'each' as const,
      items: [
        {
          id: 'contentModel:dish',
          section: 'contentModel',
          title: 'Dishes (dish)',
          detail: 'The menu. Fields: title (text).',
        },
      ],
    },
    {
      id: 'skin',
      title: 'Design',
      description: 'Pick one of the proposed designs.',
      mode: 'one-of' as const,
      items: [
        { id: 'skin:editorial', section: 'skin', title: 'Warm editorial', detail: 'Warm.' },
        { id: 'skin:clinical', section: 'skin', title: 'Clean and clinical', detail: 'Cool.' },
      ],
    },
  ]
  const planDecisions: Record<string, 'accepted' | 'rejected'> = {}
  let planAppliedAt: string | undefined

  interface MockImportRun {
    readonly id: string
    readonly source: string
    readonly status: 'analyzed' | 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
    readonly createdAt: string
    readonly updatedAt: string
    readonly analysis: unknown
    readonly mapping: unknown
    readonly progress: { readonly processed: number; readonly total: number }
    readonly report: unknown
    readonly error: string | null
  }
  const importPreviewRuns = new Map<string, MockImportRun>()

  let notices = [...(options.notices ?? [])]

  // Account state, per `installMockFetch()` call: the signed-in user plus
  // whatever the test creates through the real routes.
  interface MockAccount {
    id: string
    email: string
    roles: readonly string[]
    status: 'active' | 'disabled' | 'invited' | 'anonymized'
    createdAt: string
    updatedAt: string
    mfa: { totp: boolean; passkeys: number }
    // Fiche 17 task 3's public profile, self-service only in the real router
    // — settable here only through the `me/profile` branch below.
    displayName?: string | null
    avatarMediaId?: string | null
    bio?: string | null
    locale?: string | null
    // Fiche 17 task 1 — only meaningful while `status === 'invited'`.
    invitedAt?: string
  }

  /** The wire shape `AdminUser` expects — fiche 17's fields default the same way an untouched account's do on the real server. */
  function toWireAccount(account: MockAccount): unknown {
    return {
      ...account,
      displayName: account.displayName ?? null,
      avatarMediaId: account.avatarMediaId ?? null,
      bio: account.bio ?? null,
      locale: account.locale ?? null,
      mfaRecommended: false,
      lastSignInAt: null,
      dormant: false,
      invitation:
        account.status === 'invited' && account.invitedAt !== undefined
          ? { sentAt: account.invitedAt, expiresAt: '2030-01-01T00:00:00.000Z' }
          : null,
    }
  }
  // Commerce state (contract E, ADR-0024), per `installMockFetch()` call —
  // one order and one payment pre-seeded so a test can open the order detail
  // screen without also having to drive a whole checkout through this mock.
  interface MockProduct {
    id: string
    handle: string
    title: string
    status: 'active' | 'archived'
    contentRef: { collection: string; entryId: string } | null
    imageMediaIds: string[]
    createdAt: string
    updatedAt: string
  }
  interface MockVariant {
    id: string
    productId: string
    sku: string
    title: string
    priceMinor: number
    currency: string
    onHand: number
    allowBackorder: boolean
    weightGrams: number
    taxCategory: string
    position: number
    lowStockThreshold: number | null
    compareAtPriceMinor: number | null
    saleStartsAt: string | null
    saleEndsAt: string | null
    widthMm: number | null
    heightMm: number | null
    depthMm: number | null
    imageMediaId: string | null
    createdAt: string
    updatedAt: string
  }
  interface MockProductTerm {
    productId: string
    taxonomy: string
    termId: string
  }
  interface MockStockMovement {
    id: string
    variantId: string
    delta: number
    balanceAfter: number
    reason: 'sale' | 'restock' | 'stock_take' | 'manual'
    actorId: string | null
    referenceId: string | null
    note: string | null
    createdAt: string
  }
  interface MockCoupon {
    code: string
    kind: 'percentage' | 'fixed' | 'free_shipping'
    value: number
    currency: string | null
    minSubtotalMinor: number
    startsAt: string | null
    endsAt: string | null
    maxRedemptions: number | null
    redemptions: number
    maxRedemptionsPerCustomer: number | null
    restrictedProductIds: string[]
    active: boolean
    createdAt: string
  }
  interface MockSubscription {
    id: string
    customerId: string
    variantId: string
    quantity: number
    status: 'active' | 'past_due' | 'paused' | 'cancelled'
    intervalUnit: 'day' | 'week' | 'month' | 'year'
    intervalCount: number
    priceMinor: number
    currency: string
    nextBillingAt: string
    createdAt: string
    cancelledAt: string | null
  }
  interface MockSubscriptionCycle {
    id: string
    subscriptionId: string
    periodStart: string
    periodEnd: string
    orderId: string | null
    status: 'billed' | 'skipped_out_of_stock' | 'failed'
    createdAt: string
  }
  let mockProductCounter = 0
  let mockVariantCounter = 0
  let mockStockMovementCounter = 0
  const mockProducts: MockProduct[] = [...(options.commerceProducts ?? [])]
  const mockVariants: MockVariant[] = [...(options.commerceVariants ?? [])]
  const mockProductTerms: MockProductTerm[] = []
  const mockStockMovements: MockStockMovement[] = []
  const mockCoupons: MockCoupon[] = []
  let mockTaxRuleCounter = 0
  const mockTaxRules = [...(options.commerceTaxRules ?? [])]
  let mockShippingMethodCounter = 0
  const mockShippingMethods = [...(options.commerceShippingMethods ?? [])]
  const mockPaymentDrivers = options.commercePaymentDrivers ?? [
    {
      name: 'manual',
      tier: 'degraded',
      settlesOffline: true,
      configured: true,
      selected: undefined,
    },
    {
      name: 'stripe',
      tier: 'optimal',
      settlesOffline: false,
      configured: false,
      selected: undefined,
    },
    {
      name: 'paypal',
      tier: 'optimal',
      settlesOffline: false,
      configured: false,
      selected: undefined,
    },
  ]
  const mockPaymentTestMode = options.commercePaymentTestMode ?? true
  const mockPaymentWebhookUrl =
    options.commercePaymentWebhookUrl === undefined
      ? 'https://example.com/api/commerce/payments/webhook'
      : options.commercePaymentWebhookUrl
  const mockPaymentTestResults = options.commercePaymentTestResults ?? {}
  const mockSubscriptions: MockSubscription[] = [
    {
      id: 'subscription-1',
      customerId: 'customer-1',
      variantId: 'variant-seed',
      quantity: 1,
      status: 'active',
      intervalUnit: 'month',
      intervalCount: 1,
      priceMinor: 1500,
      currency: 'EUR',
      nextBillingAt: '2026-04-01T00:00:00.000Z',
      createdAt: '2026-03-01T00:00:00.000Z',
      cancelledAt: null,
    },
  ]
  const mockSubscriptionCycles: MockSubscriptionCycle[] = []
  const mockOrders = [
    {
      id: 'order-1',
      reference: 'ORD-0001',
      customerId: null,
      email: 'shopper@example.com',
      status: 'pending' as string,
      currency: 'EUR',
      subtotalMinor: 4500,
      discountMinor: 0,
      shippingMinor: 500,
      taxMinor: 0,
      totalMinor: 5000,
      couponCode: null,
      shippingAddressLine1: null as string | null,
      shippingAddressLine2: null as string | null,
      shippingCity: null as string | null,
      shippingPostalCode: null as string | null,
      shippingRecipient: null as string | null,
      shippingPhone: null as string | null,
      trackingCarrier: null as string | null,
      trackingNumber: null as string | null,
      trackingUrl: null as string | null,
      shippedAt: null as string | null,
      placedAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
      lines: [
        {
          id: 'line-1',
          variantId: 'variant-seed',
          sku: 'WOOL-JUMPER-M',
          title: 'Wool jumper',
          quantity: 1,
          unitPriceMinor: 4500,
          subtotalMinor: 4500,
          discountMinor: 0,
          taxMinor: 0,
          totalMinor: 4500,
          position: 0,
        },
      ],
    },
  ]
  const mockOrderHistory = [
    {
      id: 'event-seed',
      orderId: 'order-1',
      at: '2026-03-01T00:00:00.000Z',
      kind: 'placed' as string,
      fromStatus: null as string | null,
      toStatus: 'pending' as string | null,
      actorId: null as string | null,
      note: null as string | null,
    },
  ]
  const mockPayments = [
    {
      id: 'payment-1',
      orderId: 'order-1',
      driver: 'manual',
      status: 'pending' as string,
      amountMinor: 5000,
      currency: 'EUR',
      instructions: 'Bank transfer to IBAN …',
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
    },
  ]
  // Fiche 52 — refunds, credit notes and the transactional e-mail log, all
  // empty by default: nothing has been refunded or shipped on the seeded
  // fixture order until a test does it.
  const mockRefunds: {
    id: string
    paymentId: string
    orderId: string
    status: string
    amountMinor: number
    currency: string
    reason: string | null
    createdAt: string
  }[] = []
  let mockRefundCounter = 0
  const mockOrderEmails: {
    id: string
    orderId: string
    kind: string
    toEmail: string
    status: string
    attempts: number
    lastError: string | null
    createdAt: string
    sentAt: string | null
  }[] = []
  const mockCustomers = [
    {
      id: 'customer-1',
      email: 'shopper@example.com',
      name: 'Shopper One' as string | null,
      userId: null as string | null,
      createdAt: '2026-03-01T00:00:00.000Z',
      updatedAt: '2026-03-01T00:00:00.000Z',
    },
  ]

  let accountCounter = 0
  const accounts: MockAccount[] = [
    {
      id: user.id,
      email: user.email,
      roles: user.roles,
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      mfa: { totp: false, passkeys: 0 },
    },
    {
      id: 'user-2',
      email: 'bob@example.com',
      roles: ['viewer'],
      status: 'active',
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      mfa: { totp: true, passkeys: 0 },
    },
  ]
  // `session-1` is always the id behind `VALID_TOKEN` (see `session()` above)
  // — the only session this mock ever authenticates as, so it is also the
  // only one that can ever be "the session making this request" (fiche 18
  // task 2's `isCurrent`).
  const CURRENT_SESSION_ID = 'session-1'
  const userSessions: Record<
    string,
    { id: string; lastSeenAt: string; label: string | null; browser: string; device: string }[]
  > = {
    [user.id]: [
      {
        id: 'session-1',
        lastSeenAt: '2026-03-01T00:00:00.000Z',
        label: 'Work laptop',
        browser: 'chrome',
        device: 'desktop',
      },
      {
        id: 'session-2',
        lastSeenAt: '2026-03-02T00:00:00.000Z',
        label: null,
        browser: 'safari',
        device: 'mobile',
      },
    ],
    'user-2': [
      {
        id: 'session-3',
        lastSeenAt: '2026-03-03T00:00:00.000Z',
        label: 'Phone',
        browser: 'firefox',
        device: 'mobile',
      },
    ],
  }
  // Fiche 18 task 1: recovery codes, per account, mirroring the real store's
  // shape closely enough for the admin's own tests — a batch plus how many
  // remain unused.
  const recoveryCodes: Record<string, { total: number; remaining: number }> = {}

  let apiKeyCounter = 0
  const apiKeys: {
    id: string
    name: string
    prefix: string
    scope: readonly string[]
    createdBy: string | null
    createdAt: string
    expiresAt: string | null
    revokedAt: string | null
    lastUsedAt: string | null
    rateLimitPerMinute: number
    supersededBy: string | null
  }[] = [
    {
      id: 'key-1',
      name: 'CI pipeline',
      prefix: 'cogenta_sk_',
      scope: ['viewer'],
      createdBy: user.id,
      createdAt: '2026-02-01T00:00:00.000Z',
      expiresAt: null,
      revokedAt: null,
      lastUsedAt: '2026-03-05T00:00:00.000Z',
      rateLimitPerMinute: 600,
      supersededBy: null,
    },
    // Fiche 62 task 2: revoked well outside `MIN_PURGE_AFTER_REVOKED_DAYS`
    // (30 days) of the real wall clock, so the "purge" screen tests do not
    // need to fake time — this row is eligible for purge the moment the
    // suite starts.
    {
      id: 'key-long-revoked',
      name: 'Old integration',
      prefix: 'cogenta_sk_',
      scope: ['viewer'],
      createdBy: user.id,
      createdAt: '2020-01-01T00:00:00.000Z',
      expiresAt: null,
      revokedAt: '2020-02-01T00:00:00.000Z',
      lastUsedAt: null,
      rateLimitPerMinute: 600,
      supersededBy: null,
    },
  ]

  // Fiche 58 tasks 2-6 — "MCP Clients". In-memory stand-in for
  // `McpConnectionStore`, mirroring the real store's own shape
  // (`packages/mcp/src/registry/store.ts`'s `McpConnectionSummary`) closely
  // enough that the screen's own request/response typing exercises for
  // real, without re-implementing sandboxing or discovery — this mock's
  // "test connection" always reports one fixed discovered tool, "greet".
  let mcpConnectionCounter = 0
  const mcpConnections: {
    id: string
    name: string
    transport: 'stdio' | 'http'
    command?: string
    args: readonly string[]
    url?: string
    env: Record<string, string>
    authKind: 'none' | 'api_key' | 'oauth'
    hasSecret: boolean
    secretEnvVar?: string
    confirmedUnsandboxed: boolean
    enabled: boolean
    status: 'unverified' | 'ok' | 'error'
    lastError?: string
    discoveredTools: { name: string; description: string; inputSchema: Record<string, unknown> }[]
    lastDiscoveredAt?: string
    exposedTools: {
      remoteName: string
      localName: string
      description: string
      sideEffects: boolean
      reversible: boolean
      cost: 'low' | 'medium' | 'high'
    }[]
    createdAt: string
    updatedAt: string
  }[] = []

  // L22 task 2 — "Canaux". In-memory stand-in for `ChannelLinkStore`, scoped
  // per test the same way `apiKeys` is: one signed-in account's own links,
  // never another account's.
  let linkedChannels: { channelName: string; channelUserId: string; linkedAt: string }[] = [
    ...(options.linkedChannels ?? []),
  ]
  let channelLinkCodeCounter = 0

  // The marketplace catalog (L17). A static, fixed set of entries — the real
  // catalog is caller-assembled (`createMarketplaceCatalog`), so what matters
  // here is the transport, not a realistic directory. Three entries cover
  // the three things the admin screen has to get right: a normal install
  // whose signature verifies, one whose signature does **not** (the
  // never-silent-failure requirement), and one already installed whose next
  // version widens its capabilities (the never-silent-permission-widening
  // requirement).
  const MARKETPLACE_CAPABILITY_INFO: Record<
    string,
    { sentence: string; riskLevel: 'low' | 'medium' | 'high'; category: string }
  > = {
    'content.read': { sentence: 'Read your content.', riskLevel: 'low', category: 'content' },
    'content.publish': {
      sentence: 'Publish or unpublish content on your behalf.',
      riskLevel: 'high',
      category: 'content',
    },
  }
  function marketplaceCapabilities(capabilities: readonly string[]) {
    return capabilities.map((capability) => ({
      capability,
      ...(MARKETPLACE_CAPABILITY_INFO[capability] ?? {
        sentence: capability,
        riskLevel: 'medium' as const,
        category: 'other',
      }),
    }))
  }
  const MARKETPLACE_CATALOG = [
    {
      id: 'seo-helper',
      kind: 'plugin' as const,
      displayName: 'SEO Helper',
      description: 'Suggests meta descriptions for your pages.',
      category: 'SEO',
      author: 'Cogenta',
      screenshots: ['https://example.test/seo-helper.png'],
      changelog: [{ version: '1.0.0', notes: 'First release.' }],
      capabilities: ['content.read'],
      signatureVerified: true,
      signatureInvalid: false,
      installFails: false,
    },
    {
      id: 'forged-plugin',
      kind: 'plugin' as const,
      displayName: 'Forged Plugin',
      description: 'A plugin whose signature never verifies.',
      category: 'Misc',
      screenshots: [],
      changelog: [],
      capabilities: ['content.read'],
      signatureVerified: false,
      signatureInvalid: true,
      installFails: true,
    },
    {
      // The preview looks fine (no `error`), but the install call itself
      // still refuses — a bad-signature response the admin UI only ever
      // learns about from clicking "install", not from the fiche détaillée.
      // This is what proves `confirmInstall`'s own failure path, not just
      // the pre-emptive `detail.error` block that `forged-plugin` exercises.
      id: 'flaky-signature-plugin',
      kind: 'plugin' as const,
      displayName: 'Flaky Signature Plugin',
      description: 'Looks fine until you actually install it.',
      category: 'Misc',
      screenshots: [],
      changelog: [{ version: '1.0.0', notes: 'First release.' }],
      capabilities: ['content.read'],
      signatureVerified: true,
      signatureInvalid: false,
      installFails: true,
    },
    {
      id: 'widening-plugin',
      kind: 'plugin' as const,
      displayName: 'Widening Plugin',
      description: 'Its latest version requests a new, wider permission.',
      category: 'Misc',
      screenshots: [],
      changelog: [{ version: '2.0.0', notes: 'Adds publishing.' }],
      capabilities: ['content.read', 'content.publish'],
      signatureVerified: true,
      signatureInvalid: false,
      installFails: false,
    },
  ]
  interface MarketplaceInstallRow {
    itemId: string
    kind: string
    displayName: string
    reference: string
    pluginName: string | null
    pluginVersion: string | null
    signatureVerified: boolean
    installedBy: string | null
    installedAt: string
    updatedAt: string
    enabled: boolean
  }
  const marketplaceInstalls = new Map<string, MarketplaceInstallRow>([
    // Pre-installed at the *previous* version, so the first `update` call in
    // a test is the one that discovers the widened capability, exactly as
    // the real installer's `detectCapabilitiesNeedingApproval` would.
    [
      'widening-plugin',
      {
        itemId: 'widening-plugin',
        kind: 'plugin',
        displayName: 'Widening Plugin',
        reference: 'mock://widening-plugin',
        pluginName: 'widening-plugin',
        pluginVersion: '1.0.0',
        signatureVerified: true,
        installedBy: user.id,
        installedAt: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
        enabled: true,
      },
    ],
  ])

  // Taxonomy terms and the trash live per `installMockFetch()` call, like
  // the media library above: each test starts from the same fixture and
  // changes it through the same routes the real server exposes.
  let termCounter = 0
  let terms: {
    id: string
    taxonomy: string
    parent: string | null
    slug: string
    labels: Readonly<Record<string, string>>
    position: number
    depth: number
    createdAt: string
    updatedAt: string
  }[] = (
    options.taxonomyTerms ?? [
      {
        id: 'term-existing',
        taxonomy: 'topic',
        parent: null,
        slug: 'cuisine',
        labels: { fr: 'Cuisine', en: 'Cooking' },
        position: 0,
        depth: 0,
        createdAt: '2026-02-01T00:00:00.000Z',
        updatedAt: '2026-02-01T00:00:00.000Z',
      },
    ]
  ).map((term) => ({ ...term }))
  // `?counts=1`'s answer, by term id — a simplified stand-in for the real
  // cross-collection aggregation `countTaxonomyUsage` performs server-side
  // (proven there, against a real database, in `@cogenta/schema`'s and
  // `@cogenta/api`'s own test suites). Zero unless a test seeds otherwise.
  const taxonomyUsage: Record<string, { own: number; withDescendants: number }> = {
    ...options.taxonomyUsage,
  }
  let trash = [MOCK_TRASHED_ENTRY, MOCK_TRASHED_BLOCKED_ENTRY]
  // `note`'s own trash, kept apart from `article`'s (fiche 07 task 1): a
  // real server scopes the trash per collection, and a mock that merged them
  // into one array would let `article?trashed=only` see `note`'s rows too.
  let noteTrash = [MOCK_TRASHED_NOTE]

  // Menus live per `installMockFetch()` call too, the same way taxonomy terms
  // do: each test starts empty and changes state only through the routes the
  // real server exposes. Write is a fixed `admin`/`editor` rule here — unlike
  // a taxonomy, a menu carries no per-site permission configuration.
  let menuCounter = 0
  let itemCounter = 0
  let menus: {
    id: string
    name: string
    locale: string
    label: string
    location: string | null
    createdAt: string
    updatedAt: string
  }[] = []
  let menuItems: {
    id: string
    menuId: string
    parent: string | null
    label: string
    kind: string
    targetCollection: string | null
    targetEntryId: string | null
    targetTaxonomy: string | null
    targetTermId: string | null
    url: string | null
    title: string | null
    position: number
    depth: number
    openInNewTab: boolean
  }[] = []

  // The redirect table, admin-only on every method — see `redirects.tsx`.
  let redirectCounter = 0
  let redirects: {
    id: string
    from: string
    to: string
    status: 301 | 302 | 307 | 308 | 410
    collection: null
    entryId: null
    locale: null
    reason: 'manual' | 'import'
    createdAt: number
  }[] = []

  // Role permission overrides (fiche 63, ADR-0028) — see `roles.tsx`.
  // Empty by default, exactly as a real site that has never written one:
  // every "byCollection" matrix cell falls through to the schema's own
  // `permissions` block, which `MOCK_SCHEMA` already declares.
  let rolePermissionOverrides: {
    targetType: 'collection' | 'taxonomy'
    targetName: string
    action: 'read' | 'create' | 'update' | 'delete' | 'publish'
    roles: string[]
    own: boolean
    updatedAt: string
    updatedBy: string | null
  }[] = []

  // Forms (contract G, ADR-0026 + fiche 47) — see `forms.tsx`/`form-submissions.tsx`.
  let formCounter = 0
  let formDefs: {
    id: string
    name: string
    label: string
    fields: readonly Record<string, unknown>[]
    active: boolean
    confirmationMessage: string
    redirectTo: string | null
    notifyEmails: readonly string[]
    autoresponder: { enabled: boolean; body?: string }
    retainDays: number
    steps: readonly Record<string, unknown>[]
    notifyChannels: readonly Record<string, unknown>[]
    captcha: { enabled: boolean; siteKey?: string; secretKey?: string }
    createdAt: string
    updatedAt: string
  }[] = (options.forms ?? []).map((form) => ({
    ...form,
    steps: form.steps ?? [],
    notifyChannels: form.notifyChannels ?? [],
    captcha: form.captcha ?? { enabled: false },
  }))
  let formNotes: {
    id: string
    submissionId: string
    authorId: string | null
    authorLabel: string
    body: string
    createdAt: string
  }[] = []
  let formNoteCounter = 0
  const _submissionCounter = 0
  let formSubmissions: {
    id: string
    formId: string
    formName: string
    values: Readonly<Record<string, unknown>>
    consents: readonly Record<string, unknown>[]
    status: 'new' | 'read' | 'archived' | 'spam'
    ipHash: string | null
    referrer: string | null
    userAgent: string | null
    submittedAt: string
  }[] = (options.formSubmissions ?? []).map((submission) => ({ ...submission }))

  // The page builder's motif/model library (fiche 43 sub-chantier A) — see
  // `builder/pattern-picker.tsx`. Empty by default: most tests that switch
  // to the visual builder never touch this panel, and the fixture is only
  // there so `PatternPicker`'s own mount-time fetch does not throw.
  let pageBuilderPatternCounter = 0
  let pageBuilderPatterns: {
    id: string
    name: string
    category: string | null
    kind: 'pattern' | 'template'
    blocks: readonly { key: string; type: string; data: Record<string, unknown> }[]
    provenance: 'human' | 'assisted' | 'generated'
    provenanceDetail: Record<string, unknown> | null
    createdAt: string
    updatedAt: string
  }[] = []

  // Prefix redirects (fiche 12 task 4) — see `redirects/pattern-panel.tsx`.
  let patternCounter = 0
  let redirectPatterns: {
    id: string
    fromPrefix: string
    toPrefix: string
    status: 301 | 302
    createdAt: number
  }[] = []

  // The 404 log (fiche 12 task 1) — see `redirects/not-found-panel.tsx`.
  let notFoundEntries: {
    path: string
    hits: number
    firstSeen: number
    lastSeen: number
    lastReferrer: string | null
  }[] = options.notFound === undefined ? [] : [...options.notFound]

  interface CommentFixture {
    id: string
    collection: string
    entryId: string
    locale: string | null
    parentId: string | null
    userId: string | null
    authorName: string
    authorEmail: string
    authorUrl: string | null
    body: string
    status: 'pending' | 'approved' | 'spam' | 'trash'
    ipHash: string | null
    userAgent: string | null
    moderation: { flagged: boolean | null; severity: string | null; reason: string | null }
    provenance: string
    createdAt: string
    updatedAt: string
    moderatedAt: string | null
    moderatedBy: string | null
  }
  const comments: CommentFixture[] = (options.comments ?? []).map((seed) => {
    return {
      id: seed.id,
      collection: seed.collection,
      entryId: seed.entryId,
      locale: null,
      parentId: null,
      userId: null,
      authorName: seed.authorName,
      authorEmail: seed.authorEmail,
      authorUrl: null,
      body: seed.body,
      status: seed.status,
      ipHash: null,
      userAgent: null,
      moderation: { flagged: null, severity: null, reason: null },
      provenance: 'human',
      createdAt: seed.createdAt ?? '2026-01-01T00:00:00.000Z',
      updatedAt: seed.createdAt ?? '2026-01-01T00:00:00.000Z',
      moderatedAt: null,
      moderatedBy: null,
    }
  })
  let commentSettings: Record<
    string,
    { enabled: boolean | null; moderationRequired: boolean | null }
  > = {}
  let entryCommentSettings: Record<string, boolean | null> = {}

  let mediaCounter = 0
  interface MockMediaAsset {
    id: string
    kind: string
    filename: string
    mimeType: string
    size: number
    width: number | null
    height: number | null
    alt: string
    decorative: boolean
    decorativeJustification: string | null
    focal: { x: number; y: number } | null
    tags: string[]
    contentHash: string
    folderId: string | null
    createdAt: string
    createdBy: string | null
  }
  const media: MockMediaAsset[] = []
  for (let i = 0; i < (options.mediaSeedCount ?? 0); i += 1) {
    mediaCounter += 1
    media.push({
      id: `media-seed-${mediaCounter}`,
      kind: 'image',
      filename: `seed-${mediaCounter}.png`,
      mimeType: 'image/png',
      size: 10,
      width: null,
      height: null,
      alt: `Seed image ${mediaCounter}`,
      decorative: false,
      decorativeJustification: null,
      focal: null,
      tags: [],
      contentHash: `hash-seed-${mediaCounter}`,
      folderId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: USER.id,
    })
  }

  // Media folders (fiche 46), per `installMockFetch()` call — same
  // materialised-path shape as the real `MediaFolderStore`, kept minimal:
  // this is a fixture, not a re-implementation of the depth/cycle guards
  // already proven server-side in `@cogenta/core`'s own contract suite.
  let folderCounter = 0
  interface MockMediaFolder {
    id: string
    parentId: string | null
    name: string
    path: string
    position: number
    createdAt: string
  }
  const mediaFolders: MockMediaFolder[] = []
  function mediaFolderPath(parentId: string | null, id: string): string {
    if (parentId === null) return `/${id}/`
    const parent = mediaFolders.find((folder) => folder.id === parentId)
    return `${parent?.path ?? '/'}${id}/`
  }

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method ?? 'GET'
      // A real `multipart/form-data` upload (fiche 57's resource upload,
      // fiche 46's `replaceMedia` — the one media write that has to be
      // multipart on the wire) is not JSON — parsing it here would throw
      // before any route-specific handler below ever runs. Every route that
      // actually expects a `FormData` body reads `init?.body` itself further
      // down, the same way the real router treats it as a second,
      // structurally different transport rather than another JSON shape;
      // this shared `body` is only ever consumed by the JSON routes.
      const body =
        init?.body === undefined || init.body instanceof FormData
          ? {}
          : JSON.parse(init.body as string)
      const auth = (init?.headers as Record<string, string> | undefined)?.authorization

      if (url.endsWith('/api/auth/login') && method === 'POST') {
        if (body.password !== password) {
          return json(401, {
            error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Incorrect email or password.' },
          })
        }
        if (options.requireTotp === true) {
          return json(200, {
            data: { status: 'mfa_required', ticket: 'ticket-1', availableFactors: ['totp'] },
          })
        }
        return json(200, { data: session() })
      }

      if (url.endsWith('/api/auth/totp') && method === 'POST') {
        if (body.ticket !== 'ticket-1' || body.token !== '123456') {
          return json(401, {
            error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Incorrect verification code.' },
          })
        }
        return json(200, { data: session() })
      }

      // Self-service enrolment (ADR-0021): identified by the bearer token, never
      // by anything in the request body.
      if (url.endsWith('/api/auth/totp/enrol') && method === 'POST') {
        if (auth !== `Bearer ${VALID_TOKEN}`) {
          return json(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in first.' } })
        }
        return json(200, {
          data: { secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/Cogenta:alice@example.com' },
        })
      }

      if (url.endsWith('/api/auth/totp/enrol/confirm') && method === 'POST') {
        if (auth !== `Bearer ${VALID_TOKEN}`) {
          return json(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in first.' } })
        }
        if (body.token !== '123456') {
          return json(401, {
            error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Incorrect verification code.' },
          })
        }
        // Minted alongside TOTP confirmation (fiche 18 task 1), shown once.
        recoveryCodes[user.id] = { total: 10, remaining: 10 }
        const confirmedAccount = accounts.find((candidate) => candidate.id === user.id)
        if (confirmedAccount !== undefined) confirmedAccount.mfa.totp = true
        return json(200, {
          data: { enrolled: true, recoveryCodes: mockRecoveryCodeBatch() },
        })
      }

      if (url.endsWith('/api/auth/totp') && method === 'DELETE') {
        if (auth !== `Bearer ${VALID_TOKEN}`) {
          return json(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in first.' } })
        }
        delete recoveryCodes[user.id]
        const disabledAccount = accounts.find((candidate) => candidate.id === user.id)
        if (disabledAccount !== undefined) disabledAccount.mfa.totp = false
        return new Response(null, { status: 204 })
      }

      if (url.endsWith('/api/auth/totp/recovery-codes') && method === 'GET') {
        if (auth !== `Bearer ${VALID_TOKEN}`) {
          return json(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in first.' } })
        }
        return json(200, { data: recoveryCodes[user.id] ?? { total: 0, remaining: 0 } })
      }

      if (url.endsWith('/api/auth/totp/recovery-codes/regenerate') && method === 'POST') {
        if (auth !== `Bearer ${VALID_TOKEN}`) {
          return json(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in first.' } })
        }
        recoveryCodes[user.id] = { total: 10, remaining: 10 }
        return json(200, { data: { recoveryCodes: mockRecoveryCodeBatch() } })
      }

      if (url.endsWith('/api/auth/recovery-code') && method === 'POST') {
        if (body.ticket !== 'ticket-1' || body.code !== 'AAAAA-AAAAA') {
          return json(401, {
            error: {
              code: 'AUTH_RECOVERY_CODE_INVALID',
              message: 'This recovery code is not valid.',
            },
          })
        }
        return json(200, { data: session() })
      }

      if (url.endsWith('/api/auth/password-policy') && method === 'GET') {
        return json(200, { data: { minLength: 12 } })
      }

      const dismissMatch = /\/api\/notices\/([^/?]+)\/dismiss$/u.exec(url)
      if (dismissMatch !== null && method === 'POST') {
        if (auth !== `Bearer ${VALID_TOKEN}`) {
          return json(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in first.' } })
        }
        const id = decodeURIComponent(dismissMatch[1] ?? '')
        const found = notices.find((notice) => notice.id === id)
        if (found === undefined) {
          return json(404, { error: { code: 'CONTENT_NOT_FOUND', message: 'No such notice.' } })
        }
        notices = notices.filter((notice) => notice.id !== id)
        return new Response(null, { status: 204 })
      }

      if (url.endsWith('/api/notices') && method === 'GET') {
        if (auth !== `Bearer ${VALID_TOKEN}`) {
          return json(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in first.' } })
        }
        return json(200, { data: notices })
      }

      // `/api/notices/channels/*` — L22 task 2's "Canaux" screen, on the same
      // `ChannelLinkStore` fiche 38's notice delivery already exposed
      // (`channel-settings-router.ts`, unmodified by this lot).
      const channelLinkMatch =
        /\/api\/notices\/channels(?:\/([^/?]+)(?:\/(link-code|preferences))?)?(?:\?.*)?$/u.exec(url)
      if (channelLinkMatch !== null && url.includes('/api/notices/channels')) {
        if (auth !== `Bearer ${VALID_TOKEN}`) {
          return json(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in first.' } })
        }
        const [, rawChannelName, action] = channelLinkMatch

        if (rawChannelName === undefined && method === 'GET') {
          return json(200, { data: linkedChannels })
        }

        const channelName = decodeURIComponent(rawChannelName ?? '')

        if (action === 'link-code' && method === 'POST') {
          channelLinkCodeCounter += 1
          if (!linkedChannels.some((link) => link.channelName === channelName)) {
            linkedChannels = [
              ...linkedChannels,
              {
                channelName,
                channelUserId: `mock-${channelName}-user`,
                linkedAt: '2026-03-06T00:00:00.000Z',
              },
            ]
          }
          return json(201, {
            data: {
              code: `MOCKCODE${channelLinkCodeCounter}`,
              expiresAt: '2026-03-06T00:10:00.000Z',
            },
          })
        }

        if (action === undefined && method === 'DELETE') {
          linkedChannels = linkedChannels.filter((link) => link.channelName !== channelName)
          return new Response(null, { status: 204 })
        }
      }

      // `/api/api-keys/*`. Admin-only, mirroring the real router: the raw
      // `key` is present only in the `POST`, `POST .../rotate` and
      // `POST .../recover` response bodies, never in the list — proving the
      // screen never re-displays it depends on this stub agreeing with
      // `packages/api/test/rest/api-keys-router.test.ts`.
      const apiKeysMatch =
        /\/api\/api-keys(?:\/([^/?]+)(?:\/(rotate|purge|recover))?)?(?:\?.*)?$/u.exec(url)
      if (apiKeysMatch !== null && url.includes('/api/api-keys')) {
        if (auth !== `Bearer ${VALID_TOKEN}`) {
          return json(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in first.' } })
        }
        const isAdmin = user.roles.includes('admin')
        const forbidden = json(403, {
          error: { code: 'FORBIDDEN', message: 'Only the admin role may do this.' },
        })
        const [, rawId, actionSuffix] = apiKeysMatch

        if (rawId === undefined && method === 'GET') {
          if (!isAdmin) return forbidden
          const withUsage = apiKeys.map((key) => ({
            ...key,
            usage: { last7Days: 0, last30Days: 3 },
          }))
          // Fiche 67 task 5: real `limit`/`offset`, same "absent means every
          // key" contract `parseApiKeysLimit` documents server-side —
          // `mcp.tsx`'s picker (`listApiKeys`) never sends either and keeps
          // getting the full array, byte for byte.
          const parsedUrl = new URL(url, 'http://localhost')
          const limitRaw = parsedUrl.searchParams.get('limit')
          const pageLimit = limitRaw === null ? undefined : Number(limitRaw)
          const offset = Number(parsedUrl.searchParams.get('offset') ?? '0')
          const page =
            pageLimit === undefined ? withUsage : withUsage.slice(offset, offset + pageLimit)
          const hasMore = pageLimit !== undefined && offset + pageLimit < withUsage.length
          return json(200, { data: page, page: { hasMore } })
        }

        if (rawId === undefined && method === 'POST') {
          if (!isAdmin) return forbidden
          apiKeyCounter += 1
          const rawKey = `cogenta_sk_mock-${apiKeyCounter}-not-a-real-secret`
          const expiresAt =
            typeof body.expiresAt === 'string'
              ? body.expiresAt
              : body.neverExpires === true
                ? null
                : '2026-06-06T00:00:00.000Z'
          const record = {
            id: `key-new-${apiKeyCounter}`,
            name: String(body.name),
            prefix: rawKey.slice(0, 12),
            scope: body.scope as readonly string[],
            createdBy: user.id,
            createdAt: '2026-03-06T00:00:00.000Z',
            expiresAt,
            revokedAt: null,
            lastUsedAt: null,
            rateLimitPerMinute:
              typeof body.rateLimitPerMinute === 'number' ? body.rateLimitPerMinute : 600,
            supersededBy: null,
          }
          apiKeys.push(record)
          return json(201, {
            data: { ...record, key: rawKey, usage: { last7Days: 0, last30Days: 0 } },
          })
        }

        if (rawId !== undefined && actionSuffix === 'rotate' && method === 'POST') {
          if (!isAdmin) return forbidden
          const found = apiKeys.find((candidate) => candidate.id === rawId)
          if (found === undefined) {
            return json(404, {
              error: { code: 'API_KEY_NOT_FOUND', message: 'No API key with that id.' },
            })
          }
          apiKeyCounter += 1
          const rawKey = `cogenta_sk_mock-rotated-${apiKeyCounter}-not-a-real-secret`
          const issued = {
            id: `key-rotated-${apiKeyCounter}`,
            name: found.name,
            prefix: rawKey.slice(0, 12),
            scope: found.scope,
            createdBy: user.id,
            createdAt: '2026-03-07T00:00:00.000Z',
            expiresAt: found.expiresAt,
            revokedAt: null,
            lastUsedAt: null,
            rateLimitPerMinute: found.rateLimitPerMinute,
            supersededBy: null,
          }
          found.supersededBy = issued.id
          // Far in the future on purpose: this only has to outlive whatever
          // the real wall clock is when the test suite runs, so the row
          // reads "on grace period" rather than "expired" by coincidence.
          found.expiresAt = '2099-01-01T00:00:00.000Z'
          apiKeys.push(issued)
          return json(201, {
            data: {
              issued: { ...issued, key: rawKey, usage: { last7Days: 0, last30Days: 0 } },
              previous: { ...found, usage: { last7Days: 0, last30Days: 3 } },
            },
          })
        }

        if (rawId !== undefined && actionSuffix === undefined && method === 'DELETE') {
          if (!isAdmin) return forbidden
          const found = apiKeys.find((candidate) => candidate.id === rawId)
          if (found === undefined) {
            return json(404, {
              error: { code: 'API_KEY_NOT_FOUND', message: 'No API key with that id.' },
            })
          }
          // The real wall clock, not a fixed date: fiche 62's recover/purge
          // eligibility windows are both computed against `Date.now()` on
          // the admin screen, so a freshly revoked row has to actually be
          // fresh for "recover within 24h" to be exercisable at all.
          found.revokedAt = new Date().toISOString()
          return new Response(null, { status: 204 })
        }

        // Fiche 62 task 2 — a real delete, mirroring
        // `ApiKeyStore.purge`'s two refusals (never revoked; revoked too
        // recently).
        if (rawId !== undefined && actionSuffix === 'purge' && method === 'DELETE') {
          if (!isAdmin) return forbidden
          const found = apiKeys.find((candidate) => candidate.id === rawId)
          if (found === undefined) {
            return json(404, {
              error: { code: 'API_KEY_NOT_FOUND', message: 'No API key with that id.' },
            })
          }
          if (found.revokedAt === null) {
            return json(409, {
              error: {
                code: 'API_KEY_PURGE_INVALID',
                message: 'Only a revoked key can be purged.',
              },
            })
          }
          const revokedAgoMs = Date.now() - new Date(found.revokedAt).getTime()
          if (revokedAgoMs < 30 * 24 * 60 * 60 * 1000) {
            return json(409, {
              error: {
                code: 'API_KEY_PURGE_INVALID',
                message: 'A revoked key can only be purged after 30 days.',
              },
            })
          }
          apiKeys.splice(apiKeys.indexOf(found), 1)
          return new Response(null, { status: 204 })
        }

        // Fiche 62 task 3, decision (b) — mints a replacement without ever
        // lifting `revokedAt`, mirroring `ApiKeyStore.recover`.
        if (rawId !== undefined && actionSuffix === 'recover' && method === 'POST') {
          if (!isAdmin) return forbidden
          const found = apiKeys.find((candidate) => candidate.id === rawId)
          if (found === undefined) {
            return json(404, {
              error: { code: 'API_KEY_NOT_FOUND', message: 'No API key with that id.' },
            })
          }
          if (found.revokedAt === null) {
            return json(409, {
              error: {
                code: 'API_KEY_RECOVERY_INVALID',
                message: 'Only a revoked key can be recovered.',
              },
            })
          }
          const revokedAgoMs = Date.now() - new Date(found.revokedAt).getTime()
          if (revokedAgoMs > 24 * 60 * 60 * 1000) {
            return json(409, {
              error: {
                code: 'API_KEY_RECOVERY_INVALID',
                message: 'This key was revoked too long ago to recover.',
              },
            })
          }
          apiKeyCounter += 1
          const rawKey = `cogenta_sk_mock-recovered-${apiKeyCounter}-not-a-real-secret`
          const issued = {
            id: `key-recovered-${apiKeyCounter}`,
            name: found.name,
            prefix: rawKey.slice(0, 12),
            scope: found.scope,
            createdBy: user.id,
            createdAt: '2026-03-08T00:00:00.000Z',
            expiresAt: found.expiresAt,
            revokedAt: null,
            lastUsedAt: null,
            rateLimitPerMinute: found.rateLimitPerMinute,
            supersededBy: null,
          }
          found.supersededBy = issued.id
          apiKeys.push(issued)
          return json(201, {
            data: { ...issued, key: rawKey, usage: { last7Days: 0, last30Days: 0 } },
          })
        }
      }

      // `/api/mcp-connections/*` (fiche 58). Admin-only, mirroring
      // `packages/api/src/rest/mcp-connections-router.ts`: the mandatory
      // confirmation for a `stdio` connection is enforced here too (never
      // just assumed the screen already checked it), and "test connection"
      // always discovers exactly one tool, "greet" — enough for the screen's
      // own "absent, pas refusée" checkbox flow to be exercised for real.
      const mcpConnectionsMatch =
        /\/api\/mcp-connections(?:\/([^/?]+)(?:\/(test|exposed-tools))?)?(?:\?.*)?$/u.exec(url)
      if (mcpConnectionsMatch !== null && url.includes('/api/mcp-connections')) {
        if (auth !== `Bearer ${VALID_TOKEN}`) {
          return json(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in first.' } })
        }
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: {
              code: 'FORBIDDEN',
              message: 'Only the admin role may manage MCP connections.',
            },
          })
        }
        const [, rawId, action] = mcpConnectionsMatch

        if (rawId === undefined && method === 'GET') {
          return json(200, { data: mcpConnections })
        }

        if (rawId === undefined && method === 'POST') {
          if (body.transport === 'stdio' && body.confirmUnsandboxed !== true) {
            return json(400, {
              error: {
                code: 'MCP_CONNECTION_CONFIRMATION_REQUIRED',
                message: 'A "stdio" connection must explicitly confirm it is unsandboxed.',
              },
            })
          }
          mcpConnectionCounter += 1
          const now = '2026-03-08T00:00:00.000Z'
          const record = {
            id: `mcp-conn-${mcpConnectionCounter}`,
            name: String(body.name),
            transport: body.transport as 'stdio' | 'http',
            ...(typeof body.command === 'string' ? { command: body.command } : {}),
            args: (body.args as readonly string[] | undefined) ?? [],
            ...(typeof body.url === 'string' ? { url: body.url } : {}),
            env: (body.env as Record<string, string> | undefined) ?? {},
            authKind: (body.authKind as 'none' | 'api_key' | 'oauth' | undefined) ?? 'none',
            hasSecret: typeof body.secret === 'string' && body.secret.length > 0,
            ...(typeof body.secretEnvVar === 'string' ? { secretEnvVar: body.secretEnvVar } : {}),
            confirmedUnsandboxed: true,
            enabled: true,
            status: 'unverified' as const,
            discoveredTools: [],
            exposedTools: [],
            createdAt: now,
            updatedAt: now,
          }
          mcpConnections.push(record)
          return json(201, { data: record })
        }

        const found = mcpConnections.find((candidate) => candidate.id === rawId)
        if (rawId !== undefined && found === undefined) {
          return json(404, {
            error: { code: 'MCP_CONNECTION_NOT_FOUND', message: 'No such connection.' },
          })
        }

        if (rawId !== undefined && action === undefined && method === 'PATCH') {
          if (found === undefined) throw new Error('unreachable')
          if (typeof body.enabled === 'boolean') found.enabled = body.enabled
          found.updatedAt = '2026-03-08T00:05:00.000Z'
          return json(200, { data: found })
        }

        if (rawId !== undefined && action === undefined && method === 'DELETE') {
          const index = mcpConnections.findIndex((candidate) => candidate.id === rawId)
          if (index !== -1) mcpConnections.splice(index, 1)
          return json(200, { data: { id: rawId, removed: true } })
        }

        if (rawId !== undefined && action === 'test' && method === 'POST') {
          if (found === undefined) throw new Error('unreachable')
          found.status = 'ok'
          found.discoveredTools = [
            { name: 'greet', description: 'Greets a person by name.', inputSchema: {} },
          ]
          found.lastDiscoveredAt = '2026-03-08T00:10:00.000Z'
          found.updatedAt = found.lastDiscoveredAt
          return json(200, { data: found })
        }

        if (rawId !== undefined && action === 'exposed-tools' && method === 'PUT') {
          if (found === undefined) throw new Error('unreachable')
          const discoveredNames = new Set(found.discoveredTools.map((tool) => tool.name))
          const tools = (body.tools as readonly Record<string, unknown>[] | undefined) ?? []
          for (const tool of tools) {
            if (!discoveredNames.has(String(tool.remoteName))) {
              return json(400, {
                error: {
                  code: 'MCP_CONNECTION_TOOL_NOT_DISCOVERED',
                  message: `"${tool.remoteName}" was not discovered on this connection.`,
                },
              })
            }
          }
          found.exposedTools = tools.map((tool) => ({
            remoteName: String(tool.remoteName),
            localName:
              typeof tool.localName === 'string' && tool.localName.length > 0
                ? tool.localName
                : String(tool.remoteName),
            description:
              typeof tool.description === 'string' && tool.description.length > 0
                ? tool.description
                : String(tool.remoteName),
            sideEffects: Boolean(tool.sideEffects),
            reversible: Boolean(tool.reversible),
            cost: (tool.cost as 'low' | 'medium' | 'high' | undefined) ?? 'low',
          }))
          found.updatedAt = '2026-03-08T00:15:00.000Z'
          return json(200, { data: found })
        }
      }

      // `/api/marketplace/*` (L17). Admin-only, mirroring
      // `packages/api/src/rest/marketplace-router.ts`: a signature refusal on
      // install is a real 422 with `PLUGIN_SIGNATURE_INVALID`, and an update
      // that would widen capabilities is a real 409 with
      // `MARKETPLACE_UPDATE_REQUIRES_APPROVAL` until `confirmPendingPermissions`
      // is sent — the two refusals this admin screen exists to never hide.
      const marketplaceInstalledMatch = /\/api\/marketplace\/installed(?:\?.*)?$/u.exec(url)
      const marketplaceUpdatesMatch = /\/api\/marketplace\/updates(\/apply)?(?:\?.*)?$/u.exec(url)
      const marketplaceMatch =
        /\/api\/marketplace\/items(?:\/([^/?]+))?(?:\/(install|update|uninstall|activate|deactivate))?(?:\?.*)?$/u.exec(
          url,
        )
      if (
        (marketplaceInstalledMatch !== null ||
          marketplaceUpdatesMatch !== null ||
          marketplaceMatch !== null) &&
        url.includes('/api/marketplace')
      ) {
        if (auth !== `Bearer ${VALID_TOKEN}`) {
          return json(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in first.' } })
        }
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: {
              code: 'FORBIDDEN',
              message: 'Only the admin role may browse or install marketplace items.',
            },
          })
        }

        // Fiche 29 tasks 1-2 — the "installed extensions" and "updates"
        // summary endpoints. Kept deliberately simple in this mock (no
        // usage/disabled data, matching the real router's honest "null
        // means never measured/never violated" default): the real
        // enrichment logic is proved server-side, not re-implemented here.
        if (marketplaceInstalledMatch !== null && method === 'GET') {
          const data = Array.from(marketplaceInstalls.values()).map((record) => {
            const entry = MARKETPLACE_CATALOG.find((candidate) => candidate.id === record.itemId)
            const latestVersion = entry?.changelog.at(-1)?.version ?? null
            const updateAvailable = latestVersion !== null && latestVersion !== record.pluginVersion
            return {
              itemId: record.itemId,
              kind: record.kind,
              displayName: record.displayName,
              pluginName: record.pluginName,
              pluginVersion: record.pluginVersion,
              signatureVerified: record.signatureVerified,
              installedBy: record.installedBy,
              installedAt: record.installedAt,
              updatedAt: record.updatedAt,
              enabled: record.enabled,
              disabled: null,
              usage: null,
              latestVersion,
              updateAvailable,
              updateRequiresApproval: updateAvailable,
              grantedCapabilities: [],
            }
          })
          return json(200, { data })
        }

        if (marketplaceUpdatesMatch !== null) {
          const applying = marketplaceUpdatesMatch[1] === '/apply'
          const withUpdate = Array.from(marketplaceInstalls.values())
            .map((record) => {
              const entry = MARKETPLACE_CATALOG.find((candidate) => candidate.id === record.itemId)
              const latestVersion = entry?.changelog.at(-1)?.version ?? null
              return { record, entry, latestVersion }
            })
            .filter(
              ({ latestVersion, record }) =>
                latestVersion !== null && latestVersion !== record.pluginVersion,
            )

          if (!applying) {
            if (method !== 'GET')
              return json(405, { error: { code: 'QUERY_INVALID', message: '' } })
            return json(200, {
              data: {
                count: withUpdate.length,
                items: withUpdate.map(({ record, latestVersion }) => ({
                  itemId: record.itemId,
                  displayName: record.displayName,
                  currentVersion: record.pluginVersion,
                  latestVersion,
                  requiresApproval: true,
                })),
              },
            })
          }

          if (method !== 'POST') return json(405, { error: { code: 'QUERY_INVALID', message: '' } })
          // Every mock update widens permissions (the fixture's only stories
          // are "plain" or "widening") — a grouped apply always skips them,
          // exactly like the real server would.
          return json(200, {
            data: {
              applied: [],
              skipped: withUpdate.map(({ record }) => ({
                itemId: record.itemId,
                reason: 'requires_approval',
              })),
              failed: [],
            },
          })
        }

        if (marketplaceMatch === null) {
          return json(404, {
            error: { code: 'MARKETPLACE_ITEM_NOT_FOUND', message: 'No such marketplace item.' },
          })
        }
        const [, rawId, action] = marketplaceMatch

        if (rawId === undefined && method === 'GET') {
          const parsed = new URL(url, 'http://localhost')
          const kindFilter = parsed.searchParams.get('kind')
          const query = (parsed.searchParams.get('q') ?? '').toLowerCase()
          const filtered = MARKETPLACE_CATALOG.filter(
            (entry) =>
              (kindFilter === null || entry.kind === kindFilter) &&
              (query === '' ||
                entry.displayName.toLowerCase().includes(query) ||
                entry.description.toLowerCase().includes(query) ||
                entry.category.toLowerCase().includes(query)),
          )
          return json(200, {
            data: filtered.map((entry) => {
              const installed = marketplaceInstalls.get(entry.id) ?? null
              return {
                id: entry.id,
                kind: entry.kind,
                displayName: entry.displayName,
                description: entry.description,
                category: entry.category,
                screenshots: entry.screenshots,
                changelog: entry.changelog,
                installed: installed !== null,
                installedVersion: installed?.pluginVersion ?? null,
              }
            }),
          })
        }

        const entry = MARKETPLACE_CATALOG.find((candidate) => candidate.id === rawId)
        if (entry === undefined) {
          return json(404, {
            error: { code: 'MARKETPLACE_ITEM_NOT_FOUND', message: 'No such marketplace item.' },
          })
        }
        const installed = marketplaceInstalls.get(entry.id) ?? null

        if (action === undefined && method === 'GET') {
          return json(200, {
            data: {
              id: entry.id,
              kind: entry.kind,
              displayName: entry.displayName,
              description: entry.description,
              category: entry.category,
              screenshots: entry.screenshots,
              changelog: entry.changelog,
              installed: installed !== null,
              installedVersion: installed?.pluginVersion ?? null,
              supported: true,
              signatureVerified: entry.signatureVerified,
              capabilities: marketplaceCapabilities(entry.capabilities),
              error: entry.signatureInvalid
                ? {
                    code: 'PLUGIN_SIGNATURE_INVALID',
                    message: 'The plugin signature does not match a trusted key.',
                  }
                : null,
            },
          })
        }

        if (action === 'install' && method === 'POST') {
          if (entry.installFails) {
            return json(422, {
              error: {
                code: 'PLUGIN_SIGNATURE_INVALID',
                message: 'The plugin signature does not match a trusted key.',
              },
            })
          }
          const timestamp = '2026-03-06T00:00:00.000Z'
          const record: MarketplaceInstallRow = {
            itemId: entry.id,
            kind: entry.kind,
            displayName: entry.displayName,
            reference: `mock://${entry.id}`,
            pluginName: entry.id,
            pluginVersion: entry.changelog.at(-1)?.version ?? '1.0.0',
            signatureVerified: entry.signatureVerified,
            installedBy: user.id,
            installedAt: timestamp,
            updatedAt: timestamp,
            enabled: true,
          }
          marketplaceInstalls.set(entry.id, record)
          return json(201, { data: record })
        }

        if (action === 'update' && method === 'POST') {
          if (installed === null) {
            return json(404, {
              error: { code: 'MARKETPLACE_NOT_INSTALLED', message: 'Not installed.' },
            })
          }
          if (body.confirmPendingPermissions !== true) {
            return json(409, {
              error: {
                code: 'MARKETPLACE_UPDATE_REQUIRES_APPROVAL',
                message: `Updating "${entry.displayName}" would request new permissions.`,
                hint: 'Review the new permissions and retry with confirmPendingPermissions: true.',
              },
            })
          }
          const timestamp = '2026-03-06T00:00:00.000Z'
          const updated: MarketplaceInstallRow = {
            ...installed,
            pluginVersion: entry.changelog.at(-1)?.version ?? installed.pluginVersion,
            signatureVerified: entry.signatureVerified,
            updatedAt: timestamp,
          }
          marketplaceInstalls.set(entry.id, updated)
          return json(200, {
            data: { record: updated, pendingApproval: marketplaceCapabilities(entry.capabilities) },
          })
        }

        if (action === 'uninstall' && (method === 'POST' || method === 'DELETE')) {
          marketplaceInstalls.delete(entry.id)
          return json(200, {
            data: { id: entry.id, uninstalled: true, dataRemoved: body.removeData === true },
          })
        }

        if ((action === 'activate' || action === 'deactivate') && method === 'POST') {
          if (installed === null) {
            return json(404, {
              error: { code: 'MARKETPLACE_NOT_INSTALLED', message: 'Not installed.' },
            })
          }
          const updated: MarketplaceInstallRow = { ...installed, enabled: action === 'activate' }
          marketplaceInstalls.set(entry.id, updated)
          return json(200, { data: updated })
        }
      }

      // `/api/users/*`. The role checks below mirror the real router's, because
      // an admin screen test whose stub answers 200 to everyone proves nothing
      // — the real refusals are proved against the real router in
      // `packages/api/test/rest/users-router.test.ts`.
      const usersMatch =
        /\/api\/users(?:\/([^/?]+))?(?:\/([^/?]+))?(?:\/([^/?]+))?(?:\?.*)?$/u.exec(url)
      if (usersMatch !== null && url.includes('/api/users')) {
        if (auth !== `Bearer ${VALID_TOKEN}`) {
          return json(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in first.' } })
        }
        const [, rawId, sub, sessionId] = usersMatch
        const isAdmin = user.roles.includes('admin')
        const forbidden = json(403, {
          error: { code: 'FORBIDDEN', message: 'Only the admin role may do this.' },
        })
        const id = rawId === 'me' ? user.id : rawId

        if (rawId === undefined && method === 'GET') {
          if (!isAdmin) return forbidden
          const parsed = new URL(url, 'http://localhost')
          const role = parsed.searchParams.get('role')
          const filtered = role === null ? accounts : accounts.filter((a) => a.roles.includes(role))
          return json(200, {
            data: filtered.map(toWireAccount),
            // Real pagination and sorting are proved against the real router
            // in `packages/api/test/rest/users-router.test.ts` and end to end
            // in `packages/cli/test/serve-users.test.ts` — this mock only
            // needs to answer the shape `listUsersPage` expects.
            page: { hasMore: false, nextCursor: null },
            meta: { invitationEmailAvailable: options.invitationEmailAvailable ?? false },
          })
        }

        if (rawId === undefined && method === 'POST') {
          if (!isAdmin) return forbidden
          accountCounter += 1
          const invite = body.invite === true && (options.invitationEmailAvailable ?? false)
          const created: MockAccount = {
            id: `user-new-${accountCounter}`,
            email: String(body.email).toLowerCase(),
            roles: body.roles as readonly string[],
            status: invite ? 'invited' : 'active',
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
            mfa: { totp: false, passkeys: 0 },
            ...(invite ? { invitedAt: '2026-03-01T00:00:00.000Z' } : {}),
          }
          accounts.push(created)
          return json(201, {
            data: invite
              ? { user: toWireAccount(created), invited: true, emailSent: true }
              : {
                  user: toWireAccount(created),
                  invited: false,
                  emailSent: false,
                  password: 'generated-password-xyz',
                },
          })
        }

        if (rawId === 'bulk' && method === 'POST') {
          if (!isAdmin) return forbidden
          const ids = body.ids as readonly string[]
          const succeeded: string[] = []
          const failed: { id: string; error: string }[] = []
          for (const targetId of ids) {
            const target = accounts.find((candidate) => candidate.id === targetId)
            if (target === undefined) {
              failed.push({ id: targetId, error: 'No account.' })
              continue
            }
            if (body.action === 'disable') target.status = 'disabled'
            else if (body.action === 'enable') target.status = 'active'
            else if (body.action === 'setRoles') target.roles = body.roles as readonly string[]
            succeeded.push(targetId)
          }
          return json(200, { data: { succeeded, failed } })
        }

        const account = accounts.find((candidate) => candidate.id === id)

        if (sub === undefined && method === 'GET') {
          if (id !== user.id && !isAdmin) return forbidden
          if (account === undefined) {
            return json(404, { error: { code: 'AUTH_USER_NOT_FOUND', message: 'No account.' } })
          }
          return json(200, { data: toWireAccount(account) })
        }

        // T09-04 (RGPD) — `GET /{id}/personal-data`, self-or-admin like the
        // profile GET just above. The mock only needs the shape
        // `fetchPersonalDataExport` reads (`account`), not a faithful
        // re-implementation of the server's content/order/gap gathering,
        // which is proved for real in `packages/api/test/rest/users-router.test.ts`.
        if (sub === 'personal-data' && method === 'GET') {
          if (id !== user.id && !isAdmin) return forbidden
          if (account === undefined) {
            return json(404, { error: { code: 'AUTH_USER_NOT_FOUND', message: 'No account.' } })
          }
          return json(200, {
            data: {
              generatedAt: '2026-03-02T00:00:00.000Z',
              subjectEmail: account.email,
              account: {
                id: account.id,
                email: account.email,
                roles: account.roles,
                status: account.status,
                createdAt: account.createdAt,
              },
              authoredContent: [],
              orders: [],
              gaps: [
                { source: 'comments', reason: 'Comments have no store in this codebase yet.' },
              ],
            },
          })
        }

        if (sub === undefined && method === 'PATCH') {
          if (!isAdmin) return forbidden
          if (account === undefined) {
            return json(404, { error: { code: 'AUTH_USER_NOT_FOUND', message: 'No account.' } })
          }
          if (account.status === 'anonymized') {
            return json(409, {
              error: {
                code: 'AUTH_ACCOUNT_ANONYMIZED',
                message: 'This account has been anonymized and can no longer be changed.',
              },
            })
          }
          if (body.roles !== undefined) account.roles = body.roles as readonly string[]
          if (body.status !== undefined) account.status = body.status as 'active' | 'disabled'
          return json(200, { data: toWireAccount(account) })
        }

        if (sub === 'password' && method === 'POST') {
          if (id !== user.id) return forbidden
          if (body.currentPassword !== password) {
            return json(401, {
              error: {
                code: 'AUTH_INVALID_CREDENTIALS',
                message: 'The current password is not correct.',
              },
            })
          }
          return json(200, { data: { changed: true } })
        }

        if (sub === 'profile' && method === 'PATCH') {
          if (id !== user.id) return forbidden
          if (account === undefined) {
            return json(404, { error: { code: 'AUTH_USER_NOT_FOUND', message: 'No account.' } })
          }
          if ('displayName' in body) account.displayName = body.displayName as string | null
          if ('avatarMediaId' in body) account.avatarMediaId = body.avatarMediaId as string | null
          if ('bio' in body) account.bio = body.bio as string | null
          if ('locale' in body) account.locale = body.locale as string | null
          return json(200, { data: toWireAccount(account) })
        }

        if (sub === 'invite' && method === 'POST') {
          if (!isAdmin) return forbidden
          if (account === undefined) {
            return json(404, { error: { code: 'AUTH_USER_NOT_FOUND', message: 'No account.' } })
          }
          if (account.status !== 'invited') {
            return json(409, {
              error: {
                code: 'AUTH_INVITE_INVALID_STATE',
                message: 'This account is not a pending invitation.',
              },
            })
          }
          if (!(options.invitationEmailAvailable ?? false)) {
            return json(503, {
              error: {
                code: 'AUTH_INVITE_UNAVAILABLE',
                message: 'No email transport is configured on this site.',
              },
            })
          }
          account.invitedAt = '2026-03-02T00:00:00.000Z'
          return json(200, { data: { invited: true, expiresAt: '2030-01-01T00:00:00.000Z' } })
        }

        if (sub === 'invite' && method === 'DELETE') {
          if (!isAdmin) return forbidden
          if (account === undefined || account.status !== 'invited') {
            return json(409, {
              error: {
                code: 'AUTH_INVITE_INVALID_STATE',
                message: 'This account is not a pending invitation.',
              },
            })
          }
          const index = accounts.findIndex((candidate) => candidate.id === account.id)
          if (index !== -1) accounts.splice(index, 1)
          return new Response(null, { status: 204 })
        }

        if (sub === 'anonymize' && method === 'POST') {
          if (!isAdmin) return forbidden
          if (account === undefined) {
            return json(404, { error: { code: 'AUTH_USER_NOT_FOUND', message: 'No account.' } })
          }
          if (account.status === 'anonymized') {
            return json(409, {
              error: {
                code: 'AUTH_ACCOUNT_ANONYMIZED',
                message: 'This account has already been anonymized.',
              },
            })
          }
          if (body.confirmEmail !== account.email) {
            return json(400, {
              error: {
                code: 'AUTH_ANONYMIZE_CONFIRMATION_MISMATCH',
                message: 'The typed email does not match this account’s current address.',
              },
            })
          }
          account.email = `anon-${account.id}@anonymized.invalid`
          account.status = 'anonymized'
          account.displayName = null
          account.avatarMediaId = null
          account.bio = null
          account.locale = null
          return json(200, { data: { id: account.id, anonymized: true } })
        }

        // `/api/users/me/sessions/revoke-others` (fiche 18 task 2) matches
        // the same three-segment shape as `/sessions/{sessionId}` above —
        // disambiguated by the literal name, same convention the real
        // router uses for `totp/enrol` vs a ticket-bearing path.
        if (sub === 'sessions' && sessionId === 'revoke-others' && method === 'POST') {
          if (id !== user.id) return forbidden
          const list = userSessions[id ?? ''] ?? []
          const revoked = list.filter((entry) => entry.id !== CURRENT_SESSION_ID).length
          userSessions[id ?? ''] = list.filter((entry) => entry.id === CURRENT_SESSION_ID)
          return json(200, { data: { revoked, keptSessionId: CURRENT_SESSION_ID } })
        }

        if (sub === 'sessions' && sessionId === undefined && method === 'GET') {
          if (id !== user.id && !isAdmin) return forbidden
          return json(200, {
            data: (userSessions[id ?? ''] ?? []).map((session) => ({
              ...session,
              createdAt: '2026-03-01T00:00:00.000Z',
              expiresAt: '2030-01-01T00:00:00.000Z',
              // Only ever true on your own list, and only for the one
              // session this mock ever authenticates as.
              isCurrent: id === user.id && session.id === CURRENT_SESSION_ID,
            })),
          })
        }

        if (sub === 'sessions' && sessionId !== undefined && method === 'DELETE') {
          if (id !== user.id && !isAdmin) return forbidden
          const list = userSessions[id ?? ''] ?? []
          const index = list.findIndex((session) => session.id === sessionId)
          if (index === -1) {
            return json(404, { error: { code: 'CONTENT_NOT_FOUND', message: 'No such session.' } })
          }
          list.splice(index, 1)
          return new Response(null, { status: 204 })
        }
      }

      if (url.endsWith('/api/auth/session') && method === 'GET') {
        if (auth === `Bearer ${VALID_TOKEN}`) return json(200, { data: user })
        return json(401, { error: { code: 'AUTH_SESSION_INVALID', message: 'No active session.' } })
      }

      if (url.endsWith('/api/auth/session') && method === 'DELETE') {
        return new Response(null, { status: 204 })
      }

      if (url.endsWith('/api/auth/webauthn/register/begin') && method === 'POST') {
        if (auth !== `Bearer ${VALID_TOKEN}`) {
          return json(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in first.' } })
        }
        return json(200, {
          data: {
            options: {
              challenge: 'register-challenge',
              rp: { id: 'example.com', name: 'Cogenta' },
            },
            ticket: 'register-ticket-1',
          },
        })
      }

      if (url.endsWith('/api/auth/webauthn/register/complete') && method === 'POST') {
        if (body.ticket !== 'register-ticket-1') {
          return json(401, { error: { code: 'AUTH_SESSION_INVALID', message: 'Invalid ticket.' } })
        }
        if (body.response?.id !== 'mock-new-credential-id') {
          return json(401, {
            error: {
              code: 'AUTH_WEBAUTHN_FAILED',
              message: 'The passkey response could not be verified.',
            },
          })
        }
        return json(200, { data: { registered: true } })
      }

      if (url.endsWith('/api/auth/webauthn/login/begin') && method === 'POST') {
        return json(200, {
          data: {
            options: { challenge: 'test-challenge', rpId: 'example.com', allowCredentials: [] },
            ticket: 'webauthn-ticket-1',
          },
        })
      }

      if (url.endsWith('/api/auth/webauthn/login/complete') && method === 'POST') {
        if (body.ticket !== 'webauthn-ticket-1') {
          return json(401, { error: { code: 'AUTH_SESSION_INVALID', message: 'Invalid ticket.' } })
        }
        if (body.response?.id !== 'mock-credential-id') {
          return json(401, {
            error: {
              code: 'AUTH_WEBAUTHN_FAILED',
              message: 'The passkey response could not be verified.',
            },
          })
        }
        return json(200, { data: session() })
      }

      if (url.endsWith('/api/schema') && method === 'GET') {
        const site =
          options.siteLocales === undefined
            ? {}
            : { site: { locales: options.siteLocales, defaultLocale: options.siteLocales[0] } }
        return json(200, { data: { ...MOCK_SCHEMA, ...site } })
      }

      if (url.endsWith('/api/health') && method === 'GET') {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: { code: 'FORBIDDEN', message: 'Only the admin role may read site health.' },
          })
        }
        return json(200, {
          data: {
            database: { status: 'degraded', driver: 'sqlite', tier: 'degraded' },
            storage: { status: 'degraded', driver: 'local', tier: 'degraded' },
          },
        })
      }

      if (url.endsWith('/api/scheduled-tasks') && method === 'GET') {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: { code: 'FORBIDDEN', message: 'Only the admin role may read scheduled tasks.' },
          })
        }
        return json(200, {
          data: {
            mode: options.scheduledTasksMode ?? 'internal',
            tasks: options.scheduledTasks ?? [
              {
                name: 'publish',
                description: 'Scheduled publication',
                intervalMs: 60_000,
                destructive: false,
                lastRun: {
                  id: 'run-1',
                  taskName: 'publish',
                  startedAt: 1_772_500_000_000,
                  finishedAt: 1_772_500_000_100,
                  durationMs: 100,
                  outcome: 'success',
                  summary: '2 published',
                  error: null,
                  triggeredBy: 'schedule',
                  actor: null,
                },
                nextRunAt: 1_772_500_060_000,
                overdue: false,
                recentRuns: [],
              },
              {
                name: 'trash-purge',
                description: 'Trash purge',
                intervalMs: 60_000,
                destructive: true,
                lastRun: null,
                nextRunAt: 1_772_500_060_000,
                overdue: true,
                recentRuns: [],
              },
            ],
          },
        })
      }

      // `.split('?')[0]` because fiche 67 task 3's screen now always sends
      // `?limit=`, which `.endsWith` alone would never match.
      if (url.split('?')[0]?.endsWith('/api/scheduled-tasks/queue') && method === 'GET') {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: { code: 'FORBIDDEN', message: 'Only the admin role may read the job queue.' },
          })
        }
        return json(200, { data: { jobs: options.scheduledTasksQueue ?? [] } })
      }

      if (/\/api\/scheduled-tasks\/[^/]+\/run$/u.test(url) && method === 'POST') {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: { code: 'FORBIDDEN', message: 'Only the admin role may run a scheduled task.' },
          })
        }
        const name = url.match(/\/api\/scheduled-tasks\/([^/]+)\/run$/u)?.[1] ?? ''
        return json(200, {
          data: {
            id: 'run-manual',
            taskName: name,
            startedAt: 1_772_500_100_000,
            finishedAt: 1_772_500_100_050,
            durationMs: 50,
            outcome: 'success',
            summary: name === 'trash-purge' ? '5 purged' : '2 published',
            error: null,
            triggeredBy: 'manual',
            actor: user.id,
          },
        })
      }

      if (url.includes('/api/analytics/summary')) {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: {
              code: 'FORBIDDEN',
              message: 'Only the admin role may read the analytics summary.',
            },
          })
        }
        return json(200, {
          data: {
            since: '2026-03-01T00:00:00.000Z',
            until: '2026-03-08T00:00:00.000Z',
            totalViews: options.analyticsSummary?.totalViews ?? 0,
            uniqueVisitors: options.analyticsSummary?.uniqueVisitors ?? 0,
            topPages: options.analyticsSummary?.topPages ?? [],
            topReferrers: options.analyticsSummary?.topReferrers ?? [],
            deviceBreakdown: options.analyticsSummary?.deviceBreakdown ?? [],
            dailyViews: options.analyticsSummary?.dailyViews ?? [],
            previousTotalViews: options.analyticsSummary?.previousTotalViews ?? 0,
            previousUniqueVisitors: options.analyticsSummary?.previousUniqueVisitors ?? 0,
            previousDailyViews: options.analyticsSummary?.previousDailyViews ?? [],
            viewsChangePercent: options.analyticsSummary?.viewsChangePercent ?? null,
            retentionDays: options.analyticsSummary?.retentionDays ?? 400,
          },
        })
      }

      if (url.includes('/api/analytics/page')) {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: { code: 'FORBIDDEN', message: 'Only the admin role may read page stats.' },
          })
        }
        const parsed = new URL(url, 'http://localhost')
        return json(200, {
          data: {
            path: parsed.searchParams.get('path') ?? '',
            since: '2026-03-01T00:00:00.000Z',
            until: '2026-03-08T00:00:00.000Z',
            views: options.analyticsPageStats?.views ?? 0,
            previousViews: options.analyticsPageStats?.previousViews ?? 0,
            changePercent: options.analyticsPageStats?.changePercent ?? null,
            rank: options.analyticsPageStats?.rank ?? null,
            rankedPages: options.analyticsPageStats?.rankedPages ?? 0,
          },
        })
      }

      // `/api/audit/me` (fiche 18 task 4): open to anyone signed in, unlike
      // the full log below — always the caller's own two entries here,
      // whatever `actorId` the query string might try to name.
      if (url.includes('/api/audit/me')) {
        if (auth !== `Bearer ${VALID_TOKEN}`) {
          return json(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in first.' } })
        }
        return json(200, {
          data: [
            {
              id: 'audit-mine-2',
              at: '2026-03-05T00:00:00.000Z',
              actorId: user.id,
              actorRoles: user.roles,
              action: 'user.password_change',
              collection: null,
              entryId: user.id,
              diff: null,
              hash: 'mine-2',
              previousHash: 'mine-1',
            },
            {
              id: 'audit-mine-1',
              at: '2026-03-01T00:00:00.000Z',
              actorId: user.id,
              actorRoles: user.roles,
              action: 'auth.login',
              collection: null,
              entryId: null,
              diff: null,
              hash: 'mine-1',
              previousHash: null,
            },
          ],
        })
      }

      if (url.includes('/api/audit')) {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: { code: 'FORBIDDEN', message: 'Only the admin role may read the audit log.' },
          })
        }
        if (url.includes('/api/audit/verify')) {
          return json(200, { data: { ok: true } })
        }
        // Fiche 21 task 3: the scheduled check's status, and the "run now"
        // that forces a fresh, persisted one.
        if (url.includes('/api/audit/integrity')) {
          return json(200, {
            data: options.auditIntegrity ?? {
              state: 'ok',
              checkpoint: { id: 'audit-1', at: '2026-03-01T00:00:00.000Z', hash: 'abc' },
              entriesChecked: 1,
              lastCheckedAt: '2026-03-01T00:05:00.000Z',
              lastMode: 'full',
              lastFullCheckedAt: '2026-03-01T00:05:00.000Z',
              brokenAt: null,
              brokenEntryId: null,
              brokenMessage: null,
            },
          })
        }
        // Fiche 21 task 2: the filtered view as a file. CSV is not JSON, so
        // it is returned as a plain `Response` with a text body, the same
        // shape the real route sends.
        if (url.includes('/api/audit/export')) {
          if (url.includes('format=csv')) {
            return new Response(
              'id,at,actorId,actorKind,actorRoles,action,collection,entryId\r\n',
              {
                status: 200,
                headers: { 'content-type': 'text/csv; charset=utf-8' },
              },
            )
          }
          return json(200, { data: [] })
        }
        // Fiche 21 task 1: one entry's detail — anything after `/api/audit/`
        // that is not one of the routes above is an id.
        const detailMatch = /\/api\/audit\/([^/?]+)/u.exec(url)
        if (detailMatch !== null) {
          return json(200, {
            data: options.auditDetail ?? {
              entry: {
                id: detailMatch[1],
                at: '2026-03-01T00:00:00.000Z',
                actorId: 'user-1',
                actorRoles: ['editor'],
                action: 'content.create',
                collection: 'article',
                entryId: 'entry-1',
                diff: { title: 'First article' },
                version: 1,
                hash: 'abc',
                previousHash: null,
              },
              actorKind: 'human',
              actorLabel: 'alice@example.com',
              diff: null,
              diffUnavailable: 'first-version',
            },
          })
        }
        const allEntries =
          options.auditEntries ??
          ([
            {
              id: 'audit-1',
              at: '2026-03-01T00:00:00.000Z',
              actorId: 'user-1',
              actorRoles: ['editor'],
              action: 'content.create',
              collection: 'article',
              entryId: 'entry-1',
              diff: { title: 'First article' },
              version: 1,
              hash: 'abc',
              previousHash: null,
            },
            // `note-trashed`'s own deletion (fiche 07 task 3 — "deleted by").
            // Deliberately `note`, not `article`: a second `article` row
            // here would give `audit.test.tsx`'s `getByText('article')` two
            // matches instead of one.
            {
              id: 'audit-2',
              at: '2026-03-03T00:00:00.000Z',
              actorId: 'user-1',
              actorRoles: ['editor'],
              action: 'content.delete',
              collection: 'note',
              entryId: 'note-trashed',
              diff: null,
              hash: 'def',
              previousHash: 'abc',
            },
          ] as readonly Readonly<Record<string, unknown>>[])

        // Fiche 67 task 1 — real `limit`/`after` pagination, newest first,
        // mirroring `audit-router.ts`: `after` decodes to the previous
        // page's last `(at, id)`, and everything at or after it is dropped.
        const parsedAuditUrl = new URL(url, 'http://localhost')
        const sorted = [...allEntries].sort((a, b) => {
          const atCompare = String(b['at']).localeCompare(String(a['at']))
          return atCompare !== 0 ? atCompare : String(b['id']).localeCompare(String(a['id']))
        })
        const afterRaw = parsedAuditUrl.searchParams.get('after')
        let startIndex = 0
        if (afterRaw !== null) {
          const decoded = Buffer.from(afterRaw, 'base64url').toString('utf8')
          const separator = decoded.indexOf(' ')
          const cursor =
            separator === -1
              ? null
              : { at: decoded.slice(0, separator), id: decoded.slice(separator + 1) }
          const foundIndex =
            cursor === null
              ? -1
              : sorted.findIndex((entry) => entry['at'] === cursor.at && entry['id'] === cursor.id)
          if (foundIndex !== -1) startIndex = foundIndex + 1
        }
        const limitRaw = parsedAuditUrl.searchParams.get('limit')
        const pageLimit = limitRaw === null ? 50 : Number(limitRaw)
        const page = sorted.slice(startIndex, startIndex + pageLimit)
        const hasMore = startIndex + pageLimit < sorted.length
        const lastOfPage = page[page.length - 1]
        const nextCursor =
          hasMore && lastOfPage !== undefined
            ? Buffer.from(
                `${String(lastOfPage['at'])} ${String(lastOfPage['id'])}`,
                'utf8',
              ).toString('base64url')
            : null

        return json(200, { data: page, page: { hasMore, nextCursor } })
      }

      if (url.includes('/api/site-plans')) {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: {
              code: 'FORBIDDEN',
              message: 'Only the admin role may propose or apply a site plan.',
            },
          })
        }
        const detail = {
          id: 'draft-1',
          createdAt: '2026-08-16T09:00:00.000Z',
          activity: 'A neighbourhood restaurant.',
          summary: 'A small showcase site.',
          sources: ['brief.md'],
          decidedCount: Object.keys(planDecisions).length,
          ...(planAppliedAt === undefined ? {} : { appliedAt: planAppliedAt }),
          draft: {
            brief: {
              activity: 'A neighbourhood restaurant.',
              summary: 'A small showcase site.',
              languages: ['fr'],
              warnings: [],
            },
            violations: [
              {
                explanation:
                  'The document rules out blog: \u201cPas de blog.\u201d The proposed \u201cpost\u201d collection was removed from the plan.',
              },
            ],
            warnings: [],
          },
          sections: planSections,
          decisions: { ...planDecisions },
        }

        if (url.endsWith('/apply')) {
          const total = planSections.reduce((sum, section) => sum + section.items.length, 0)
          if (Object.keys(planDecisions).length < total) {
            return json(400, {
              error: {
                code: 'SITE_PLAN_DECISION_MISSING',
                message: 'Some items of this plan have no decision.',
                hint: 'Every proposed item must be accepted or rejected explicitly.',
              },
            })
          }
          planAppliedAt = '2026-08-16T11:00:00.000Z'
          return json(200, {
            data: {
              ...detail,
              appliedAt: planAppliedAt,
              report: {
                added: ['dish'],
                skipped: [],
                entriesSeeded: 0,
                skinApplied: true,
                followUp: ['Restart `cogenta serve` to pick up the new collections.'],
              },
            },
          })
        }
        if (url.endsWith('/decisions')) {
          const body = JSON.parse(String(init?.body ?? '{}')) as {
            decisions?: Record<string, 'accepted' | 'rejected'>
          }
          Object.assign(planDecisions, body.decisions ?? {})
          return json(200, { data: { id: 'draft-1', decisions: { ...planDecisions } } })
        }
        if (/\/api\/site-plans\/[^/?]+$/u.test(url)) {
          return json(200, { data: detail })
        }
        return json(200, { data: [detail], plannerAvailable: true })
      }

      if (url.includes('/api/import/wordpress') && method === 'POST') {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: { code: 'FORBIDDEN', message: 'Only the admin role may import content.' },
          })
        }
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          filename?: string
          data?: string
        }
        if (body.filename === undefined || body.data === undefined) {
          return json(400, {
            error: { code: 'CONTENT_INVALID', message: 'This request names no file.' },
          })
        }
        return json(200, {
          data: {
            imported: {
              posts: 2,
              pages: 1,
              categories: 1,
              tags: 0,
              media: 0,
              authors: 1,
              comments: 0,
            },
            redirectsCreated: 1,
            skipped: [
              {
                type: 'post',
                wpId: '42',
                title: 'Draft nobody finished',
                reason: 'Trashed in WordPress; not imported.',
              },
            ],
            unconvertedBlocks: [],
            warnings: ['Media "old-logo.png" was imported with a synthesised alt text; review it.'],
          },
        })
      }

      if (url.includes('/api/import/runs') || url.includes('/api/import/analyze')) {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: { code: 'FORBIDDEN', message: 'Only the admin role may import content.' },
          })
        }

        if (url.includes('/api/import/analyze') && method === 'POST') {
          const body = JSON.parse(String(init?.body ?? '{}')) as {
            source?: string
            filename?: string
            data?: string
          }
          if (body.filename === undefined || body.data === undefined) {
            return json(400, {
              error: { code: 'CONTENT_INVALID', message: 'This request names no file.' },
            })
          }
          const run: MockImportRun = {
            id: 'run-1',
            source: body.source ?? 'csv',
            status: 'analyzed',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            analysis: { totalRecords: 3 },
            mapping: { targetCollection: 'page', fields: { title: 'title' } },
            progress: { processed: 0, total: 3 },
            report: null,
            error: null,
          }
          importPreviewRuns.set(run.id, run)
          return json(200, { data: run })
        }

        const runMatch = /\/api\/import\/runs\/([^/?]+)(?:\/(apply|cancel))?/u.exec(url)
        if (runMatch === null) {
          return json(200, { data: [...importPreviewRuns.values()] })
        }
        const [, runId, action] = runMatch
        const run = runId === undefined ? undefined : importPreviewRuns.get(runId)
        if (run === undefined) {
          return json(404, {
            error: { code: 'IMPORT_RUN_NOT_FOUND', message: `No import run "${runId}" exists.` },
          })
        }
        if (action === 'apply' && method === 'POST') {
          const updated = {
            ...run,
            status: 'done' as const,
            report: {
              imported: run.status === 'done' ? 0 : 3,
              resumedSkips: run.status === 'done' ? 3 : 0,
            },
          }
          importPreviewRuns.set(run.id, updated)
          return json(200, { data: updated })
        }
        if (action === 'cancel' && method === 'POST') {
          const updated = { ...run, status: 'cancelled' as const }
          importPreviewRuns.set(run.id, updated)
          return json(200, { data: updated })
        }
        return json(200, { data: run })
      }

      if (url.endsWith('/api/health-report') && method === 'GET') {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: {
              code: 'FORBIDDEN',
              message: 'Only the admin role may read the health report.',
            },
          })
        }
        return json(200, {
          data: {
            node: '22.0.0',
            platform: 'linux',
            arch: 'x64',
            configPath: '/site/cogenta.config.mjs',
            site: undefined,
            checks: options.healthReport?.checks ?? [
              {
                need: 'database',
                status: 'ok',
                driver: 'sqlite',
                tier: 'degraded',
                reason: 'first available driver',
                message: undefined,
              },
            ],
            notes: options.healthReport?.notes ?? [],
            problems: options.healthReport?.problems ?? [],
          },
        })
      }

      if (url.endsWith('/api/observability') && method === 'GET') {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: {
              code: 'FORBIDDEN',
              message: 'Only the admin role may read recent traces and logs.',
            },
          })
        }
        return json(200, {
          data: {
            enabled: options.observability?.enabled ?? true,
            traces: options.observability?.traces ?? [],
            logs: options.observability?.logs ?? [],
          },
        })
      }

      if (url.endsWith('/api/migrations-status') && method === 'GET') {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: { code: 'FORBIDDEN', message: 'Only the admin role may read migration status.' },
          })
        }
        return json(200, { data: { items: [] } })
      }

      if (url.endsWith('/api/audit-integrity') && method === 'GET') {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: { code: 'FORBIDDEN', message: 'Only the admin role may read audit integrity.' },
          })
        }
        return json(200, {
          data: { ok: true, checkedAt: '2026-03-01T00:00:00.000Z', error: undefined },
        })
      }

      if (url.endsWith('/api/disk-usage') && method === 'GET') {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: { code: 'FORBIDDEN', message: 'Only the admin role may read disk usage.' },
          })
        }
        return json(200, { data: { available: false } })
      }

      if (url.endsWith('/api/error-log') && method === 'GET') {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: { code: 'FORBIDDEN', message: 'Only the admin role may read the error log.' },
          })
        }
        return json(200, { data: { entries: [] } })
      }

      if (url.endsWith('/api/maintenance') && method === 'GET') {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: {
              code: 'FORBIDDEN',
              message: 'Only the admin role may read maintenance state.',
            },
          })
        }
        return json(200, {
          data: {
            enabled: false,
            message: null,
            updatedAt: '2026-03-01T00:00:00.000Z',
            updatedBy: null,
          },
        })
      }

      if (url.includes('/api/agents')) {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: { code: 'FORBIDDEN', message: 'Only the admin role may manage agents.' },
          })
        }
        // No `AgentRegistry` is ever constructed unless a caller opts in
        // (R2-honest, documented throughout `CLAUDE.md`) — the real
        // `cogenta serve` therefore never mounts `/api/agents` by default,
        // and the request falls through to the generic content-router 404.
        // L20 audit §1 point 5's regression test opts into that real shape.
        if (options.agentsRegistryMounted === false) {
          return json(404, {
            error: { code: 'CONTENT_NOT_FOUND', message: 'No route matches this path.' },
          })
        }
        syncSecurityEnabled()
        const agentMatch =
          /\/api\/agents\/([^/?]+)(?:\/(enable|disable|traces|history|identity|run))?/u.exec(url)
        if (agentMatch === null) {
          if (method === 'GET') {
            return json(200, {
              data: Object.values(mockAgents).map((agent) => ({
                ...agent,
                usage: { tokensToday: 1234, eurThisMonth: 0.5, callsThisHour: 2 },
              })),
            })
          }
          if (method === 'POST') {
            const body = JSON.parse(String(init?.body ?? '{}')) as {
              name?: string
              identity?: { role: string; objectives: string[]; style?: string }
              model?: { preferred: string; fallback?: string }
              tools?: string[]
              autonomy?: { default: string }
              skills?: string[]
              subagents?: string[]
              budget?: Record<string, number>
            }
            const newName = body.name ?? 'New Agent'
            mockAgents[newName] = {
              name: newName,
              tools: body.tools ?? [],
              autonomy: body.autonomy ?? { default: 'propose' },
              budget: body.budget ?? {},
              enabled: true,
              ...(body.skills === undefined ? {} : { skills: body.skills }),
              ...(body.subagents === undefined ? {} : { subagents: body.subagents }),
              ...(body.model === undefined ? {} : { model: body.model }),
              builtin: false,
            }
            mockAgentIdentities[newName] = body.identity ?? { role: '', objectives: [] }
            return json(201, {
              data: { ...(mockAgents[newName] as MockAgent), usage: {} },
            })
          }
        }
        const [, name, action] = agentMatch ?? []
        if (name !== undefined && mockAgents[name] === undefined && action !== undefined) {
          return json(404, { error: { code: 'CONTENT_NOT_FOUND', message: 'No such agent.' } })
        }
        if (name === 'ghost') {
          return json(404, { error: { code: 'CONTENT_NOT_FOUND', message: 'No such agent.' } })
        }
        if (name !== undefined && action === undefined) {
          if (method === 'GET') {
            const agent = mockAgents[name]
            if (agent === undefined) {
              return json(404, { error: { code: 'CONTENT_NOT_FOUND', message: 'No such agent.' } })
            }
            return json(200, {
              data: { ...agent, usage: { tokensToday: 1234, eurThisMonth: 0.5, callsThisHour: 2 } },
            })
          }
          if (method === 'PATCH') {
            const existing = mockAgents[name]
            if (existing === undefined) {
              return json(404, { error: { code: 'CONTENT_NOT_FOUND', message: 'No such agent.' } })
            }
            const body = JSON.parse(String(init?.body ?? '{}')) as Partial<MockAgent> & {
              identity?: { role: string; objectives: string[]; style?: string }
            }
            mockAgents[name] = {
              ...existing,
              ...body,
              name: existing.name,
              builtin: existing.builtin,
            }
            if (body.identity !== undefined) mockAgentIdentities[name] = body.identity
            if (name === 'security' && body.enabled !== undefined) {
              securityAgentEnabled = body.enabled
            }
            return json(200, {
              data: { ...(mockAgents[name] as MockAgent), usage: {} },
            })
          }
          if (method === 'DELETE') {
            delete mockAgents[name]
            delete mockAgentIdentities[name]
            return json(200, { data: { name, removed: true } })
          }
        }
        if (action === 'enable' && method === 'POST' && name !== undefined) {
          if (mockAgents[name] !== undefined) (mockAgents[name] as MockAgent).enabled = true
          if (name === 'security') securityAgentEnabled = true
          return json(200, { data: { name, enabled: true } })
        }
        if (action === 'disable' && method === 'POST' && name !== undefined) {
          if (mockAgents[name] !== undefined) (mockAgents[name] as MockAgent).enabled = false
          if (name === 'security') securityAgentEnabled = false
          return json(200, { data: { name, enabled: false } })
        }
        if (action === 'identity' && method === 'GET' && name !== undefined) {
          const identity = mockAgentIdentities[name] ?? { role: '', objectives: [] }
          return json(200, { data: identity })
        }
        if (action === 'run' && method === 'POST' && name !== undefined) {
          const body = JSON.parse(String(init?.body ?? '{}')) as { instruction?: string }
          return json(200, {
            data: {
              agent: name,
              stopReason: 'end_turn',
              finalText: `Mock result for: ${body.instruction ?? ''}`,
              steps: 1,
              usage: { inputTokens: 10, outputTokens: 5 },
            },
          })
        }
        if (action === 'traces' && method === 'GET') {
          return json(200, {
            data: [
              {
                id: 'trace-1',
                agentName: name,
                startedAt: '2026-03-01T00:00:00.000Z',
                finishedAt: '2026-03-01T00:01:00.000Z',
                stopReason: 'end_turn',
                usage: { inputTokens: 100, outputTokens: 50 },
              },
            ],
          })
        }
        if (action === 'history' && method === 'GET') {
          return json(200, {
            data: [
              {
                id: 'audit-agent-1',
                at: '2026-03-01T00:00:00.000Z',
                actorId: `agent:${name}`,
                action: 'deps.scan',
              },
            ],
          })
        }
        return json(404, {
          error: { code: 'CONTENT_NOT_FOUND', message: 'No route matches this path.' },
        })
      }

      if (url.includes('/api/agent-skills')) {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: { code: 'FORBIDDEN', message: 'Only the admin role may manage agent skills.' },
          })
        }
        const resourceMatch = /\/api\/agent-skills\/([^/?]+)\/resources(?:\/(.+))?$/u.exec(url)
        if (resourceMatch !== null) {
          const skillId = resourceMatch[1] as string
          const resourcePath = resourceMatch[2]
          if (mockSkillResources[skillId] === undefined) mockSkillResources[skillId] = []
          const bucket = mockSkillResources[skillId]
          if (resourcePath === undefined) {
            if (method === 'GET') return json(200, { data: bucket })
            if (method === 'POST') {
              const bodyInit = init?.body
              let path: string | undefined
              let size = 0
              if (bodyInit instanceof FormData) {
                const rawPath = bodyInit.get('path')
                path = typeof rawPath === 'string' ? rawPath : undefined
                const file = bodyInit.get('file')
                size = file instanceof File ? file.size : 0
              } else {
                const parsed = JSON.parse(String(bodyInit ?? '{}')) as {
                  path?: string
                  content?: string
                }
                path = parsed.path
                size = parsed.content !== undefined ? parsed.content.length : 0
              }
              if (path === undefined || path.trim().length === 0) {
                return json(400, {
                  error: {
                    code: 'AGENT_SKILL_RESOURCE_INVALID',
                    message: 'A resource upload needs a "path" field.',
                  },
                })
              }
              const resource = { path, size, updatedAt: '2026-03-01T00:00:00.000Z' }
              const existingIndex = bucket.findIndex((entry) => entry.path === path)
              if (existingIndex >= 0) bucket[existingIndex] = resource
              else bucket.push(resource)
              return json(201, { data: resource })
            }
          } else if (method === 'DELETE') {
            const index = bucket.findIndex((entry) => entry.path === resourcePath)
            if (index === -1) {
              return json(404, {
                error: {
                  code: 'AGENT_SKILL_RESOURCE_UNKNOWN',
                  message: `No resource "${resourcePath}".`,
                },
              })
            }
            bucket.splice(index, 1)
            return json(200, { data: { path: resourcePath, removed: true } })
          }
          return json(404, {
            error: { code: 'CONTENT_NOT_FOUND', message: 'No route matches this path.' },
          })
        }

        const skillMatch = /\/api\/agent-skills\/([^/?]+)/u.exec(url)
        if (skillMatch === null) {
          if (method === 'GET') return json(200, { data: mockAgentSkills })
          if (method === 'POST') {
            const body = JSON.parse(String(init?.body ?? '{}')) as {
              content?: string
              enabledByDefault?: boolean
            }
            const parsed = parseMockSkillContent(body.content ?? '')
            const created = {
              id: `skill-${mockAgentSkills.length + 1}`,
              name: parsed.name,
              description: parsed.description,
              instructions: parsed.instructions,
              content: renderMockSkillContent(parsed.name, parsed.description, parsed.instructions),
              enabledByDefault: body.enabledByDefault ?? true,
              builtin: false,
              createdAt: '2026-03-01T00:00:00.000Z',
              updatedAt: '2026-03-01T00:00:00.000Z',
            }
            mockAgentSkills.push(created)
            return json(201, { data: created })
          }
        }
        const [, skillId] = skillMatch ?? []
        const index = mockAgentSkills.findIndex((skill) => skill.id === skillId)
        if (method === 'PATCH' && index >= 0) {
          const body = JSON.parse(String(init?.body ?? '{}')) as {
            content?: string
            enabledByDefault?: boolean
          }
          const existing = mockAgentSkills[index] as (typeof mockAgentSkills)[number]
          const parsed = body.content !== undefined ? parseMockSkillContent(body.content) : null
          const updated = {
            ...existing,
            ...(parsed === null
              ? {}
              : {
                  name: parsed.name,
                  description: parsed.description,
                  instructions: parsed.instructions,
                }),
            ...(body.enabledByDefault === undefined
              ? {}
              : { enabledByDefault: body.enabledByDefault }),
          }
          updated.content = renderMockSkillContent(
            updated.name,
            updated.description,
            updated.instructions,
          )
          mockAgentSkills[index] = updated
          return json(200, { data: updated })
        }
        if (method === 'DELETE' && index >= 0) {
          mockAgentSkills.splice(index, 1)
          return json(200, { data: { id: skillId, removed: true } })
        }
        return json(404, { error: { code: 'AGENT_SKILL_UNKNOWN', message: 'No such skill.' } })
      }

      if (url.includes('/api/prompt-templates')) {
        // Real router: any signed-in actor may read, only `admin` may write.
        const templateMatch = /\/api\/prompt-templates\/([^/?]+)/u.exec(url)
        if (templateMatch === null) {
          if (method === 'GET') return json(200, { data: mockPromptTemplates })
          if (method === 'POST') {
            if (!user.roles.includes('admin')) {
              return json(403, {
                error: {
                  code: 'FORBIDDEN',
                  message: 'Only the admin role may manage prompt templates.',
                },
              })
            }
            const body = JSON.parse(String(init?.body ?? '{}')) as {
              name?: string
              description?: string
              category?: string
              template?: string
            }
            const created = {
              id: `template-${mockPromptTemplates.length + 1}`,
              name: body.name ?? '',
              description: body.description ?? '',
              category: body.category ?? '',
              template: body.template ?? '',
              builtin: false,
              createdAt: '2026-03-01T00:00:00.000Z',
              updatedAt: '2026-03-01T00:00:00.000Z',
            }
            mockPromptTemplates.push(created)
            return json(201, { data: created })
          }
        }
        const [, templateId] = templateMatch ?? []
        const index = mockPromptTemplates.findIndex((template) => template.id === templateId)
        if (method === 'GET' && index >= 0) {
          return json(200, { data: mockPromptTemplates[index] })
        }
        if (method === 'PATCH' && index >= 0) {
          if (!user.roles.includes('admin')) {
            return json(403, {
              error: {
                code: 'FORBIDDEN',
                message: 'Only the admin role may manage prompt templates.',
              },
            })
          }
          const body = JSON.parse(String(init?.body ?? '{}')) as {
            name?: string
            description?: string
            category?: string
            template?: string
          }
          const existing = mockPromptTemplates[index] as (typeof mockPromptTemplates)[number]
          const updated = {
            ...existing,
            ...(body.name === undefined ? {} : { name: body.name }),
            ...(body.description === undefined ? {} : { description: body.description }),
            ...(body.category === undefined ? {} : { category: body.category }),
            ...(body.template === undefined ? {} : { template: body.template }),
          }
          mockPromptTemplates[index] = updated
          return json(200, { data: updated })
        }
        if (method === 'DELETE' && index >= 0) {
          if (!user.roles.includes('admin')) {
            return json(403, {
              error: {
                code: 'FORBIDDEN',
                message: 'Only the admin role may manage prompt templates.',
              },
            })
          }
          mockPromptTemplates.splice(index, 1)
          return json(200, { data: { id: templateId, removed: true } })
        }
        return json(404, {
          error: { code: 'PROMPT_TEMPLATE_UNKNOWN', message: 'No such prompt template.' },
        })
      }

      if (url.includes('/api/providers')) {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: { code: 'FORBIDDEN', message: 'Only the admin role may manage providers.' },
          })
        }
        if (url.includes('/api/providers/catalog') && method === 'GET') {
          return json(200, { data: MOCK_PROVIDER_CATALOG })
        }
        const providerMatch = /\/api\/providers\/([^/?]+)/u.exec(url)
        if (providerMatch === null) {
          if (method === 'GET') return json(200, { data: mockProviders })
          if (method === 'POST') {
            const body = JSON.parse(String(init?.body ?? '{}')) as {
              provider?: string
              apiKey?: string
              model?: string
              baseUrl?: string
            }
            const providerId = body.provider ?? 'anthropic'
            const isCatalogId = MOCK_PROVIDER_CATALOG.some((entry) => entry.id === providerId)
            if (
              !isCatalogId &&
              (typeof body.baseUrl !== 'string' || body.baseUrl.trim().length === 0)
            ) {
              return json(400, {
                error: {
                  code: 'PROVIDER_CUSTOM_BASE_URL_REQUIRED',
                  message: `"${providerId}" is not a built-in provider — a custom provider needs a non-empty "baseUrl".`,
                },
              })
            }
            const created = {
              provider: providerId,
              enabled: true,
              model: body.model ?? '',
              ...(typeof body.baseUrl === 'string' && body.baseUrl.length > 0
                ? { baseUrl: body.baseUrl }
                : {}),
              maskedKey: `••••${(body.apiKey ?? '').slice(-4)}`,
              updatedAt: '2026-03-01T00:00:00.000Z',
            }
            const existingIndex = mockProviders.findIndex((p) => p.provider === created.provider)
            if (existingIndex >= 0) mockProviders[existingIndex] = created
            else mockProviders.push(created)
            return json(201, { data: created })
          }
        }
        const [, providerName] = providerMatch ?? []
        const providerIndex = mockProviders.findIndex((p) => p.provider === providerName)
        if (method === 'PATCH' && providerIndex >= 0) {
          const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
          mockProviders[providerIndex] = {
            ...(mockProviders[providerIndex] as (typeof mockProviders)[number]),
            ...body,
          }
          return json(200, { data: mockProviders[providerIndex] })
        }
        if (method === 'DELETE' && providerIndex >= 0) {
          mockProviders.splice(providerIndex, 1)
          return json(200, { data: { provider: providerName, removed: true } })
        }
        return json(404, {
          error: { code: 'PROVIDER_NOT_CONFIGURED', message: 'No such provider.' },
        })
      }

      // `/api/search` — the same shape `createSearchRouter` returns, including
      // its refusal for a role that may not read drafts (the server decides
      // that, never the UI: R4).
      if (url.includes('/api/search?')) {
        if (auth !== `Bearer ${VALID_TOKEN}`) {
          return json(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in to search.' } })
        }
        const parsed = new URL(url, 'http://localhost')
        const text = (parsed.searchParams.get('q') ?? '').toLowerCase()
        const status = parsed.searchParams.get('status')
        if (status !== null && status !== 'published' && !user.roles.includes('editor')) {
          return json(403, {
            error: { code: 'FORBIDDEN', message: 'You may not search unpublished content.' },
          })
        }
        const hits = MOCK_ENTRIES.filter(
          (entry) =>
            (status === null || entry.status === status) &&
            entry.values.title.toLowerCase().includes(text),
        ).map((entry) => ({
          id: entry.id,
          collection: 'article',
          locale: entry.locale,
          status: entry.status,
          title: entry.values.title,
          score: 1,
        }))
        return json(200, { data: hits, page: { hasMore: false, nextOffset: null } })
      }

      // The translation dashboard (fiche 10 task 1): a collection-scoped
      // action, `-` where an entry id would be — see `router.ts`'s own doc
      // comment for why that segment can never collide with a real id.
      const matrixMatch = /\/api\/content\/([^/?]+)\/-\/translation-matrix(?:\?.*)?$/u.exec(url)
      if (matrixMatch !== null && method === 'GET') {
        const [, collection] = matrixMatch
        if (collection === 'article') {
          const roots = MOCK_ENTRIES.filter((entry) => entry.translationOf === null)
          const items = roots.map((root) => ({
            root,
            cells: {
              [root.locale]: {
                id: root.id,
                status: root.status,
                updatedAt: root.updatedAt,
                obsolete: false,
              },
              ...(root.id === 'entry-1'
                ? {
                    fr: {
                      id: 'entry-1-fr',
                      status: 'draft',
                      updatedAt: '2026-01-15T00:00:00.000Z',
                      // Deliberately true: this fixture is what proves the
                      // dashboard renders task 2's signal as a fact, not
                      // just as a state.
                      obsolete: true,
                    },
                  }
                : {}),
            },
          }))
          return json(200, { data: items, page: { hasMore: false, nextCursor: null } })
        }
        return json(200, { data: [], page: { hasMore: false, nextCursor: null } })
      }

      const versionMatch =
        /\/api\/content\/([^/?]+)\/([^/?]+)\/(history|diff|restore|preview|translations|publish|unpublish|duplicate)(?:\?.*)?$/u.exec(
          url,
        )
      if (versionMatch !== null) {
        const [, collection, id, action] = versionMatch

        // Status control (the admin's own gap this feature fixes). Stateless,
        // like `restore` below: it answers what the real route would return
        // for this request, without mutating the shared `MOCK_ENTRIES` fixture
        // other tests read from.
        if (collection === 'article' && action === 'publish' && method === 'POST') {
          const entry = MOCK_ENTRIES.find((candidate) => candidate.id === id)
          if (entry === undefined) {
            return json(404, { error: { code: 'CONTENT_NOT_FOUND', message: 'No entry.' } })
          }
          const allowed = MOCK_SCHEMA.collections[0]?.permissions.publish ?? []
          if (!allowed.some((role) => user.roles.includes(role))) {
            return json(403, {
              error: { code: 'FORBIDDEN', message: 'Access denied: publish on article.' },
            })
          }
          return json(200, { data: { ...entry, status: 'published' } })
        }

        if (collection === 'article' && action === 'unpublish' && method === 'POST') {
          const entry = MOCK_ENTRIES.find((candidate) => candidate.id === id)
          if (entry === undefined) {
            return json(404, { error: { code: 'CONTENT_NOT_FOUND', message: 'No entry.' } })
          }
          const allowed = MOCK_SCHEMA.collections[0]?.permissions.publish ?? []
          if (!allowed.some((role) => user.roles.includes(role))) {
            return json(403, {
              error: { code: 'FORBIDDEN', message: 'Access denied: publish on article.' },
            })
          }
          if (body.status === 'scheduled') {
            if (typeof body.publishedAt !== 'string' || body.publishedAt.length === 0) {
              return json(400, {
                error: {
                  code: 'CONTENT_SCHEDULE_INVALID',
                  message: 'A scheduled publication needs a date.',
                },
              })
            }
            return json(200, {
              data: { ...entry, status: 'scheduled', publishedAt: body.publishedAt },
            })
          }
          const status = body.status === 'archived' ? 'archived' : 'draft'
          return json(200, { data: { ...entry, status, publishedAt: null } })
        }

        // `entry-1` -> `entry-1-copy`. A GET of the copy's id is synthesised
        // the same way below, so the admin's "open the new draft" navigation
        // after duplicating has something real to load.
        if (collection === 'article' && action === 'duplicate' && method === 'POST') {
          const entry = MOCK_ENTRIES.find((candidate) => candidate.id === id)
          if (entry === undefined) {
            return json(404, { error: { code: 'CONTENT_NOT_FOUND', message: 'No entry.' } })
          }
          const allowed = MOCK_SCHEMA.collections[0]?.permissions.create ?? []
          if (!allowed.some((role) => user.roles.includes(role))) {
            return json(403, {
              error: { code: 'FORBIDDEN', message: 'Access denied: create on article.' },
            })
          }
          return json(201, {
            data: {
              ...entry,
              id: `${id}-copy`,
              status: 'draft',
              version: 1,
              translationOf: null,
              values: { ...entry.values, ...(body.values ?? {}) },
            },
          })
        }

        if (collection === 'article' && action === 'translations' && method === 'GET') {
          return json(200, { data: MOCK_ENTRIES.filter((candidate) => candidate.id === id) })
        }

        if (
          collection === 'article' &&
          id === 'entry-1' &&
          action === 'history' &&
          method === 'GET'
        ) {
          return json(200, {
            data: [
              {
                version: 1,
                status: 'draft',
                createdAt: '2026-01-01T00:00:00.000Z',
                createdBy: 'user-1',
                live: false,
              },
              {
                version: 2,
                status: 'published',
                createdAt: '2026-02-01T00:00:00.000Z',
                createdBy: 'user-1',
                live: true,
              },
            ],
          })
        }

        if (
          collection === 'article' &&
          id === 'entry-1' &&
          action === 'preview' &&
          method === 'POST'
        ) {
          if (options.previewSigningKeyMissing === true) {
            return json(500, {
              error: {
                code: 'CONFIG_INVALID',
                message:
                  'Preview tokens need COGENTA_PREVIEW_SIGNING_KEY to hold at least 32 characters.',
                hint: 'Set COGENTA_PREVIEW_SIGNING_KEY in the environment — for example `openssl rand -hex 32`. Never put it in a configuration file.',
              },
            })
          }
          return json(201, {
            data: {
              token: 'preview-token-1',
              expiresIn: 3600,
              path: '/blog/first-article',
              url: 'https://example.com/blog/first-article?state=working&preview=preview-token-1',
            },
          })
        }

        if (collection === 'article' && id === 'entry-1' && action === 'diff' && method === 'GET') {
          return json(200, {
            data: {
              fields: [
                {
                  field: 'title',
                  change: 'changed',
                  before: 'First draft',
                  after: 'First article',
                },
              ],
              blocks: [],
              changed: true,
            },
          })
        }

        if (
          collection === 'article' &&
          id === 'entry-1' &&
          action === 'restore' &&
          method === 'POST'
        ) {
          const entry = MOCK_ENTRIES.find((candidate) => candidate.id === id)
          if (entry === undefined) {
            return json(404, {
              error: { code: 'CONTENT_NOT_FOUND', message: 'No entry with that id.' },
            })
          }
          return json(200, {
            data: { ...entry, version: entry.version + 1, values: { title: 'Restored title' } },
          })
        }
      }

      // `GET /api/media/-/limits` (fiche 05 task 1) — shown by `UploadForm`
      // before the first file is picked.
      if (url.endsWith('/api/media/-/limits') && method === 'GET') {
        if (auth !== `Bearer ${VALID_TOKEN}`) {
          return json(401, {
            error: { code: 'UNAUTHENTICATED', message: 'Sign in to manage media.' },
          })
        }
        return json(200, {
          data: {
            maxUploadBytes: 250 * 1024 * 1024,
            acceptedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/avif'],
          },
        })
      }

      const mediaFileMatch = /\/api\/media\/([^/?]+)\/file(?:\?.*)?$/u.exec(url)
      if (mediaFileMatch !== null) {
        if (auth !== `Bearer ${VALID_TOKEN}`) {
          return json(401, {
            error: { code: 'UNAUTHENTICATED', message: 'Sign in to view media.' },
          })
        }
        const found = media.find((item) => item.id === mediaFileMatch[1])
        if (found === undefined) {
          return json(404, { error: { code: 'MEDIA_NOT_FOUND', message: 'No media asset.' } })
        }
        return new Response(new Blob(['fake-bytes'], { type: found.mimeType }), {
          status: 200,
          headers: { 'content-type': found.mimeType },
        })
      }

      // Fiche 46: the folder tree. Checked before the generic `mediaMatch`
      // below, whose own single-segment capture would otherwise treat
      // "folders" as an asset id.
      const mediaFoldersMatch = /\/api\/media\/folders(?:\/([^/?]+))?(?:\/(move))?(?:\?.*)?$/u.exec(
        url,
      )
      if (mediaFoldersMatch !== null) {
        if (auth !== `Bearer ${VALID_TOKEN}`) {
          return json(401, {
            error: { code: 'UNAUTHENTICATED', message: 'Sign in to manage media.' },
          })
        }
        const [, folderId, moveAction] = mediaFoldersMatch

        if (folderId === undefined && method === 'GET') {
          const parsed = new URL(url, 'http://localhost')
          const parentIdRaw = parsed.searchParams.has('parentId')
            ? parsed.searchParams.get('parentId')
            : undefined
          const scoped =
            parentIdRaw === undefined
              ? mediaFolders
              : mediaFolders.filter(
                  (folder) => folder.parentId === (parentIdRaw === '' ? null : parentIdRaw),
                )
          return json(200, { data: [...scoped].sort((a, b) => a.position - b.position) })
        }

        if (folderId === undefined && method === 'POST') {
          const name = String(body.name ?? '').trim()
          if (name.length === 0) {
            return json(400, {
              error: { code: 'MEDIA_FOLDER_INVALID', message: 'A folder needs a name.' },
            })
          }
          const parentId = (body.parentId ?? null) as string | null
          const clash = mediaFolders.find(
            (folder) =>
              folder.parentId === parentId && folder.name.toLowerCase() === name.toLowerCase(),
          )
          if (clash !== undefined) {
            return json(409, {
              error: {
                code: 'MEDIA_FOLDER_NAME_TAKEN',
                message: `A folder named "${name}" already exists here.`,
              },
            })
          }
          folderCounter += 1
          const id = `folder-${folderCounter}`
          const created: MockMediaFolder = {
            id,
            parentId,
            name,
            path: mediaFolderPath(parentId, id),
            position: mediaFolders.filter((folder) => folder.parentId === parentId).length,
            createdAt: '2026-03-01T00:00:00.000Z',
          }
          mediaFolders.push(created)
          return json(201, { data: created })
        }

        if (folderId !== undefined && moveAction === undefined && method === 'GET') {
          const found = mediaFolders.find((folder) => folder.id === folderId)
          if (found === undefined) {
            return json(404, {
              error: { code: 'MEDIA_FOLDER_NOT_FOUND', message: 'No media folder.' },
            })
          }
          return json(200, { data: found })
        }

        if (
          folderId !== undefined &&
          moveAction === undefined &&
          (method === 'PATCH' || method === 'PUT')
        ) {
          const found = mediaFolders.find((folder) => folder.id === folderId)
          if (found === undefined) {
            return json(404, {
              error: { code: 'MEDIA_FOLDER_NOT_FOUND', message: 'No media folder.' },
            })
          }
          if (typeof body.name === 'string') found.name = body.name.trim()
          if (typeof body.position === 'number') found.position = body.position
          return json(200, { data: found })
        }

        if (folderId !== undefined && moveAction === undefined && method === 'DELETE') {
          const found = mediaFolders.find((folder) => folder.id === folderId)
          if (found === undefined) {
            return json(404, {
              error: { code: 'MEDIA_FOLDER_NOT_FOUND', message: 'No media folder.' },
            })
          }
          const hasChildren = mediaFolders.some((folder) => folder.parentId === folderId)
          const hasAssets = media.some((item) => item.folderId === folderId)
          if (hasChildren || hasAssets) {
            return json(409, {
              error: {
                code: 'MEDIA_FOLDER_NOT_EMPTY',
                message: 'This folder is not empty.',
              },
            })
          }
          const index = mediaFolders.findIndex((folder) => folder.id === folderId)
          mediaFolders.splice(index, 1)
          return new Response(null, { status: 204 })
        }

        if (folderId !== undefined && moveAction === 'move' && method === 'POST') {
          const found = mediaFolders.find((folder) => folder.id === folderId)
          if (found === undefined) {
            return json(404, {
              error: { code: 'MEDIA_FOLDER_NOT_FOUND', message: 'No media folder.' },
            })
          }
          const parentId = (body.parentId ?? null) as string | null
          if (parentId === folderId) {
            return json(400, {
              error: {
                code: 'MEDIA_FOLDER_CYCLE',
                message: 'A folder cannot be moved into itself.',
              },
            })
          }
          const target = parentId === null ? undefined : mediaFolders.find((f) => f.id === parentId)
          if (target?.path.startsWith(found.path)) {
            return json(400, {
              error: {
                code: 'MEDIA_FOLDER_CYCLE',
                message: 'Moving this folder would make it its own ancestor.',
              },
            })
          }
          const oldPath = found.path
          found.parentId = parentId
          found.path = mediaFolderPath(parentId, folderId)
          for (const other of mediaFolders) {
            if (other.id !== folderId && other.path.startsWith(oldPath)) {
              other.path = found.path + other.path.slice(oldPath.length)
            }
          }
          return json(200, { data: found })
        }
      }

      const mediaUsageMatch = /\/api\/media\/([^/?]+)\/usage(?:\?.*)?$/u.exec(url)
      if (mediaUsageMatch !== null && method === 'GET') {
        if (auth !== `Bearer ${VALID_TOKEN}`) {
          return json(401, {
            error: { code: 'UNAUTHENTICATED', message: 'Sign in to view media.' },
          })
        }
        const found = media.find((item) => item.id === mediaUsageMatch[1])
        if (found === undefined) {
          return json(404, { error: { code: 'MEDIA_NOT_FOUND', message: 'No media asset.' } })
        }
        const matches = options.mediaUsage?.[found.id] ?? []
        return json(200, { data: { matches, scannedEntries: 0, truncated: false } })
      }

      // `POST /api/media/-/bulk-usage` (fiche 05 task 3) — checked before
      // the admin's bulk-delete confirmation dialog opens.
      if (url.endsWith('/api/media/-/bulk-usage') && method === 'POST') {
        if (auth !== `Bearer ${VALID_TOKEN}`) {
          return json(401, {
            error: { code: 'UNAUTHENTICATED', message: 'Sign in to manage media.' },
          })
        }
        const ids = Array.isArray(body.ids) ? (body.ids as string[]) : []
        const reports: Record<
          string,
          { matches: unknown; scannedEntries: number; truncated: boolean }
        > = {}
        for (const id of ids) {
          reports[id] = {
            matches: options.mediaUsage?.[id] ?? [],
            scannedEntries: 0,
            truncated: false,
          }
        }
        return json(200, { data: reports })
      }

      const mediaExifMatch = /\/api\/media\/([^/?]+)\/exif(?:\?.*)?$/u.exec(url)
      if (mediaExifMatch !== null && method === 'GET') {
        if (auth !== `Bearer ${VALID_TOKEN}`) {
          return json(401, {
            error: { code: 'UNAUTHENTICATED', message: 'Sign in to view media.' },
          })
        }
        const found = media.find((item) => item.id === mediaExifMatch[1])
        if (found === undefined) {
          return json(404, { error: { code: 'MEDIA_NOT_FOUND', message: 'No media asset.' } })
        }
        return json(200, { data: null })
      }

      const mediaReplaceMatch = /\/api\/media\/([^/?]+)\/replace(?:\?.*)?$/u.exec(url)
      if (mediaReplaceMatch !== null && method === 'POST') {
        if (auth !== `Bearer ${VALID_TOKEN}`) {
          return json(401, {
            error: { code: 'UNAUTHENTICATED', message: 'Sign in to manage media.' },
          })
        }
        const found = media.find((item) => item.id === mediaReplaceMatch[1])
        if (found === undefined) {
          return json(404, { error: { code: 'MEDIA_NOT_FOUND', message: 'No media asset.' } })
        }
        const form = init?.body
        const file = form instanceof FormData ? form.get('file') : null
        if (!(file instanceof File)) {
          return json(400, {
            error: { code: 'MEDIA_INVALID', message: 'No file part named "file".' },
          })
        }
        found.filename = file.name
        found.mimeType = file.type || found.mimeType
        found.size = file.size
        found.contentHash = `hash-replaced-${mediaCounter + 1}`
        mediaCounter += 1
        return json(200, { data: found })
      }

      const mediaMoveMatch = /\/api\/media\/([^/?]+)\/move(?:\?.*)?$/u.exec(url)
      if (mediaMoveMatch !== null && method === 'POST') {
        if (auth !== `Bearer ${VALID_TOKEN}`) {
          return json(401, {
            error: { code: 'UNAUTHENTICATED', message: 'Sign in to manage media.' },
          })
        }
        const found = media.find((item) => item.id === mediaMoveMatch[1])
        if (found === undefined) {
          return json(404, { error: { code: 'MEDIA_NOT_FOUND', message: 'No media asset.' } })
        }
        const folderId = (body.folderId ?? null) as string | null
        if (folderId !== null && mediaFolders.every((folder) => folder.id !== folderId)) {
          return json(404, {
            error: { code: 'MEDIA_FOLDER_NOT_FOUND', message: 'No media folder.' },
          })
        }
        found.folderId = folderId
        return json(200, { data: found })
      }

      const mediaBulkMatch = /\/api\/media\/-\/(bulk-delete|bulk-tag|bulk-untag|bulk-move)$/u.exec(
        url,
      )
      if (mediaBulkMatch !== null && method === 'POST') {
        if (auth !== `Bearer ${VALID_TOKEN}`) {
          return json(401, {
            error: { code: 'UNAUTHENTICATED', message: 'Sign in to manage media.' },
          })
        }
        const action = mediaBulkMatch[1]
        const ids = Array.isArray(body.ids) ? (body.ids as string[]) : []

        if (action === 'bulk-delete') {
          const deleted: string[] = []
          const failed: { id: string; code: string; message: string }[] = []
          for (const id of ids) {
            const index = media.findIndex((item) => item.id === id)
            if (index === -1) {
              failed.push({ id, code: 'MEDIA_NOT_FOUND', message: 'No media asset.' })
              continue
            }
            media.splice(index, 1)
            deleted.push(id)
          }
          return json(200, { data: { deleted, failed } })
        }

        if (action === 'bulk-tag' || action === 'bulk-untag') {
          const tag = String(body.tag ?? '')
          const updated: MockMediaAsset[] = []
          const failed: { id: string; code: string; message: string }[] = []
          for (const id of ids) {
            const found = media.find((item) => item.id === id)
            if (found === undefined) {
              failed.push({ id, code: 'MEDIA_NOT_FOUND', message: 'No media asset.' })
              continue
            }
            found.tags =
              action === 'bulk-tag'
                ? found.tags.includes(tag)
                  ? found.tags
                  : [...found.tags, tag]
                : found.tags.filter((existing) => existing !== tag)
            updated.push(found)
          }
          return json(200, { data: { updated, failed } })
        }

        // bulk-move
        const folderId = (body.folderId ?? null) as string | null
        if (folderId !== null && mediaFolders.every((folder) => folder.id !== folderId)) {
          return json(404, {
            error: { code: 'MEDIA_FOLDER_NOT_FOUND', message: 'No media folder.' },
          })
        }
        const moved: MockMediaAsset[] = []
        const failed: { id: string; code: string; message: string }[] = []
        for (const id of ids) {
          const found = media.find((item) => item.id === id)
          if (found === undefined) {
            failed.push({ id, code: 'MEDIA_NOT_FOUND', message: 'No media asset.' })
            continue
          }
          found.folderId = folderId
          moved.push(found)
        }
        return json(200, { data: { moved, failed } })
      }

      const mediaMatch = /\/api\/media(?:\/([^/?]+))?(?:\?.*)?$/u.exec(url)
      if (mediaMatch !== null) {
        const [, id] = mediaMatch

        if (id === undefined && method === 'GET') {
          const parsed = new URL(url, 'http://localhost')
          const kindFilter = parsed.searchParams.get('kind')
          const tagFilter = parsed.searchParams.get('tag')
          const qFilter = parsed.searchParams.get('q')
          const folderIdRaw = parsed.searchParams.has('folderId')
            ? parsed.searchParams.get('folderId')
            : undefined
          const includeSubfolders = parsed.searchParams.get('includeSubfolders') === '1'
          const sortField = parsed.searchParams.get('sort') ?? 'createdAt'
          const direction = parsed.searchParams.get('direction') ?? 'desc'

          let filtered = media.slice()
          if (kindFilter !== null) filtered = filtered.filter((item) => item.kind === kindFilter)
          if (tagFilter !== null) {
            filtered = filtered.filter((item) => item.tags.includes(tagFilter))
          }
          if (qFilter !== null && qFilter.trim() !== '') {
            const needle = qFilter.trim().toLowerCase()
            filtered = filtered.filter(
              (item) =>
                item.filename.toLowerCase().includes(needle) ||
                item.alt.toLowerCase().includes(needle),
            )
          }
          if (folderIdRaw !== undefined) {
            const wanted = folderIdRaw === '' || folderIdRaw === 'none' ? null : folderIdRaw
            if (wanted === null) {
              filtered = filtered.filter((item) => item.folderId === null)
            } else if (includeSubfolders) {
              const subtree = mediaFolders.find((folder) => folder.id === wanted)
              const wantedIds = new Set(
                subtree === undefined
                  ? [wanted]
                  : mediaFolders
                      .filter((folder) => folder.path.startsWith(subtree.path))
                      .map((folder) => folder.id),
              )
              filtered = filtered.filter(
                (item) => item.folderId !== null && wantedIds.has(item.folderId),
              )
            } else {
              filtered = filtered.filter((item) => item.folderId === wanted)
            }
          }

          filtered.sort((a, b) => {
            const left: string | number =
              sortField === 'size' ? a.size : sortField === 'filename' ? a.filename : a.createdAt
            const right: string | number =
              sortField === 'size' ? b.size : sortField === 'filename' ? b.filename : b.createdAt
            const cmp = left < right ? -1 : left > right ? 1 : 0
            return direction === 'asc' ? cmp : -cmp
          })

          // Fiche 67 task 2: `media.tsx` now sends real `limit`/`after`
          // (`nextCursor` from the previous page, the id of its last item —
          // an opaque mock convention, not a claim about the real store's
          // cursor format). Absent `limit`/`after` returns everything in one
          // page, byte for byte what this mock always did before this fiche.
          const limitRaw = parsed.searchParams.get('limit')
          const limit = limitRaw === null ? undefined : Number(limitRaw)
          const after = parsed.searchParams.get('after')
          const startIndex =
            after === null ? 0 : filtered.findIndex((item) => item.id === after) + 1
          const pageSize = limit ?? filtered.length
          const items = filtered.slice(startIndex, startIndex + pageSize)
          const hasMore = startIndex + pageSize < filtered.length
          const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null
          return json(200, {
            data: items,
            page: { hasMore, nextCursor, total: filtered.length },
          })
        }

        if (id === undefined && method === 'POST') {
          if (auth !== `Bearer ${VALID_TOKEN}`) {
            return json(401, {
              error: { code: 'UNAUTHENTICATED', message: 'Sign in to manage media.' },
            })
          }
          // Fiche 05 task 1: the admin's real upload transport is now
          // `multipart/form-data` (`uploadMediaMultipart`), not the JSON
          // `body` this route used to be the only path for.
          const uploadBody = mockUploadBody(body, init?.body instanceof FormData ? init.body : null)
          const decorative = uploadBody.decorative === true
          if (decorative && (uploadBody.decorativeJustification ?? '').length === 0) {
            return json(400, {
              error: {
                code: 'MEDIA_INVALID',
                message: 'A decorative image needs a justification.',
              },
            })
          }
          if (!decorative && (uploadBody.alt ?? '').length === 0) {
            return json(400, {
              error: { code: 'MEDIA_INVALID', message: 'Alt text is required.' },
            })
          }
          mediaCounter += 1
          const created: MockMediaAsset = {
            id: `media-${mediaCounter}`,
            kind: uploadBody.kind ?? mockMediaKindFor(uploadBody.mimeType ?? ''),
            filename: uploadBody.filename ?? 'upload.bin',
            mimeType: uploadBody.mimeType ?? 'application/octet-stream',
            size: 10,
            width: null,
            height: null,
            alt: decorative ? '' : (uploadBody.alt ?? ''),
            decorative,
            decorativeJustification: decorative
              ? (uploadBody.decorativeJustification ?? null)
              : null,
            focal: (uploadBody.focal ?? null) as MockMediaAsset['focal'],
            tags: Array.isArray(uploadBody.tags) ? (uploadBody.tags as string[]) : [],
            contentHash: `hash-${mediaCounter}`,
            folderId: (uploadBody.folderId ?? null) as string | null,
            createdAt: '2026-03-01T00:00:00.000Z',
            createdBy: USER.id,
          }
          media.unshift(created)
          return json(201, { data: created })
        }

        if (id !== undefined && method === 'GET') {
          const found = media.find((item) => item.id === id)
          if (found === undefined) {
            return json(404, { error: { code: 'MEDIA_NOT_FOUND', message: 'No media asset.' } })
          }
          return json(200, { data: found })
        }

        if (id !== undefined && (method === 'PATCH' || method === 'PUT')) {
          if (auth !== `Bearer ${VALID_TOKEN}`) {
            return json(401, {
              error: { code: 'UNAUTHENTICATED', message: 'Sign in to manage media.' },
            })
          }
          const found = media.find((item) => item.id === id)
          if (found === undefined) {
            return json(404, { error: { code: 'MEDIA_NOT_FOUND', message: 'No media asset.' } })
          }
          if (body.decorative !== undefined) found.decorative = body.decorative
          if (found.decorative) {
            found.alt = ''
            if (body.decorativeJustification !== undefined) {
              found.decorativeJustification = body.decorativeJustification
            }
          } else {
            if (body.alt !== undefined) found.alt = body.alt
            found.decorativeJustification = null
          }
          if (body.focal !== undefined) found.focal = body.focal
          if (Array.isArray(body.tags)) found.tags = body.tags as string[]
          return json(200, { data: found })
        }

        if (id !== undefined && method === 'DELETE') {
          const index = media.findIndex((item) => item.id === id)
          if (index !== -1) media.splice(index, 1)
          return new Response(null, { status: 204 })
        }
      }

      /**
       * The taxonomy transport (`schema@2.0`, ADR-0022), refusing by the same
       * rules the real router applies — the point of these role tests is
       * worthless if the stub says yes to everyone.
       */
      const taxonomyMatch =
        /\/api\/taxonomies\/([^/?]+)(?:\/([^/?]+))?(?:\/(move))?(?:\?.*)?$/u.exec(url)
      if (taxonomyMatch !== null) {
        const [, taxonomy = '', id, action] = taxonomyMatch
        const declared = MOCK_SCHEMA.taxonomies.find((entry) => entry.name === taxonomy)
        if (declared === undefined) {
          return json(404, {
            error: { code: 'TAXONOMY_UNKNOWN', message: 'No such taxonomy.' },
          })
        }

        const requiredAction =
          method === 'GET'
            ? 'read'
            : method === 'POST' && action !== 'move'
              ? 'create'
              : method === 'DELETE'
                ? 'delete'
                : 'update'
        const allowed: readonly string[] =
          (declared.permissions as Record<string, readonly string[]>)[requiredAction] ?? []
        const held = [...user.roles, 'public']
        if (!allowed.some((role) => held.includes(role))) {
          return json(403, {
            error: {
              code: 'FORBIDDEN',
              message: `Access denied: ${requiredAction} on ${taxonomy}.`,
            },
          })
        }

        if (id === undefined && method === 'GET') {
          const parsed = new URL(url, 'http://localhost')
          // Mirrors the real store's in-memory tree flattening: a parent
          // immediately before its children, siblings by `position` — not
          // insertion order, so a reorder through the tree's buttons is
          // actually visible on the next fetch.
          let listed = flattenMockTerms(terms)

          const q = parsed.searchParams.get('q')
          if (q !== null && q.trim() !== '') {
            const folded = foldForMockSearch(q.trim())
            listed = listed.filter(
              (term) =>
                foldForMockSearch(term.slug).includes(folded) ||
                Object.values(term.labels).some((label) =>
                  foldForMockSearch(label).includes(folded),
                ),
            )
          }

          const wantsCounts = parsed.searchParams.get('counts') === '1'
          const wantsUnusedOnly = parsed.searchParams.get('unused') === '1'
          if (wantsUnusedOnly) {
            listed = listed.filter((term) => (taxonomyUsage[term.id]?.own ?? 0) === 0)
          }
          const withCounts = wantsCounts
            ? listed.map((term) => ({
                ...term,
                entryCount: taxonomyUsage[term.id] ?? { own: 0, withDescendants: 0 },
              }))
            : listed

          return json(200, { data: withCounts })
        }

        if (id === undefined && method === 'POST') {
          if (terms.some((term) => term.slug === body.slug)) {
            return json(409, {
              error: { code: 'TAXONOMY_SLUG_TAKEN', message: 'That slug is taken.' },
            })
          }
          termCounter += 1
          const parent = typeof body.parent === 'string' ? body.parent : null
          const parentTerm = terms.find((term) => term.id === parent)
          const created = {
            id: `term-${termCounter}`,
            taxonomy,
            parent,
            slug: body.slug,
            labels: body.labels,
            position: terms.length,
            depth: parentTerm === undefined ? 0 : parentTerm.depth + 1,
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
          }
          terms.push(created)
          return json(201, { data: created })
        }

        if (id !== undefined && action === undefined && (method === 'PATCH' || method === 'PUT')) {
          const term = terms.find((candidate) => candidate.id === id)
          if (term === undefined) {
            return json(404, {
              error: { code: 'TAXONOMY_TERM_NOT_FOUND', message: 'No such term.' },
            })
          }
          if (
            typeof body.slug === 'string' &&
            terms.some((candidate) => candidate.id !== id && candidate.slug === body.slug)
          ) {
            return json(409, {
              error: { code: 'TAXONOMY_SLUG_TAKEN', message: 'That slug is taken.' },
            })
          }
          if (typeof body.slug === 'string') term.slug = body.slug
          if (body.labels !== undefined) term.labels = body.labels
          if (typeof body.position === 'number') term.position = body.position
          term.updatedAt = '2026-03-02T00:00:00.000Z'
          return json(200, { data: term })
        }

        if (id !== undefined && action === 'move' && method === 'POST') {
          const term = terms.find((candidate) => candidate.id === id)
          if (term === undefined) {
            return json(404, {
              error: { code: 'TAXONOMY_TERM_NOT_FOUND', message: 'No such term.' },
            })
          }
          const parent =
            body.parent === null ? null : typeof body.parent === 'string' ? body.parent : undefined
          if (parent === undefined) {
            return json(400, {
              error: { code: 'CONTENT_INVALID', message: 'A move needs a new parent.' },
            })
          }

          const isWithinSubtree = (candidateId: string): boolean => {
            let current = terms.find((entry) => entry.id === candidateId)
            while (current !== undefined) {
              if (current.id === id) return true
              current = terms.find((entry) => entry.id === current?.parent)
            }
            return false
          }
          if (parent !== null && isWithinSubtree(parent)) {
            return json(400, {
              error: {
                code: 'TAXONOMY_CYCLE',
                message: `Moving "${id}" under "${parent}" would make it its own ancestor.`,
              },
            })
          }

          const parentTerm =
            parent === null ? undefined : terms.find((entry) => entry.id === parent)
          const newDepth = parentTerm === undefined ? 0 : parentTerm.depth + 1
          const depthDelta = newDepth - term.depth

          // Rewrites the depth of the whole moved subtree, mirroring the real
          // store's "only a move pays" write cost.
          const subtree = new Set([id])
          let grew = true
          while (grew) {
            grew = false
            for (const candidate of terms) {
              if (
                candidate.parent !== null &&
                subtree.has(candidate.parent) &&
                !subtree.has(candidate.id)
              ) {
                subtree.add(candidate.id)
                grew = true
              }
            }
          }
          for (const candidate of terms) {
            if (subtree.has(candidate.id)) candidate.depth += depthDelta
          }

          term.parent = parent
          term.position = terms.filter(
            (candidate) => candidate.parent === parent && candidate.id !== id,
          ).length
          term.updatedAt = '2026-03-02T00:00:00.000Z'
          return json(200, { data: term })
        }

        if (id !== undefined && action === undefined && method === 'DELETE') {
          const parsed = new URL(url, 'http://localhost')
          const hasChildren = terms.some((term) => term.parent === id)
          if (hasChildren && parsed.searchParams.get('cascade') !== 'true') {
            return json(409, {
              error: {
                code: 'TAXONOMY_TERM_HAS_CHILDREN',
                message: 'This term still has descendant terms.',
              },
            })
          }
          terms = terms.filter((term) => term.id !== id && term.parent !== id)
          return new Response(null, { status: 204 })
        }
      }

      /**
       * The menu transport. Write is a fixed `admin`/`editor` rule, refused
       * the same way the real router refuses it — these role tests are
       * worthless if the stub says yes to everyone.
       */
      const mayWriteMenus = user.roles.includes('admin') || user.roles.includes('editor')
      const menuItemMatch =
        /\/api\/menus\/([^/?]+)\/items(?:\/([^/?]+)(?:\/(reorder|move))?)?(?:\?.*)?$/u.exec(url)
      const menuMatch = /\/api\/menus(?:\/([^/?]+))?(?:\?.*)?$/u.exec(url)

      /** Depth from `parent`, recomputed rather than trusted — the same rule the real store follows. */
      function depthOf(parent: string | null): number {
        if (parent === null) return 0
        const parentItem = menuItems.find((candidate) => candidate.id === parent)
        return parentItem === undefined ? 0 : parentItem.depth + 1
      }

      /** Every descendant of `id`'s depth follows it — a re-parent moves a whole subtree, never just the one row. */
      function refreshDescendantDepths(id: string): void {
        for (const child of menuItems.filter((candidate) => candidate.parent === id)) {
          child.depth = depthOf(child.parent)
          refreshDescendantDepths(child.id)
        }
      }

      /** Tree order: group by parent, sort each group by `position`, then depth-first from the roots. */
      function treeOrder(menuId: string): typeof menuItems {
        const byParent = new Map<string | null, typeof menuItems>()
        for (const item of menuItems.filter((candidate) => candidate.menuId === menuId)) {
          const siblings = byParent.get(item.parent) ?? []
          siblings.push(item)
          byParent.set(item.parent, siblings)
        }
        for (const siblings of byParent.values()) siblings.sort((a, b) => a.position - b.position)
        const ordered: typeof menuItems = []
        const visit = (parent: string | null): void => {
          for (const item of byParent.get(parent) ?? []) {
            ordered.push(item)
            visit(item.id)
          }
        }
        visit(null)
        return ordered
      }

      /**
       * The same shape the real router's `resolve()` adds — a display label,
       * a route and (for `entry`) a health status — computed from the same
       * fixtures every other route in this file already reads (`MOCK_ENTRIES`,
       * `trash`, `terms`). Applied only where the admin actually consumes it
       * (a menu's detail read), the same way the real server only resolves
       * when it serialises an item, never when it stores one.
       */
      function resolveMenuItem(item: (typeof menuItems)[number]): typeof item & {
        resolvedLabel?: string
        resolvedRoute?: string | null
        resolvedHealth?: string
      } {
        if (item.kind === 'home') return { ...item, resolvedLabel: item.label, resolvedRoute: '/' }
        if (item.kind === 'taxonomy' && item.targetTermId !== null) {
          const term = terms.find((candidate) => candidate.id === item.targetTermId)
          if (term === undefined) return item
          return {
            ...item,
            resolvedLabel: term.labels.fr ?? Object.values(term.labels)[0] ?? term.slug,
            resolvedRoute: null,
          }
        }
        if (
          item.kind === 'entry' &&
          item.targetCollection === 'article' &&
          item.targetEntryId !== null
        ) {
          const entry =
            MOCK_ENTRIES.find((candidate) => candidate.id === item.targetEntryId) ??
            trash.find((candidate) => candidate.id === item.targetEntryId)
          if (entry === undefined) return item
          return {
            ...item,
            resolvedLabel: entry.values.title,
            resolvedRoute: `/${entry.values.title.toLowerCase().replaceAll(' ', '-')}`,
            resolvedHealth: entry.deletedAt !== null ? 'trashed' : entry.status,
          }
        }
        return item
      }

      if (menuItemMatch !== null) {
        const [, menuId = '', itemId, action] = menuItemMatch

        if (itemId === undefined && method === 'POST') {
          if (!mayWriteMenus) {
            return json(403, { error: { code: 'FORBIDDEN', message: 'Access denied: menus.' } })
          }
          itemCounter += 1
          const parent = typeof body.parent === 'string' ? body.parent : null
          const created = {
            id: `item-${itemCounter}`,
            menuId,
            parent,
            label: body.label,
            kind: body.kind,
            targetCollection: body.targetCollection ?? null,
            targetEntryId: body.targetEntryId ?? null,
            targetTaxonomy: body.targetTaxonomy ?? null,
            targetTermId: body.targetTermId ?? null,
            url: body.url ?? null,
            title: body.title ?? null,
            position: menuItems.filter((item) => item.menuId === menuId && item.parent === parent)
              .length,
            depth: depthOf(parent),
            openInNewTab: body.openInNewTab === true,
          }
          menuItems.push(created)
          return json(201, { data: created })
        }

        // The bulk reorder (fiche 09, task 2) — one call rewriting `parent`
        // and `position` for however many rows are named, mirroring
        // `MenuStore.reorderItems`'s contract closely enough for a UI test:
        // real cycle/depth validation lives in the schema package's own
        // suite, not here.
        if (itemId === undefined && method === 'PATCH') {
          if (!mayWriteMenus) {
            return json(403, { error: { code: 'FORBIDDEN', message: 'Access denied: menus.' } })
          }
          const updates = (body.updates ?? []) as {
            id: string
            parent: string | null
            position: number
          }[]
          for (const update of updates) {
            const item = menuItems.find((candidate) => candidate.id === update.id)
            if (item === undefined) {
              return json(404, {
                error: { code: 'MENU_ITEM_NOT_FOUND', message: 'No such item.' },
              })
            }
            item.parent = update.parent
            item.position = update.position
          }
          for (const update of updates) refreshDescendantDepths(update.id)
          for (const item of menuItems.filter((candidate) => candidate.menuId === menuId)) {
            item.depth = depthOf(item.parent)
          }
          return json(200, { data: treeOrder(menuId) })
        }

        if (itemId !== undefined && action === 'reorder' && method === 'POST') {
          if (!mayWriteMenus) {
            return json(403, { error: { code: 'FORBIDDEN', message: 'Access denied: menus.' } })
          }
          const item = menuItems.find((candidate) => candidate.id === itemId)
          if (item === undefined) {
            return json(404, { error: { code: 'MENU_ITEM_NOT_FOUND', message: 'No such item.' } })
          }
          const siblings = menuItems
            .filter(
              (candidate) => candidate.menuId === item.menuId && candidate.parent === item.parent,
            )
            .sort((a, b) => a.position - b.position)
          const index = siblings.findIndex((candidate) => candidate.id === itemId)
          const swapIndex = body.direction === 'up' ? index - 1 : index + 1
          const neighbour = siblings[swapIndex]
          if (neighbour !== undefined) {
            const myPosition = item.position
            item.position = neighbour.position
            neighbour.position = myPosition
          }
          return json(200, { data: item })
        }

        if (itemId !== undefined && action === 'move' && method === 'POST') {
          if (!mayWriteMenus) {
            return json(403, { error: { code: 'FORBIDDEN', message: 'Access denied: menus.' } })
          }
          const item = menuItems.find((candidate) => candidate.id === itemId)
          if (item === undefined) {
            return json(404, { error: { code: 'MENU_ITEM_NOT_FOUND', message: 'No such item.' } })
          }
          const parent = typeof body.parent === 'string' ? body.parent : null
          item.parent = parent
          item.position = menuItems.filter(
            (candidate) => candidate.menuId === item.menuId && candidate.parent === parent,
          ).length
          item.depth = depthOf(parent)
          refreshDescendantDepths(item.id)
          return json(200, { data: item })
        }

        if (
          itemId !== undefined &&
          action === undefined &&
          (method === 'PATCH' || method === 'PUT')
        ) {
          if (!mayWriteMenus) {
            return json(403, { error: { code: 'FORBIDDEN', message: 'Access denied: menus.' } })
          }
          const item = menuItems.find((candidate) => candidate.id === itemId)
          if (item === undefined) {
            return json(404, { error: { code: 'MENU_ITEM_NOT_FOUND', message: 'No such item.' } })
          }
          if (typeof body.label === 'string') item.label = body.label
          if (typeof body.kind === 'string') item.kind = body.kind
          if (Object.hasOwn(body, 'targetCollection')) item.targetCollection = body.targetCollection
          if (Object.hasOwn(body, 'targetEntryId')) item.targetEntryId = body.targetEntryId
          if (Object.hasOwn(body, 'targetTaxonomy')) item.targetTaxonomy = body.targetTaxonomy
          if (Object.hasOwn(body, 'targetTermId')) item.targetTermId = body.targetTermId
          if (Object.hasOwn(body, 'url')) item.url = body.url
          if (Object.hasOwn(body, 'title')) item.title = body.title
          if (typeof body.openInNewTab === 'boolean') item.openInNewTab = body.openInNewTab
          return json(200, { data: item })
        }

        if (itemId !== undefined && action === undefined && method === 'DELETE') {
          const parsed = new URL(url, 'http://localhost')
          const hasChildren = menuItems.some((item) => item.parent === itemId)
          if (hasChildren && parsed.searchParams.get('cascade') !== 'true') {
            return json(409, {
              error: { code: 'MENU_ITEM_INVALID', message: 'This item still has children.' },
            })
          }
          menuItems = menuItems.filter((item) => item.id !== itemId && item.parent !== itemId)
          return new Response(null, { status: 204 })
        }
      } else if (menuMatch !== null) {
        const [, id] = menuMatch

        if (id === undefined && method === 'GET') {
          return json(200, { data: menus })
        }

        if (id === undefined && method === 'POST') {
          if (!mayWriteMenus) {
            return json(403, { error: { code: 'FORBIDDEN', message: 'Access denied: menus.' } })
          }
          const location = typeof body.location === 'string' ? body.location : null
          if (
            location !== null &&
            menus.some((menu) => menu.location === location && menu.locale === body.locale)
          ) {
            return json(409, {
              error: {
                code: 'MENU_LOCATION_TAKEN',
                message: 'That location is already assigned for this locale.',
              },
            })
          }
          menuCounter += 1
          const created = {
            id: `menu-${menuCounter}`,
            name: body.name,
            locale: body.locale,
            label: body.label,
            location,
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
          }
          menus.push(created)
          return json(201, { data: created })
        }

        if (id !== undefined && method === 'GET') {
          const menu = menus.find((candidate) => candidate.id === id)
          if (menu === undefined) {
            return json(404, { error: { code: 'MENU_UNKNOWN', message: 'No such menu.' } })
          }
          return json(200, { data: { ...menu, items: treeOrder(id).map(resolveMenuItem) } })
        }

        if (id !== undefined && (method === 'PATCH' || method === 'PUT')) {
          if (!mayWriteMenus) {
            return json(403, { error: { code: 'FORBIDDEN', message: 'Access denied: menus.' } })
          }
          const menu = menus.find((candidate) => candidate.id === id)
          if (menu === undefined) {
            return json(404, { error: { code: 'MENU_UNKNOWN', message: 'No such menu.' } })
          }
          if (typeof body.label === 'string') menu.label = body.label
          if (Object.hasOwn(body, 'location')) {
            const location = body.location as string | null
            if (
              location !== null &&
              menus.some(
                (candidate) =>
                  candidate.id !== id &&
                  candidate.location === location &&
                  candidate.locale === menu.locale,
              )
            ) {
              return json(409, {
                error: {
                  code: 'MENU_LOCATION_TAKEN',
                  message: 'That location is already assigned for this locale.',
                },
              })
            }
            menu.location = location
          }
          return json(200, { data: menu })
        }

        if (id !== undefined && method === 'DELETE') {
          if (!mayWriteMenus) {
            return json(403, { error: { code: 'FORBIDDEN', message: 'Access denied: menus.' } })
          }
          const parsed = new URL(url, 'http://localhost')
          const hasItems = menuItems.some((item) => item.menuId === id)
          if (hasItems && parsed.searchParams.get('cascade') !== 'true') {
            return json(409, {
              error: { code: 'MENU_ITEM_INVALID', message: 'This menu still has items.' },
            })
          }
          menus = menus.filter((menu) => menu.id !== id)
          menuItems = menuItems.filter((item) => item.menuId !== id)
          return new Response(null, { status: 204 })
        }
      }

      // The page builder's preview (L16). It answers with a document shaped
      // exactly like the one `@cogenta/theme-canonical` serialises — one
      // element per block, carrying the `data-block-key` the builder maps
      // clicks back through. Whether the real renderer produces the real page
      // is proven against a real server in `packages/cli/test/serve-builder.test.ts`;
      // what matters here is that the admin sends the block list and shows
      // what it is handed.
      if (url.endsWith('/api/builder/render') && method === 'POST') {
        if (auth !== `Bearer ${VALID_TOKEN}`) {
          return json(401, {
            error: { code: 'UNAUTHENTICATED', message: 'This preview needs a signed-in editor.' },
          })
        }
        const zone = (body.blocks?.body ?? []) as { key: string; type: string }[]
        const sections = zone
          .map(
            (block) =>
              `<section class="cg-block" data-block="${block.type}" data-block-key="${block.key}"></section>`,
          )
          .join('')
        return json(200, {
          data: {
            html: `<!doctype html><html lang="en"><head><title>Preview</title></head><body><main class="cg-main" id="cg-main">${sections}</main></body></html>`,
          },
        })
      }

      // The dashboard's content summary widget (fiche 22 tâche 1): one
      // request across every readable collection, mirroring the real
      // `GET /api/content/-/summary` — a role that may not read a
      // collection's drafts or its trash gets `null` for those fields, never
      // a fabricated `0`.
      if (url.endsWith('/api/content/-/summary') && method === 'GET') {
        const has = (allowed: readonly string[] | undefined): boolean =>
          (allowed ?? []).some((role) => user.roles.includes(role))

        const article = MOCK_SCHEMA.collections[0]
        const articlePermissions = article?.permissions as Record<string, readonly string[]>
        const canDraftArticle =
          has(articlePermissions.create) ||
          has(articlePermissions.update) ||
          has(articlePermissions.delete) ||
          has(articlePermissions.publish)
        const canTrashArticle = has(articlePermissions.delete)
        const draftCount = MOCK_ENTRIES.filter((entry) => entry.status === 'draft').length
        const publishedCount = MOCK_ENTRIES.filter((entry) => entry.status === 'published').length

        const rows: unknown[] = [
          {
            collection: 'article',
            published: publishedCount,
            total: canDraftArticle ? MOCK_ENTRIES.length : publishedCount,
            draft: canDraftArticle ? draftCount : null,
            scheduled: canDraftArticle ? 0 : null,
            archived: canDraftArticle ? 0 : null,
            trashed: canTrashArticle ? trash.length : null,
          },
        ]

        const memo = MOCK_SCHEMA.collections[1]
        const memoPermissions = memo?.permissions as Record<string, readonly string[]>
        if (has(memoPermissions.read)) {
          rows.push({
            collection: 'secret-memo',
            published: 0,
            total: 0,
            draft: has(memoPermissions.create) ? 0 : null,
            scheduled: has(memoPermissions.create) ? 0 : null,
            archived: has(memoPermissions.create) ? 0 : null,
            trashed: has(memoPermissions.delete) ? 0 : null,
          })
        }

        return json(200, { data: rows })
      }

      // The editorial workflow's four transition routes (`schema@2.1`,
      // ADR-0027) — each its own path, mirroring the real router exactly
      // (never a second meaning for an existing verb).
      const workflowMatch =
        /\/api\/content\/([^/?]+)\/([^/?]+)\/(submit|approve|request-changes|assign-reviewer)$/u.exec(
          url,
        )
      if (workflowMatch !== null && method === 'POST') {
        const [, collection, id, action] = workflowMatch
        if (collection !== 'wf-article' || id !== wfEntry.id) {
          return json(404, { error: { code: 'CONTENT_NOT_FOUND', message: 'No entry.' } })
        }
        const permissions = MOCK_SCHEMA.collections.find(
          (c) => c.name === 'wf-article',
        )?.permissions
        const updateRoles = ((permissions?.update as { roles?: readonly string[] })?.roles ??
          []) as readonly string[]
        const publishRoles = (permissions?.publish ?? []) as readonly string[]

        if (action === 'submit') {
          if (!updateRoles.some((role) => user.roles.includes(role))) {
            return json(403, {
              error: { code: 'FORBIDDEN', message: 'Access denied: update on wf-article.' },
            })
          }
          if (wfEntry.reviewState !== 'none' && wfEntry.reviewState !== 'changes-requested') {
            return json(409, {
              error: {
                code: 'CONTENT_REVIEW_TRANSITION_INVALID',
                message: 'This entry cannot be submitted for review right now.',
              },
            })
          }
          wfEntry = {
            ...wfEntry,
            reviewState: 'pending',
            assignedReviewer: (body.reviewerId as string | undefined) ?? wfEntry.assignedReviewer,
          }
          return json(200, { data: wfEntry })
        }

        if (action === 'approve' || action === 'request-changes') {
          if (!publishRoles.some((role) => user.roles.includes(role))) {
            return json(403, {
              error: { code: 'FORBIDDEN', message: 'Access denied: publish on wf-article.' },
            })
          }
          if (wfEntry.reviewState !== 'pending') {
            return json(409, {
              error: {
                code: 'CONTENT_REVIEW_TRANSITION_INVALID',
                message: 'This entry is not waiting for review.',
              },
            })
          }
          wfEntry = {
            ...wfEntry,
            reviewState: action === 'approve' ? 'approved' : 'changes-requested',
          }
          return json(200, { data: wfEntry })
        }

        if (action === 'assign-reviewer') {
          if (!updateRoles.some((role) => user.roles.includes(role))) {
            return json(403, {
              error: { code: 'FORBIDDEN', message: 'Access denied: update on wf-article.' },
            })
          }
          wfEntry = { ...wfEntry, assignedReviewer: (body.reviewerId as string | null) ?? null }
          return json(200, { data: wfEntry })
        }
      }

      if (url.startsWith('/api/review') && method === 'GET') {
        const parsed = new URL(url, 'http://localhost')
        const scope = parsed.searchParams.get('scope') ?? 'pending'
        const item = { collection: 'wf-article', entry: wfEntry }
        const inScope =
          scope === 'pending'
            ? wfEntry.reviewState === 'pending'
            : scope === 'assigned'
              ? wfEntry.reviewState === 'pending' && wfEntry.assignedReviewer === user.id
              : wfEntry.reviewState !== 'none' && wfEntry.createdBy === user.id
        return json(200, { data: inScope ? [item] : [] })
      }

      const contentMatch = /\/api\/content\/([^/?]+)(?:\/([^/?]+))?(?:\?.*)?$/u.exec(url)
      if (contentMatch !== null) {
        const [, collection, id] = contentMatch

        if (collection === 'article' && id === undefined && method === 'GET') {
          const parsed = new URL(url, 'http://localhost')
          const trashed = parsed.searchParams.get('trashed')
          const wantsCounts = parsed.searchParams.get('counts') === '1'
          const counts = wantsCounts ? { counts: articleCounts(user.roles) } : {}

          // Seeing the trash needs `delete`, exactly as the API requires
          // (ADR-0022 keeps the five actions frozen; the trash borrows the
          // one that fills it).
          if (trashed !== null && trashed !== 'exclude') {
            const allowed = MOCK_SCHEMA.collections[0]?.permissions.delete ?? []
            if (!allowed.some((role) => user.roles.includes(role))) {
              return json(403, {
                error: { code: 'FORBIDDEN', message: 'Access denied: delete on article.' },
              })
            }
            const items = trashed === 'only' ? trash : [...MOCK_ENTRIES, ...trash]
            return json(200, { data: items, page: { hasMore: false, nextCursor: null }, ...counts })
          }

          const statusFilter = parsed.searchParams.get('status')
          const localeFilter = parsed.searchParams.get('locale')
          const items = MOCK_ENTRIES.filter(
            (entry) =>
              (statusFilter === null || entry.status === statusFilter) &&
              (localeFilter === null || entry.locale === localeFilter),
          )
          return json(200, { data: items, page: { hasMore: false, nextCursor: null }, ...counts })
        }

        if (collection === 'article' && id !== undefined && method === 'GET') {
          const entry = MOCK_ENTRIES.find((candidate) => candidate.id === id)
          if (entry !== undefined) return json(200, { data: entry })

          // Opening the entry `duplicate` just created above — see there for
          // why this is synthesised rather than stored.
          if (id.endsWith('-copy')) {
            const source = MOCK_ENTRIES.find((candidate) => candidate.id === id.slice(0, -5))
            if (source !== undefined) {
              return json(200, { data: { ...source, id, status: 'draft', version: 1 } })
            }
          }

          return json(404, {
            error: { code: 'CONTENT_NOT_FOUND', message: 'No entry with that id.' },
          })
        }

        if (collection === 'article' && id === undefined && method === 'POST') {
          const created = {
            id: 'entry-new',
            status: 'draft',
            version: 1,
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
            locale: body.locale ?? 'en',
            translationOf: body.translationOf ?? null,
            values: body.values ?? {},
            blocks: body.blocks ?? {},
          }
          return json(201, { data: created })
        }

        if (collection === 'article' && id !== undefined && method === 'PATCH') {
          const entry = MOCK_ENTRIES.find((candidate) => candidate.id === id)
          if (entry === undefined) {
            return json(404, {
              error: { code: 'CONTENT_NOT_FOUND', message: 'No entry with that id.' },
            })
          }
          // Concurrent editing (fiche 02 task 7): refused exactly like the
          // real `update()` when the caller's `expectedUpdatedAt` no longer
          // matches — absent, this behaves exactly as before.
          if (
            typeof body.expectedUpdatedAt === 'string' &&
            body.expectedUpdatedAt !== entry.updatedAt
          ) {
            return json(409, {
              error: {
                code: 'CONTENT_STALE_WRITE',
                message: `"${id}" was changed by someone else since this write was loaded.`,
                hint: 'Reload the entry, compare what changed, and reapply your edit.',
              },
            })
          }
          return json(200, {
            data: {
              ...entry,
              values: { ...entry.values, ...body.values },
              blocks: { ...entry.blocks, ...body.blocks },
            },
          })
        }

        if (collection === 'article' && id !== undefined && method === 'DELETE') {
          return new Response(null, { status: 204 })
        }

        // `note`'s own trashed-only list (fiche 07 task 1, the "All" tab
        // merging more than one collection's trash). Only what `trashed`
        // asks for — `note` has no live entries seeded, since nothing in
        // this fiche's tests needs one.
        if (collection === 'note' && id === undefined && method === 'GET') {
          const parsed = new URL(url, 'http://localhost')
          const trashed = parsed.searchParams.get('trashed')
          if (trashed !== null && trashed !== 'exclude') {
            const allowed =
              MOCK_SCHEMA.collections.find((c) => c.name === 'note')?.permissions.delete ?? []
            if (!allowed.some((role) => user.roles.includes(role))) {
              return json(403, {
                error: { code: 'FORBIDDEN', message: 'Access denied: delete on note.' },
              })
            }
            // No live `note` entries are seeded, so `only` and `include`
            // answer the same thing — there is nothing else to include.
            return json(200, { data: noteTrash, page: { hasMore: false, nextCursor: null } })
          }
          return json(200, { data: [], page: { hasMore: false, nextCursor: null } })
        }

        if (collection === 'wf-article' && id !== undefined && method === 'GET') {
          if (id !== wfEntry.id) {
            return json(404, {
              error: { code: 'CONTENT_NOT_FOUND', message: 'No entry with that id.' },
            })
          }
          return json(200, { data: wfEntry })
        }

        if (collection === 'wf-article' && id !== undefined && method === 'PATCH') {
          if (id !== wfEntry.id) {
            return json(404, {
              error: { code: 'CONTENT_NOT_FOUND', message: 'No entry with that id.' },
            })
          }
          const updateRoles = ((
            MOCK_SCHEMA.collections.find((c) => c.name === 'wf-article')?.permissions.update as {
              roles?: readonly string[]
            }
          )?.roles ?? []) as readonly string[]
          if (
            !updateRoles.some((role) => user.roles.includes(role)) ||
            wfEntry.createdBy !== user.id
          ) {
            return json(403, {
              error: { code: 'FORBIDDEN', message: 'Access denied: update on wf-article.' },
            })
          }
          wfEntry = { ...wfEntry, values: { ...wfEntry.values, ...body.values } }
          return json(200, { data: wfEntry })
        }
      }

      // A trashed `article` that always refuses `untrash` (404, the honest
      // shape of "someone already restored or purged it first") and `purge`
      // (409 `CONTENT_REFERENCED`, the real error `assertNotReferenced`
      // raises) — fiche 07 task 2's partial-failure report, checked before
      // the generic handler below so this one id never reaches it.
      //
      // Matched with a regex tolerating a trailing query string, not
      // `.endsWith()`: `content-client.ts`'s entry-returning calls (fiche 03)
      // append `?depth=0` to this same route, and a bare `.endsWith()` missed
      // it entirely — the request fell through to the generic handler below,
      // which happily untrashed/purged an entry this fixture exists
      // specifically to keep refusing. Found by the real cross-fiche
      // integration test, not a review.
      if (
        new RegExp(
          `/api/content/article/${MOCK_TRASHED_BLOCKED_ENTRY.id}/untrash(?:\\?.*)?$`,
          'u',
        ).test(url) &&
        method === 'POST'
      ) {
        return json(404, {
          error: {
            code: 'CONTENT_NOT_TRASHED',
            message: `"${MOCK_TRASHED_BLOCKED_ENTRY.id}" is not in the "article" trash.`,
          },
        })
      }
      if (
        new RegExp(
          `/api/content/article/${MOCK_TRASHED_BLOCKED_ENTRY.id}/purge(?:\\?.*)?$`,
          'u',
        ).test(url) &&
        method === 'POST'
      ) {
        return json(409, {
          error: {
            code: 'CONTENT_REFERENCED',
            message: `"${MOCK_TRASHED_BLOCKED_ENTRY.id}" cannot be removed from "article": 1 entry of "note" still reference it.`,
          },
        })
      }

      // `note`'s own untrash/purge, kept apart from `article`'s below for
      // the same reason `noteTrash` is a separate array.
      const noteTrashActionMatch = /\/api\/content\/note\/([^/?]+)\/(untrash|purge)$/u.exec(url)
      if (noteTrashActionMatch !== null && method === 'POST') {
        const [, entryId, action] = noteTrashActionMatch
        const allowed =
          MOCK_SCHEMA.collections.find((c) => c.name === 'note')?.permissions.delete ?? []
        if (!allowed.some((role) => user.roles.includes(role))) {
          return json(403, {
            error: { code: 'FORBIDDEN', message: 'Access denied: delete on note.' },
          })
        }
        const found = noteTrash.find((entry) => entry.id === entryId)
        if (found === undefined) {
          return json(404, { error: { code: 'CONTENT_NOT_FOUND', message: 'No entry.' } })
        }
        noteTrash = noteTrash.filter((entry) => entry.id !== entryId)
        if (action === 'purge') return new Response(null, { status: 204 })
        return json(200, { data: { ...found, deletedAt: null } })
      }

      // The two trash routes. Both `delete`, both refusing an actor without
      // it — and `purge` is a POST on its own path rather than a second
      // meaning for DELETE, which is exactly what the client sends.
      // `(?:\?.*)?$` rather than a bare `$`: `content-client.ts`'s `untrashEntry`
      // now asks for `?depth=0` on this route too (fiche 03 — every entry-returning
      // request does, to avoid an expanded relation corrupting the next save), and
      // a query string must not make this stub miss the route it is answering.
      const trashActionMatch =
        /\/api\/content\/([^/?]+)\/([^/?]+)\/(untrash|purge)(?:\?.*)?$/u.exec(url)
      if (trashActionMatch !== null && method === 'POST') {
        const [, , entryId, action] = trashActionMatch
        const allowed = MOCK_SCHEMA.collections[0]?.permissions.delete ?? []
        if (!allowed.some((role) => user.roles.includes(role))) {
          return json(403, {
            error: { code: 'FORBIDDEN', message: 'Access denied: delete on article.' },
          })
        }

        const found = trash.find((entry) => entry.id === entryId)
        if (found === undefined) {
          return json(404, { error: { code: 'CONTENT_NOT_FOUND', message: 'No entry.' } })
        }
        trash = trash.filter((entry) => entry.id !== entryId)

        if (action === 'purge') return new Response(null, { status: 204 })
        // Restored with the status it went in with, never demoted to a draft.
        return json(200, { data: { ...found, deletedAt: null } })
      }

      // `/api/commerce/*` (contract E, ADR-0024). Unlike every other router
      // here this one does not wrap its body in `{ data }` — it is
      // `@cogenta/commerce`'s own transport-free shape, reused verbatim by
      // `cogenta serve`. The permission map below mirrors
      // `DEFAULT_COMMERCE_ROLES` in `packages/commerce/src/admin/permissions.ts`
      // for the same reason the users mock mirrors the real router: a mock
      // that always says yes would make the screen's refusal-handling
      // untestable.
      if (url.includes('/api/commerce')) {
        const COMMERCE_ROLES: Readonly<Record<string, readonly string[]>> = {
          admin: [
            'commerce.read',
            'commerce.catalog.write',
            'commerce.order.write',
            'commerce.payment.settle',
            'commerce.order.refund',
            'commerce.invoice.issue',
          ],
          editor: ['commerce.read', 'commerce.catalog.write'],
          shopkeeper: [
            'commerce.read',
            'commerce.catalog.write',
            'commerce.order.write',
            'commerce.payment.settle',
            'commerce.invoice.issue',
          ],
          viewer: ['commerce.read'],
        }
        const hasCommercePermission = (permission: string): boolean =>
          user.roles.some((role) => (COMMERCE_ROLES[role] ?? []).includes(permission))
        const commerceRefused = (permission: string): Response | null => {
          if (auth !== `Bearer ${VALID_TOKEN}`) {
            return json(401, {
              error: {
                code: 'UNAUTHENTICATED',
                message: 'This part of the shop needs you to be signed in.',
              },
            })
          }
          if (!hasCommercePermission(permission)) {
            return json(403, {
              error: { code: 'FORBIDDEN', message: 'Your account is not allowed to do that.' },
            })
          }
          return null
        }

        const parsed = new URL(url, 'http://localhost')
        const segments = parsed.pathname
          .replace(/^.*\/api\/commerce\/?/u, '')
          .split('/')
          .filter((segment) => segment !== '')

        // permissions (fiche 19's read-only matrix)
        if (segments[0] === 'permissions' && segments.length === 1 && method === 'GET') {
          const refused = commerceRefused('commerce.read')
          if (refused !== null) return refused
          return json(200, {
            permissions: [
              'commerce.read',
              'commerce.catalog.write',
              'commerce.order.write',
              'commerce.payment.settle',
              'commerce.order.refund',
              'commerce.invoice.issue',
            ],
            roles: COMMERCE_ROLES,
          })
        }

        // ---- tax (fiche 34 task 1) --------------------------------------
        if (segments[0] === 'tax' && segments[1] === 'rules' && segments.length === 2) {
          if (method === 'GET') {
            const refused = commerceRefused('commerce.read')
            if (refused !== null) return refused
            return json(200, { rules: mockTaxRules })
          }
          if (method === 'POST') {
            const refused = commerceRefused('commerce.catalog.write')
            if (refused !== null) return refused
            mockTaxRuleCounter += 1
            const rule = {
              id: `tax-rule-${mockTaxRuleCounter}`,
              name: String(body.name),
              country: body.country === undefined ? null : String(body.country),
              region: body.region === undefined ? null : String(body.region),
              taxCategory: body.taxCategory === undefined ? 'standard' : String(body.taxCategory),
              rateBp: Number(body.rateBp),
              includedInPrice: body.includedInPrice !== false,
              priority: body.priority === undefined ? 0 : Number(body.priority),
              active: true,
              createdAt: '2026-03-01T00:00:00.000Z',
            }
            mockTaxRules.push(rule)
            return json(201, rule)
          }
        }
        if (segments[0] === 'tax' && segments[1] === 'rules' && segments.length === 3) {
          if (method === 'DELETE') {
            const refused = commerceRefused('commerce.catalog.write')
            if (refused !== null) return refused
            const index = mockTaxRules.findIndex((rule) => rule.id === segments[2])
            if (index !== -1) mockTaxRules.splice(index, 1)
            return new Response(null, { status: 204 })
          }
        }
        if (segments[0] === 'tax' && segments[1] === 'simulate' && segments.length === 2) {
          if (method === 'POST') {
            const refused = commerceRefused('commerce.read')
            if (refused !== null) return refused
            const category = body.taxCategory === undefined ? 'standard' : String(body.taxCategory)
            const country = body.country === undefined ? null : String(body.country)
            const region = body.region === undefined ? null : String(body.region)
            const candidates = mockTaxRules.filter(
              (rule) => rule.active && rule.taxCategory === category,
            )
            const specificity = (rule: (typeof mockTaxRules)[number]): number => {
              if (rule.country === null) return 0
              if (country !== null && rule.country === country) {
                return rule.region !== null && rule.region === region ? 2 : 1
              }
              return -1
            }
            const applicable = candidates.filter((rule) => specificity(rule) >= 0)
            const winner =
              applicable.length === 0
                ? null
                : applicable.reduce((best, rule) =>
                    specificity(rule) > specificity(best) ||
                    (specificity(rule) === specificity(best) && rule.priority > best.priority)
                      ? rule
                      : best,
                  )
            const amountMinor = Number(body.amountMinor)
            const rateBp = winner?.rateBp ?? 0
            const includedInPrice = winner?.includedInPrice ?? true
            const taxMinor = includedInPrice
              ? Math.round(amountMinor - (amountMinor * 10000) / (10000 + rateBp))
              : Math.round((amountMinor * rateBp) / 10000)
            return json(200, {
              rule: winner,
              outcome: { rateBp, taxMinor, includedInPrice, ruleName: winner?.name ?? null },
            })
          }
        }

        // ---- shipping (fiche 34 task 2) ---------------------------------
        if (segments[0] === 'shipping' && segments[1] === 'methods' && segments.length === 2) {
          if (method === 'GET') {
            const refused = commerceRefused('commerce.read')
            if (refused !== null) return refused
            return json(200, { methods: mockShippingMethods })
          }
          if (method === 'POST') {
            const refused = commerceRefused('commerce.catalog.write')
            if (refused !== null) return refused
            mockShippingMethodCounter += 1
            const method_ = {
              id: `shipping-method-${mockShippingMethodCounter}`,
              label: String(body.label),
              country: body.country === undefined ? null : String(body.country),
              region: body.region === undefined ? null : String(body.region),
              kind: (body.kind === undefined ? 'flat' : String(body.kind)) as
                | 'flat'
                | 'by_weight'
                | 'free',
              currency: String(body.currency),
              amountMinor: body.amountMinor === undefined ? 0 : Number(body.amountMinor),
              perKgMinor: body.perKgMinor === undefined ? 0 : Number(body.perKgMinor),
              freeOverMinor: body.freeOverMinor === undefined ? null : Number(body.freeOverMinor),
              carrier: body.carrier === undefined ? null : String(body.carrier),
              position: mockShippingMethods.length,
              active: true,
              createdAt: '2026-03-01T00:00:00.000Z',
            }
            mockShippingMethods.push(method_)
            return json(201, method_)
          }
        }
        if (segments[0] === 'shipping' && segments[1] === 'methods' && segments.length === 3) {
          if (method === 'DELETE') {
            const refused = commerceRefused('commerce.catalog.write')
            if (refused !== null) return refused
            const index = mockShippingMethods.findIndex((entry) => entry.id === segments[2])
            if (index !== -1) mockShippingMethods.splice(index, 1)
            return new Response(null, { status: 204 })
          }
        }
        if (segments[0] === 'shipping' && segments[1] === 'simulate' && segments.length === 2) {
          if (method === 'POST') {
            const refused = commerceRefused('commerce.read')
            if (refused !== null) return refused
            const currency = String(body.currency)
            const subtotalMinor = body.subtotalMinor === undefined ? 0 : Number(body.subtotalMinor)
            const quotes = mockShippingMethods
              .filter((entry) => entry.active && entry.currency === currency)
              .map((entry) => ({
                methodId: entry.id,
                label: entry.label,
                amountMinor:
                  entry.freeOverMinor !== null && subtotalMinor >= entry.freeOverMinor
                    ? 0
                    : entry.amountMinor,
                currency: entry.currency,
                carrier: entry.carrier,
              }))
            return json(200, { quotes })
          }
        }

        // ---- payment (fiche 34 task 3) -----------------------------------
        if (segments[0] === 'payment' && segments[1] === 'drivers' && segments.length === 2) {
          if (method === 'GET') {
            const refused = commerceRefused('commerce.read')
            if (refused !== null) return refused
            return json(200, {
              drivers: mockPaymentDrivers,
              testMode: mockPaymentTestMode,
              webhookUrl: mockPaymentWebhookUrl,
            })
          }
        }
        if (
          segments[0] === 'payment' &&
          segments[1] === 'drivers' &&
          segments[3] === 'test-connection' &&
          segments.length === 4
        ) {
          if (method === 'POST') {
            const refused = commerceRefused('commerce.read')
            if (refused !== null) return refused
            const name = segments[2] ?? ''
            const known = mockPaymentDrivers.some((driver) => driver.name === name)
            if (!known) {
              return json(404, {
                error: { code: 'DRIVER_UNKNOWN', message: `No payment driver named "${name}".` },
              })
            }
            return json(200, mockPaymentTestResults[name] ?? { ok: true, message: null })
          }
        }

        // products (fiche 51: search/sort/pagination, contentRef, terms, CSV)
        if (segments[0] === 'products' && segments[1] === 'export' && segments.length === 2) {
          if (method === 'GET') {
            const refused = commerceRefused('commerce.read')
            if (refused !== null) return refused
            const header =
              'handle,title,status,sku,variant,price,currency,onhand,allowbackorder,weightgrams,taxcategory,lowstockthreshold,compareprice,salestartsat,saleendsat,widthmm,heightmm,depthmm'
            const rows = mockProducts.flatMap((product) =>
              mockVariants
                .filter((variant) => variant.productId === product.id)
                .map((variant) =>
                  [
                    product.handle,
                    product.title,
                    product.status,
                    variant.sku,
                    variant.title,
                    (variant.priceMinor / 100).toFixed(2),
                    variant.currency,
                    String(variant.onHand),
                    String(variant.allowBackorder),
                    String(variant.weightGrams),
                    variant.taxCategory,
                    variant.lowStockThreshold === null ? '' : String(variant.lowStockThreshold),
                    variant.compareAtPriceMinor === null
                      ? ''
                      : (variant.compareAtPriceMinor / 100).toFixed(2),
                    variant.saleStartsAt ?? '',
                    variant.saleEndsAt ?? '',
                    variant.widthMm === null ? '' : String(variant.widthMm),
                    variant.heightMm === null ? '' : String(variant.heightMm),
                    variant.depthMm === null ? '' : String(variant.depthMm),
                  ].join(','),
                ),
            )
            return json(200, { csv: [header, ...rows].join('\r\n'), filename: 'products.csv' })
          }
        }
        if (segments[0] === 'products' && segments[1] === 'import' && segments.length === 2) {
          if (method === 'POST') {
            const refused = commerceRefused('commerce.catalog.write')
            if (refused !== null) return refused
            const csv: string = typeof body.csv === 'string' ? body.csv : ''
            const apply = body.apply === true
            const lines = csv.split(/\r?\n/u).filter((line) => line.trim() !== '')
            const header = (lines[0] ?? '').split(',').map((cell) => cell.trim().toLowerCase())
            const index = (name: string): number => header.indexOf(name)
            const rows = lines.slice(1).map((line, offset) => {
              const cells = line.split(',')
              const cell = (name: string): string => (cells[index(name)] ?? '').trim()
              const sku = cell('sku')
              const existing = mockVariants.find((candidate) => candidate.sku === sku)
              return {
                line: offset + 2,
                handle: cell('handle'),
                sku,
                title: cell('title'),
                priceMinor: Math.round(Number(cell('price')) * 100),
                currency: cell('currency') || 'EUR',
                onHand: cell('onhand') === '' ? 0 : Number(cell('onhand')),
                outcome: existing === undefined ? ('create' as const) : ('update' as const),
              }
            })
            if (!apply) {
              return json(200, {
                rows: rows.map((row) => ({
                  line: row.line,
                  handle: row.handle,
                  sku: row.sku,
                  outcome: row.outcome,
                })),
                issues: [],
                summary: {
                  create: rows.filter((r) => r.outcome === 'create').length,
                  update: rows.filter((r) => r.outcome === 'update').length,
                  duplicate: 0,
                  invalid: 0,
                },
              })
            }
            let created = 0
            let updated = 0
            for (const row of rows) {
              let product = mockProducts.find((candidate) => candidate.handle === row.handle)
              if (product === undefined) {
                mockProductCounter += 1
                product = {
                  id: `product-${mockProductCounter}`,
                  handle: row.handle,
                  title: row.title,
                  status: 'active',
                  contentRef: null,
                  imageMediaIds: [],
                  createdAt: '2026-03-01T00:00:00.000Z',
                  updatedAt: '2026-03-01T00:00:00.000Z',
                }
                mockProducts.push(product)
              }
              const existing = mockVariants.find((candidate) => candidate.sku === row.sku)
              if (existing === undefined) {
                mockVariantCounter += 1
                mockVariants.push({
                  id: `variant-${mockVariantCounter}`,
                  productId: product.id,
                  sku: row.sku,
                  title: row.title,
                  priceMinor: row.priceMinor,
                  currency: row.currency,
                  onHand: row.onHand,
                  allowBackorder: false,
                  weightGrams: 0,
                  taxCategory: 'standard',
                  position: 0,
                  lowStockThreshold: null,
                  compareAtPriceMinor: null,
                  saleStartsAt: null,
                  saleEndsAt: null,
                  widthMm: null,
                  heightMm: null,
                  depthMm: null,
                  imageMediaId: null,
                  createdAt: '2026-03-01T00:00:00.000Z',
                  updatedAt: '2026-03-01T00:00:00.000Z',
                })
                created += 1
              } else {
                existing.priceMinor = row.priceMinor
                existing.onHand = row.onHand
                updated += 1
              }
            }
            return json(200, { created, updated, skipped: 0, failed: [] })
          }
        }
        if (segments[0] === 'products' && segments[1] === 'by-content' && segments.length === 2) {
          if (method === 'GET') {
            const refused = commerceRefused('commerce.read')
            if (refused !== null) return refused
            const collection = parsed.searchParams.get('collection')
            const entryId = parsed.searchParams.get('entryId')
            const found =
              mockProducts.find(
                (candidate) =>
                  candidate.contentRef?.collection === collection &&
                  candidate.contentRef.entryId === entryId,
              ) ?? null
            return json(200, { product: found })
          }
        }
        if (segments[0] === 'products' && segments.length === 1 && method === 'GET') {
          const refused = commerceRefused('commerce.read')
          if (refused !== null) return refused
          const q = parsed.searchParams.get('q')
          const status = parsed.searchParams.get('status')
          const sort = parsed.searchParams.get('sort') ?? 'createdAt'
          const direction = parsed.searchParams.get('direction') ?? 'desc'
          const limit = Number(parsed.searchParams.get('limit') ?? '25')
          const offset = Number(parsed.searchParams.get('offset') ?? '0')
          let filtered = mockProducts.filter((product) => {
            if (status !== null && product.status !== status) return false
            if (q !== null && q !== '') {
              const needle = q.toLowerCase()
              if (
                !product.title.toLowerCase().includes(needle) &&
                !product.handle.toLowerCase().includes(needle)
              ) {
                return false
              }
            }
            return true
          })
          filtered = [...filtered].sort((a, b) => {
            const left = sort === 'title' ? a.title : sort === 'handle' ? a.handle : a.createdAt
            const right = sort === 'title' ? b.title : sort === 'handle' ? b.handle : b.createdAt
            const compared = left < right ? -1 : left > right ? 1 : 0
            return direction === 'asc' ? compared : -compared
          })
          const page = filtered.slice(offset, offset + limit + 1)
          const hasMore = page.length > limit
          return json(200, { products: hasMore ? page.slice(0, limit) : page, hasMore })
        }
        if (segments[0] === 'products' && segments.length === 1 && method === 'POST') {
          const refused = commerceRefused('commerce.catalog.write')
          if (refused !== null) return refused
          mockProductCounter += 1
          const product = {
            id: `product-${mockProductCounter}`,
            handle: String(body.handle),
            title: String(body.title),
            status: 'active' as const,
            contentRef: null,
            imageMediaIds: Array.isArray(body.imageMediaIds)
              ? (body.imageMediaIds as string[])
              : [],
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
          }
          mockProducts.push(product)
          return json(201, product)
        }
        if (segments[0] === 'products' && segments[2] === 'terms' && segments.length === 3) {
          if (method === 'PUT') {
            const refused = commerceRefused('commerce.catalog.write')
            if (refused !== null) return refused
            const productId = segments[1] ?? ''
            const taxonomy = String(body.taxonomy)
            const termIds = Array.isArray(body.termIds) ? (body.termIds as string[]) : []
            for (let i = mockProductTerms.length - 1; i >= 0; i -= 1) {
              const entry = mockProductTerms[i]
              if (
                entry !== undefined &&
                entry.productId === productId &&
                entry.taxonomy === taxonomy
              ) {
                mockProductTerms.splice(i, 1)
              }
            }
            for (const termId of termIds) mockProductTerms.push({ productId, taxonomy, termId })
            return json(200, {
              terms: mockProductTerms.filter((entry) => entry.productId === productId),
            })
          }
        }
        if (segments[0] === 'products' && segments.length === 2 && method === 'GET') {
          const refused = commerceRefused('commerce.read')
          if (refused !== null) return refused
          const product = mockProducts.find((candidate) => candidate.id === segments[1])
          if (product === undefined) {
            return json(404, {
              error: {
                code: 'COMMERCE_PRODUCT_NOT_FOUND',
                message: 'This product does not exist.',
              },
            })
          }
          return json(200, {
            product,
            variants: mockVariants.filter((variant) => variant.productId === product.id),
            terms: mockProductTerms.filter((entry) => entry.productId === product.id),
          })
        }
        if (segments[0] === 'products' && segments.length === 2 && method === 'PATCH') {
          const refused = commerceRefused('commerce.catalog.write')
          if (refused !== null) return refused
          const product = mockProducts.find((candidate) => candidate.id === segments[1])
          if (product === undefined) {
            return json(404, {
              error: {
                code: 'COMMERCE_PRODUCT_NOT_FOUND',
                message: 'This product does not exist.',
              },
            })
          }
          if (typeof body.title === 'string') product.title = body.title
          if (typeof body.handle === 'string') product.handle = body.handle
          if (body.status === 'active' || body.status === 'archived') product.status = body.status
          if ('contentRef' in body) {
            product.contentRef =
              body.contentRef === null
                ? null
                : (body.contentRef as { collection: string; entryId: string })
          }
          if ('imageMediaIds' in body) {
            product.imageMediaIds = Array.isArray(body.imageMediaIds)
              ? (body.imageMediaIds as string[])
              : []
          }
          return json(200, product)
        }
        if (segments[0] === 'products' && segments.length === 2 && method === 'DELETE') {
          const refused = commerceRefused('commerce.catalog.write')
          if (refused !== null) return refused
          const product = mockProducts.find((candidate) => candidate.id === segments[1])
          if (product !== undefined) product.status = 'archived'
          return new Response(null, { status: 204 })
        }

        // variants
        if (segments[0] === 'variants' && segments[1] === 'low-stock' && segments.length === 2) {
          if (method === 'GET') {
            const refused = commerceRefused('commerce.read')
            if (refused !== null) return refused
            return json(200, {
              variants: mockVariants.filter(
                (variant) =>
                  variant.lowStockThreshold !== null && variant.onHand <= variant.lowStockThreshold,
              ),
            })
          }
        }
        if (
          segments[0] === 'variants' &&
          segments[2] === 'stock-movements' &&
          segments.length === 3
        ) {
          if (method === 'GET') {
            const refused = commerceRefused('commerce.read')
            if (refused !== null) return refused
            return json(200, {
              movements: mockStockMovements
                .filter((movement) => movement.variantId === segments[1])
                .slice()
                .reverse(),
            })
          }
        }
        if (segments[0] === 'products' && segments[2] === 'variants' && method === 'POST') {
          const refused = commerceRefused('commerce.catalog.write')
          if (refused !== null) return refused
          mockVariantCounter += 1
          const variant = {
            id: `variant-${mockVariantCounter}`,
            productId: segments[1] ?? '',
            sku: String(body.sku),
            title: String(body.title),
            priceMinor: Number(body.priceMinor),
            currency: String(body.currency),
            onHand: typeof body.onHand === 'number' ? body.onHand : 0,
            allowBackorder: typeof body.allowBackorder === 'boolean' ? body.allowBackorder : false,
            weightGrams: typeof body.weightGrams === 'number' ? body.weightGrams : 0,
            taxCategory: typeof body.taxCategory === 'string' ? body.taxCategory : 'standard',
            position: 0,
            lowStockThreshold:
              typeof body.lowStockThreshold === 'number' ? body.lowStockThreshold : null,
            compareAtPriceMinor:
              typeof body.compareAtPriceMinor === 'number' ? body.compareAtPriceMinor : null,
            saleStartsAt: typeof body.saleStartsAt === 'string' ? body.saleStartsAt : null,
            saleEndsAt: typeof body.saleEndsAt === 'string' ? body.saleEndsAt : null,
            widthMm: typeof body.widthMm === 'number' ? body.widthMm : null,
            heightMm: typeof body.heightMm === 'number' ? body.heightMm : null,
            depthMm: typeof body.depthMm === 'number' ? body.depthMm : null,
            imageMediaId: typeof body.imageMediaId === 'string' ? body.imageMediaId : null,
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
          }
          mockVariants.push(variant)
          return json(201, variant)
        }
        if (segments[0] === 'variants' && segments.length === 2 && method === 'PATCH') {
          const refused = commerceRefused('commerce.catalog.write')
          if (refused !== null) return refused
          const variant = mockVariants.find((candidate) => candidate.id === segments[1])
          if (variant === undefined) {
            return json(404, {
              error: {
                code: 'COMMERCE_VARIANT_NOT_FOUND',
                message: 'This variant does not exist.',
              },
            })
          }
          if (typeof body.priceMinor === 'number') variant.priceMinor = body.priceMinor
          if (typeof body.sku === 'string') variant.sku = body.sku
          if (typeof body.title === 'string') variant.title = body.title
          if (typeof body.allowBackorder === 'boolean') variant.allowBackorder = body.allowBackorder
          if (typeof body.weightGrams === 'number') variant.weightGrams = body.weightGrams
          if (typeof body.taxCategory === 'string') variant.taxCategory = body.taxCategory
          if ('lowStockThreshold' in body) {
            variant.lowStockThreshold =
              typeof body.lowStockThreshold === 'number' ? body.lowStockThreshold : null
          }
          if ('compareAtPriceMinor' in body) {
            variant.compareAtPriceMinor =
              typeof body.compareAtPriceMinor === 'number' ? body.compareAtPriceMinor : null
          }
          if ('saleStartsAt' in body) {
            variant.saleStartsAt = typeof body.saleStartsAt === 'string' ? body.saleStartsAt : null
          }
          if ('saleEndsAt' in body) {
            variant.saleEndsAt = typeof body.saleEndsAt === 'string' ? body.saleEndsAt : null
          }
          if ('widthMm' in body)
            variant.widthMm = typeof body.widthMm === 'number' ? body.widthMm : null
          if ('heightMm' in body) {
            variant.heightMm = typeof body.heightMm === 'number' ? body.heightMm : null
          }
          if ('depthMm' in body)
            variant.depthMm = typeof body.depthMm === 'number' ? body.depthMm : null
          if ('imageMediaId' in body) {
            variant.imageMediaId = typeof body.imageMediaId === 'string' ? body.imageMediaId : null
          }
          return json(200, variant)
        }
        if (segments[0] === 'variants' && segments.length === 2 && method === 'DELETE') {
          const refused = commerceRefused('commerce.catalog.write')
          if (refused !== null) return refused
          const index = mockVariants.findIndex((candidate) => candidate.id === segments[1])
          if (index !== -1) mockVariants.splice(index, 1)
          return new Response(null, { status: 204 })
        }
        if (segments[0] === 'variants' && segments[2] === 'stock' && method === 'PUT') {
          const refused = commerceRefused('commerce.catalog.write')
          if (refused !== null) return refused
          const variant = mockVariants.find((candidate) => candidate.id === segments[1])
          if (variant === undefined) {
            return json(404, {
              error: {
                code: 'COMMERCE_VARIANT_NOT_FOUND',
                message: 'This variant does not exist.',
              },
            })
          }
          const onHand = Number(body.onHand)
          const delta = onHand - variant.onHand
          variant.onHand = onHand
          if (delta !== 0) {
            mockStockMovementCounter += 1
            mockStockMovements.push({
              id: `movement-${mockStockMovementCounter}`,
              variantId: variant.id,
              delta,
              balanceAfter: onHand,
              reason: 'stock_take',
              actorId: null,
              referenceId: null,
              note: null,
              createdAt: '2026-03-01T00:00:00.000Z',
            })
          }
          return json(200, variant)
        }

        // orders
        // Checked before the length-1/length-2 routes below, same reasoning
        // as the real router: "export.csv" is not an order id.
        if (segments[0] === 'orders' && segments[1] === 'export.csv' && method === 'GET') {
          const refused = commerceRefused('commerce.read')
          if (refused !== null) return refused
          const rows = mockOrders.map((order) => [
            order.reference,
            order.placedAt,
            order.status,
            order.email,
            order.currency,
            String(order.subtotalMinor),
            String(order.discountMinor),
            String(order.shippingMinor),
            String(order.taxMinor),
            String(order.totalMinor),
            '',
          ])
          const csv = [
            'reference,placed_at,status,email,currency,subtotal_minor,discount_minor,shipping_minor,tax_minor,total_minor,invoice_number',
            ...rows.map((row) => row.join(',')),
          ].join('\r\n')
          return new Response(csv, { status: 200, headers: { 'content-type': 'text/csv' } })
        }
        if (segments[0] === 'orders' && segments.length === 1 && method === 'GET') {
          const refused = commerceRefused('commerce.read')
          if (refused !== null) return refused
          const status = parsed.searchParams.get('status')
          const from = parsed.searchParams.get('from')
          const to = parsed.searchParams.get('to')
          // Audit T-COM-03: mirrors the real router's `q` (reference/e-mail,
          // case-insensitive substring) — the screen's new search box has
          // something real to filter against in a mocked test, the same way
          // `status`/`from`/`to` already did.
          const q = parsed.searchParams.get('q')?.trim().toLowerCase()
          let list = status === null ? mockOrders : mockOrders.filter((o) => o.status === status)
          if (from !== null) list = list.filter((o) => o.placedAt >= from)
          if (to !== null) list = list.filter((o) => o.placedAt <= to)
          if (q !== undefined && q !== '') {
            list = list.filter(
              (o) => o.reference.toLowerCase().includes(q) || o.email.toLowerCase().includes(q),
            )
          }
          return json(200, { orders: list })
        }
        // A shopkeeper-entered order (fiche 52 task 5). The mock keeps this
        // deliberately simple: it always succeeds and always finds the
        // seeded variant, since the real placement logic is proven against a
        // real database in `@cogenta/commerce`'s own tests, not re-proven here.
        if (segments[0] === 'orders' && segments.length === 1 && method === 'POST') {
          const refused = commerceRefused('commerce.order.write')
          if (refused !== null) return refused
          const id = `order-manual-${mockOrders.length + 1}`
          const lines = Array.isArray(body.lines) ? body.lines : []
          const totalMinor = lines.reduce(
            (sum: number, line: { quantity?: unknown }) =>
              sum + (typeof line.quantity === 'number' ? line.quantity : 1) * 4500,
            0,
          )
          const address =
            body.shippingAddress !== null && typeof body.shippingAddress === 'object'
              ? (body.shippingAddress as Record<string, unknown>)
              : null
          const order = {
            id,
            reference: `ORD-MANUAL-${mockOrders.length + 1}`,
            customerId: null,
            email: typeof body.email === 'string' ? body.email : 'unknown@example.com',
            status: 'pending' as string,
            currency: typeof body.currency === 'string' ? body.currency : 'EUR',
            subtotalMinor: totalMinor,
            discountMinor: 0,
            shippingMinor: 0,
            taxMinor: 0,
            totalMinor,
            couponCode: null,
            shippingAddressLine1: address !== null ? (address.line1 as string) : null,
            shippingAddressLine2: null,
            shippingCity: address !== null ? (address.city as string) : null,
            shippingPostalCode: address !== null ? (address.postalCode as string) : null,
            shippingRecipient: null,
            shippingPhone: null,
            trackingCarrier: null as string | null,
            trackingNumber: null as string | null,
            trackingUrl: null as string | null,
            shippedAt: null as string | null,
            placedAt: '2026-03-03T00:00:00.000Z',
            updatedAt: '2026-03-03T00:00:00.000Z',
            lines: lines.map(
              (line: { variantId?: unknown; quantity?: unknown }, index: number) => ({
                id: `manual-line-${index}`,
                variantId: typeof line.variantId === 'string' ? line.variantId : 'unknown',
                sku: 'MANUAL',
                title: 'Manual line',
                quantity: typeof line.quantity === 'number' ? line.quantity : 1,
                unitPriceMinor: 4500,
                subtotalMinor: 4500,
                discountMinor: 0,
                taxMinor: 0,
                totalMinor: 4500,
                position: index,
              }),
            ),
          }
          mockOrders.push(order)
          return json(201, { kind: 'placed', order })
        }
        if (segments[0] === 'orders' && segments.length === 2 && method === 'GET') {
          const refused = commerceRefused('commerce.read')
          if (refused !== null) return refused
          const order = mockOrders.find((candidate) => candidate.id === segments[1])
          if (order === undefined) {
            return json(404, {
              error: { code: 'COMMERCE_ORDER_NOT_FOUND', message: 'This order does not exist.' },
            })
          }
          return json(200, {
            order,
            history: mockOrderHistory.filter((event) => event.orderId === order.id),
            payments: mockPayments.filter((payment) => payment.orderId === order.id),
          })
        }
        if (segments[0] === 'orders' && segments.length === 2 && method === 'PATCH') {
          const refused = commerceRefused('commerce.order.write')
          if (refused !== null) return refused
          const order = mockOrders.find((candidate) => candidate.id === segments[1])
          if (order === undefined) {
            return json(404, {
              error: { code: 'COMMERCE_ORDER_NOT_FOUND', message: 'This order does not exist.' },
            })
          }
          if (order.status !== 'pending') {
            return json(409, {
              error: {
                code: 'COMMERCE_ORDER_LOCKED',
                message: 'This order can no longer be edited.',
              },
            })
          }
          if (typeof body.email === 'string') order.email = body.email
          const address =
            body.shippingAddress !== null && typeof body.shippingAddress === 'object'
              ? (body.shippingAddress as Record<string, unknown>)
              : null
          if (address !== null) {
            order.shippingAddressLine1 = (address.line1 as string) ?? null
            order.shippingAddressLine2 = (address.line2 as string) ?? null
            order.shippingCity = (address.city as string) ?? null
            order.shippingPostalCode = (address.postalCode as string) ?? null
            order.shippingRecipient = (address.recipient as string) ?? null
            order.shippingPhone = (address.phone as string) ?? null
          }
          return json(200, order)
        }
        if (segments[0] === 'orders' && segments[2] === 'status' && method === 'PUT') {
          const refused = commerceRefused('commerce.order.write')
          if (refused !== null) return refused
          const order = mockOrders.find((candidate) => candidate.id === segments[1])
          if (order === undefined) {
            return json(404, {
              error: { code: 'COMMERCE_ORDER_NOT_FOUND', message: 'This order does not exist.' },
            })
          }
          const from = order.status
          order.status = String(body.status)
          mockOrderHistory.push({
            id: `event-${mockOrderHistory.length + 1}`,
            orderId: order.id,
            at: '2026-03-02T00:00:00.000Z',
            kind: 'status_changed',
            fromStatus: from,
            toStatus: order.status,
            actorId: user.id,
            note: typeof body.note === 'string' ? body.note : null,
          })
          return json(200, order)
        }
        if (segments[0] === 'orders' && segments[2] === 'tracking' && method === 'PUT') {
          const refused = commerceRefused('commerce.order.write')
          if (refused !== null) return refused
          const order = mockOrders.find((candidate) => candidate.id === segments[1])
          if (order === undefined) {
            return json(404, {
              error: { code: 'COMMERCE_ORDER_NOT_FOUND', message: 'This order does not exist.' },
            })
          }
          order.trackingCarrier = typeof body.carrier === 'string' ? body.carrier : null
          order.trackingNumber = typeof body.number === 'string' ? body.number : null
          order.trackingUrl = typeof body.url === 'string' ? body.url : null
          if (order.status === 'paid') {
            order.status = 'shipped'
            order.shippedAt = '2026-03-04T00:00:00.000Z'
            mockOrderHistory.push({
              id: `event-${mockOrderHistory.length + 1}`,
              orderId: order.id,
              at: '2026-03-04T00:00:00.000Z',
              kind: 'status_changed',
              fromStatus: 'paid',
              toStatus: 'shipped',
              actorId: user.id,
              note: 'Shipped, tracking attached.',
            })
            mockOrderEmails.push({
              id: `email-${mockOrderEmails.length + 1}`,
              orderId: order.id,
              kind: 'shipment',
              toEmail: order.email,
              status: 'sent',
              attempts: 1,
              lastError: null,
              createdAt: '2026-03-04T00:00:00.000Z',
              sentAt: '2026-03-04T00:00:00.000Z',
            })
          }
          return json(200, order)
        }
        if (segments[0] === 'orders' && segments[2] === 'emails' && method === 'GET') {
          const refused = commerceRefused('commerce.read')
          if (refused !== null) return refused
          return json(200, {
            emails: mockOrderEmails.filter((email) => email.orderId === segments[1]),
          })
        }
        if (segments[0] === 'orders' && segments[2] === 'credit-notes' && method === 'GET') {
          const refused = commerceRefused('commerce.read')
          if (refused !== null) return refused
          return json(200, { creditNotes: [] })
        }

        // payments
        if (segments[0] === 'payments' && segments[2] === 'settle' && method === 'POST') {
          const refused = commerceRefused('commerce.payment.settle')
          if (refused !== null) return refused
          const payment = mockPayments.find((candidate) => candidate.id === segments[1])
          if (payment === undefined) {
            return json(404, {
              error: {
                code: 'COMMERCE_PAYMENT_NOT_FOUND',
                message: 'This payment does not exist.',
              },
            })
          }
          payment.status = 'paid'
          return json(200, payment)
        }
        if (segments[0] === 'payments' && segments[2] === 'refunds' && method === 'GET') {
          const refused = commerceRefused('commerce.read')
          if (refused !== null) return refused
          return json(200, {
            refunds: mockRefunds.filter((refund) => refund.paymentId === segments[1]),
          })
        }
        if (segments[0] === 'payments' && segments[2] === 'refund' && method === 'POST') {
          const refused = commerceRefused('commerce.order.refund')
          if (refused !== null) return refused
          const payment = mockPayments.find((candidate) => candidate.id === segments[1])
          if (payment === undefined) {
            return json(404, {
              error: {
                code: 'COMMERCE_PAYMENT_NOT_FOUND',
                message: 'This payment does not exist.',
              },
            })
          }
          // "Motif obligatoire" (fiche 52 task 6) — the mock enforces the
          // same requirement the real router does.
          if (typeof body.reason !== 'string' || body.reason.trim() === '') {
            return json(400, {
              error: {
                code: 'COMMERCE_AMOUNT_INVALID',
                message: '"reason" is required and must be a non-empty string.',
              },
            })
          }
          const amountMinor = typeof body.amountMinor === 'number' ? body.amountMinor : 0
          mockRefundCounter += 1
          const refund = {
            id: `refund-${mockRefundCounter}`,
            paymentId: payment.id,
            orderId: payment.orderId,
            status: 'succeeded',
            amountMinor,
            currency: payment.currency,
            reason: body.reason,
            createdAt: '2026-03-05T00:00:00.000Z',
          }
          mockRefunds.push(refund)
          const refunded = mockRefunds
            .filter((r) => r.paymentId === payment.id)
            .reduce((sum, r) => sum + r.amountMinor, 0)
          payment.status = refunded >= payment.amountMinor ? 'refunded' : 'partially_refunded'
          return json(200, { refund, creditNote: null })
        }

        // customers
        if (segments[0] === 'customers' && segments.length === 1 && method === 'GET') {
          const refused = commerceRefused('commerce.read')
          if (refused !== null) return refused
          const q = parsed.searchParams.get('q')?.toLowerCase()
          const list =
            q === undefined || q === ''
              ? mockCustomers
              : mockCustomers.filter(
                  (c) =>
                    c.email.toLowerCase().includes(q) || (c.name ?? '').toLowerCase().includes(q),
                )
          return json(200, { customers: list })
        }
        if (segments[0] === 'customers' && segments.length === 2 && method === 'GET') {
          const refused = commerceRefused('commerce.read')
          if (refused !== null) return refused
          const customer = mockCustomers.find((c) => c.id === segments[1])
          if (customer === undefined) {
            return json(404, {
              error: {
                code: 'COMMERCE_CUSTOMER_NOT_FOUND',
                message: 'This customer does not exist.',
              },
            })
          }
          const orders = mockOrders.filter((o) => o.customerId === customer.id)
          const totalSpentMinor = orders
            .filter((o) => o.status !== 'cancelled' && o.status !== 'refunded')
            .reduce((sum, o) => sum + o.totalMinor, 0)
          return json(200, {
            customer,
            orders,
            totalSpentMinor,
            currency: orders[0]?.currency ?? null,
            subscriptions: mockSubscriptions.filter((s) => s.customerId === customer.id),
          })
        }
        if (segments[0] === 'customers' && segments[2] === 'export' && method === 'POST') {
          const refused = commerceRefused('commerce.read')
          if (refused !== null) return refused
          const customer = mockCustomers.find((c) => c.id === segments[1])
          if (customer === undefined) {
            return json(404, {
              error: {
                code: 'COMMERCE_CUSTOMER_NOT_FOUND',
                message: 'This customer does not exist.',
              },
            })
          }
          return json(200, {
            customer,
            orders: mockOrders.filter((o) => o.customerId === customer.id),
            totalSpentMinor: 0,
            currency: null,
            subscriptions: [],
          })
        }
        if (segments[0] === 'customers' && segments[2] === 'anonymize' && method === 'POST') {
          const refused = commerceRefused('commerce.order.write')
          if (refused !== null) return refused
          const customer = mockCustomers.find((c) => c.id === segments[1])
          if (customer === undefined) {
            return json(404, {
              error: {
                code: 'COMMERCE_CUSTOMER_NOT_FOUND',
                message: 'This customer does not exist.',
              },
            })
          }
          customer.email = `anon-${customer.id}@deleted.invalid`
          customer.name = null
          return json(200, customer)
        }

        // coupons
        if (segments[0] === 'coupons' && segments[1] === 'metrics' && method === 'GET') {
          const refused = commerceRefused('commerce.read')
          if (refused !== null) return refused
          return json(200, {
            activeCoupons: mockCoupons.filter((c) => c.active).length,
            totalRedemptions: mockCoupons.reduce((sum, c) => sum + c.redemptions, 0),
            discountGivenMinor: [],
            revenueMinor: [],
          })
        }
        if (segments[0] === 'coupons' && segments.length === 1 && method === 'GET') {
          const refused = commerceRefused('commerce.read')
          if (refused !== null) return refused
          return json(200, { coupons: mockCoupons })
        }
        if (segments[0] === 'coupons' && segments.length === 1 && method === 'POST') {
          const refused = commerceRefused('commerce.catalog.write')
          if (refused !== null) return refused
          const coupon: MockCoupon = {
            code: String(body.code).toUpperCase(),
            kind: body.kind as MockCoupon['kind'],
            value: typeof body.value === 'number' ? body.value : 0,
            currency: typeof body.currency === 'string' ? body.currency : null,
            minSubtotalMinor: typeof body.minSubtotalMinor === 'number' ? body.minSubtotalMinor : 0,
            startsAt: typeof body.startsAt === 'string' ? body.startsAt : null,
            endsAt: typeof body.endsAt === 'string' ? body.endsAt : null,
            maxRedemptions: typeof body.maxRedemptions === 'number' ? body.maxRedemptions : null,
            redemptions: 0,
            maxRedemptionsPerCustomer:
              typeof body.maxRedemptionsPerCustomer === 'number'
                ? body.maxRedemptionsPerCustomer
                : null,
            restrictedProductIds: Array.isArray(body.restrictedProductIds)
              ? (body.restrictedProductIds as string[])
              : [],
            active: true,
            createdAt: '2026-03-01T00:00:00.000Z',
          }
          mockCoupons.push(coupon)
          return json(201, coupon)
        }
        if (segments[0] === 'coupons' && segments[2] === 'deactivate' && method === 'POST') {
          const refused = commerceRefused('commerce.catalog.write')
          if (refused !== null) return refused
          const coupon = mockCoupons.find((candidate) => candidate.code === segments[1])
          if (coupon !== undefined) coupon.active = false
          return new Response(null, { status: 204 })
        }

        // subscriptions
        if (segments[0] === 'subscriptions' && segments[1] === 'metrics' && method === 'GET') {
          const refused = commerceRefused('commerce.read')
          if (refused !== null) return refused
          return json(200, {
            active: mockSubscriptions.filter((s) => s.status === 'active').length,
            pastDue: mockSubscriptions.filter((s) => s.status === 'past_due').length,
            paused: mockSubscriptions.filter((s) => s.status === 'paused').length,
            cancelled: mockSubscriptions.filter((s) => s.status === 'cancelled').length,
            mrrMinor: [],
            churnRate: 0,
          })
        }
        if (segments[0] === 'subscriptions' && segments.length === 1 && method === 'GET') {
          const refused = commerceRefused('commerce.read')
          if (refused !== null) return refused
          const status = parsed.searchParams.get('status')
          return json(200, {
            subscriptions:
              status === null
                ? mockSubscriptions
                : mockSubscriptions.filter((s) => s.status === status),
          })
        }
        if (segments[0] === 'subscriptions' && segments.length === 2 && method === 'GET') {
          const refused = commerceRefused('commerce.read')
          if (refused !== null) return refused
          const subscription = mockSubscriptions.find((candidate) => candidate.id === segments[1])
          if (subscription === undefined) {
            return json(404, {
              error: {
                code: 'COMMERCE_SUBSCRIPTION_NOT_FOUND',
                message: 'This subscription does not exist.',
              },
            })
          }
          const cycles: MockSubscriptionCycle[] = mockSubscriptionCycles.filter(
            (c) => c.subscriptionId === subscription.id,
          )
          return json(200, { subscription, cycles, dunning: null })
        }
        if (segments[0] === 'subscriptions' && segments[2] === 'pause' && method === 'POST') {
          const refused = commerceRefused('commerce.order.write')
          if (refused !== null) return refused
          const subscription = mockSubscriptions.find((candidate) => candidate.id === segments[1])
          if (subscription === undefined) {
            return json(404, {
              error: {
                code: 'COMMERCE_SUBSCRIPTION_NOT_FOUND',
                message: 'This subscription does not exist.',
              },
            })
          }
          subscription.status = 'paused'
          return json(200, subscription)
        }
        if (segments[0] === 'subscriptions' && segments[2] === 'resume' && method === 'POST') {
          const refused = commerceRefused('commerce.order.write')
          if (refused !== null) return refused
          const subscription = mockSubscriptions.find((candidate) => candidate.id === segments[1])
          if (subscription === undefined) {
            return json(404, {
              error: {
                code: 'COMMERCE_SUBSCRIPTION_NOT_FOUND',
                message: 'This subscription does not exist.',
              },
            })
          }
          subscription.status = 'active'
          return json(200, subscription)
        }
        if (segments[0] === 'subscriptions' && segments[2] === 'cancel' && method === 'POST') {
          const refused = commerceRefused('commerce.order.write')
          if (refused !== null) return refused
          const subscription = mockSubscriptions.find((candidate) => candidate.id === segments[1])
          if (subscription === undefined) {
            return json(404, {
              error: {
                code: 'COMMERCE_SUBSCRIPTION_NOT_FOUND',
                message: 'This subscription does not exist.',
              },
            })
          }
          subscription.status = 'cancelled'
          subscription.cancelledAt = '2026-03-02T00:00:00.000Z'
          return json(200, subscription)
        }
        if (segments[0] === 'subscriptions' && segments[2] === 'change-plan' && method === 'POST') {
          const refused = commerceRefused('commerce.order.write')
          if (refused !== null) return refused
          const subscription = mockSubscriptions.find((candidate) => candidate.id === segments[1])
          if (subscription === undefined) {
            return json(404, {
              error: {
                code: 'COMMERCE_SUBSCRIPTION_NOT_FOUND',
                message: 'This subscription does not exist.',
              },
            })
          }
          subscription.variantId = String(body.variantId)
          return json(200, { subscription, prorationMinor: 0, prorationOrderId: null })
        }

        // The preview route (fiche 54 task 2) never depends on a seller being
        // configured or on an invoice existing — it renders straight from an
        // order, real or, for this mock, any id at all.
        if (segments[0] === 'orders' && segments[2] === 'invoice' && segments[3] === 'preview') {
          const refused = commerceRefused('commerce.read')
          if (refused !== null) return refused
          return new Response(
            new Blob(['%PDF-1.4 fake preview bytes'], { type: 'application/pdf' }),
            {
              status: 200,
            },
          )
        }

        // invoices — this mock has no seller configured, so an order is never
        // invoiced: the screen's "not issued yet" and "not configured" paths
        // share the same 404, exactly like the real router.
        if (segments[0] === 'orders' && segments[2] === 'invoice' && segments[3] === 'pdf') {
          return json(404, {
            error: { code: 'COMMERCE_INVOICE_NOT_FOUND', message: 'This invoice does not exist.' },
          })
        }
        if (segments[0] === 'orders' && segments[2] === 'invoice' && segments.length === 3) {
          const refused = commerceRefused('commerce.read')
          if (refused !== null) return refused
          return json(404, {
            error: { code: 'COMMERCE_INVOICE_NOT_FOUND', message: 'This invoice does not exist.' },
          })
        }

        return json(405, { error: { code: 'INTERNAL', message: 'No such route.' } })
      }

      // `/api/redirects/patterns` — prefix redirects (fiche 12 task 4). Checked
      // before the plain `/api/redirects` block below, since that one matches
      // on `.includes('/api/redirects')` and would otherwise also catch this.
      if (url.includes('/api/redirects/patterns')) {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: { code: 'FORBIDDEN', message: 'Access denied: redirects are admin-only.' },
          })
        }
        if (method === 'GET') return json(200, { data: redirectPatterns })
        if (method === 'POST') {
          if (typeof body.fromPrefix !== 'string' || typeof body.toPrefix !== 'string') {
            return json(400, {
              error: {
                code: 'CONTENT_ROUTE_INVALID',
                message: 'A prefix redirect needs "fromPrefix" and "toPrefix".',
              },
            })
          }
          patternCounter += 1
          const created = {
            id: `pattern-${patternCounter}`,
            fromPrefix: body.fromPrefix.endsWith('*')
              ? body.fromPrefix.slice(0, -1)
              : body.fromPrefix,
            toPrefix: body.toPrefix.endsWith('*') ? body.toPrefix.slice(0, -1) : body.toPrefix,
            status: (body.status === 302 ? 302 : 301) as 301 | 302,
            createdAt: Date.parse('2026-03-01T00:00:00.000Z'),
          }
          redirectPatterns = redirectPatterns.filter((p) => p.fromPrefix !== created.fromPrefix)
          redirectPatterns.push(created)
          return json(201, { data: created })
        }
        if (method === 'DELETE') {
          const parsed = new URL(url, 'http://localhost')
          const fromPrefix = parsed.searchParams.get('fromPrefix')
          const before = redirectPatterns.length
          redirectPatterns = redirectPatterns.filter(
            (p) => `${p.fromPrefix}*` !== fromPrefix && p.fromPrefix !== fromPrefix,
          )
          if (redirectPatterns.length === before) {
            return json(404, {
              error: { code: 'REDIRECT_UNKNOWN', message: `No pattern leaves "${fromPrefix}".` },
            })
          }
          return new Response(null, { status: 204 })
        }
      }

      // `/api/redirects/export` and `/api/redirects/import` — CSV (fiche 12
      // task 4), also checked before the plain block for the same reason.
      if (url.includes('/api/redirects/export') && method === 'GET') {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: { code: 'FORBIDDEN', message: 'Access denied: redirects are admin-only.' },
          })
        }
        const lines = [
          'from,to,status,reason',
          ...redirects.map(
            (r) => `${r.from},${r.status === 410 ? '' : r.to},${r.status},${r.reason}`,
          ),
        ]
        return json(200, { data: { csv: `${lines.join('\r\n')}\r\n`, filename: 'redirects.csv' } })
      }

      if (url.includes('/api/redirects/import') && method === 'POST') {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: { code: 'FORBIDDEN', message: 'Access denied: redirects are admin-only.' },
          })
        }
        const csv = typeof body.csv === 'string' ? (body.csv as string) : ''
        const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== '')
        const [header, ...dataLines] = lines
        const columns = (header ?? '').split(',').map((c) => c.trim().toLowerCase())
        const fromIndex = columns.indexOf('from')
        const toIndex = columns.indexOf('to')
        const statusIndex = columns.indexOf('status')
        const rows = dataLines.map((line, index) => {
          const cells = line.split(',')
          const from = (cells[fromIndex] ?? '').trim()
          const to = (cells[toIndex] ?? '').trim()
          const status = statusIndex === -1 ? 301 : Number((cells[statusIndex] ?? '301').trim())
          const existing = redirects.find((r) => r.from === from)
          const outcome = existing === undefined ? 'create' : 'update'
          return { line: index + 2, from, to, status, outcome }
        })
        const apply = body.apply === true
        if (!apply) {
          return json(200, {
            data: {
              rows,
              issues: [],
              summary: {
                create: rows.filter((r) => r.outcome === 'create').length,
                update: rows.filter((r) => r.outcome === 'update').length,
                unchanged: 0,
                duplicate: 0,
                loop: 0,
                invalid: 0,
              },
            },
          })
        }
        let created = 0
        for (const row of rows) {
          redirects = redirects.filter((r) => r.from !== row.from)
          redirectCounter += 1
          redirects.push({
            id: `redirect-${redirectCounter}`,
            from: row.from,
            to: row.to,
            status: row.status as 301 | 302 | 307 | 308 | 410,
            collection: null,
            entryId: null,
            locale: null,
            reason: 'import',
            createdAt: Date.parse('2026-03-01T00:00:00.000Z'),
          })
          created += 1
        }
        return json(200, { data: { created, updated: 0, skipped: 0, failed: [] } })
      }

      // `/api/not-found` — the 404 log (fiche 12 task 1).
      if (url.includes('/api/not-found')) {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: {
              code: 'FORBIDDEN',
              message: 'Access denied: the not-found log is admin-only.',
            },
          })
        }
        if (method === 'GET') {
          return json(200, {
            data: [...notFoundEntries].sort((a, b) => b.hits - a.hits),
          })
        }
        if (method === 'DELETE') {
          const parsed = new URL(url, 'http://localhost')
          const path = parsed.searchParams.get('path')
          const before = notFoundEntries.length
          notFoundEntries = notFoundEntries.filter((entry) => entry.path !== path)
          if (notFoundEntries.length === before) {
            return json(404, {
              error: {
                code: 'CONTENT_NOT_FOUND',
                message: `"${path}" is not in the not-found log.`,
              },
            })
          }
          return new Response(null, { status: 204 })
        }
      }

      // `/api/role-permissions` (fiche 63, ADR-0028) — admin-only on every
      // method, like the real router. GET lists every override; PUT writes
      // one; DELETE reverts one target/action back to the schema file.
      if (url.includes('/api/role-permissions')) {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: {
              code: 'FORBIDDEN',
              message: 'Access denied: role permission overrides can only be written by admin.',
            },
          })
        }

        if (method === 'GET') {
          return json(200, { data: rolePermissionOverrides })
        }

        if (method === 'PUT') {
          const targetType = body.targetType as 'collection' | 'taxonomy'
          const targetName = body.targetName as string
          const action = body.action as 'read' | 'create' | 'update' | 'delete' | 'publish'
          const roles = (body.roles ?? []) as string[]
          const own = (body.own as boolean | undefined) ?? false
          rolePermissionOverrides = rolePermissionOverrides.filter(
            (row) =>
              !(
                row.targetType === targetType &&
                row.targetName === targetName &&
                row.action === action
              ),
          )
          const record = {
            targetType,
            targetName,
            action,
            roles,
            own,
            updatedAt: '2026-08-26T00:00:00.000Z',
            updatedBy: user.id,
          }
          rolePermissionOverrides.push(record)
          return json(200, { data: record })
        }

        if (method === 'DELETE') {
          const parsed = new URL(url, 'http://localhost')
          const segments = parsed.pathname
            .replace(/^.*\/api\/role-permissions\/?/u, '')
            .split('/')
            .filter((segment) => segment !== '')
          const [targetType, targetName, action] = segments
          const before = rolePermissionOverrides.length
          rolePermissionOverrides = rolePermissionOverrides.filter(
            (row) =>
              !(
                row.targetType === targetType &&
                row.targetName === targetName &&
                row.action === action
              ),
          )
          return json(200, { data: { removed: rolePermissionOverrides.length !== before } })
        }
      }

      // `/api/redirects` — admin-only on every method, like the real router.
      if (url.includes('/api/redirects')) {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: { code: 'FORBIDDEN', message: 'Access denied: redirects are admin-only.' },
          })
        }

        if (method === 'GET') {
          const parsed = new URL(url, 'http://localhost')
          const q = parsed.searchParams.get('q')?.toLowerCase()
          const filtered =
            q === undefined || q === ''
              ? redirects
              : redirects.filter(
                  (r) => r.from.toLowerCase().includes(q) || r.to.toLowerCase().includes(q),
                )
          return json(200, { data: filtered, total: filtered.length })
        }

        if (method === 'POST') {
          if (
            typeof body.from !== 'string' ||
            (body.status !== 410 && typeof body.to !== 'string')
          ) {
            return json(400, {
              error: {
                code: 'CONTENT_ROUTE_INVALID',
                message: 'A redirect needs "from" and "to" unless its status is 410.',
              },
            })
          }
          if (body.from === body.to) {
            return json(409, {
              error: {
                code: 'CONTENT_REDIRECT_LOOP',
                message: 'A path cannot redirect to itself.',
              },
            })
          }
          redirectCounter += 1
          const status = ([301, 302, 307, 308, 410].includes(body.status) ? body.status : 301) as
            | 301
            | 302
            | 307
            | 308
            | 410
          const created = {
            id: `redirect-${redirectCounter}`,
            from: body.from as string,
            to: status === 410 ? (body.from as string) : (body.to as string),
            status,
            collection: null,
            entryId: null,
            locale: null,
            reason: 'manual' as const,
            createdAt: Date.parse('2026-03-01T00:00:00.000Z'),
          }
          redirects.push(created)
          return json(201, { data: created })
        }

        if (method === 'PATCH') {
          const parsed = new URL(url, 'http://localhost')
          const from = parsed.searchParams.get('from')
          const existing = redirects.find((r) => r.from === from)
          if (existing === undefined) {
            return json(404, {
              error: { code: 'REDIRECT_UNKNOWN', message: `No redirect leaves "${from}".` },
            })
          }
          if (typeof body.to === 'string') existing.to = body.to
          if (typeof body.status === 'number') existing.status = body.status
          return json(200, { data: existing })
        }

        if (method === 'DELETE') {
          const parsed = new URL(url, 'http://localhost')
          const from = parsed.searchParams.get('from')
          const before = redirects.length
          redirects = redirects.filter((redirect) => redirect.from !== from)
          if (redirects.length === before) {
            return json(404, {
              error: { code: 'REDIRECT_UNKNOWN', message: `No redirect leaves "${from}".` },
            })
          }
          return new Response(null, { status: 204 })
        }
      }

      // `GET /api/security-status` and `GET /api/webhooks-status` — read-only
      // mirrors of the config file, admin-only.
      if (url.endsWith('/api/security-status') && method === 'GET') {
        if (!user.roles.includes('admin')) {
          return json(403, { error: { code: 'FORBIDDEN', message: 'Access denied.' } })
        }
        return json(200, {
          data: {
            cors: {
              enabled: false,
              origins: [],
              methods: ['GET', 'POST', 'PATCH', 'DELETE'],
              headers: ['content-type', 'authorization'],
              credentials: false,
              maxAge: 600,
            },
            csp: null,
            hsts: { enabled: false, maxAge: 0, includeSubDomains: false },
            pageMaxAge: 60,
          },
        })
      }

      if (url.endsWith('/api/webhooks-status') && method === 'GET') {
        if (!user.roles.includes('admin')) {
          return json(403, { error: { code: 'FORBIDDEN', message: 'Access denied.' } })
        }
        return json(200, {
          data: options.webhooksStatus ?? {
            endpoints: [],
            signed: false,
            disabledForMissingSecret: false,
          },
        })
      }

      // `GET /api/trash-status` (fiche 07 task 5) — admin-only, same as the
      // two above. `'lastRunAt' in` rather than `??`: a test asserting the
      // "no sweep yet" wording needs to pass an explicit `null`, which `??`
      // would otherwise treat the same as "not provided".
      if (url.endsWith('/api/trash-status') && method === 'GET') {
        if (!user.roles.includes('admin')) {
          return json(403, { error: { code: 'FORBIDDEN', message: 'Access denied.' } })
        }
        const override = options.trashStatus
        return json(200, {
          data: {
            retainDaysByCollection: override?.retainDaysByCollection ?? { article: 30, note: 7 },
            lastRunAt:
              override !== undefined && 'lastRunAt' in override
                ? override.lastRunAt
                : '2026-03-05T00:10:00.000Z',
            lastPurged:
              override !== undefined && 'lastPurged' in override ? override.lastPurged : 0,
          },
        })
      }

      // `GET /api/seo/diagnostics` — fiche 13, admin-only, healthy-and-empty by default.
      if (url.endsWith('/api/seo/diagnostics') && method === 'GET') {
        if (!user.roles.includes('admin')) {
          return json(403, { error: { code: 'FORBIDDEN', message: 'Access denied.' } })
        }
        const diagnostics = options.seoDiagnostics
        return json(200, {
          data: {
            generatedAt: diagnostics?.generatedAt ?? '2026-01-01T00:00:00.000Z',
            sitemap: diagnostics?.sitemap ?? { totalUrls: 0, collections: [] },
            robots: diagnostics?.robots ?? {
              content: 'User-agent: *\nAllow: /\n',
              allowIndexing: true,
              disallowsEverything: false,
            },
            content: diagnostics?.content ?? {
              publishedCount: 0,
              noindexCount: 0,
              missingDescriptionCount: [],
              tooLongTitleCount: [],
              duplicateTitles: [],
            },
            anomalies: diagnostics?.anomalies ?? [],
          },
        })
      }

      // `GET /api/seo/link-suggestions` — fiche 70 task 2, follows `update`
      // on the named collection (never `admin`, unlike diagnostics above).
      if (url.includes('/api/seo/link-suggestions') && method === 'GET') {
        const parsedLinkUrl = new URL(url, 'http://localhost')
        const collectionName = parsedLinkUrl.searchParams.get('collection') ?? ''
        if (
          !user.roles.includes('editor') &&
          !user.roles.includes('admin') &&
          collectionName !== ''
        ) {
          return json(403, { error: { code: 'FORBIDDEN', message: 'Access denied.' } })
        }
        const found = options.seoLinkSuggestions?.[collectionName]
        return json(200, {
          data: {
            collection: collectionName,
            orphans: found?.orphans ?? [],
            suggestionsByEntry: found?.suggestionsByEntry ?? {},
          },
        })
      }

      // `/api/seo/search-console/*` — fiche 70 task 4, ADR-0032. `status` is
      // admin-only like the rest of the diagnostics scan; not configured by
      // default (R2), matching a real install with no OAuth app set.
      if (url.includes('/api/seo/search-console/status') && method === 'GET') {
        if (!user.roles.includes('admin')) {
          return json(403, { error: { code: 'FORBIDDEN', message: 'Access denied.' } })
        }
        const found = options.searchConsoleStatus
        return json(200, {
          data: {
            configured: found?.configured ?? false,
            connected: searchConsoleConnected,
            ...(!searchConsoleConnected || found?.siteUrl === undefined
              ? {}
              : { siteUrl: found.siteUrl }),
            ...(!searchConsoleConnected || found?.connectedAt === undefined
              ? {}
              : { connectedAt: found.connectedAt }),
            ...(!searchConsoleConnected || found?.updatedAt === undefined
              ? {}
              : { updatedAt: found.updatedAt }),
          },
        })
      }
      if (url.includes('/api/seo/search-console/metrics') && method === 'GET') {
        if (!user.roles.includes('admin')) {
          return json(403, { error: { code: 'FORBIDDEN', message: 'Access denied.' } })
        }
        const found = options.searchConsoleMetrics
        return json(200, {
          data: {
            siteUrl: found?.siteUrl ?? 'https://example.com/',
            windowDays: found?.windowDays ?? 28,
            rows: found?.rows ?? [],
          },
        })
      }
      if (url.includes('/api/seo/search-console/authorize') && method === 'GET') {
        if (!user.roles.includes('admin')) {
          return json(403, { error: { code: 'FORBIDDEN', message: 'Access denied.' } })
        }
        return json(200, { data: { url: 'https://accounts.google.com/o/oauth2/v2/auth?mock=1' } })
      }
      if (url.includes('/api/seo/search-console/disconnect') && method === 'POST') {
        if (!user.roles.includes('admin')) {
          return json(403, { error: { code: 'FORBIDDEN', message: 'Access denied.' } })
        }
        searchConsoleConnected = false
        return json(200, { data: { disconnected: true } })
      }

      // `/api/admin-theme` (L21 task 2) — the admin's own runtime template.
      // Unlike `/api/theme` just below, `GET` needs no role at all: the login
      // screen (mounted outside every admin-only guard) has to paint in
      // whatever template an install picked before a session exists.
      if (url.includes('/api/admin-theme')) {
        if (method === 'GET') {
          return json(200, { data: { active: adminTheme, templates: ADMIN_THEME_TEMPLATES } })
        }
        if (method === 'PUT') {
          if (!user.roles.includes('admin')) {
            return json(403, { error: { code: 'FORBIDDEN', message: 'Access denied.' } })
          }
          const input = body as { templateId?: string; overrides?: Record<string, unknown> }
          const templateId = input.templateId ?? adminTheme.templateId
          if (!ADMIN_THEME_TEMPLATES.some((template) => template.id === templateId)) {
            return json(400, {
              error: {
                code: 'ADMIN_THEME_TEMPLATE_UNKNOWN',
                message: `"${templateId}" is not a built-in admin theme template.`,
              },
            })
          }
          adminTheme = {
            templateId,
            overrides: input.overrides ?? {},
            updatedAt: '2026-01-01T00:00:00.000Z',
            updatedBy: user.id,
          }
          return json(200, { data: { active: adminTheme, templates: ADMIN_THEME_TEMPLATES } })
        }
      }

      // `/api/theme` (fiche 14) — the appearance screen. Admin-only, every route.
      if (url.includes('/api/theme')) {
        if (!user.roles.includes('admin')) {
          return json(403, { error: { code: 'FORBIDDEN', message: 'Access denied.' } })
        }

        if (url.includes('/api/theme/preview') && method === 'POST') {
          const tokens = (body as { tokens?: Record<string, unknown> } | undefined)?.tokens
          const accent =
            (tokens?.color as Record<string, unknown> | undefined)?.accent ??
            (themeEffectiveTokens().color as Record<string, unknown> | undefined)?.accent
          return json(200, {
            data: {
              html: `<!doctype html><html><head><style>:root{--cogenta-color-accent:${String(accent)}}</style></head><body>preview</body></html>`,
            },
          })
        }

        // `/api/theme/gallery-preview` (fiche L24 task 5) — the theme
        // gallery's own visual preview, one card per installed theme. The
        // real route renders a fixed demo page through the named theme
        // package; this mock only needs to answer with *some* real HTML that
        // names the requested theme, so a test can assert the iframe
        // actually receives a different document per card.
        if (url.includes('/api/theme/gallery-preview') && method === 'POST') {
          const requestedTheme = (body as { theme?: string } | undefined)?.theme ?? ''
          return json(200, {
            data: {
              html: `<!doctype html><html><head><style>/* ${requestedTheme} */</style></head><body>gallery preview of ${requestedTheme}</body></html>`,
            },
          })
        }

        if (url.includes('/api/theme/generate') && method === 'POST') {
          if (options.theme?.aiAvailable !== true) {
            return json(501, {
              error: { code: 'THEME_NO_PROVIDER', message: 'No LLM provider is configured.' },
            })
          }
          return json(200, { data: { candidates: options.theme.generateCandidates ?? [] } })
        }

        if (url.includes('/api/theme/export') && method === 'POST') {
          if (options.theme?.exportAvailable !== true) {
            return json(409, {
              error: {
                code: 'THEME_EXPORT_NOT_ALLOWED',
                message: 'This instance cannot write theme.tokens.json.',
              },
            })
          }
          return json(200, { data: { exported: true } })
        }

        const skinApplyMatch = /\/api\/theme\/skins\/([^/]+)\/apply$/.exec(url)
        if (skinApplyMatch !== null && method === 'POST') {
          const skin = (options.theme?.skins ?? []).find((entry) => entry.id === skinApplyMatch[1])
          if (skin === undefined || skin.tokens === null) {
            return json(404, {
              error: { code: 'THEME_SKIN_NOT_FOUND', message: 'No such skin.' },
            })
          }
          themeOverrides = { ...themeOverrides, tokenOverrides: skin.tokens, updatedBy: user.id }
          return json(200, { data: themeOverrides })
        }

        if (url.includes('/api/theme/skins') && method === 'GET') {
          return json(200, { data: options.theme?.skins ?? [] })
        }

        if (url.includes('/api/theme/overrides') && method === 'PUT') {
          const input = body as {
            tokenOverrides?: Record<string, unknown> | null
            additionalCss?: string | null
            logoMediaId?: string | null
            logoDarkMediaId?: string | null
            faviconMediaId?: string | null
            shareImageMediaId?: string | null
            activeTheme?: string | null
          }
          if (
            input.activeTheme !== undefined &&
            input.activeTheme !== null &&
            !availableThemes.some((theme) => theme.name === input.activeTheme)
          ) {
            return json(404, {
              error: { code: 'THEME_NOT_FOUND', message: 'No such theme.' },
            })
          }
          themeOverrides = {
            tokenOverrides:
              input.tokenOverrides === undefined
                ? themeOverrides.tokenOverrides
                : input.tokenOverrides,
            additionalCss:
              input.additionalCss === undefined
                ? themeOverrides.additionalCss
                : input.additionalCss,
            logoMediaId:
              input.logoMediaId === undefined ? themeOverrides.logoMediaId : input.logoMediaId,
            logoDarkMediaId:
              input.logoDarkMediaId === undefined
                ? themeOverrides.logoDarkMediaId
                : input.logoDarkMediaId,
            faviconMediaId:
              input.faviconMediaId === undefined
                ? themeOverrides.faviconMediaId
                : input.faviconMediaId,
            shareImageMediaId:
              input.shareImageMediaId === undefined
                ? themeOverrides.shareImageMediaId
                : input.shareImageMediaId,
            activeTheme:
              input.activeTheme === undefined ? themeOverrides.activeTheme : input.activeTheme,
            updatedAt: '2026-01-02T00:00:00.000Z',
            updatedBy: user.id,
          }
          return json(200, { data: themeOverrides })
        }

        if (url.includes('/api/theme/overrides') && method === 'DELETE') {
          themeOverrides = {
            tokenOverrides: null,
            additionalCss: null,
            logoMediaId: null,
            logoDarkMediaId: null,
            faviconMediaId: null,
            shareImageMediaId: null,
            activeTheme: themeOverrides.activeTheme,
            updatedAt: '2026-01-03T00:00:00.000Z',
            updatedBy: user.id,
          }
          return json(200, { data: themeOverrides })
        }

        if (method === 'GET') {
          return json(200, {
            data: {
              fileTokens: options.theme?.fileTokens ?? DEFAULT_THEME_TOKENS,
              effectiveTokens: themeEffectiveTokens(),
              overrides: themeOverrides,
              skins: options.theme?.skins ?? [],
              aiAvailable: options.theme?.aiAvailable ?? false,
              exportAvailable: options.theme?.exportAvailable ?? false,
              ...(options.theme?.omitAvailableThemesField === true ? {} : { availableThemes }),
            },
          })
        }
      }

      if (url.includes('/api/config-status') && method === 'GET') {
        if (!user.roles.includes('admin')) {
          return json(403, { error: { code: 'FORBIDDEN', message: 'Access denied.' } })
        }
        return json(200, { data: options.configStatus ?? null })
      }

      // `/api/updates/*` — the update system (L22 task 9). Admin-only, same
      // shape as every other status route above. Defaults to "up to date,
      // no history" so a test that never configures this (almost every
      // existing one — `OpsSettingsRoute` always mounts this card) gets a
      // quiet, harmless answer rather than an unhandled-request throw.
      if (url.includes('/api/updates/status') && method === 'GET') {
        if (!user.roles.includes('admin')) {
          return json(403, { error: { code: 'FORBIDDEN', message: 'Access denied.' } })
        }
        return json(200, {
          data: options.updateStatus ?? {
            checkedAt: '2026-01-01T00:00:00.000Z',
            packages: [
              {
                name: '@cogenta/core',
                installed: '0.4.0',
                latest: '0.4.0',
                bump: 'none',
                updateAvailable: false,
                checkError: undefined,
                contractRisk: null,
              },
              {
                name: '@cogenta/cli',
                installed: '0.4.0',
                latest: '0.4.0',
                bump: 'none',
                updateAvailable: false,
                checkError: undefined,
                contractRisk: null,
              },
            ],
            updateAvailable: false,
            highestBump: 'none',
            contractRiskDetected: false,
          },
        })
      }

      if (url.includes('/api/updates/history') && method === 'GET') {
        if (!user.roles.includes('admin')) {
          return json(403, { error: { code: 'FORBIDDEN', message: 'Access denied.' } })
        }
        return json(200, { data: options.updateHistory ?? { entries: [], restorePoints: [] } })
      }

      if (url.includes('/api/updates/apply') && method === 'POST') {
        if (!user.roles.includes('admin')) {
          return json(403, { error: { code: 'FORBIDDEN', message: 'Access denied.' } })
        }
        return json(200, {
          data: options.updateApplyResult ?? {
            kind: 'up-to-date',
            report: {
              checkedAt: '2026-01-01T00:00:00.000Z',
              packages: [],
              updateAvailable: false,
              highestBump: 'none',
              contractRiskDetected: false,
            },
          },
        })
      }

      // `GET|PATCH /api/settings` — the editorial site settings (fiche 23).
      // Read is public — no role check — the same as the real router.
      if (url.includes('/api/settings') && method === 'GET') {
        const requestedLocale = new URL(url, 'http://localhost').searchParams.get('locale') ?? ''
        const data = Object.entries(SITE_SETTINGS_DEFAULTS).map(([key, definition]) => {
          const locale = definition.scope === 'locale' ? requestedLocale : ''
          const write = siteSettingsWrites.get(`${key} ${locale}`)
          return {
            key,
            group: definition.group,
            order: definition.order,
            uiType: definition.uiType,
            scope: definition.scope,
            locale: definition.scope === 'locale' ? locale : null,
            value: write?.value ?? definition.value,
            isDefault: write === undefined,
            updatedAt: write?.updatedAt ?? null,
            updatedBy: write?.updatedBy ?? null,
            options: definition.options,
          }
        })
        return json(200, { data })
      }

      if (url.includes('/api/settings') && method === 'PATCH') {
        const key = body.key as string | undefined
        const definition = key === undefined ? undefined : SITE_SETTINGS_DEFAULTS[key]
        if (key === undefined || definition === undefined) {
          return json(404, {
            error: {
              code: 'SITE_SETTING_UNKNOWN',
              message: `"${String(key)}" is not a declared site setting.`,
            },
          })
        }
        if (!user.roles.includes('admin')) {
          return json(403, { error: { code: 'FORBIDDEN', message: 'Access denied.' } })
        }
        const requestedLocale = new URL(url, 'http://localhost').searchParams.get('locale') ?? ''
        const locale = definition.scope === 'locale' ? requestedLocale : ''
        const updatedAt = '2025-06-15T10:00:00.000Z'
        siteSettingsWrites.set(`${key} ${locale}`, {
          value: body.value,
          updatedAt,
          updatedBy: user.id,
        })
        return json(200, {
          data: {
            key,
            group: definition.group,
            order: definition.order,
            uiType: definition.uiType,
            scope: definition.scope,
            locale: definition.scope === 'locale' ? locale : null,
            value: body.value,
            isDefault: false,
            updatedAt,
            updatedBy: user.id,
            options: definition.options,
          },
        })
      }

      // `/api/comments` (fiche 15, ADR-0025) — the moderation queue. This
      // router does not wrap its body in `{ data }` (`comments-client.ts`'s
      // own comment explains why), so every branch here returns the bare
      // shape the real `@cogenta/comments` router would.
      if (url.includes('/api/comments')) {
        const afterBase = url.split('/api/comments')[1] ?? ''
        const [pathPart, queryPart] = afterBase.split('?')
        const segments = (pathPart ?? '').split('/').filter((segment) => segment !== '')
        const params = new URLSearchParams(queryPart ?? '')

        if (segments.length === 0 && method === 'GET') {
          const status = params.get('status')
          const q = params.get('q')?.toLowerCase()
          let filtered = comments.filter((c) => (status === null ? true : c.status === status))
          if (q !== undefined && q !== null && q !== '') {
            filtered = filtered.filter(
              (c) =>
                c.authorName.toLowerCase().includes(q) ||
                c.authorEmail.toLowerCase().includes(q) ||
                c.body.toLowerCase().includes(q),
            )
          }
          return json(200, { items: filtered, total: filtered.length })
        }

        if (segments.length === 1 && segments[0] === 'counts' && method === 'GET') {
          return json(200, {
            pending: comments.filter((c) => c.status === 'pending').length,
            approved: comments.filter((c) => c.status === 'approved').length,
            spam: comments.filter((c) => c.status === 'spam').length,
            trash: comments.filter((c) => c.status === 'trash').length,
          })
        }

        if (segments.length === 1 && segments[0] === 'bulk' && method === 'POST') {
          const ids = (body.ids as string[] | undefined) ?? []
          const status = body.status as CommentFixture['status']
          let updated = 0
          for (const c of comments) {
            if (ids.includes(c.id)) {
              c.status = status
              updated += 1
            }
          }
          return json(200, { updated })
        }

        if (segments.length === 2 && segments[0] === 'settings' && segments[1] === 'collection') {
          const collection =
            params.get('collection') ?? (body.collection as string | undefined) ?? ''
          if (method === 'GET') {
            const current = commentSettings[collection] ?? {
              enabled: null,
              moderationRequired: null,
            }
            return json(200, { collection, ...current })
          }
          if (method === 'PUT') {
            const current = commentSettings[collection] ?? {
              enabled: null,
              moderationRequired: null,
            }
            const next = {
              enabled: typeof body.enabled === 'boolean' ? body.enabled : current.enabled,
              moderationRequired:
                typeof body.moderationRequired === 'boolean'
                  ? body.moderationRequired
                  : current.moderationRequired,
            }
            commentSettings = { ...commentSettings, [collection]: next }
            return json(200, { collection, ...next })
          }
        }

        if (segments.length === 2 && segments[0] === 'settings' && segments[1] === 'entry') {
          const collection =
            params.get('collection') ?? (body.collection as string | undefined) ?? ''
          const entryId = params.get('entryId') ?? (body.entryId as string | undefined) ?? ''
          const key = `${collection}:${entryId}`
          if (method === 'GET') {
            return json(200, { collection, entryId, enabled: entryCommentSettings[key] ?? null })
          }
          if (method === 'PUT') {
            const enabled = body.enabled as boolean | null
            entryCommentSettings = { ...entryCommentSettings, [key]: enabled }
            return json(200, { collection, entryId, enabled })
          }
        }

        if (segments.length === 2 && segments[1] === 'status' && method === 'POST') {
          const found = comments.find((c) => c.id === segments[0])
          if (found === undefined) {
            return json(404, { error: { code: 'COMMENT_NOT_FOUND', message: 'Not found.' } })
          }
          found.status = body.status as CommentFixture['status']
          found.moderatedAt = '2026-01-02T00:00:00.000Z'
          found.moderatedBy = user.id
          return json(200, found)
        }

        if (segments.length === 2 && segments[1] === 'reply' && method === 'POST') {
          const parent = comments.find((c) => c.id === segments[0])
          if (parent === undefined) {
            return json(404, { error: { code: 'COMMENT_NOT_FOUND', message: 'Not found.' } })
          }
          const reply: CommentFixture = {
            id: `reply-${comments.length + 1}`,
            collection: parent.collection,
            entryId: parent.entryId,
            locale: parent.locale,
            parentId: parent.id,
            userId: user.id,
            authorName: body.authorName as string,
            authorEmail: body.authorEmail as string,
            authorUrl: null,
            body: body.body as string,
            status: 'approved',
            ipHash: null,
            userAgent: null,
            moderation: { flagged: null, severity: null, reason: null },
            provenance: 'human',
            createdAt: '2026-01-02T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
            moderatedAt: null,
            moderatedBy: null,
          }
          comments.push(reply)
          return json(201, reply)
        }

        if (segments.length === 1 && method === 'DELETE') {
          const index = comments.findIndex((c) => c.id === segments[0])
          if (index !== -1) comments.splice(index, 1)
          return new Response(null, { status: 204 })
        }
      }

      // `GET /api/shell-status` (fiche 35 task 3) — the sidebar's one
      // aggregated read for badges and feature flags. Defaults to a quiet
      // site (nothing trashed, no shop, no marketplace item installed) so
      // that the vast majority of tests that never care about it see the
      // sidebar in its plainest, most predictable shape.
      if (url.endsWith('/api/shell-status') && method === 'GET') {
        const defaults = {
          trash: 0,
          commerceOrdersPending: user.roles.length > 0 ? 0 : null,
          commerceActive: false,
          marketplaceUpdates: user.roles.includes('admin') ? 0 : null,
          reviewPending: null,
          commentsPending:
            user.roles.length > 0 ? comments.filter((c) => c.status === 'pending').length : null,
          formSubmissionsUnread: user.roles.includes('admin')
            ? formSubmissions.filter((s) => s.status === 'new').length
            : null,
          cogentaVersion: '0.4.0',
        }
        return json(200, { data: { ...defaults, ...options.shellStatus } })
      }

      if (url.endsWith('/api/assistant') && method === 'GET') {
        const assistant = options.assistant ?? { available: false, tools: [] }
        return json(200, {
          data: {
            available: assistant.available,
            tools: assistant.tools ?? [],
            ...(assistant.reason === undefined ? {} : { reason: assistant.reason }),
            ...(assistant.model === undefined ? {} : { model: assistant.model }),
            ...(assistant.usage === undefined ? {} : { usage: assistant.usage }),
            ...(assistant.vector === undefined ? {} : { vector: assistant.vector }),
          },
        })
      }

      if (url.endsWith('/api/assistant/run') && method === 'POST') {
        const tool = body.tool as string | undefined
        const answer = tool === undefined ? undefined : options.assistantRun?.[tool]
        if (answer === undefined) {
          return json(404, {
            error: { code: 'TOOL_UNKNOWN', message: `No assistant tool named "${String(tool)}".` },
          })
        }
        return json(200, { data: answer })
      }

      // `/api/patterns*` — the page builder's motif/model library (fiche 43
      // sub-chantier A), admin/editor only, mirroring `pattern-router.ts`'s
      // own fixed door.
      if (url.includes('/api/patterns')) {
        if (!user.roles.includes('admin') && !user.roles.includes('editor')) {
          return json(403, {
            error: {
              code: 'FORBIDDEN',
              message: 'Access denied: patterns can only be managed by admin or editor.',
            },
          })
        }
        const parsed = new URL(url, 'http://localhost')
        const segments = parsed.pathname
          .replace(/^.*\/api\/patterns/, '')
          .split('/')
          .filter((segment) => segment.length > 0)

        if (segments.length === 0) {
          if (method === 'GET') {
            const kind = parsed.searchParams.get('kind')
            const filtered =
              kind === null
                ? pageBuilderPatterns
                : pageBuilderPatterns.filter((p) => p.kind === kind)
            return json(200, { data: filtered })
          }
          if (method === 'POST') {
            pageBuilderPatternCounter += 1
            const now = '2026-03-01T00:00:00.000Z'
            const created = {
              id: `pattern-${pageBuilderPatternCounter}`,
              name: body.name as string,
              category: (body.category as string | null | undefined) ?? null,
              kind: body.kind as 'pattern' | 'template',
              blocks: (body.blocks ?? []) as {
                key: string
                type: string
                data: Record<string, unknown>
              }[],
              provenance:
                (body.provenance as 'human' | 'assisted' | 'generated' | undefined) ?? 'human',
              provenanceDetail:
                (body.provenanceDetail as Record<string, unknown> | null | undefined) ?? null,
              createdAt: now,
              updatedAt: now,
            }
            pageBuilderPatterns.push(created)
            return json(201, { data: created })
          }
        }

        if (segments.length === 1) {
          const id = segments[0]
          const existing = pageBuilderPatterns.find((p) => p.id === id)
          if (existing === undefined) {
            return json(404, { error: { code: 'PATTERN_UNKNOWN', message: `No pattern "${id}".` } })
          }
          if (method === 'GET') return json(200, { data: existing })
          if (method === 'PATCH') {
            if (typeof body.name === 'string') existing.name = body.name
            if (Object.hasOwn(body, 'category')) {
              existing.category = body.category as string | null
            }
            existing.updatedAt = '2026-03-01T00:01:00.000Z'
            return json(200, { data: existing })
          }
          if (method === 'DELETE') {
            pageBuilderPatterns = pageBuilderPatterns.filter((p) => p.id !== id)
            return new Response(null, { status: 204 })
          }
        }
      }

      // `/api/forms/*` (contract G, ADR-0026) — admin-only, mirroring
      // `forms-router.ts`'s own gate. Submissions sub-routes are checked
      // before the general `/api/forms/{id}` shape, the same ordering
      // discipline `/api/redirects`'s block above documents for itself.
      if (url.includes('/api/forms')) {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: { code: 'FORBIDDEN', message: 'Only the admin role may manage forms.' },
          })
        }
        const parsed = new URL(url, 'http://localhost')
        const segments = parsed.pathname
          .replace(/^.*\/api\/forms\/?/u, '')
          .split('/')
          .filter(Boolean)

        if (segments[0] === 'submissions') {
          const rest = segments.slice(1)

          // Fiche 47 task 9 — the streamed export. A plain CSV body, not
          // JSON, mirroring `serveFormsSubmissionsExport`'s own content type.
          if (rest.length === 1 && rest[0] === 'export.csv' && method === 'GET') {
            const formId = parsed.searchParams.get('formId')
            const filtered = formSubmissions.filter((s) => formId === null || s.formId === formId)
            const columns = [...new Set(filtered.flatMap((s) => Object.keys(s.values)))]
            const rows = [
              ['id', 'form', 'status', 'submittedAt', 'referrer', ...columns],
              ...filtered.map((s) => [
                s.id,
                s.formName,
                s.status,
                s.submittedAt,
                s.referrer ?? '',
                ...columns.map((c) => String(s.values[c] ?? '')),
              ]),
            ]
            const csv = rows.map((row) => row.join(',')).join('\r\n')
            return new Response(csv, { status: 200, headers: { 'content-type': 'text/csv' } })
          }

          if (rest.length === 0 && method === 'GET') {
            const formId = parsed.searchParams.get('formId')
            const status = parsed.searchParams.get('status')
            const filtered = formSubmissions.filter(
              (s) =>
                (formId === null || s.formId === formId) &&
                (status === null || s.status === status),
            )
            // Fiche 67 task 2: the screen now sends real `limit`/`cursor` —
            // same opaque "id of the previous page's last item" mock
            // convention `media.tsx`'s fixture already established just
            // above. Absent `limit` still returns everything in one page,
            // byte for byte what this mock always did before this fiche.
            const limitRaw = parsed.searchParams.get('limit')
            const pageLimit = limitRaw === null ? undefined : Number(limitRaw)
            const cursor = parsed.searchParams.get('cursor')
            const startIndex = cursor === null ? 0 : filtered.findIndex((s) => s.id === cursor) + 1
            const pageSize = pageLimit ?? filtered.length
            const items = filtered.slice(startIndex, startIndex + pageSize)
            const hasMore = startIndex + pageSize < filtered.length
            const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null
            return json(200, { data: items, nextCursor })
          }
          if (rest.length === 1 && rest[0] === 'unread-count' && method === 'GET') {
            return json(200, {
              data: { count: formSubmissions.filter((s) => s.status === 'new').length },
            })
          }
          if (rest.length === 1 && rest[0] === 'search' && method === 'GET') {
            const email = (parsed.searchParams.get('email') ?? '').toLowerCase()
            const matches = formSubmissions.filter((s) =>
              Object.values(s.values).some(
                (v) => typeof v === 'string' && v.toLowerCase() === email,
              ),
            )
            return json(200, { data: matches })
          }
          if (rest.length === 1 && rest[0] === 'by-email' && method === 'DELETE') {
            const email = (parsed.searchParams.get('email') ?? '').toLowerCase()
            const before = formSubmissions.length
            formSubmissions = formSubmissions.filter(
              (s) =>
                !Object.values(s.values).some(
                  (v) => typeof v === 'string' && v.toLowerCase() === email,
                ),
            )
            return json(200, { data: { erased: before - formSubmissions.length } })
          }
          if (rest.length === 1 && rest[0] === 'bulk' && method === 'POST') {
            const ids = (body.ids ?? []) as string[]
            const action = body.action as string
            if (action === 'delete') {
              const before = formSubmissions.length
              formSubmissions = formSubmissions.filter((s) => !ids.includes(s.id))
              return json(200, { data: { updated: before - formSubmissions.length } })
            }
            let updated = 0
            formSubmissions = formSubmissions.map((s) => {
              if (!ids.includes(s.id)) return s
              updated += 1
              return { ...s, status: action as typeof s.status }
            })
            return json(200, { data: { updated } })
          }
          if (rest.length === 2 && rest[1] === 'notes') {
            const submissionId = rest[0] as string
            if (method === 'GET') {
              return json(200, { data: formNotes.filter((n) => n.submissionId === submissionId) })
            }
            if (method === 'POST') {
              formNoteCounter += 1
              const note = {
                id: `note-${formNoteCounter}`,
                submissionId,
                authorId: user.id,
                authorLabel: user.id,
                body: body.body as string,
                createdAt: '2026-03-01T00:00:00.000Z',
              }
              formNotes.push(note)
              return json(201, { data: note })
            }
          }

          if (rest.length === 1) {
            const submission = formSubmissions.find((s) => s.id === rest[0])
            if (submission === undefined) {
              return json(404, {
                error: { code: 'FORM_SUBMISSION_NOT_FOUND', message: 'No such submission.' },
              })
            }
            if (method === 'GET') return json(200, { data: submission })
            if (method === 'PATCH') {
              submission.status = body.status as typeof submission.status
              return json(200, { data: submission })
            }
            if (method === 'DELETE') {
              formSubmissions = formSubmissions.filter((s) => s.id !== submission.id)
              formNotes = formNotes.filter((n) => n.submissionId !== submission.id)
              return new Response(null, { status: 204 })
            }
          }
        }

        if (segments.length === 0 && method === 'GET') return json(200, { data: formDefs })
        if (segments.length === 0 && method === 'POST') {
          formCounter += 1
          const created = {
            id: `form-${formCounter}`,
            name: body.name as string,
            label: body.label as string,
            fields: (body.fields ?? []) as Record<string, unknown>[],
            active: (body.active as boolean | undefined) ?? true,
            confirmationMessage:
              (body.confirmationMessage as string | undefined) ??
              'Thank you — your message has been received.',
            redirectTo: (body.redirectTo as string | null | undefined) ?? null,
            notifyEmails: (body.notifyEmails as string[] | undefined) ?? [],
            autoresponder: (body.autoresponder as { enabled: boolean } | undefined) ?? {
              enabled: false,
            },
            retainDays: (body.retainDays as number | undefined) ?? 180,
            steps: (body.steps as Record<string, unknown>[] | undefined) ?? [],
            notifyChannels: (body.notifyChannels as Record<string, unknown>[] | undefined) ?? [],
            captcha: (body.captcha as { enabled: boolean } | undefined) ?? { enabled: false },
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
          }
          formDefs.push(created)
          return json(201, { data: created })
        }
        if (segments.length === 2 && segments[1] === 'duplicate' && method === 'POST') {
          const existing = formDefs.find((f) => f.id === segments[0])
          if (existing === undefined) {
            return json(404, { error: { code: 'FORM_UNKNOWN', message: 'No such form.' } })
          }
          formCounter += 1
          const copy = {
            ...existing,
            id: `form-${formCounter}`,
            name: `${existing.name}-copy`,
            label: `${existing.label} (copy)`,
            active: false,
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
          }
          formDefs.push(copy)
          return json(201, { data: copy })
        }
        if (segments.length === 1) {
          const existing = formDefs.find((f) => f.id === segments[0])
          if (existing === undefined) {
            return json(404, { error: { code: 'FORM_UNKNOWN', message: 'No such form.' } })
          }
          if (method === 'GET') return json(200, { data: existing })
          if (method === 'PATCH') {
            Object.assign(existing, body, { updatedAt: '2026-03-01T00:01:00.000Z' })
            return json(200, { data: existing })
          }
          if (method === 'DELETE') {
            formDefs = formDefs.filter((f) => f.id !== existing.id)
            return new Response(null, { status: 204 })
          }
        }
      }

      throw new Error(`unhandled request in test: ${method} ${url}`)
    }),
  )

  installMockXhr()
}

/**
 * `uploadMediaMultipart` (fiche 05 task 1) uses `XMLHttpRequest`, not
 * `fetch` — only `xhr.upload.onprogress` reports real byte-level upload
 * progress, which `fetch` has no equivalent for. jsdom's real
 * `XMLHttpRequest` would try an actual network request in a test, so this
 * stub exists purely to translate an XHR call into the same stubbed
 * `fetch` above (already routed by then), rather than duplicating any
 * route logic a second time.
 */
function installMockXhr(): void {
  class MockXMLHttpRequest {
    #method = 'GET'
    #url = ''
    #headers: Record<string, string> = {}
    status = 0
    responseText = ''
    upload: {
      onprogress:
        | ((event: { lengthComputable: boolean; loaded: number; total: number }) => void)
        | null
    } = { onprogress: null }
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    onabort: (() => void) | null = null

    open(method: string, url: string): void {
      this.#method = method
      this.#url = url
    }

    setRequestHeader(name: string, value: string): void {
      this.#headers[name] = value
    }

    send(body?: Document | XMLHttpRequestBodyInit | null): void {
      // A single "done" progress event is honest about what this stub can
      // simulate — a real byte-by-byte trickle needs a real socket, which a
      // unit test has no business opening.
      const size = body instanceof FormData ? estimateFormDataSize(body) : 0
      this.upload.onprogress?.({ lengthComputable: true, loaded: size, total: size })

      fetch(this.#url, { method: this.#method, headers: this.#headers, body: body as BodyInit })
        .then(async (response) => {
          this.status = response.status
          this.responseText = await response.text()
          this.onload?.()
        })
        .catch(() => {
          this.onerror?.()
        })
    }
  }

  function estimateFormDataSize(form: FormData): number {
    let total = 0
    for (const value of form.values()) {
      total += value instanceof File ? value.size : String(value).length
    }
    return total
  }

  vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest)
}
