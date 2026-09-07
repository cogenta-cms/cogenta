import { type ChangeEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import { getTheme } from '../api/theme-client.js'
import {
  checkSandboxDeployment,
  createSandbox,
  deploySandbox,
  downloadThemeExport,
  importThemeZip,
  listSandboxIds,
  listThemeVersions,
  previewSandbox,
  restoreThemeVersion,
  type SandboxPreviewResult,
  type ThemeDeploymentCheck,
  type ThemeVersionInfo,
  toZipBase64,
} from '../api/theme-sandbox-client.js'
import { useAuth } from '../auth/auth-context.js'
import {
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Modal,
  Notice,
  Select,
} from '../ui/index.js'

/**
 * Fiche 73's own admin screen — the last, deliberately deferred piece of
 * every one of the fiche's 8 tasks: "no admin screen yet, delivered and
 * tested as an API surface first." This is that screen.
 *
 * What it does NOT do, on purpose (§ 3.3, decided explicitly with the
 * user): no file editor. A sandbox's own files are edited outside this
 * screen — the developer's own IDE, or (a later task) the AI agent's
 * `theme.write_sandbox_file` tool. This screen only ever *observes* a
 * sandbox already sitting on disk (preview, check) and *acts* on the whole
 * of it (deploy, restore, export, import) — never a keystroke inside one of
 * its files.
 */

type ErrorState = { readonly message: string; readonly hint?: string }

function toErrorState(caught: unknown, fallback: string): ErrorState {
  return caught instanceof ApiError
    ? { message: caught.message, ...(caught.hint === undefined ? {} : { hint: caught.hint }) }
    : { message: fallback }
}

function ErrorNotice({ error }: { readonly error: ErrorState }): JSX.Element {
  return (
    <Notice tone="danger" live="assertive">
      <p>{error.message}</p>
      {error.hint !== undefined && <p className="text-xs">{error.hint}</p>}
    </Notice>
  )
}

/** A sandbox's live preview, in a modal — same real-server-render discipline as `ThemeCandidatePreview`: an iframe on a real render, never a screenshot. */
function PreviewModal({
  open,
  onOpenChange,
  id,
  token,
}: {
  readonly open: boolean
  onOpenChange(open: boolean): void
  readonly id: string
  readonly token: string
}): JSX.Element {
  const { t } = useTranslation()
  const [result, setResult] = useState<SandboxPreviewResult | null>(null)
  const [loadError, setLoadError] = useState<ErrorState | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setResult(null)
    setLoadError(null)
    previewSandbox(token, id)
      .then((data) => {
        if (!cancelled) setResult(data)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setLoadError(toErrorState(caught, t('themeSandbox.previewLoadError')))
      })
    return () => {
      cancelled = true
    }
  }, [open, token, id, t])

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('themeSandbox.previewTitle', { id })}
      closeLabel={t('themeSandbox.closeAction')}
    >
      {loadError !== null && <ErrorNotice error={loadError} />}
      {loadError === null && result === null && (
        <p className="text-sm text-muted-foreground">{t('themeSandbox.previewLoading')}</p>
      )}
      {loadError === null && result !== null && !result.ok && (
        <Notice tone="danger">
          <p>{result.error}</p>
        </Notice>
      )}
      {loadError === null && result !== null && result.ok && (
        <iframe
          title={t('themeSandbox.previewIframeTitle', { id })}
          srcDoc={result.html}
          className="h-[60vh] w-full rounded-md border border-border bg-white"
        />
      )}
    </Modal>
  )
}

