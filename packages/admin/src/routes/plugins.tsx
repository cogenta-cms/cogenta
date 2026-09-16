import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { describeApiError } from '../api/describe-error.js'
import {
  createSandbox,
  getPlugins,
  grantCapability,
  type InstalledPlugin,
  type PluginDraft,
  type PluginsState,
  revokeCapability,
  setPluginDisabled,
  uninstallPlugin,
} from '../api/plugins-client.js'
import { useAuth } from '../auth/auth-context.js'
import { describeCapability, describeProvides } from '../plugins/plugin-capabilities.js'
import { CreatePluginDialog } from '../plugins/plugin-create-dialog.js'
import { PluginDraftEditor } from '../plugins/plugin-draft-editor.js'
import { Badge, Button, Notice, PageHeader } from '../ui/index.js'

/**
 * « Plugins » — what this site has installed, what each one may do, and the
 * plugins being written.
 *
 * Rewritten after the first version of this screen was, fairly, called too
 * technical: it asked for a "sandbox id", showed capabilities as raw
 * identifiers, and had no way to switch a plugin off, remove one, or throw a
 * draft away. What replaces it is the same two acts a person actually
 * performs — manage what is installed, write something new — with the words
 * of the task rather than the words of the implementation.
 *
 * The rule the whole thing rests on has not moved: **writing a plugin and
 * installing it are two different acts**, and installing one grants it
 * nothing. A plugin holds no capability until someone says yes to that
 * capability, on its own line, one at a time.
 */

