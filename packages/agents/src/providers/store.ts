import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CogentaError } from '@cogenta/core'
import { findProviderCatalogEntry } from './catalog.js'
import type { ProviderName } from './registry.js'

/**
 * L22 task 1bis's "Providers" screen: which LLM providers this site has
 * configured, each one's API key, and its default model — persisted so an
 * operator can turn a provider on from the admin instead of only via
 * `COGENTA_LLM_API_KEY`/`cogenta.config.mjs`'s single `llm` section
 * (`@cogenta/core`'s `llmSchema`, unchanged and still the install-time
 * default — `agents/orchestrator.ts` imports it as the first configured
 * provider the first time this store is read, so an existing site loses
 * nothing by upgrading).
 *
 * Fiche 56 widened `provider` from the closed 3-literal union to a free
 * string (`registry.ts`'s `ProviderName`) so a catalog id (OpenRouter,
 * DeepSeek, Qwen, GLM, …) or an operator-chosen custom id both fit. `upsert`
 * is the write boundary that keeps this safe: `assertValidProviderId` rejects
 * anything that is not a plain slug (this store builds a filename directly
 * from `provider` — see `fileFor` — so a malformed id is a path-traversal
 * risk, not merely an aesthetic one), and a name absent from the catalog
 * must carry its own `baseUrl` or it could never resolve to a working client
 * (`registry.ts`'s `buildClient` throws `PROVIDER_CUSTOM_BASE_URL_REQUIRED`
 * for exactly that case — this store refuses the same shape earlier, at the
 * point an operator can still fix it, rather than at first agent run).
 *
 * "Jamais affichée en clair une fois enregistrée" (the lot's own words, same
 * discipline as `create-cogenta`'s masked key prompt) rules out storing the
 * key as recoverable plaintext an API response could echo back — but an LLM
 * call still needs the real key at request time, which rules out a one-way
 * hash (`@cogenta/auth`'s `ApiKeyStore` model: fine for a bearer token this
 * site itself verifies, useless for a key a *vendor* must see). This store
 * therefore encrypts at rest (AES-256-GCM, `node:crypto`, zero new
 * dependency — R9/R10) with a key derived from `COGENTA_AUTH_SIGNING_KEY`
 * (the secret every real deployment already has, R7 — no second secret to
 * generate, rotate or lose) via `scryptSync` with a purpose-specific salt,
 * so the derived key is never the literal signing key reused across
 * purposes. `list()`/`get()` return only a masked preview; the plaintext key
 * is decrypted solely inside `resolveProviderRegistryConfig`, which the
 * runtime hands straight to `createProviderRegistry` and never logs or
 * returns over the wire (R7).
 */

/**
 * A safe filename component and a reasonable admin-typed identifier: lower-
 * case slug, 2-64 characters, no leading/trailing/doubled hyphen. Every
 * catalog id in `catalog.ts` matches this by construction; the check exists
 * for an operator-typed custom provider id.
 */
const PROVIDER_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+){0,10}$/u

function assertValidProviderId(provider: string): void {
  if (PROVIDER_ID_PATTERN.test(provider) && provider.length <= 64) return
  throw new CogentaError({
    code: 'PROVIDER_ID_INVALID',
    message: `"${provider}" is not a valid provider id.`,
    hint: 'Use lowercase letters, digits and single hyphens only (e.g. "openrouter", "my-vllm-server").',
  })
}

/** A provider id the catalog does not know needs its own `baseUrl` — otherwise it could never resolve to a working client (see `registry.ts`'s `buildClient`). */
function assertResolvable(provider: string, baseUrl: string | undefined): void {
  if (findProviderCatalogEntry(provider) !== undefined) return
  if (baseUrl !== undefined && baseUrl.trim().length > 0) return
  throw new CogentaError({
    code: 'PROVIDER_CUSTOM_BASE_URL_REQUIRED',
    message: `"${provider}" is not a built-in provider — a custom provider needs a non-empty "baseUrl".`,
    hint: 'Add a baseUrl pointing at an OpenAI-compatible chat completions endpoint, or use a catalog provider id.',
  })
}

