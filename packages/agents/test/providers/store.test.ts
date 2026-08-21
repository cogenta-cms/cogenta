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