export function PluginsRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const isAdmin = auth.state.status === 'authenticated' && auth.state.user.roles.includes('admin')

  const [state, setState] = useState<PluginsState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [openDraft, setOpenDraft] = useState<string | null>(null)
  const [confirmingRemoval, setConfirmingRemoval] = useState<string | null>(null)
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

  const report = useCallback(
    (caught: unknown) => setError(describeApiError(caught, t('plugins.actionError')).message),
    [t],
  )

  const act = useCallback(
    async (run: () => Promise<unknown>, done: string): Promise<void> => {
      setBusy(true)
      setError(null)
      try {
        await run()
        setStatus(done)
        await load()
      } catch (caught) {
        report(caught)
      } finally {
        setBusy(false)
      }
    },
    [load, report],
  )

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

  const installedNames = new Set((state?.installed ?? []).map((plugin) => plugin.name))
  const draft = (state?.sandboxes ?? []).find((item) => item.id === openDraft) ?? null

  function capabilityRow(plugin: InstalledPlugin, capability: string): JSX.Element {
    const described = describeCapability(t, capability)
    const granted = plugin.granted.includes(capability)
    return (
      <li key={capability} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span className="flex flex-col">
          <span className="text-sm">{described.label}</span>
          <span className="text-xs text-muted-foreground">
            {described.scope === null
              ? described.raw
              : t('plugins.limitedTo', { scope: described.scope, raw: described.raw })}
          </span>
        </span>
        <span className="flex items-center gap-2">
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
        </span>
      </li>
    )
  }

  function installedCard(plugin: InstalledPlugin): JSX.Element {
    const off = plugin.disabled !== null
    const removing = confirmingRemoval === plugin.name
    return (
      <li key={plugin.name} className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="flex flex-col">
            <span className="font-semibold">
              {plugin.title ?? plugin.name}{' '}
              <span className="text-muted-foreground">{plugin.version}</span>
            </span>
            {plugin.title !== null && (
              <span className="text-xs text-muted-foreground">{plugin.name}</span>
            )}
          </span>
          <span className="flex flex-wrap gap-1">
            <Badge tone={off ? 'neutral' : 'success'}>
              {off ? t('plugins.state.off') : t('plugins.state.on')}
            </Badge>
            {plugin.devMode && <Badge tone="warning">{t('plugins.unsigned')}</Badge>}
            {!plugin.hasCode && <Badge tone="danger">{t('plugins.noCode')}</Badge>}
          </span>
        </div>

        <ul className="m-0 mt-2 list-none p-0 text-sm text-muted-foreground">
          {describeProvides(t, plugin.provides).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>

        {off && plugin.disabled !== null && (
          <Notice tone={plugin.disabled.reason === 'manual' ? 'info' : 'warning'} live="off">
            <p className="m-0">
              {t(`plugins.disabledBecause.${plugin.disabled.reason}`, {
                defaultValue: t('plugins.disabledBecause.crash'),
              })}
            </p>
          </Notice>
        )}

        {plugin.capabilities.length === 0 ? (
          <p className="m-0 mt-3 text-sm">{t('plugins.asksNothing')}</p>
        ) : (
          <>
            <h3 className="mt-3 mb-0 text-sm font-semibold">{t('plugins.permissions')}</h3>
            <p className="m-0 mb-1 text-xs text-muted-foreground">{t('plugins.permissionsHelp')}</p>
            <ul className="m-0 list-none divide-y divide-border p-0">
              {plugin.capabilities.map((capability) => capabilityRow(plugin, capability))}
            </ul>
          </>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy || token === null}
            onClick={() =>
              void act(
                () => setPluginDisabled(token as string, plugin.name, !off),
                off ? t('plugins.status.enabled') : t('plugins.status.disabled'),
              )
            }
          >
            {off ? t('plugins.enable') : t('plugins.disable')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy || token === null}
            onClick={() => {
              if (!removing) {
                setConfirmingRemoval(plugin.name)
                return
              }
              setConfirmingRemoval(null)
              void act(async () => {
                const removal = await uninstallPlugin(token as string, plugin.name)
                if (!removal.ok) throw new Error(removal.problems.join(' '))
              }, t('plugins.status.uninstalled'))
            }}
          >
            {removing ? t('plugins.confirmUninstall') : t('plugins.uninstall')}
          </Button>
          <span className="text-xs text-muted-foreground">{t('plugins.uninstallHelp')}</span>
        </div>
      </li>
    )
  }

  function draftCard(item: PluginDraft): JSX.Element {
    return (
      <li
        key={item.id}
        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-4"
      >
        <span className="flex flex-col">
          <span className="font-semibold">{item.title ?? item.name}</span>
          <span className="text-xs text-muted-foreground">
            {item.readable
              ? describeProvides(t, item.provides).join(' · ')
              : t('plugins.draft.unreadable')}
          </span>
        </span>
        <Button
          type="button"
          size="sm"
          variant={openDraft === item.id ? 'secondary' : 'ghost'}
          onClick={() => setOpenDraft(openDraft === item.id ? null : item.id)}
        >
          {openDraft === item.id ? t('plugins.draft.close') : t('plugins.draft.open')}
        </Button>
      </li>
    )
  }

  return (
    <section aria-labelledby="plugins-heading" className="flex flex-col gap-6">
      <PageHeader
        id="plugins-heading"
        title={t('plugins.heading')}
        description={t('plugins.description')}
        actions={
          <Button type="button" onClick={() => setCreating(true)} disabled={busy}>
            {t('plugins.create.open')}
          </Button>
        }
      />
      {error !== null && (
        <Notice tone="danger" live="polite">
          <p>{error}</p>
        </Notice>
      )}
      {/*
        Seen as well as announced: the screen's own acts (create, install,
        grant) land far enough down the page that a confirmation only a screen
        reader received looked, to everyone else, like nothing had happened.
      */}
      {status !== null && (
        <Notice tone="success" live="polite">
          <p>{status}</p>
        </Notice>
      )}

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
            {state.installed.map((plugin) => installedCard(plugin))}
          </ul>
        )}
        {(state?.failures ?? []).map((failure) => (
          <Notice key={failure.directory} tone="warning" live="off">
            <p>
              {t('plugins.brokenPlugin', {
                directory: failure.directory,
                message: failure.message,
              })}
            </p>
          </Notice>
        ))}
      </section>

      <section aria-labelledby="plugins-drafts" className="flex flex-col gap-3">
        <h2 id="plugins-drafts" className="m-0 text-base font-semibold">
          {t('plugins.drafts')}
        </h2>
        <p className="m-0 text-sm text-muted-foreground">{t('plugins.draftsHelp')}</p>
        {state !== null && state.sandboxes.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">{t('plugins.noDraft')}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {(state?.sandboxes ?? []).map((item) => draftCard(item))}
          </ul>
        )}
        {draft !== null && token !== null && (
          <PluginDraftEditor
            key={draft.id}
            token={token}
            draft={draft}
            installedAlready={installedNames.has(draft.name)}
            busy={busy}
            onBusy={setBusy}
            onDone={(message) => {
              setStatus(message)
              void load()
            }}
            onError={report}
            onClose={() => setOpenDraft(null)}
          />
        )}
      </section>

      <CreatePluginDialog
        open={creating}
        onOpenChange={setCreating}
        templates={state?.templates ?? []}
        busy={busy}
        onCreate={(name, template) =>
          void act(async () => {
            const created = await createSandbox(token as string, name, template)
            setOpenDraft(created.id)
          }, t('plugins.status.draftCreated'))
        }
      />
    </section>
  )
}
