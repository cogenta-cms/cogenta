import { vi } from 'vitest'

export interface MockUser {
  readonly id: string
  readonly email: string
  readonly roles: readonly string[]
}

export const USER: MockUser = { id: 'user-1', email: 'alice@example.com', roles: ['editor'] }
export const VALID_TOKEN = 'valid-test-token'

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

export const MOCK_ENTRIES = [
  {
    id: 'entry-1',
    status: 'published',
    version: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
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
    locale: 'en',
    translationOf: null,
    deletedAt: null,
    publishedAt: null,
    values: { title: 'Second article' },
    blocks: {},
  },
]

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
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
     * `GET /api/assistant`'s answer. Absent means `available: false, tools:
     * []` — the same "no AI provider configured" a real site with none
     * answers with, and the state most tests that never touch the assistant
     * want by default.
     */
    readonly assistant?: {
      readonly available: boolean
      readonly tools?: readonly {
        readonly tool: string
        readonly label: string
        readonly description: string
        readonly cost: string
        readonly needs: readonly string[]
      }[]
    }
    /** `POST /api/assistant/run`'s answer, keyed by tool name — what each test's scripted provider "said". */
    readonly assistantRun?: Readonly<Record<string, unknown>>
    /** What `GET /api/notices` answers with. Empty by default: most screens have nothing to recommend. */
    readonly notices?: readonly {
      id: string
      code: string
      severity: string
      dismissible: boolean
      action?: { code: string; href: string }
    }[]
    /** What `GET /api/webhooks-status` answers with — no endpoint configured by default. */
    readonly webhooksStatus?: {
      endpoints: readonly string[]
      signed: boolean
      disabledForMissingSecret: boolean
    }
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

  let notices = [...(options.notices ?? [])]

  // Account state, per `installMockFetch()` call: the signed-in user plus
  // whatever the test creates through the real routes.
  interface MockAccount {
    id: string
    email: string
    roles: readonly string[]
    status: 'active' | 'disabled'
    createdAt: string
    updatedAt: string
    mfa: { totp: boolean; passkeys: number }
  }
  // Commerce state (contract E, ADR-0024), per `installMockFetch()` call —
  // one order and one payment pre-seeded so a test can open the order detail
  // screen without also having to drive a whole checkout through this mock.
  interface MockProduct {
    id: string
    handle: string
    title: string
    status: 'active' | 'archived'
    contentRef: null
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
    createdAt: string
    updatedAt: string
  }
  let mockProductCounter = 0
  let mockVariantCounter = 0
  const mockProducts: MockProduct[] = []
  const mockVariants: MockVariant[] = []
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
  const userSessions: Record<string, { id: string; lastSeenAt: string; label: string | null }[]> = {
    [user.id]: [
      { id: 'session-1', lastSeenAt: '2026-03-01T00:00:00.000Z', label: 'Work laptop' },
      { id: 'session-2', lastSeenAt: '2026-03-02T00:00:00.000Z', label: null },
    ],
    'user-2': [{ id: 'session-3', lastSeenAt: '2026-03-03T00:00:00.000Z', label: 'Phone' }],
  }

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
    },
  ]

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
  }[] = [
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
  let trash = [MOCK_TRASHED_ENTRY]

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
    url: string | null
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
    status: 301 | 302
    collection: null
    entryId: null
    locale: null
    reason: 'manual'
    createdAt: number
  }[] = []

  let mediaCounter = 0
  const media: {
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
    createdAt: string
    createdBy: string | null
  }[] = []

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method ?? 'GET'
      const body = init?.body === undefined ? {} : JSON.parse(init.body as string)
      const auth = (init?.headers as Record<string, string> | undefined)?.['authorization']

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
        return json(200, { data: { enrolled: true } })
      }

      if (url.endsWith('/api/auth/totp') && method === 'DELETE') {
        if (auth !== `Bearer ${VALID_TOKEN}`) {
          return json(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in first.' } })
        }
        return new Response(null, { status: 204 })
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

      // `/api/api-keys/*`. Admin-only, mirroring the real router: the raw
      // `key` is present only in the `POST` response's body, never in the
      // list — proving the screen never re-displays it depends on this stub
      // agreeing with `packages/api/test/rest/api-keys-router.test.ts`.
      const apiKeysMatch = /\/api\/api-keys(?:\/([^/?]+))?(?:\?.*)?$/u.exec(url)
      if (apiKeysMatch !== null && url.includes('/api/api-keys')) {
        if (auth !== `Bearer ${VALID_TOKEN}`) {
          return json(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in first.' } })
        }
        const isAdmin = user.roles.includes('admin')
        const forbidden = json(403, {
          error: { code: 'FORBIDDEN', message: 'Only the admin role may do this.' },
        })
        const [, rawId] = apiKeysMatch

        if (rawId === undefined && method === 'GET') {
          if (!isAdmin) return forbidden
          return json(200, { data: apiKeys })
        }

        if (rawId === undefined && method === 'POST') {
          if (!isAdmin) return forbidden
          apiKeyCounter += 1
          const rawKey = `cogenta_sk_mock-${apiKeyCounter}-not-a-real-secret`
          const record = {
            id: `key-new-${apiKeyCounter}`,
            name: String(body.name),
            prefix: rawKey.slice(0, 12),
            scope: body.scope as readonly string[],
            createdBy: user.id,
            createdAt: '2026-03-06T00:00:00.000Z',
            expiresAt: null,
            revokedAt: null,
            lastUsedAt: null,
          }
          apiKeys.push(record)
          return json(201, { data: { ...record, key: rawKey } })
        }

        if (rawId !== undefined && method === 'DELETE') {
          if (!isAdmin) return forbidden
          const found = apiKeys.find((candidate) => candidate.id === rawId)
          if (found === undefined) {
            return json(404, {
              error: { code: 'API_KEY_NOT_FOUND', message: 'No API key with that id.' },
            })
          }
          found.revokedAt = '2026-03-06T00:00:00.000Z'
          return new Response(null, { status: 204 })
        }
      }

      // `/api/marketplace/*` (L17). Admin-only, mirroring
      // `packages/api/src/rest/marketplace-router.ts`: a signature refusal on
      // install is a real 422 with `PLUGIN_SIGNATURE_INVALID`, and an update
      // that would widen capabilities is a real 409 with
      // `MARKETPLACE_UPDATE_REQUIRES_APPROVAL` until `confirmPendingPermissions`
      // is sent — the two refusals this admin screen exists to never hide.
      const marketplaceMatch =
        /\/api\/marketplace\/items(?:\/([^/?]+))?(?:\/(install|update|uninstall))?(?:\?.*)?$/u.exec(
          url,
        )
      if (marketplaceMatch !== null && url.includes('/api/marketplace')) {
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
          return json(200, { data: { id: entry.id, uninstalled: true } })
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
          return json(200, {
            data: role === null ? accounts : accounts.filter((a) => a.roles.includes(role)),
          })
        }

        if (rawId === undefined && method === 'POST') {
          if (!isAdmin) return forbidden
          accountCounter += 1
          const created: MockAccount = {
            id: `user-new-${accountCounter}`,
            email: String(body.email).toLowerCase(),
            roles: body.roles as readonly string[],
            status: 'active',
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
            mfa: { totp: false, passkeys: 0 },
          }
          accounts.push(created)
          return json(201, { data: { user: created, password: 'generated-password-xyz' } })
        }

        const account = accounts.find((candidate) => candidate.id === id)

        if (sub === undefined && method === 'GET') {
          if (id !== user.id && !isAdmin) return forbidden
          if (account === undefined) {
            return json(404, { error: { code: 'AUTH_USER_NOT_FOUND', message: 'No account.' } })
          }
          return json(200, { data: account })
        }

        if (sub === undefined && method === 'PATCH') {
          if (!isAdmin) return forbidden
          if (account === undefined) {
            return json(404, { error: { code: 'AUTH_USER_NOT_FOUND', message: 'No account.' } })
          }
          if (body.roles !== undefined) account.roles = body.roles as readonly string[]
          if (body.status !== undefined) account.status = body.status as 'active' | 'disabled'
          return json(200, { data: account })
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

        if (sub === 'sessions' && sessionId === undefined && method === 'GET') {
          if (id !== user.id && !isAdmin) return forbidden
          return json(200, {
            data: (userSessions[id ?? ''] ?? []).map((session) => ({
              ...session,
              createdAt: '2026-03-01T00:00:00.000Z',
              expiresAt: '2030-01-01T00:00:00.000Z',
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

      if (url.includes('/api/audit')) {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: { code: 'FORBIDDEN', message: 'Only the admin role may read the audit log.' },
          })
        }
        if (url.includes('/api/audit/verify')) {
          return json(200, { data: { ok: true } })
        }
        return json(200, {
          data: [
            {
              id: 'audit-1',
              at: '2026-03-01T00:00:00.000Z',
              actorId: 'user-1',
              actorRoles: ['editor'],
              action: 'content.create',
              collection: 'article',
              entryId: 'entry-1',
              diff: { title: 'First article' },
              hash: 'abc',
              previousHash: null,
            },
          ],
        })
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

      if (url.includes('/api/agents')) {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: { code: 'FORBIDDEN', message: 'Only the admin role may manage agents.' },
          })
        }
        const agentMatch = /\/api\/agents\/([^/?]+)(?:\/(enable|disable|traces|history))?/u.exec(
          url,
        )
        if (agentMatch === null) {
          return json(200, {
            data: [
              {
                name: 'security',
                tools: ['deps.scan', 'deps.patch'],
                autonomy: { default: 'propose', overrides: { 'deps.scan': 'autonomous' } },
                budget: { tokensPerDay: 200_000 },
                enabled: securityAgentEnabled,
                usage: { tokensToday: 1234, eurThisMonth: 0.5, callsThisHour: 2 },
              },
            ],
          })
        }
        const [, name, action] = agentMatch
        if (name === 'ghost') {
          return json(404, { error: { code: 'CONTENT_NOT_FOUND', message: 'No such agent.' } })
        }
        if (action === 'enable' && method === 'POST') {
          securityAgentEnabled = true
          return json(200, { data: { name, enabled: true } })
        }
        if (action === 'disable' && method === 'POST') {
          securityAgentEnabled = false
          return json(200, { data: { name, enabled: false } })
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
        return json(200, {
          data: {
            name,
            tools: ['deps.scan', 'deps.patch'],
            autonomy: { default: 'propose', overrides: { 'deps.scan': 'autonomous' } },
            budget: { tokensPerDay: 200_000 },
            enabled: securityAgentEnabled,
            usage: { tokensToday: 1234, eurThisMonth: 0.5, callsThisHour: 2 },
          },
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

      const mediaMatch = /\/api\/media(?:\/([^/?]+))?(?:\?.*)?$/u.exec(url)
      if (mediaMatch !== null) {
        const [, id] = mediaMatch

        if (id === undefined && method === 'GET') {
          const parsed = new URL(url, 'http://localhost')
          const kindFilter = parsed.searchParams.get('kind')
          const items =
            kindFilter === null ? media : media.filter((item) => item.kind === kindFilter)
          return json(200, { data: items, page: { hasMore: false, nextCursor: null } })
        }

        if (id === undefined && method === 'POST') {
          if (auth !== `Bearer ${VALID_TOKEN}`) {
            return json(401, {
              error: { code: 'UNAUTHENTICATED', message: 'Sign in to manage media.' },
            })
          }
          const decorative = body.decorative === true
          if (decorative && (body.decorativeJustification ?? '').length === 0) {
            return json(400, {
              error: {
                code: 'MEDIA_INVALID',
                message: 'A decorative image needs a justification.',
              },
            })
          }
          if (!decorative && (body.alt ?? '').length === 0) {
            return json(400, {
              error: { code: 'MEDIA_INVALID', message: 'Alt text is required.' },
            })
          }
          mediaCounter += 1
          const created = {
            id: `media-${mediaCounter}`,
            kind: body.kind,
            filename: body.filename,
            mimeType: body.mimeType,
            size: 10,
            width: null,
            height: null,
            alt: decorative ? '' : (body.alt ?? ''),
            decorative,
            decorativeJustification: decorative ? (body.decorativeJustification ?? null) : null,
            focal: body.focal ?? null,
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
        const [, taxonomy = '', id] = taxonomyMatch
        const declared = MOCK_SCHEMA.taxonomies.find((entry) => entry.name === taxonomy)
        if (declared === undefined) {
          return json(404, {
            error: { code: 'TAXONOMY_UNKNOWN', message: 'No such taxonomy.' },
          })
        }

        const action =
          method === 'GET'
            ? 'read'
            : method === 'POST'
              ? 'create'
              : method === 'DELETE'
                ? 'delete'
                : 'update'
        const allowed: readonly string[] =
          (declared.permissions as Record<string, readonly string[]>)[action] ?? []
        const held = [...user.roles, 'public']
        if (!allowed.some((role) => held.includes(role))) {
          return json(403, {
            error: { code: 'FORBIDDEN', message: `Access denied: ${action} on ${taxonomy}.` },
          })
        }

        if (id === undefined && method === 'GET') {
          return json(200, { data: terms })
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

        if (id !== undefined && method === 'DELETE') {
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

      if (menuItemMatch !== null) {
        const [, menuId = '', itemId, action] = menuItemMatch

        if (itemId === undefined && method === 'POST') {
          if (!mayWriteMenus) {
            return json(403, { error: { code: 'FORBIDDEN', message: 'Access denied: menus.' } })
          }
          itemCounter += 1
          const parent = typeof body.parent === 'string' ? body.parent : null
          const parentItem = menuItems.find((item) => item.id === parent)
          const created = {
            id: `item-${itemCounter}`,
            menuId,
            parent,
            label: body.label,
            kind: body.kind,
            targetCollection: body.targetCollection ?? null,
            targetEntryId: body.targetEntryId ?? null,
            url: body.url ?? null,
            position: menuItems.filter((item) => item.menuId === menuId && item.parent === parent)
              .length,
            depth: parentItem === undefined ? 0 : parentItem.depth + 1,
            openInNewTab: body.openInNewTab === true,
          }
          menuItems.push(created)
          return json(201, { data: created })
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
          menuCounter += 1
          const created = {
            id: `menu-${menuCounter}`,
            name: body.name,
            locale: body.locale,
            label: body.label,
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
          // Tree order, the same way the real store walks a materialised
          // path: group by parent, sort each group by `position`, then
          // depth-first from the roots — never the raw insertion order,
          // which a reorder must not leave unchanged.
          const byParent = new Map<string | null, typeof menuItems>()
          for (const item of menuItems.filter((candidate) => candidate.menuId === id)) {
            const siblings = byParent.get(item.parent) ?? []
            siblings.push(item)
            byParent.set(item.parent, siblings)
          }
          for (const siblings of byParent.values()) siblings.sort((a, b) => a.position - b.position)
          const items: typeof menuItems = []
          const visit = (parent: string | null): void => {
            for (const item of byParent.get(parent) ?? []) {
              items.push(item)
              visit(item.id)
            }
          }
          visit(null)
          return json(200, { data: { ...menu, items } })
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

      const contentMatch = /\/api\/content\/([^/?]+)(?:\/([^/?]+))?(?:\?.*)?$/u.exec(url)
      if (contentMatch !== null) {
        const [, collection, id] = contentMatch

        if (collection === 'article' && id === undefined && method === 'GET') {
          const parsed = new URL(url, 'http://localhost')
          const trashed = parsed.searchParams.get('trashed')

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
            return json(200, { data: items, page: { hasMore: false, nextCursor: null } })
          }

          const statusFilter = parsed.searchParams.get('status')
          const items =
            statusFilter === null
              ? MOCK_ENTRIES
              : MOCK_ENTRIES.filter((entry) => entry.status === statusFilter)
          return json(200, { data: items, page: { hasMore: false, nextCursor: null } })
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
      }

      // The two trash routes. Both `delete`, both refusing an actor without
      // it — and `purge` is a POST on its own path rather than a second
      // meaning for DELETE, which is exactly what the client sends.
      const trashActionMatch = /\/api\/content\/([^/?]+)\/([^/?]+)\/(untrash|purge)$/u.exec(url)
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

        // products
        if (segments[0] === 'products' && segments.length === 1 && method === 'GET') {
          const refused = commerceRefused('commerce.read')
          if (refused !== null) return refused
          return json(200, { products: mockProducts })
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
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
          }
          mockProducts.push(product)
          return json(201, product)
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
            allowBackorder: false,
            weightGrams: 0,
            taxCategory: 'standard',
            position: 0,
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
          return json(200, variant)
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
          variant.onHand = Number(body.onHand)
          return json(200, variant)
        }

        // orders
        if (segments[0] === 'orders' && segments.length === 1 && method === 'GET') {
          const refused = commerceRefused('commerce.read')
          if (refused !== null) return refused
          const status = parsed.searchParams.get('status')
          return json(200, {
            orders: status === null ? mockOrders : mockOrders.filter((o) => o.status === status),
          })
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
          payment.status = 'refunded'
          return json(200, payment)
        }

        return json(405, { error: { code: 'INTERNAL', message: 'No such route.' } })
      }

      // `/api/redirects` — admin-only on every method, like the real router.
      if (url.includes('/api/redirects')) {
        if (!user.roles.includes('admin')) {
          return json(403, {
            error: { code: 'FORBIDDEN', message: 'Access denied: redirects are admin-only.' },
          })
        }

        if (method === 'GET') {
          return json(200, { data: redirects })
        }

        if (method === 'POST') {
          if (typeof body.from !== 'string' || typeof body.to !== 'string') {
            return json(400, {
              error: {
                code: 'CONTENT_ROUTE_INVALID',
                message: 'A redirect needs "from" and "to".',
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
          const created = {
            id: `redirect-${redirectCounter}`,
            from: body.from,
            to: body.to,
            status: (body.status === 302 ? 302 : 301) as 301 | 302,
            collection: null,
            entryId: null,
            locale: null,
            reason: 'manual' as const,
            createdAt: Date.parse('2026-03-01T00:00:00.000Z'),
          }
          redirects.push(created)
          return json(201, { data: created })
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

      if (url.endsWith('/api/assistant') && method === 'GET') {
        const assistant = options.assistant ?? { available: false, tools: [] }
        return json(200, {
          data: { available: assistant.available, tools: assistant.tools ?? [] },
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

      throw new Error(`unhandled request in test: ${method} ${url}`)
    }),
  )
}
