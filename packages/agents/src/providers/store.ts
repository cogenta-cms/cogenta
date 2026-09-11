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
  /**
   * The completion budget (`ProviderClient.maxOutputTokens`), request retry
   * count (`maxCorrectionAttempts`) and HTTP/agent-loop timeout
   * (`requestTimeoutMs`, milliseconds) this provider's client resolves to.
   * Absent means "use the built-in fallback" (`resolve.ts`) — every one of
   * these was, before this admin surface existed, a number hardcoded per
   * call site with no way for an admin to say "this particular model needs
   * more room to think" (the exact bug a real reasoning-model run
   * reproduced: DeepSeek's `deepseek-v4-flash` silently truncated to an
   * empty response at a too-low hardcoded ceiling).
   */
  readonly maxOutputTokens?: number
  readonly requestTimeoutMs?: number
  readonly maxCorrectionAttempts?: number
  /**
   * The model this vendor renders *images* with, when it can.
   *
   * Capability is derived from the models declared, never stored as a
   * separate flag: a multimodal vendor shares one key and one base URL and
   * simply has a second model name, and an explicit `capabilities: ['image']`
   * alongside an absent image model would be a record contradicting itself.
   * Absent means this entry is text-only, which is what every entry saved
   * before this field was.
   */
  readonly imageModel?: string
  /**
   * The full image endpoint, when a proxy or a self-hosted gateway serves
   * one. Separate from `baseUrl` on purpose: on both image clients this is
   * the complete URL (`…/v1/images/generations`), and the text `baseUrl` is
   * a different complete URL — sharing one field would send an image payload
   * to a chat endpoint.
   */
  readonly imageBaseUrl?: string
}

export interface ProviderConfigInput {
  readonly provider: ProviderName
  readonly apiKey: string
  readonly model: string
  readonly baseUrl?: string
  readonly enabled?: boolean
  readonly maxOutputTokens?: number
  readonly requestTimeoutMs?: number
  readonly maxCorrectionAttempts?: number
  /** Set it to declare this vendor can also generate images; clear it (empty string) to say it cannot any more. */
  readonly imageModel?: string
  readonly imageBaseUrl?: string
}

/** Bounds wide enough for any real model/deployment, narrow enough to catch a typo (a negative, a zero, or a value nobody would deliberately set) before it reaches an HTTP request. */
const TUNING_BOUNDS = {
  maxOutputTokens: { min: 1, max: 200_000 },
  requestTimeoutMs: { min: 1000, max: 600_000 },
  maxCorrectionAttempts: { min: 1, max: 10 },
} as const

function assertValidTuning(
  input: Pick<
    ProviderConfigInput,
    'maxOutputTokens' | 'requestTimeoutMs' | 'maxCorrectionAttempts'
  >,
): void {
  for (const [field, bounds] of Object.entries(TUNING_BOUNDS) as [
    keyof typeof TUNING_BOUNDS,
    (typeof TUNING_BOUNDS)[keyof typeof TUNING_BOUNDS],
  ][]) {
    const value = input[field]
    if (value === undefined) continue
    if (!Number.isInteger(value) || value < bounds.min || value > bounds.max) {
      throw new CogentaError({
        code: 'PROVIDER_TUNING_INVALID',
        message: `"${field}" must be a whole number between ${bounds.min} and ${bounds.max}.`,
        hint: 'Leave it empty to use the built-in default for this field.',
      })
    }
  }
}

