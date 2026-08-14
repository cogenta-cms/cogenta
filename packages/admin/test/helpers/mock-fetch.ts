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
      permissions: { read: ['public'], create: ['editor'] },
    },
    {
      name: 'secret-memo',
      labels: { singular: 'Secret memo', plural: 'Secret memos' },
      permissions: { read: ['admin'] },
    },
  ],
}

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

      throw new Error(`unhandled request in test: ${method} ${url}`)
    }),
  )
}