export interface StoredProviderConfig {
  readonly provider: ProviderName
  readonly enabled: boolean
  readonly model: string
  readonly baseUrl?: string
  /** Last 4 characters of the real key, for the admin to confirm which key is saved without ever re-displaying it in full. */
  readonly maskedKey: string
  readonly updatedAt: string
}

export interface ProviderConfigInput {
  readonly provider: ProviderName
  readonly apiKey: string
  readonly model: string
  readonly baseUrl?: string
  readonly enabled?: boolean
}

export interface ProviderConfigStore {
  list(): Promise<readonly StoredProviderConfig[]>
  get(provider: ProviderName): Promise<StoredProviderConfig | undefined>
  /** Encrypts and persists `apiKey`; creates or overwrites this provider's one record. */
  upsert(input: ProviderConfigInput): Promise<StoredProviderConfig>
  setEnabled(provider: ProviderName, enabled: boolean): Promise<StoredProviderConfig>
  /** Changes `model`/`baseUrl` without touching the saved key — so the admin can rename a default model without being made to re-paste the API key. Throws `PROVIDER_NOT_CONFIGURED` if this provider has no saved key yet. */
  updateSettings(
    provider: ProviderName,
    patch: { readonly model?: string; readonly baseUrl?: string },
  ): Promise<StoredProviderConfig>
  remove(provider: ProviderName): Promise<void>
  /** The one place the real key is ever decrypted — never exposed on `StoredProviderConfig` itself. Throws `PROVIDER_NOT_CONFIGURED` if this provider has no saved key. */
  decryptKey(provider: ProviderName): Promise<string>
}

interface EncryptedRecord {
  readonly provider: ProviderName
  readonly enabled: boolean
  readonly model: string
  readonly baseUrl?: string
  readonly maskedKey: string
  readonly iv: string
  readonly authTag: string
  readonly ciphertext: string
  readonly updatedAt: string
}

const KEY_DERIVATION_SALT = 'cogenta-provider-secrets-v1'
const ALGORITHM = 'aes-256-gcm'

function deriveKey(signingKey: string): Buffer {
  return scryptSync(signingKey, KEY_DERIVATION_SALT, 32)
}

function mask(apiKey: string): string {
  const tail = apiKey.slice(-4)
  return tail.length === 0 ? '••••' : `••••${tail}`
}

function providerNotConfigured(provider: ProviderName): CogentaError {
  return new CogentaError({
    code: 'PROVIDER_NOT_CONFIGURED',
    message: `No API key is saved for "${provider}".`,
    hint: 'Configure it from the admin\'s "Providers" screen first.',
  })
}

function toSummary(record: EncryptedRecord): StoredProviderConfig {
  return {
    provider: record.provider,
    enabled: record.enabled,
    model: record.model,
    ...(record.baseUrl === undefined ? {} : { baseUrl: record.baseUrl }),
    maskedKey: record.maskedKey,
    updatedAt: record.updatedAt,
  }
}

export interface FileProviderConfigStoreOptions {
  readonly dir: string
  /** `COGENTA_AUTH_SIGNING_KEY` — the encryption key is derived from it, never stored itself. */
  readonly signingKey: string
  readonly now?: () => Date
}

