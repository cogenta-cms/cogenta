import { vi } from 'vitest'

export interface MockUser {
  readonly id: string
  readonly email: string
  readonly roles: readonly string[]
}

export const USER: MockUser = { id: 'user-1', email: 'alice@example.com', roles: ['editor'] }
export const VALID_TOKEN = 'valid-test-token'

export const MOCK_SCHEMA = {
  contract: 'schema@1.0',
  collections: [
    {
      name: 'article',
      labels: { singular: 'Article', plural: 'Articles' },
      permissions: {
        read: ['public'],
        create: ['editor'],
        update: ['editor'],
        delete: ['editor'],
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
    {
      name: 'secret-memo',
      labels: { singular: 'Secret memo', plural: 'Secret memos' },
      permissions: { read: ['admin'] },
      fields: [],
    },
  ],
}

export const MOCK_ENTRIES = [
  {
    id: 'entry-1',
    status: 'published',
    version: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    values: { title: 'First article' },
    blocks: {},
  },
  {
    id: 'entry-2',
    status: 'draft',
    version: 1,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
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
    readonly requireTotpSetup?: boolean
  } = {},
): void {
  const password = options.password ?? 'correct horse battery staple'
  const session = () => ({
    status: 'session',
    session: { id: 'session-1', token: VALID_TOKEN, expiresAt: '2030-01-01T00:00:00.000Z' },
    user: USER,
  })

  // Media state lives per `installMockFetch()` call — each test starts with
  // an empty library and grows it through the same upload/edit/delete routes
  // the real server exposes, not through a shared module-level fixture.
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
        if (options.requireTotpSetup === true) {
          return json(200, { data: { status: 'totp_setup_required', ticket: 'setup-ticket-1' } })
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

      if (url.endsWith('/api/auth/totp-setup') && method === 'POST') {
        if (body.ticket !== 'setup-ticket-1') {
          return json(401, { error: { code: 'AUTH_SESSION_INVALID', message: 'Invalid ticket.' } })
        }
        return json(200, {
          data: { secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/Cogenta:alice@example.com' },
        })
      }

      if (url.endsWith('/api/auth/totp-setup-confirm') && method === 'POST') {
        if (body.ticket !== 'setup-ticket-1' || body.token !== '123456') {
          return json(401, {
            error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Incorrect verification code.' },
          })
        }
        return json(200, { data: session() })
      }

      if (url.endsWith('/api/auth/session') && method === 'GET') {
        if (auth === `Bearer ${VALID_TOKEN}`) return json(200, { data: USER })
        return json(401, { error: { code: 'AUTH_SESSION_INVALID', message: 'No active session.' } })
      }

      if (url.endsWith('/api/auth/session') && method === 'DELETE') {
        return new Response(null, { status: 204 })
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
        return json(200, { data: MOCK_SCHEMA })
      }

      const versionMatch =
        /\/api\/content\/([^/?]+)\/([^/?]+)\/(history|diff|restore)(?:\?.*)?$/u.exec(url)
      if (versionMatch !== null) {
        const [, collection, id, action] = versionMatch

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

      const contentMatch = /\/api\/content\/([^/?]+)(?:\/([^/?]+))?(?:\?.*)?$/u.exec(url)
      if (contentMatch !== null) {
        const [, collection, id] = contentMatch

        if (collection === 'article' && id === undefined && method === 'GET') {
          const parsed = new URL(url, 'http://localhost')
          const statusFilter = parsed.searchParams.get('status')
          const items =
            statusFilter === null
              ? MOCK_ENTRIES
              : MOCK_ENTRIES.filter((entry) => entry.status === statusFilter)
          return json(200, { data: items, page: { hasMore: false, nextCursor: null } })
        }

        if (collection === 'article' && id !== undefined && method === 'GET') {
          const entry = MOCK_ENTRIES.find((candidate) => candidate.id === id)
          if (entry === undefined) {
            return json(404, {
              error: { code: 'CONTENT_NOT_FOUND', message: 'No entry with that id.' },
            })
          }
          return json(200, { data: entry })
        }

        if (collection === 'article' && id === undefined && method === 'POST') {
          const created = {
            id: 'entry-new',
            status: 'draft',
            version: 1,
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-01T00:00:00.000Z',
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

      throw new Error(`unhandled request in test: ${method} ${url}`)
    }),
  )
}
