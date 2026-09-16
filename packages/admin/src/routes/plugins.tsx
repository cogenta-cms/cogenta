import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { describeApiError } from '../api/describe-error.js'
import {
  createSandbox,
  deploySandbox,
  getPlugins,
  getSandbox,
  grantCapability,
  type InstalledPlugin,
  type PluginsState,
  readSandboxFile,
  revokeCapability,
  type SandboxState,
  writeSandboxFile,
} from '../api/plugins-client.js'
import { useAuth } from '../auth/auth-context.js'
import { Badge, Button, Field, Input, Notice, PageHeader } from '../ui/index.js'

/**
 * « Plugins » (L31 step 4): what this site has installed, what each one is
 * allowed to do, and the sandboxes a plugin is written in — by a person here,
 * or by the "Cogenta Plugin Builder" agent through its own tools.
 *
 * The screen is built around the one rule the whole lot rests on: **writing a
 * plugin and installing it are two different acts**. A sandbox is code nobody
 * runs; installing it is a button on this page; and even then the plugin
 * holds nothing until someone grants a capability, one at a time, from the
 * list its manifest asks for.
 */

export function PluginsRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const isAdmin = auth.state.status === 'authenticated' && auth.state.user.roles.includes('admin')

  const [state, setState] = useState<PluginsState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [newSandbox, setNewSandbox] = useState('')
  const [newName, setNewName] = useState('')
  const [openSandbox, setOpenSandbox] = useState<SandboxState | null>(null)
  const [openFile, setOpenFile] = useState<{ path: string; content: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (token === null) return
    try {
      setState(await getPlugins(token))
      setError(null)
    } catch (caught) {
      setError(describeApiError(caught, t('plugins.loadError')).message)
    }
  }, [token, t])

  useEffect(() => {
    void load()
  }, [load])

  async function act(run: () => Promise<unknown>, done: string): Promise<void> {
    if (token === null) return
    setBusy(true)
    setError(null)
    try {
      await run()
      setStatus(done)
      await load()
      if (openSandbox !== null) setOpenSandbox(await getSandbox(token, openSandbox.id))
    } catch (caught) {
      setError(describeApiError(caught, t('plugins.actionError')).message)
    } finally {
      setBusy(false)
    }
  }

  if (!isAdmin) {
    return (
      <section className="flex flex-col gap-4">
        <h1>{t('plugins.heading')}</h1>
        <Notice tone="warning" live="off">
          <p>{t('plugins.adminOnly')}</p>
        </Notice>
      </section>
    )
  }

  const capabilityRow = (plugin: InstalledPlugin, capability: string): JSX.Element => {
    const granted = plugin.granted.includes(capability)
    return (
      <li key={capability} className="flex flex-wrap items-center justify-between gap-2 py-1">
        <code className="text-xs">{capability}</code>
        <div className="flex items-center gap-2">
          <Badge tone={granted ? 'success' : 'neutral'}>
            {granted ? t('plugins.granted') : t('plugins.notGranted')}
          </Badge>
          <Button
            type="button"
            size="sm"
            variant={granted ? 'ghost' : 'secondary'}
            disabled={busy || token === null}
            onClick={() =>
              void act(
                () =>
                  granted
                    ? revokeCapability(token as string, plugin.name, capability)
                    : grantCapability(token as string, plugin.name, capability),
                granted ? t('plugins.status.revoked') : t('plugins.status.granted'),
              )
            }
          >
            {granted ? t('plugins.revoke') : t('plugins.grant')}
          </Button>
        </div>
      </li>
    )
  }

  return (
    <section aria-labelledby="plugins-heading" className="flex flex-col gap-6">
      <PageHeader
        id="plugins-heading"
        title={t('plugins.heading')}
        description={t('plugins.description')}
      />
      {error !== null && (
        <Notice tone="danger" live="polite">
          <p>{error}</p>
        </Notice>
      )}
      <p className="sr-only" aria-live="polite">
        {status}
      </p>

      <section aria-labelledby="plugins-installed" className="flex flex-col gap-3">
        <h2 id="plugins-installed" className="m-0 text-base font-semibold">
          {t('plugins.installed')}
        </h2>
        {state === null ? (
          <p>{t('common.loading')}</p>
        ) : state.installed.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">{t('plugins.noneInstalled')}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {state.installed.map((plugin) => (
              <li key={plugin.name} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">
                    {plugin.name} <span className="text-muted-foreground">{plugin.version}</span>
                  </span>
                  <div className="flex gap-1">
                    {plugin.devMode && <Badge tone="warning">{t('plugins.unsigned')}</Badge>}
                    {!plugin.hasCode && <Badge tone="danger">{t('plugins.noCode')}</Badge>}
                  </div>
                </div>
                <p className="m-0 mt-1 text-sm text-muted-foreground">
                  {t('plugins.doesWhat', {
                    events: (plugin.provides.eventSubscriptions ?? []).join(', ') || '—',
                    routes: (plugin.provides.routes ?? []).join(', ') || '—',
                    schedules:
                      (plugin.provides.schedules ?? []).map((item) => item.name).join(', ') || '—',
                  })}
                </p>
                {plugin.capabilities.length === 0 ? (
                  <p className="m-0 mt-2 text-sm">{t('plugins.asksNothing')}</p>
                ) : (
                  <>
                    <h3 className="mt-3 mb-1 text-sm font-semibold">{t('plugins.permissions')}</h3>
                    <ul className="m-0 list-none divide-y divide-border p-0">
                      {plugin.capabilities.map((capability) => capabilityRow(plugin, capability))}
                    </ul>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {state !== null &&
          state.failures.map((failure) => (
            <Notice key={failure.directory} tone="warning" live="off">
              <p>
                {failure.directory}: {failure.message}
              </p>
            </Notice>
          ))}
      </section>

      <section aria-labelledby="plugins-sandboxes" className="flex flex-col gap-3">
        <h2 id="plugins-sandboxes" className="m-0 text-base font-semibold">
          {t('plugins.sandboxes')}
        </h2>
        <p className="m-0 text-sm text-muted-foreground">{t('plugins.sandboxHelp')}</p>
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t('plugins.sandboxId')}>
            {(control) => (
              <Input
                {...control}
                value={newSandbox}
                onChange={(event) => setNewSandbox(event.target.value)}
              />
            )}
          </Field>
          <Field label={t('plugins.pluginName')}>
            {(control) => (
              <Input
                {...control}
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
            )}
          </Field>
          <Button
            type="button"
            disabled={busy || newSandbox.trim() === '' || token === null}
            onClick={() =>
              void act(
                () => createSandbox(token as string, newSandbox.trim(), newName.trim()),
                t('plugins.status.sandboxCreated'),
              )
            }
          >
            {t('plugins.createSandbox')}
          </Button>
        </div>
        {state !== null && state.sandboxes.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">{t('plugins.noSandbox')}</p>
        ) : (
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {(state?.sandboxes ?? []).map((id) => (
              <li key={id}>
                <Button
                  type="button"
                  size="sm"
                  variant={openSandbox?.id === id ? 'secondary' : 'ghost'}
                  onClick={() =>
                    void act(async () => {
                      if (token === null) return
                      setOpenFile(null)
                      setOpenSandbox(await getSandbox(token, id))
                    }, t('plugins.status.sandboxOpened'))
                  }
                >
                  {id}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {openSandbox !== null && (
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="m-0 text-sm font-semibold">{openSandbox.id}</h3>
              <Badge tone={openSandbox.check.ok ? 'success' : 'warning'}>
                {openSandbox.check.ok ? t('plugins.checksOut') : t('plugins.notReady')}
              </Badge>
            </div>
            {openSandbox.check.problems.length > 0 && (
              <Notice tone="warning" live="off">
                <ul className="m-0 pl-4">
                  {openSandbox.check.problems.map((problem) => (
                    <li key={problem}>{problem}</li>
                  ))}
                </ul>
              </Notice>
            )}
            <p className="m-0 text-sm text-muted-foreground">
              {t('plugins.handlers', { handlers: openSandbox.check.handlers.join(', ') || '—' })}
            </p>
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {openSandbox.files.map((path) => (
                <li key={path}>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void act(async () => {
                        if (token === null) return
                        const file = await readSandboxFile(token, openSandbox.id, path)
                        setOpenFile({ path, content: file.content })
                      }, t('plugins.status.fileOpened'))
                    }
                  >
                    {path}
                  </Button>
                </li>
              ))}
            </ul>
            {openFile !== null && (
              <div className="flex flex-col gap-2">
                <Field label={openFile.path}>
                  {(control) => (
                    <textarea
                      {...control}
                      rows={16}
                      className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs"
                      value={openFile.content}
                      onChange={(event: { target: { value: string } }) =>
                        setOpenFile({ path: openFile.path, content: event.target.value })
                      }
                    />
                  )}
                </Field>
                <div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () =>
                          writeSandboxFile(
                            token as string,
                            openSandbox.id,
                            openFile.path,
                            openFile.content,
                          ),
                        t('plugins.status.fileSaved'),
                      )
                    }
                  >
                    {t('plugins.saveFile')}
                  </Button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                disabled={busy || !openSandbox.check.ok}
                onClick={() =>
                  void act(async () => {
                    const deployment = await deploySandbox(token as string, openSandbox.id, false)
                    if (!deployment.ok) throw new Error(deployment.problems.join(' '))
                  }, t('plugins.status.installed'))
                }
              >
                {t('plugins.install')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy || !openSandbox.check.ok}
                onClick={() =>
                  void act(async () => {
                    const deployment = await deploySandbox(token as string, openSandbox.id, true)
                    if (!deployment.ok) throw new Error(deployment.problems.join(' '))
                  }, t('plugins.status.replaced'))
                }
              >
                {t('plugins.replace')}
              </Button>
              <span className="text-xs text-muted-foreground">{t('plugins.installHelp')}</span>
            </div>
          </div>
        )}
      </section>
    </section>
  )
}
