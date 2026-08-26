import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveProviderRegistryConfig } from '../../src/providers/resolve.js'
import type { ProviderConfigStore } from '../../src/providers/store.js'
import { createFileProviderConfigStore } from '../../src/providers/store.js'

let dir: string
let store: ProviderConfigStore

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cogenta-providers-store-'))
  store = createFileProviderConfigStore({ dir, signingKey: 'a-real-signing-key-of-some-length' })
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('createFileProviderConfigStore', () => {
  it('starts empty', async () => {
    expect(await store.list()).toEqual([])
  })

  it('never returns the plaintext key from list/get/upsert', async () => {
    const saved = await store.upsert({
      provider: 'anthropic',
      apiKey: 'sk-ant-super-secret-value',
      model: 'claude-sonnet',
    })
    expect(JSON.stringify(saved)).not.toContain('super-secret')
    expect(saved.maskedKey).toBe('••••alue')

    const fetched = await store.get('anthropic')
    expect(JSON.stringify(fetched)).not.toContain('super-secret')
  })

  it('decrypts back to the exact key that was saved', async () => {
    await store.upsert({ provider: 'openai', apiKey: 'sk-openai-abc123', model: 'gpt-5' })
    expect(await store.decryptKey('openai')).toBe('sk-openai-abc123')
  })

  it('the on-disk file never contains the plaintext key', async () => {
    await store.upsert({ provider: 'google', apiKey: 'a-plaintext-secret-key', model: 'gemini' })
    const { readFile } = await import('node:fs/promises')
    const raw = await readFile(join(dir, 'google.json'), 'utf8')
    expect(raw).not.toContain('a-plaintext-secret-key')
  })

  it('throws PROVIDER_NOT_CONFIGURED decrypting a provider with no saved key', async () => {
    await expect(store.decryptKey('anthropic')).rejects.toMatchObject({
      code: 'PROVIDER_NOT_CONFIGURED',
    })
  })

  it('setEnabled toggles without touching the saved key', async () => {
    await store.upsert({ provider: 'anthropic', apiKey: 'sk-1', model: 'claude' })
    const disabled = await store.setEnabled('anthropic', false)
    expect(disabled.enabled).toBe(false)
    expect(await store.decryptKey('anthropic')).toBe('sk-1')
  })

  it('remove deletes the record entirely', async () => {
    await store.upsert({ provider: 'anthropic', apiKey: 'sk-1', model: 'claude' })
    await store.remove('anthropic')
    expect(await store.get('anthropic')).toBeUndefined()
  })

  it('updateSettings changes the model without touching the saved key', async () => {
    await store.upsert({ provider: 'anthropic', apiKey: 'sk-1', model: 'claude-haiku' })
    const updated = await store.updateSettings('anthropic', { model: 'claude-sonnet' })
    expect(updated.model).toBe('claude-sonnet')
    expect(await store.decryptKey('anthropic')).toBe('sk-1')
  })

  it('updateSettings throws PROVIDER_NOT_CONFIGURED for a provider with no saved key', async () => {
    await expect(store.updateSettings('anthropic', { model: 'x' })).rejects.toMatchObject({
      code: 'PROVIDER_NOT_CONFIGURED',
    })
  })

  // Fiche 56: `provider` is a free string now — these are the write-boundary
  // checks that keep that safe.
  it('upsert accepts a catalog id with no baseUrl', async () => {
    const saved = await store.upsert({ provider: 'openrouter', apiKey: 'or-1', model: 'x' })
    expect(saved.provider).toBe('openrouter')
  })

  it('upsert accepts a custom id when it carries a baseUrl', async () => {
    const saved = await store.upsert({
      provider: 'my-vllm-server',
      apiKey: 'sk-local',
      model: 'llama-3',
      baseUrl: 'https://vllm.internal/v1/chat/completions',
    })
    expect(saved.provider).toBe('my-vllm-server')
  })

  it('upsert throws PROVIDER_CUSTOM_BASE_URL_REQUIRED for a custom id with no baseUrl', async () => {
    await expect(
      store.upsert({ provider: 'not-a-real-provider', apiKey: 'x', model: 'x' }),
    ).rejects.toMatchObject({ code: 'PROVIDER_CUSTOM_BASE_URL_REQUIRED' })
  })

  it('upsert throws PROVIDER_ID_INVALID for an id that is not a plain slug', async () => {
    await expect(
      store.upsert({
        provider: '../escape',
        apiKey: 'x',
        model: 'x',
        baseUrl: 'https://example.test/v1/chat/completions',
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_ID_INVALID' })
  })

  it('upsert throws PROVIDER_ID_INVALID for an empty id', async () => {
    await expect(
      store.upsert({
        provider: '',
        apiKey: 'x',
        model: 'x',
        baseUrl: 'https://example.test/v1/chat/completions',
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_ID_INVALID' })
  })

  it('updateSettings refuses to clear the baseUrl of a custom provider (it would become unresolvable)', async () => {
    await store.upsert({
      provider: 'my-vllm-server',
      apiKey: 'sk-local',
      model: 'llama-3',
      baseUrl: 'https://vllm.internal/v1/chat/completions',
    })
    await expect(store.updateSettings('my-vllm-server', { baseUrl: '' })).rejects.toMatchObject({
      code: 'PROVIDER_CUSTOM_BASE_URL_REQUIRED',
    })
  })

  // Security review of fiche 56: widening `provider` to a free string also
  // widened `fileFor()`'s attack surface — every method that builds a path
  // from `provider` must reject a traversal-shaped id, not just `upsert`.
  // `providers-router.ts` no longer allowlists `provider` against a fixed
  // name list before calling these (it now has to admit catalog and custom
  // ids), so this store is the only remaining checkpoint.
  const TRAVERSAL_ID = '../agents/some-agent'

  it('get rejects a traversal-shaped id rather than reading outside the providers directory', async () => {
    await expect(store.get(TRAVERSAL_ID)).rejects.toMatchObject({ code: 'PROVIDER_ID_INVALID' })
  })

  it('setEnabled rejects a traversal-shaped id', async () => {
    await expect(store.setEnabled(TRAVERSAL_ID, true)).rejects.toMatchObject({
      code: 'PROVIDER_ID_INVALID',
    })
  })

  it('updateSettings rejects a traversal-shaped id', async () => {
    await expect(store.updateSettings(TRAVERSAL_ID, { model: 'x' })).rejects.toMatchObject({
      code: 'PROVIDER_ID_INVALID',
    })
  })

  it('remove rejects a traversal-shaped id rather than deleting outside the providers directory', async () => {
    await expect(store.remove(TRAVERSAL_ID)).rejects.toMatchObject({
      code: 'PROVIDER_ID_INVALID',
    })
  })

  it('decryptKey rejects a traversal-shaped id', async () => {
    await expect(store.decryptKey(TRAVERSAL_ID)).rejects.toMatchObject({
      code: 'PROVIDER_ID_INVALID',
    })
  })

  it('a validation error from a malformed id is never rewritten into a generic INTERNAL "file may be corrupted" error', async () => {
    // Regression: `readRecord` used to wrap `fileFor(provider)` — which
    // validates — inside its own try/catch, so a thrown `PROVIDER_ID_INVALID`
    // was caught and replaced with a misleading `INTERNAL` error.
    await expect(store.get(TRAVERSAL_ID)).rejects.not.toMatchObject({ code: 'INTERNAL' })
  })
})

describe('resolveProviderRegistryConfig', () => {
  it('includes only enabled providers, with real decrypted keys', async () => {
    await store.upsert({ provider: 'anthropic', apiKey: 'sk-ant-1', model: 'claude-sonnet' })
    await store.upsert({
      provider: 'openai',
      apiKey: 'sk-oai-1',
      model: 'gpt-5',
      enabled: false,
    })

    const config = await resolveProviderRegistryConfig(store)
    expect(config.anthropic).toEqual({ apiKey: 'sk-ant-1', model: 'claude-sonnet' })
    expect(config.openai).toBeUndefined()
  })

  it('is empty when nothing is configured (R2)', async () => {
    expect(await resolveProviderRegistryConfig(store)).toEqual({})
  })
})