/** The deploy pipeline (§ 3.4): scan, show the result, only then let a human confirm the copy into `themes/<name>/`. */
function DeployModal({
  open,
  onOpenChange,
  id,
  token,
  onDeployed,
}: {
  readonly open: boolean
  onOpenChange(open: boolean): void
  readonly id: string
  readonly token: string
  onDeployed(themeName: string): void
}): JSX.Element {
  const { t } = useTranslation()
  const [themeName, setThemeName] = useState('')
  const [check, setCheck] = useState<ThemeDeploymentCheck | null>(null)
  const [checking, setChecking] = useState(false)
  const [deploying, setDeploying] = useState(false)
  const [error, setError] = useState<ErrorState | null>(null)

  useEffect(() => {
    if (!open) {
      setThemeName('')
      setCheck(null)
      setError(null)
    }
  }, [open])

  async function runCheck(): Promise<void> {
    if (themeName.trim() === '') return
    setChecking(true)
    setError(null)
    try {
      setCheck(await checkSandboxDeployment(token, id, themeName.trim()))
    } catch (caught) {
      setError(toErrorState(caught, t('themeSandbox.checkError')))
    } finally {
      setChecking(false)
    }
  }

  async function confirmDeploy(): Promise<void> {
    setDeploying(true)
    setError(null)
    try {
      const result = await deploySandbox(token, id, themeName.trim())
      if (!result.ok) {
        setError({ message: result.reasons.join(' ') })
        return
      }
      onDeployed(themeName.trim())
      onOpenChange(false)
    } catch (caught) {
      setError(toErrorState(caught, t('themeSandbox.deployError')))
    } finally {
      setDeploying(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('themeSandbox.deployTitle', { id })}
      description={t('themeSandbox.deployDescription')}
      closeLabel={t('themeSandbox.closeAction')}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('themeSandbox.cancelAction')}
          </Button>
          {check?.ok === true && (
            <Button onClick={() => void confirmDeploy()} disabled={deploying}>
              {deploying ? t('themeSandbox.deploying') : t('themeSandbox.confirmDeployAction')}
            </Button>
          )}
        </>
      }
    >
      <Field label={t('themeSandbox.targetThemeNameLabel')}>
        {(control) => (
          <Input
            {...control}
            value={themeName}
            onChange={(event) => {
              setThemeName(event.target.value)
              setCheck(null)
            }}
            placeholder={t('themeSandbox.targetThemeNamePlaceholder')}
          />
        )}
      </Field>
      <Button
        variant="secondary"
        onClick={() => void runCheck()}
        disabled={checking || themeName.trim() === ''}
      >
        {checking ? t('themeSandbox.checking') : t('themeSandbox.runCheckAction')}
      </Button>
      {error !== null && <ErrorNotice error={error} />}
      {check?.ok === true && (
        <Notice tone="success">
          <p>{t('themeSandbox.checkPassed')}</p>
        </Notice>
      )}
      {check !== null && !check.ok && (
        <Notice tone="danger">
          <p>{t('themeSandbox.checkFailed')}</p>
          <ul className="list-disc pl-5">
            {check.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </Notice>
      )}
    </Modal>
  )
}

