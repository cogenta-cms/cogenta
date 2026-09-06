import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import {
  getProviderCatalog,
  listProviders,
  type ProviderCatalogEntry,
  type ProviderSummary,
  removeProvider,
  saveProvider,
  setProviderEnabled,
  updateProviderSettings,
} from '../api/providers-client.js'
import { listSettings, type SiteSetting, writeSetting } from '../api/settings-client.js'
import { useAuth } from '../auth/auth-context.js'
import { useAutosaveEnabled } from '../lib/autosave-prefs.js'
import { SiteSettingsField } from '../settings/site-settings-field.js'
import { useSectionAutosave } from '../settings/site-settings-section.js'
import {
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Modal,
  Notice,
  SavedIndicator,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
  useSavedIndicator,
} from '../ui/index.js'

/**
 * L22 task 1bis's "Providers" screen: which LLM providers this site has
 * enabled, an API key (never shown again once saved — masked the same way
 * `create-cogenta`'s install prompt now is), and a default model.
 *
 * Fiche 56 restructured the "add" form: the provider picker is driven by
 * `GET /api/providers/catalog` (`@cogenta/agents`' `KNOWN_PROVIDER_CATALOG`)
 * rather than a hard-coded three-name list, with an explicit "custom
 * provider" choice for any other OpenAI-compatible endpoint (a self-hosted
 * proxy, or a vendor not yet in the catalog) — the free-text model field
 * (already supported before this fiche) is paired with a known-models
 * picker for the selected provider, made an explicit concept rather than an
 * unlabelled text box.
 */

/** Sentinel provider selection meaning "not one of the catalog ids" — distinct from any real id, which `store.ts`'s `PROVIDER_ID_PATTERN` never produces starting with an underscore. */
const CUSTOM_PROVIDER = '__custom__'
/** Sentinel model-select value meaning "leave the free-text model field alone". */
const CUSTOM_MODEL = ''

/** `undefined` for a blank field ("use the built-in default") or anything that is not a positive whole number — the server's own bounds check (`PROVIDER_TUNING_INVALID`) is the source of truth on the upper end, this just keeps an obviously-wrong value from ever being sent. */
function parsePositiveInt(text: string): number | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return undefined
  const value = Number(trimmed)
  return Number.isInteger(value) && value > 0 ? value : undefined
}

/**
 * The site-wide floor every resolved provider client's own
 * `maxOutputTokens`/`requestTimeoutMs`/`maxCorrectionAttempts` falls back to
 * when a per-provider override above is left blank — fiche feedback:
 * these three numbers used to be TypeScript constants
 * (`FALLBACK_MAX_OUTPUT_TOKENS`/`DEFAULT_PROVIDER_REQUEST_TIMEOUT_MS`/
 * `FALLBACK_MAX_CORRECTION_ATTEMPTS` in `@cogenta/agents`), invisible and
 * unreachable from this screen — only ever mentioned as static hint text
 * naming a literal "(8000)"/"(180s)"/"(3)". They are now real, persisted
 * `assistant.*` site settings (`SITE_SETTINGS_REGISTRY` in `@cogenta/schema`),
 * rendered here the same generic way `appearance.tsx`'s "Marque" card
 * renders `branding.*` — its own `listSettings`/`writeSetting` round trip,
 * filtered to `DEFAULT_TUNING_KEYS` below (not the whole `assistant` group —
 * see that constant's own comment for why).
 */