export interface ProviderConfigStore {
  list(): Promise<readonly StoredProviderConfig[]>
  get(provider: ProviderName): Promise<StoredProviderConfig | undefined>
  /** Encrypts and persists `apiKey`; creates or overwrites this provider's one record. */
  upsert(input: ProviderConfigInput): Promise<StoredProviderConfig>
  setEnabled(provider: ProviderName, enabled: boolean): Promise<StoredProviderConfig>
  /**
   * Changes `model`/`baseUrl`/tuning without touching the saved key — so an
   * admin can adjust any of these, including *after* the first save,
   * without being made to re-paste an API key they may no longer have
   * handy. `undefined` on a tuning field leaves it as saved; `null`
   * explicitly clears it back to "use the built-in default" (the one thing
   * a plain optional field can't express — leaving it out of the patch and
   * clearing it back to unset need distinct wire shapes). Throws
   * `PROVIDER_NOT_CONFIGURED` if this provider has no saved key yet.
   */
  updateSettings(
    provider: ProviderName,
    patch: {
      readonly model?: string
      readonly baseUrl?: string
      readonly maxOutputTokens?: number | null
      readonly requestTimeoutMs?: number | null
      readonly maxCorrectionAttempts?: number | null
      /** `null` clears it: this vendor stops offering images. */
      readonly imageModel?: string | null
      readonly imageBaseUrl?: string | null
    },
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
  readonly maxOutputTokens?: number
  readonly requestTimeoutMs?: number
  readonly maxCorrectionAttempts?: number
  readonly imageModel?: string
  readonly imageBaseUrl?: string
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
    ...(record.maxOutputTokens === undefined ? {} : { maxOutputTokens: record.maxOutputTokens }),
    ...(record.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: record.requestTimeoutMs }),
    ...(record.maxCorrectionAttempts === undefined
      ? {}
      : { maxCorrectionAttempts: record.maxCorrectionAttempts }),
    ...(record.imageModel === undefined || record.imageModel === ''
      ? {}
      : { imageModel: record.imageModel }),
    ...(record.imageBaseUrl === undefined || record.imageBaseUrl === ''
      ? {}
      : { imageBaseUrl: record.imageBaseUrl }),
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
      assertValidTuning(input)
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
        ...(input.maxOutputTokens === undefined ? {} : { maxOutputTokens: input.maxOutputTokens }),
        ...(input.requestTimeoutMs === undefined
          ? {}
          : { requestTimeoutMs: input.requestTimeoutMs }),
        ...(input.maxCorrectionAttempts === undefined
          ? {}
          : { maxCorrectionAttempts: input.maxCorrectionAttempts }),
        // An empty string is how the admin says "this vendor no longer does
        // images" — kept distinct from absent, which means the field was
        // never sent at all.
        ...(input.imageModel === undefined || input.imageModel.trim() === ''
          ? {}
          : { imageModel: input.imageModel.trim() }),
        ...(input.imageBaseUrl === undefined || input.imageBaseUrl.trim() === ''
          ? {}
          : { imageBaseUrl: input.imageBaseUrl.trim() }),
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
      assertValidTuning({
        ...(patch.maxOutputTokens === undefined || patch.maxOutputTokens === null
          ? {}
          : { maxOutputTokens: patch.maxOutputTokens }),
        ...(patch.requestTimeoutMs === undefined || patch.requestTimeoutMs === null
          ? {}
          : { requestTimeoutMs: patch.requestTimeoutMs }),
        ...(patch.maxCorrectionAttempts === undefined || patch.maxCorrectionAttempts === null
          ? {}
          : { maxCorrectionAttempts: patch.maxCorrectionAttempts }),
      })
      // `null` clears a tuning field back to "use the built-in default";
      // `undefined` leaves it exactly as saved — the reason this can't just
      // be `patch.x ?? existing.x` the way `model` above is. Starting from
      // `existing` stripped of all three (rather than the full record) and
      // re-adding only what survives is what lets a `null` actually delete
      // the key instead of merely being overwritten back to its old value.
      const {
        maxOutputTokens: _existingMaxOutputTokens,
        requestTimeoutMs: _existingRequestTimeoutMs,
        maxCorrectionAttempts: _existingMaxCorrectionAttempts,
        // Stripped for the same reason as the three above: `null` has to be
        // able to actually delete the key, which it cannot do if the old
        // value is still spread in underneath.
        imageModel: _existingImageModel,
        imageBaseUrl: _existingImageBaseUrl,
        ...existingWithoutTuning
      } = existing
      const nextMaxOutputTokens =
        patch.maxOutputTokens === undefined
          ? existing.maxOutputTokens
          : (patch.maxOutputTokens ?? undefined)
      const nextRequestTimeoutMs =
        patch.requestTimeoutMs === undefined
          ? existing.requestTimeoutMs
          : (patch.requestTimeoutMs ?? undefined)
      const nextMaxCorrectionAttempts =
        patch.maxCorrectionAttempts === undefined
          ? existing.maxCorrectionAttempts
          : (patch.maxCorrectionAttempts ?? undefined)
      const nextImageModel =
        patch.imageModel === undefined ? existing.imageModel : (patch.imageModel ?? undefined)
      const nextImageBaseUrl =
        patch.imageBaseUrl === undefined ? existing.imageBaseUrl : (patch.imageBaseUrl ?? undefined)
      const updated: EncryptedRecord = {
        ...existingWithoutTuning,
        model: patch.model ?? existing.model,
        ...(nextBaseUrl === undefined ? {} : { baseUrl: nextBaseUrl }),
        updatedAt: now().toISOString(),
        ...(nextMaxOutputTokens === undefined ? {} : { maxOutputTokens: nextMaxOutputTokens }),
        ...(nextRequestTimeoutMs === undefined ? {} : { requestTimeoutMs: nextRequestTimeoutMs }),
        ...(nextMaxCorrectionAttempts === undefined
          ? {}
          : { maxCorrectionAttempts: nextMaxCorrectionAttempts }),
        ...(nextImageModel === undefined || nextImageModel === ''
          ? {}
          : { imageModel: nextImageModel }),
        ...(nextImageBaseUrl === undefined || nextImageBaseUrl === ''
          ? {}
          : { imageBaseUrl: nextImageBaseUrl }),
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