function VersionsPanel({
  token,
  availableThemeNames,
}: {
  readonly token: string
  readonly availableThemeNames: readonly string[]
}): JSX.Element {
  const { t } = useTranslation()
  const [themeName, setThemeName] = useState('')
  const [versions, setVersions] = useState<readonly ThemeVersionInfo[] | null>(null)
  const [error, setError] = useState<ErrorState | null>(null)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [restoredNotice, setRestoredNotice] = useState<string | null>(null)

  // `clearRestoredNotice` defaults true — a fresh "Charger les versions"
  // click should not still be showing an old restore confirmation. `restore`
  // below reloads the list too, but must NOT clear the very notice it just
  // set — a real bug caught by this screen's own test: without the
  // parameter, the reload after a successful restore wiped out the
  // "restored" confirmation the instant it appeared.
  async function loadVersions(name: string, clearRestoredNotice = true): Promise<void> {
    if (name.trim() === '') return
    setError(null)
    setVersions(null)
    if (clearRestoredNotice) setRestoredNotice(null)
    try {
      const { versions: loaded } = await listThemeVersions(token, name.trim())
      setVersions(loaded)
    } catch (caught) {
      setError(toErrorState(caught, t('themeSandbox.versionsLoadError')))
    }
  }

  async function restore(timestamp: string): Promise<void> {
    setRestoring(timestamp)
    setError(null)
    try {
      const result = await restoreThemeVersion(token, themeName.trim(), timestamp)
      if (!result.ok) {
        setError({ message: result.reasons.join(' ') })
        return
      }
      setRestoredNotice(timestamp)
      await loadVersions(themeName.trim(), false)
    } catch (caught) {
      setError(toErrorState(caught, t('themeSandbox.restoreError')))
    } finally {
      setRestoring(null)
    }
  }

  return (
    <Card aria-labelledby="theme-sandbox-versions-heading">
      <CardHeader>
        <CardTitle>
          <h2 id="theme-sandbox-versions-heading">{t('themeSandbox.versionsHeading')}</h2>
        </CardTitle>
        <CardDescription>{t('themeSandbox.versionsDescription')}</CardDescription>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <Field label={t('themeSandbox.themeNameLabel')}>
          {(control) => (
            <div className="flex gap-2">
              {availableThemeNames.length > 0 ? (
                <Select
                  {...control}
                  value={themeName}
                  onChange={(event) => setThemeName(event.target.value)}
                >
                  <option value="">{t('themeSandbox.chooseThemePlaceholder')}</option>
                  {availableThemeNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  {...control}
                  value={themeName}
                  onChange={(event) => setThemeName(event.target.value)}
                />
              )}
              <Button
                variant="secondary"
                onClick={() => void loadVersions(themeName)}
                disabled={themeName.trim() === ''}
              >
                {t('themeSandbox.loadVersionsAction')}
              </Button>
            </div>
          )}
        </Field>

        {error !== null && <ErrorNotice error={error} />}
        {restoredNotice !== null && (
          <Notice tone="success">
            <p>{t('themeSandbox.restored', { timestamp: restoredNotice })}</p>
          </Notice>
        )}

        {versions !== null && versions.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('themeSandbox.noVersions')}</p>
        )}
        {versions !== null && versions.length > 0 && (
          <ul className="flex flex-col gap-2">
            {versions.map((version) => (
              <li
                key={version.timestamp}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
              >
                <span className="font-mono text-xs">{version.timestamp}</span>
                <Button
                  variant="secondary"
                  onClick={() => void restore(version.timestamp)}
                  disabled={restoring !== null}
                >
                  {restoring === version.timestamp
                    ? t('themeSandbox.restoring')
                    : t('themeSandbox.restoreAction')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}

function ExportImportPanel({
  token,
  availableThemeNames,
  onImported,
}: {
  readonly token: string
  readonly availableThemeNames: readonly string[]
  onImported(sandboxId: string): void
}): JSX.Element {
  const { t } = useTranslation()
  const [exportThemeName, setExportThemeName] = useState('')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<ErrorState | null>(null)

  const [importSandboxId, setImportSandboxId] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<ErrorState | null>(null)
  const [importedNotice, setImportedNotice] = useState<string | null>(null)

  async function runExport(): Promise<void> {
    if (exportThemeName.trim() === '') return
    setExporting(true)
    setExportError(null)
    try {
      await downloadThemeExport(token, exportThemeName.trim())
    } catch (caught) {
      setExportError(toErrorState(caught, t('themeSandbox.exportError')))
    } finally {
      setExporting(false)
    }
  }

  function onFileSelected(event: ChangeEvent<HTMLInputElement>): void {
    setImportFile(event.target.files?.[0] ?? null)
  }

  async function runImport(): Promise<void> {
    if (importFile === null || importSandboxId.trim() === '') return
    setImporting(true)
    setImportError(null)
    setImportedNotice(null)
    try {
      const zipBase64 = await toZipBase64(importFile)
      const result = await importThemeZip(token, { sandboxId: importSandboxId.trim(), zipBase64 })
      setImportedNotice(result.sandboxId)
      onImported(result.sandboxId)
    } catch (caught) {
      setImportError(toErrorState(caught, t('themeSandbox.importError')))
    } finally {
      setImporting(false)
    }
  }

  return (
    <Card aria-labelledby="theme-sandbox-export-import-heading">
      <CardHeader>
        <CardTitle>
          <h2 id="theme-sandbox-export-import-heading">{t('themeSandbox.exportImportHeading')}</h2>
        </CardTitle>
        <CardDescription>{t('themeSandbox.exportImportDescription')}</CardDescription>
      </CardHeader>
      <CardBody className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Field label={t('themeSandbox.exportThemeNameLabel')}>
            {(control) =>
              availableThemeNames.length > 0 ? (
                <Select
                  {...control}
                  value={exportThemeName}
                  onChange={(event) => setExportThemeName(event.target.value)}
                >
                  <option value="">{t('themeSandbox.chooseThemePlaceholder')}</option>
                  {availableThemeNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  {...control}
                  value={exportThemeName}
                  onChange={(event) => setExportThemeName(event.target.value)}
                />
              )
            }
          </Field>
          <Button
            variant="secondary"
            onClick={() => void runExport()}
            disabled={exporting || exportThemeName.trim() === ''}
          >
            {exporting ? t('themeSandbox.exporting') : t('themeSandbox.exportAction')}
          </Button>
          {exportError !== null && <ErrorNotice error={exportError} />}
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <Field label={t('themeSandbox.importSandboxIdLabel')}>
            {(control) => (
              <Input
                {...control}
                value={importSandboxId}
                onChange={(event) => setImportSandboxId(event.target.value)}
                placeholder={t('themeSandbox.importSandboxIdPlaceholder')}
              />
            )}
          </Field>
          <Field label={t('themeSandbox.importFileLabel')}>
            {(control) => (
              <input {...control} type="file" accept=".zip" onChange={onFileSelected} />
            )}
          </Field>
          <Button
            variant="secondary"
            onClick={() => void runImport()}
            disabled={importing || importFile === null || importSandboxId.trim() === ''}
          >
            {importing ? t('themeSandbox.importing') : t('themeSandbox.importAction')}
          </Button>
          {importError !== null && <ErrorNotice error={importError} />}
          {importedNotice !== null && (
            <Notice tone="success">
              <p>{t('themeSandbox.imported', { id: importedNotice })}</p>
            </Notice>
          )}
        </div>
      </CardBody>
    </Card>
  )
}

export function ThemeSandboxRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [sandboxIds, setSandboxIds] = useState<readonly string[]>([])
  const [availableThemeNames, setAvailableThemeNames] = useState<readonly string[]>([])
  const [loadError, setLoadError] = useState<ErrorState | null>(null)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    try {
      const [{ ids }, theme] = await Promise.all([listSandboxIds(token), getTheme(token)])
      setSandboxIds(ids)
      setAvailableThemeNames(theme.availableThemes.map((candidate) => candidate.name))
      setLoadError(null)
    } catch (caught) {
      setLoadError(toErrorState(caught, t('themeSandbox.loadError')))
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    void load()
  }, [load])

  const [newSandboxId, setNewSandboxId] = useState('')
  const [cloneFrom, setCloneFrom] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<ErrorState | null>(null)

  async function create(): Promise<void> {
    if (token === null || newSandboxId.trim() === '') return
    setCreating(true)
    setCreateError(null)
    try {
      await createSandbox(token, {
        id: newSandboxId.trim(),
        ...(cloneFrom === '' ? {} : { cloneFrom }),
      })
      setNewSandboxId('')
      setCloneFrom('')
      await load()
    } catch (caught) {
      setCreateError(toErrorState(caught, t('themeSandbox.createError')))
    } finally {
      setCreating(false)
    }
  }

  const [previewingId, setPreviewingId] = useState<string | null>(null)
  const [deployingId, setDeployingId] = useState<string | null>(null)
  const [deployedNotice, setDeployedNotice] = useState<string | null>(null)

  if (!isAdmin) {
    return (
      <section aria-labelledby="theme-sandbox-heading">
        <h1 id="theme-sandbox-heading">{t('themeSandbox.heading')}</h1>
        <p role="alert">{t('themeSandbox.adminOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="theme-sandbox-heading" className="flex flex-col gap-6">
      <div>
        <h1
          id="theme-sandbox-heading"
          className="m-0 text-2xl leading-tight font-bold tracking-tight"
        >
          {t('themeSandbox.heading')}
        </h1>
        <p className="text-muted-foreground text-sm">{t('themeSandbox.description')}</p>
      </div>

      {loadError !== null && <ErrorNotice error={loadError} />}
      {deployedNotice !== null && (
        <Notice tone="success">
          <p>{t('themeSandbox.deployed', { themeName: deployedNotice })}</p>
        </Notice>
      )}

      <Card aria-labelledby="theme-sandbox-list-heading">
        <CardHeader>
          <CardTitle>
            <h2 id="theme-sandbox-list-heading">{t('themeSandbox.sandboxesHeading')}</h2>
          </CardTitle>
          <CardDescription>{t('themeSandbox.sandboxesDescription')}</CardDescription>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t('themeSandbox.newSandboxIdLabel')}>
              {(control) => (
                <Input
                  {...control}
                  value={newSandboxId}
                  onChange={(event) => setNewSandboxId(event.target.value)}
                  placeholder={t('themeSandbox.newSandboxIdPlaceholder')}
                />
              )}
            </Field>
            <Field label={t('themeSandbox.cloneFromLabel')}>
              {(control) => (
                <Select
                  {...control}
                  value={cloneFrom}
                  onChange={(event) => setCloneFrom(event.target.value)}
                >
                  <option value="">{t('themeSandbox.cloneFromNone')}</option>
                  {availableThemeNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Button onClick={() => void create()} disabled={creating || newSandboxId.trim() === ''}>
              {creating ? t('themeSandbox.creating') : t('themeSandbox.createAction')}
            </Button>
          </div>
          {createError !== null && <ErrorNotice error={createError} />}

          {sandboxIds.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('themeSandbox.noSandboxes')}</p>
          )}
          {sandboxIds.length > 0 && (
            <ul className="flex flex-col gap-2">
              {sandboxIds.map((id) => (
                <li
                  key={id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                >
                  <span className="font-mono text-sm">{id}</span>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setPreviewingId(id)}>
                      {t('themeSandbox.previewAction')}
                    </Button>
                    <Button variant="secondary" onClick={() => setDeployingId(id)}>
                      {t('themeSandbox.deployAction')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <VersionsPanel token={token ?? ''} availableThemeNames={availableThemeNames} />
      <ExportImportPanel
        token={token ?? ''}
        availableThemeNames={availableThemeNames}
        onImported={() => void load()}
      />

      {previewingId !== null && token !== null && (
        <PreviewModal
          open={previewingId !== null}
          onOpenChange={(open) => {
            if (!open) setPreviewingId(null)
          }}
          id={previewingId}
          token={token}
        />
      )}
      {deployingId !== null && token !== null && (
        <DeployModal
          open={deployingId !== null}
          onOpenChange={(open) => {
            if (!open) setDeployingId(null)
          }}
          id={deployingId}
          token={token}
          onDeployed={(themeName) => setDeployedNotice(themeName)}
        />
      )}
    </section>
  )
}