const DEFAULT_TUNING_KEYS: ReadonlySet<string> = new Set([
  'assistant.defaultMaxOutputTokens',
  'assistant.defaultRequestTimeoutSeconds',
  'assistant.defaultMaxCorrectionAttempts',
])
function DefaultTuningCard({
  token,
  autosaveEnabled,
}: {
  readonly token: string
  readonly autosaveEnabled: boolean
}): JSX.Element {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<readonly SiteSetting[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const indicator = useSavedIndicator()

  const load = useCallback(async () => {
    try {
      const data = await listSettings()
      // Not every `group: 'assistant'` entry belongs here — `assistant
      // .indexedCollections` (L22 task 4) is a per-collection map, not a
      // scalar this generic card can render (its own doc comment in
      // `site-settings-registry.ts` says so explicitly), and already has a
      // dedicated screen (`assistant-index.tsx`). Filtering by key, not by
      // group, is what keeps that setting out of this card without this
      // card needing to know its shape.
      setSettings(data.filter((setting) => DEFAULT_TUNING_KEYS.has(setting.key)))
      setLoadError(null)
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : t('providers.defaultsLoadError'))
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  async function save(key: string, value: unknown): Promise<void> {
    await writeSetting(token, key, value)
    await load()
    indicator.show()
  }

  const section = useSectionAutosave(autosaveEnabled, (key, value) => save(key, value))

  return (
    <Card aria-labelledby="providers-defaults-heading">
      <CardHeader>
        <CardTitle>
          <h2 id="providers-defaults-heading">{t('providers.defaultsHeading')}</h2>
        </CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <p className="m-0 text-sm opacity-80">{t('providers.defaultsIntro')}</p>
        {loadError !== null && (
          <Notice tone="danger" live="assertive">
            <p>{loadError}</p>
          </Notice>
        )}
        {(settings ?? []).map((setting) => (
          <SiteSettingsField
            key={setting.key}
            setting={setting}
            canEdit
            translationNamespace="providers"
            onSave={(value) => save(setting.key, value)}
            {...section.fieldFor(setting.key, null)}
          />
        ))}
      </CardBody>
      <CardFooter>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          loading={section.saving}
          disabled={!section.hasPending}
          onClick={() => void section.flush()}
        >
          {t('providers.defaultsSaveAction')}
        </Button>
        <SavedIndicator visible={indicator.visible} label={t('providers.defaultsSaved')} />
      </CardFooter>
    </Card>
  )
}

export function ProvidersRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')
  const [autosaveEnabled] = useAutosaveEnabled()

  const [providers, setProviders] = useState<readonly ProviderSummary[]>([])
  const [catalog, setCatalog] = useState<readonly ProviderCatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const [formProviderId, setFormProviderId] = useState<string>(CUSTOM_PROVIDER)
  const [formCustomProviderId, setFormCustomProviderId] = useState('')
  const [formKey, setFormKey] = useState('')
  const [formModel, setFormModel] = useState('')
  const [formModelChoice, setFormModelChoice] = useState<string>(CUSTOM_MODEL)
  const [formBaseUrl, setFormBaseUrl] = useState('')
  /** Empty means "unset — use the built-in default"; kept as text so a partially-typed number never gets silently coerced to 0. */
  const [formMaxOutputTokens, setFormMaxOutputTokens] = useState('')
  const [formTimeoutSeconds, setFormTimeoutSeconds] = useState('')
  const [formMaxCorrectionAttempts, setFormMaxCorrectionAttempts] = useState('')

  // Fiche feedback: a saved provider's row had no way to change its own
  // model/baseUrl/tuning without re-pasting the API key (the top form's own
  // POST always needs one) — this edit dialog goes through PATCH instead,
  // which never touches the saved key.
  const [editing, setEditing] = useState<ProviderSummary | null>(null)
  const [editModel, setEditModel] = useState('')
  const [editBaseUrl, setEditBaseUrl] = useState('')
  const [editMaxOutputTokens, setEditMaxOutputTokens] = useState('')
  const [editTimeoutSeconds, setEditTimeoutSeconds] = useState('')
  const [editMaxCorrectionAttempts, setEditMaxCorrectionAttempts] = useState('')
  const [editBusy, setEditBusy] = useState(false)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      const [providerList, catalogList] = await Promise.all([
        listProviders(token),
        getProviderCatalog(token),
      ])
      setProviders(providerList)
      setCatalog(catalogList)
      setFormProviderId((current) =>
        current === CUSTOM_PROVIDER && catalogList.length > 0
          ? (catalogList[0]?.id ?? CUSTOM_PROVIDER)
          : current,
      )
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('providers.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    void load()
  }, [load])

  const selectedCatalogEntry = useMemo(
    () => catalog.find((entry) => entry.id === formProviderId),
    [catalog, formProviderId],
  )
  const isCustomProvider = formProviderId === CUSTOM_PROVIDER
  const effectiveProviderId = isCustomProvider ? formCustomProviderId.trim() : formProviderId

  function selectProvider(id: string): void {
    setFormProviderId(id)
    setFormModelChoice(CUSTOM_MODEL)
  }

  function selectKnownModel(modelId: string): void {
    setFormModelChoice(modelId)
    if (modelId !== CUSTOM_MODEL) setFormModel(modelId)
  }

  async function submitSave(): Promise<void> {
    if (
      token === null ||
      formKey.trim().length === 0 ||
      formModel.trim().length === 0 ||
      effectiveProviderId.length === 0 ||
      (isCustomProvider && formBaseUrl.trim().length === 0)
    ) {
      return
    }
    setBusy('save')
    setError(null)
    try {
      const maxOutputTokens = parsePositiveInt(formMaxOutputTokens)
      const timeoutSeconds = parsePositiveInt(formTimeoutSeconds)
      const maxCorrectionAttempts = parsePositiveInt(formMaxCorrectionAttempts)
      await saveProvider(token, {
        provider: effectiveProviderId,
        apiKey: formKey.trim(),
        model: formModel.trim(),
        ...(formBaseUrl.trim().length > 0 ? { baseUrl: formBaseUrl.trim() } : {}),
        ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
        ...(timeoutSeconds === undefined ? {} : { requestTimeoutMs: timeoutSeconds * 1000 }),
        ...(maxCorrectionAttempts === undefined ? {} : { maxCorrectionAttempts }),
      })
      setFormKey('')
      setFormModel('')
      setFormModelChoice(CUSTOM_MODEL)
      setFormBaseUrl('')
      setFormCustomProviderId('')
      setFormMaxOutputTokens('')
      setFormTimeoutSeconds('')
      setFormMaxCorrectionAttempts('')
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('providers.saveError'))
    } finally {
      setBusy(null)
    }
  }

  function startEdit(provider: ProviderSummary): void {
    setEditing(provider)
    setEditModel(provider.model)
    setEditBaseUrl(provider.baseUrl ?? '')
    setEditMaxOutputTokens(
      provider.maxOutputTokens === undefined ? '' : String(provider.maxOutputTokens),
    )
    setEditTimeoutSeconds(
      provider.requestTimeoutMs === undefined
        ? ''
        : String(Math.round(provider.requestTimeoutMs / 1000)),
    )
    setEditMaxCorrectionAttempts(
      provider.maxCorrectionAttempts === undefined ? '' : String(provider.maxCorrectionAttempts),
    )
    setError(null)
  }

  async function submitEdit(): Promise<void> {
    if (token === null || editing === null || editModel.trim().length === 0) return
    setEditBusy(true)
    setError(null)
    try {
      const maxOutputTokens = parsePositiveInt(editMaxOutputTokens)
      const timeoutSeconds = parsePositiveInt(editTimeoutSeconds)
      const maxCorrectionAttempts = parsePositiveInt(editMaxCorrectionAttempts)
      await updateProviderSettings(token, editing.provider, {
        model: editModel.trim(),
        ...(editBaseUrl.trim().length > 0 ? { baseUrl: editBaseUrl.trim() } : {}),
        // A field left blank in this dialog means "clear it back to the
        // built-in default" — `null` — never "leave it as saved", since the
        // dialog always shows the current value already: blank is a
        // deliberate change, not an omission.
        maxOutputTokens: maxOutputTokens ?? null,
        requestTimeoutMs: timeoutSeconds === undefined ? null : timeoutSeconds * 1000,
        maxCorrectionAttempts: maxCorrectionAttempts ?? null,
      })
      setEditing(null)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('providers.saveError'))
    } finally {
      setEditBusy(false)
    }
  }

  async function toggle(provider: ProviderSummary): Promise<void> {
    if (token === null) return
    setBusy(provider.provider)
    setError(null)
    try {
      await setProviderEnabled(token, provider.provider, !provider.enabled)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('providers.saveError'))
    } finally {
      setBusy(null)
    }
  }

  async function remove(provider: ProviderSummary): Promise<void> {
    if (token === null) return
    setBusy(provider.provider)
    setError(null)
    try {
      await removeProvider(token, provider.provider)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('providers.saveError'))
    } finally {
      setBusy(null)
    }
  }

  if (!isAdmin) {
    return (
      <section aria-labelledby="providers-heading">
        <h1 id="providers-heading">{t('providers.heading')}</h1>
        <p role="alert">{t('providers.adminOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="providers-heading" className="flex flex-col gap-6">
      <h1 id="providers-heading" className="m-0 text-2xl leading-tight font-bold tracking-tight">
        {t('providers.heading')}
      </h1>
      <p className="m-0 text-sm opacity-80">{t('providers.intro')}</p>

      {token !== null && <DefaultTuningCard token={token} autosaveEnabled={autosaveEnabled} />}

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}

      <Card aria-labelledby="providers-add-heading">
        <CardHeader>
          <CardTitle>
            <h2 id="providers-add-heading">{t('providers.addHeading')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t('providers.provider')}>
              {(control) => (
                <select
                  {...control}
                  className="w-full appearance-none rounded-md border border-input bg-card px-3 py-2 text-sm"
                  value={formProviderId}
                  onChange={(event) => selectProvider(event.target.value)}
                >
                  {catalog.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                  <option value={CUSTOM_PROVIDER}>{t('providers.customProviderOption')}</option>
                </select>
              )}
            </Field>
            {isCustomProvider && (
              <Field label={t('providers.customProviderId')} className="min-w-[200px]">
                {(control) => (
                  <Input
                    {...control}
                    value={formCustomProviderId}
                    onChange={(event) => setFormCustomProviderId(event.target.value)}
                    placeholder={t('providers.customProviderIdPlaceholder')}
                  />
                )}
              </Field>
            )}
            <Field label={t('providers.apiKey')} className="min-w-[240px]">
              {(control) => (
                <Input
                  {...control}
                  type="password"
                  autoComplete="off"
                  value={formKey}
                  onChange={(event) => setFormKey(event.target.value)}
                  placeholder={t('providers.apiKeyPlaceholder')}
                />
              )}
            </Field>
            {!isCustomProvider && (selectedCatalogEntry?.knownModels.length ?? 0) > 0 && (
              <Field label={t('providers.knownModel')} className="min-w-[200px]">
                {(control) => (
                  <select
                    {...control}
                    className="w-full appearance-none rounded-md border border-input bg-card px-3 py-2 text-sm"
                    value={formModelChoice}
                    onChange={(event) => selectKnownModel(event.target.value)}
                  >
                    <option value={CUSTOM_MODEL}>{t('providers.customModelOption')}</option>
                    {(selectedCatalogEntry?.knownModels ?? []).map((modelId) => (
                      <option key={modelId} value={modelId}>
                        {modelId}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            )}
            <Field label={t('providers.model')} className="min-w-[180px]">
              {(control) => (
                <Input
                  {...control}
                  value={formModel}
                  onChange={(event) => {
                    setFormModel(event.target.value)
                    setFormModelChoice(CUSTOM_MODEL)
                  }}
                  placeholder={t('providers.modelPlaceholder')}
                />
              )}
            </Field>
            <Field
              label={t('providers.baseUrl')}
              className="min-w-[200px]"
              description={isCustomProvider ? t('providers.baseUrlRequiredForCustom') : undefined}
            >
              {(control) => (
                <Input
                  {...control}
                  value={formBaseUrl}
                  onChange={(event) => setFormBaseUrl(event.target.value)}
                  placeholder={t('providers.baseUrlPlaceholder')}
                />
              )}
            </Field>
            <Field
              label={t('providers.maxOutputTokens')}
              className="min-w-[140px]"
              description={t('providers.maxOutputTokensHint')}
            >
              {(control) => (
                <Input
                  {...control}
                  type="number"
                  min={1}
                  value={formMaxOutputTokens}
                  onChange={(event) => setFormMaxOutputTokens(event.target.value)}
                  placeholder={t('providers.tuningDefaultPlaceholder')}
                />
              )}
            </Field>
            <Field
              label={t('providers.requestTimeoutSeconds')}
              className="min-w-[140px]"
              description={t('providers.requestTimeoutSecondsHint')}
            >
              {(control) => (
                <Input
                  {...control}
                  type="number"
                  min={1}
                  value={formTimeoutSeconds}
                  onChange={(event) => setFormTimeoutSeconds(event.target.value)}
                  placeholder={t('providers.tuningDefaultPlaceholder')}
                />
              )}
            </Field>
            <Field
              label={t('providers.maxCorrectionAttempts')}
              className="min-w-[140px]"
              description={t('providers.maxCorrectionAttemptsHint')}
            >
              {(control) => (
                <Input
                  {...control}
                  type="number"
                  min={1}
                  value={formMaxCorrectionAttempts}
                  onChange={(event) => setFormMaxCorrectionAttempts(event.target.value)}
                  placeholder={t('providers.tuningDefaultPlaceholder')}
                />
              )}
            </Field>
            <Button
              disabled={
                busy === 'save' ||
                formKey.trim().length === 0 ||
                formModel.trim().length === 0 ||
                effectiveProviderId.length === 0 ||
                (isCustomProvider && formBaseUrl.trim().length === 0)
              }
              onClick={() => void submitSave()}
            >
              {t('common.save')}
            </Button>
          </div>
        </CardBody>
      </Card>

      {loading && <p>{t('common.loading')}</p>}

      {!loading && (
        <TableRoot label={t('providers.heading')}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('providers.provider')}</TableHeader>
                <TableHeader>{t('providers.model')}</TableHeader>
                <TableHeader>{t('providers.apiKey')}</TableHeader>
                <TableHeader>{t('providers.tuningColumn')}</TableHeader>
                <TableHeader>{t('providers.state')}</TableHeader>
                <TableHeader>{t('agents.actions')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {providers.map((provider) => (
                <TableRow key={provider.provider}>
                  <TableCell>{provider.provider}</TableCell>
                  <TableCell>{provider.model}</TableCell>
                  <TableCell>{provider.maskedKey}</TableCell>
                  <TableCell>
                    {provider.maxOutputTokens === undefined &&
                    provider.requestTimeoutMs === undefined &&
                    provider.maxCorrectionAttempts === undefined ? (
                      <span className="text-muted-foreground">{t('providers.tuningDefault')}</span>
                    ) : (
                      <span className="text-sm">
                        {[
                          provider.maxOutputTokens === undefined
                            ? undefined
                            : t('providers.tuningTokens', { count: provider.maxOutputTokens }),
                          provider.requestTimeoutMs === undefined
                            ? undefined
                            : t('providers.tuningTimeout', {
                                seconds: Math.round(provider.requestTimeoutMs / 1000),
                              }),
                          provider.maxCorrectionAttempts === undefined
                            ? undefined
                            : t('providers.tuningAttempts', {
                                count: provider.maxCorrectionAttempts,
                              }),
                        ]
                          .filter((part) => part !== undefined)
                          .join(' · ')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {provider.enabled ? t('providers.enabled') : t('providers.disabled')}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => startEdit(provider)}>
                        {t('providers.edit')}
                      </Button>
                      <Button
                        size="sm"
                        variant={provider.enabled ? 'destructive' : 'secondary'}
                        disabled={busy === provider.provider}
                        onClick={() => void toggle(provider)}
                      >
                        {provider.enabled ? t('providers.disable') : t('providers.enable')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === provider.provider}
                        onClick={() => void remove(provider)}
                      >
                        {t('providers.remove')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {providers.length === 0 && (
                <TableEmpty colSpan={6}>{t('providers.noProviders')}</TableEmpty>
              )}
            </TableBody>
          </Table>
        </TableRoot>
      )}

      {editing !== null && (
        <Modal
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          title={t('providers.editHeading', { provider: editing.provider })}
          closeLabel={t('providers.editClose')}
          footer={
            <>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                disabled={editBusy || editModel.trim().length === 0}
                onClick={() => void submitEdit()}
              >
                {t('common.save')}
              </Button>
            </>
          }
        >
          <p className="m-0 text-sm text-muted-foreground">{t('providers.editIntro')}</p>
          <Field label={t('providers.model')}>
            {(control) => (
              <Input
                {...control}
                value={editModel}
                onChange={(event) => setEditModel(event.target.value)}
              />
            )}
          </Field>
          <Field label={t('providers.baseUrl')}>
            {(control) => (
              <Input
                {...control}
                value={editBaseUrl}
                onChange={(event) => setEditBaseUrl(event.target.value)}
                placeholder={t('providers.baseUrlPlaceholder')}
              />
            )}
          </Field>
          <Field
            label={t('providers.maxOutputTokens')}
            description={t('providers.maxOutputTokensHint')}
          >
            {(control) => (
              <Input
                {...control}
                type="number"
                min={1}
                value={editMaxOutputTokens}
                onChange={(event) => setEditMaxOutputTokens(event.target.value)}
                placeholder={t('providers.tuningDefaultPlaceholder')}
              />
            )}
          </Field>
          <Field
            label={t('providers.requestTimeoutSeconds')}
            description={t('providers.requestTimeoutSecondsHint')}
          >
            {(control) => (
              <Input
                {...control}
                type="number"
                min={1}
                value={editTimeoutSeconds}
                onChange={(event) => setEditTimeoutSeconds(event.target.value)}
                placeholder={t('providers.tuningDefaultPlaceholder')}
              />
            )}
          </Field>
          <Field
            label={t('providers.maxCorrectionAttempts')}
            description={t('providers.maxCorrectionAttemptsHint')}
          >
            {(control) => (
              <Input
                {...control}
                type="number"
                min={1}
                value={editMaxCorrectionAttempts}
                onChange={(event) => setEditMaxCorrectionAttempts(event.target.value)}
                placeholder={t('providers.tuningDefaultPlaceholder')}
              />
            )}
          </Field>
        </Modal>
      )}
    </section>
  )
}