/** One `<provider>.json` record per configured provider, under `options.dir` — the same one-file-per-record shape every other file store in this package uses (R1: no external service). */
export function createFileProviderConfigStore(
  options: FileProviderConfigStoreOptions,
): ProviderConfigStore {
  const now = options.now ?? ((): Date => new Date())
  const key = deriveKey(options.signingKey)
  const ready = mkdir(options.dir, { recursive: true })

  /**
   * The one place every method that touches disk builds a path from
   * `provider` — validating here, rather than only in `upsert`, is what
   * closes the path-traversal gap `PATCH`/`DELETE /api/providers/:provider`
   * would otherwise reopen: the router no longer allowlists `provider`
   * against a fixed name list before calling `setEnabled`/`updateSettings`/
   * `remove` (fiche 56 removed that gate to admit catalog and custom ids),
   * so this store is the only remaining checkpoint before an attacker-
   * controlled string like `../../agents/some-agent` reaches `readFile`/
   * `writeFile`/`rm`. A caller of `get`/`decryptKey` on a malformed id gets
   * the same `PROVIDER_ID_INVALID` an `upsert` would — never a silent
   * "not found" that would let the check be bypassed by relying on ENOENT.
   */
  function fileFor(provider: ProviderName): string {
    assertValidProviderId(provider)
    return join(options.dir, `${provider}.json`)
  }

  function encrypt(plaintext: string): { iv: string; authTag: string; ciphertext: string } {
    const iv = randomBytes(12)
    const cipher = createCipheriv(ALGORITHM, key, iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    return {
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    }
  }

  function decrypt(record: EncryptedRecord): string {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(record.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(record.authTag, 'base64'))
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, 'base64')),
      decipher.final(),
    ])
    return plaintext.toString('utf8')
  }

  async function readRecord(provider: ProviderName): Promise<EncryptedRecord | null> {
    // `fileFor` (which validates `provider`) is called outside the try
    // block on purpose: a `PROVIDER_ID_INVALID` it throws must propagate as
    // itself, never be caught below and rewritten into a misleading
    // "the file may be corrupted" `INTERNAL` error.
    const path = fileFor(provider)
    try {
      const raw = await readFile(path, 'utf8')
      return JSON.parse(raw) as EncryptedRecord
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw new CogentaError({
        code: 'INTERNAL',
        message: `Could not read the saved configuration for provider "${provider}".`,
        hint: 'The file may be corrupted; consider removing it and reconfiguring the provider.',
        cause: error,
      })
    }
  }

  return {
    async list() {
      await ready
      const filenames = await readdir(options.dir).catch(() => [])
      const records: StoredProviderConfig[] = []
      for (const filename of filenames) {
        if (!filename.endsWith('.json')) continue
        const provider = filename.replace(/\.json$/u, '') as ProviderName
        if (!PROVIDER_ID_PATTERN.test(provider)) continue
        const record = await readRecord(provider)
        if (record !== null) records.push(toSummary(record))
      }
      return records.sort((a, b) => a.provider.localeCompare(b.provider))
    },

    async get(provider) {
      await ready
      const record = await readRecord(provider)
      return record === null ? undefined : toSummary(record)
    },

    async upsert(input) {
      await ready
      assertValidProviderId(input.provider)
      assertResolvable(input.provider, input.baseUrl)
      const { iv, authTag, ciphertext } = encrypt(input.apiKey)
      const record: EncryptedRecord = {
        provider: input.provider,
        enabled: input.enabled ?? true,
        model: input.model,
        ...(input.baseUrl === undefined ? {} : { baseUrl: input.baseUrl }),
        maskedKey: mask(input.apiKey),
        iv,
        authTag,
        ciphertext,
        updatedAt: now().toISOString(),
      }
      await writeFile(fileFor(input.provider), JSON.stringify(record, null, 2), 'utf8')
      return toSummary(record)
    },

    async setEnabled(provider, enabled) {
      await ready
      const existing = await readRecord(provider)
      if (existing === null) throw providerNotConfigured(provider)
      const updated: EncryptedRecord = { ...existing, enabled, updatedAt: now().toISOString() }
      await writeFile(fileFor(provider), JSON.stringify(updated, null, 2), 'utf8')
      return toSummary(updated)
    },

    async remove(provider) {
      await ready
      await rm(fileFor(provider), { force: true })
    },

    async updateSettings(provider, patch) {
      await ready
      const existing = await readRecord(provider)
      if (existing === null) throw providerNotConfigured(provider)
      const nextBaseUrl =
        patch.baseUrl !== undefined
          ? patch.baseUrl
          : existing.baseUrl === undefined
            ? undefined
            : existing.baseUrl
      assertResolvable(provider, nextBaseUrl)
      const updated: EncryptedRecord = {
        ...existing,
        model: patch.model ?? existing.model,
        ...(nextBaseUrl === undefined ? {} : { baseUrl: nextBaseUrl }),
        updatedAt: now().toISOString(),
      }
      await writeFile(fileFor(provider), JSON.stringify(updated, null, 2), 'utf8')
      return toSummary(updated)
    },

    async decryptKey(provider) {
      await ready
      const record = await readRecord(provider)
      if (record === null) throw providerNotConfigured(provider)
      return decrypt(record)
    },
  }
}
