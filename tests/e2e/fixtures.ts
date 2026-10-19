import { type APIRequestContext, test as base, expect } from '@playwright/test'

export type Role = 'admin' | 'editor' | 'viewer'

export async function loginToken(request: APIRequestContext, role: Role): Promise<string> {
  const response = await request.post('/api/auth/login', {
    data: { email: `${role}@e2e.example.test`, password: 'browser-fixture-password-2026' },
  })
  expect(response.status()).toBe(200)
  const body: { data: { session: { token: string } } } = await response.json()
  return body.data.session.token
}

export const test = base.extend<{ adminToken: string }>({
  adminToken: async ({ request }, use) => {
    await use(await loginToken(request, 'admin'))
  },
})
export { expect }
