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
} from '../api/providers-client.js'
import { useAuth } from '../auth/auth-context.js'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Notice,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
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

export function ProvidersRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

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
      await saveProvider(token, {
        provider: effectiveProviderId,
        apiKey: formKey.trim(),
        model: formModel.trim(),
        ...(formBaseUrl.trim().length > 0 ? { baseUrl: formBaseUrl.trim() } : {}),
      })
      setFormKey('')
      setFormModel('')
      setFormModelChoice(CUSTOM_MODEL)
      setFormBaseUrl('')
      setFormCustomProviderId('')
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('providers.saveError'))
    } finally {
      setBusy(null)
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
      <h1 id="providers-heading" className="m-0 text-xl leading-7 font-semibold">
        {t('providers.heading')}
      </h1>
      <p className="m-0 text-sm opacity-80">{t('providers.intro')}</p>

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
                    {provider.enabled ? t('providers.enabled') : t('providers.disabled')}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
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
                <TableEmpty colSpan={5}>{t('providers.noProviders')}</TableEmpty>
              )}
            </TableBody>
          </Table>
        </TableRoot>
      )}
    </section>
  )
}
