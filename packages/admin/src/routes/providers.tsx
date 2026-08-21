import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import {
  KNOWN_PROVIDERS,
  listProviders,
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
 * `create-cogenta`'s install prompt now is), and a default model. Every
 * agent's `model.preferred` names one of these three provider ids.
 */
export function ProvidersRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [providers, setProviders] = useState<readonly ProviderSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const [formProvider, setFormProvider] = useState<string>(KNOWN_PROVIDERS[0])
  const [formKey, setFormKey] = useState('')
  const [formModel, setFormModel] = useState('')
  const [formBaseUrl, setFormBaseUrl] = useState('')

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      setProviders(await listProviders(token))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('providers.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    void load()
  }, [load])

  async function submitSave(): Promise<void> {
    if (token === null || formKey.trim().length === 0 || formModel.trim().length === 0) return
    setBusy('save')
    setError(null)
    try {
      await saveProvider(token, {
        provider: formProvider,
        apiKey: formKey.trim(),
        model: formModel.trim(),
        ...(formBaseUrl.trim().length > 0 ? { baseUrl: formBaseUrl.trim() } : {}),
      })
      setFormKey('')
      setFormModel('')
      setFormBaseUrl('')
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
                  value={formProvider}
                  onChange={(event) => setFormProvider(event.target.value)}
                >
                  {KNOWN_PROVIDERS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
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
            <Field label={t('providers.model')} className="min-w-[180px]">
              {(control) => (
                <Input
                  {...control}
                  value={formModel}
                  onChange={(event) => setFormModel(event.target.value)}
                  placeholder={t('providers.modelPlaceholder')}
                />
              )}
            </Field>
            <Field label={t('providers.baseUrl')} className="min-w-[200px]">
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
                busy === 'save' || formKey.trim().length === 0 || formModel.trim().length === 0
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
