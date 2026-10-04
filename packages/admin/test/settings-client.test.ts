import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../src/api/http.js'
import { listSettings } from '../src/api/settings-client.js'

afterEach(() => vi.unstubAllGlobals())

describe('settings authentication on the HTTP client', () => {
  it('sends the administrative session while retaining the requested locale', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ data: [{ key: 'discussion.moderationRequired' }] }),
    )
    vi.stubGlobal('fetch', fetcher)
    await listSettings('fr', 'session-token')
    expect(fetcher).toHaveBeenCalledWith(
      '/api/settings?locale=fr',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer session-token' }),
      }),
    )
  })

  it('keeps anonymous branding reads anonymous', async () => {
    const fetcher = vi.fn(async () => Response.json({ data: [] }))
    vi.stubGlobal('fetch', fetcher)
    await listSettings()
    expect(fetcher).toHaveBeenCalledWith(
      '/api/settings',
      expect.objectContaining({
        headers: { 'content-type': 'application/json' },
      }),
    )
  })

  it('reports a refused load instead of substituting the public settings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: { code: 'UNAUTHENTICATED', message: 'Session expired.' } },
          { status: 401 },
        ),
      ),
    )
    await expect(listSettings(undefined, 'expired')).rejects.toBeInstanceOf(ApiError)
  })
})
