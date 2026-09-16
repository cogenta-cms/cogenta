import { type JSX, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  deleteSandbox,
  deploySandbox,
  getSandbox,
  type PluginDraft,
  readSandboxFile,
  type SandboxState,
  writeSandboxFile,
} from '../api/plugins-client.js'
import { Badge, Button, Field, Notice } from '../ui/index.js'
import { describeCapability } from './plugin-capabilities.js'

/**
 * A draft, opened: what it will be able to do, whether it would install, its
 * files, and the two acts that end a draft's life — installing it, or throwing
 * it away.
 *
 * The rule the whole workshop rests on is visible here rather than merely
 * true: a draft is code nothing runs. Checking it evaluates it in the real
 * sandbox with nothing granted, and installing it grants nothing either — the
 * permissions are given afterwards, one at a time, on the installed plugin.
 */

export interface PluginDraftEditorProps {
  readonly token: string
  readonly draft: PluginDraft
  /** Whether a plugin of this name is already installed: "install" then means "replace". */
  readonly installedAlready: boolean
  readonly busy: boolean
  onBusy(busy: boolean): void
  onDone(message: string): void
  onError(error: unknown): void
  onClose(): void
}

export function PluginDraftEditor({
  token,
  draft,
  installedAlready,
  busy,
  onBusy,
  onDone,
  onError,
  onClose,
}: PluginDraftEditorProps): JSX.Element {
  const { t } = useTranslation()
  const [state, setState] = useState<SandboxState | null>(null)
  const [file, setFile] = useState<{ path: string; content: string } | null>(null)
  const [dirty, setDirty] = useState(false)
  // Throwing away work is a two-click act, never a one-click one: the button
  // asks before it does, in place, rather than opening a dialog that a reflex
  // dismisses.
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const panel = useRef<HTMLElement | null>(null)

  const act = useCallback(
    async (run: () => Promise<void>): Promise<void> => {
      onBusy(true)
      try {
        await run()
      } catch (caught) {
        onError(caught)
      } finally {
        onBusy(false)
      }
    },
    [onBusy, onError],
  )

  const open = useCallback(
    async (path: string): Promise<void> => {
      const content = await readSandboxFile(token, draft.id, path)
      setFile({ path, content: content.content })
      setDirty(false)
    },
    [token, draft.id],
  )

  // Opening a draft loads it once and opens its code straight away: the file
  // a person came to read is never one more click away.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const loaded = await getSandbox(token, draft.id)
        if (cancelled) return
        setState(loaded)
        const first = loaded.files.find((path) => path.endsWith('.js')) ?? loaded.files[0]
        if (first !== undefined) await open(first)
      } catch (caught) {
        if (!cancelled) onError(caught)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, draft.id, open, onError])

  // A draft opens below a list that may be long: without this, "create" and
  // "edit" both looked like they had done nothing at all.
  useEffect(() => {
    const element = panel.current
    // Guarded rather than called: jsdom has no `scrollIntoView`, and a screen
    // that throws under test to scroll a little is a bad trade.
    if (element !== null && typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const refresh = async (): Promise<void> => {
    setState(await getSandbox(token, draft.id))
  }

  const ready = state?.check.ok === true

  return (
    <section
      ref={panel}
      aria-label={t('plugins.draft.editing', { name: draft.title ?? draft.name })}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="m-0 text-sm font-semibold">{draft.title ?? draft.name}</h3>
          {state !== null && (
            <Badge tone={ready ? 'success' : 'warning'}>
              {ready ? t('plugins.draft.ready') : t('plugins.draft.notReady')}
            </Badge>
          )}
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          {t('plugins.draft.close')}
        </Button>
      </header>

      {state === null ? (
        <p className="m-0 text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <>
          {state.check.problems.length > 0 && (
            <Notice tone="warning" live="off">
              <p className="m-0 font-medium">{t('plugins.draft.problems')}</p>
              <ul className="m-0 pl-4">
                {state.check.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </Notice>
          )}

          {draft.capabilities.length > 0 && (
            <p className="m-0 text-sm text-muted-foreground">
              {t('plugins.draft.willAsk', {
                capabilities: draft.capabilities
                  .map((capability) => describeCapability(t, capability).label)
                  .join(' · '),
              })}
            </p>
          )}

          <nav aria-label={t('plugins.draft.files')}>
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {state.files.map((path) => (
                <li key={path}>
                  <Button
                    type="button"
                    size="sm"
                    variant={file?.path === path ? 'secondary' : 'ghost'}
                    disabled={busy}
                    onClick={() => void act(() => open(path))}
                  >
                    {path}
                  </Button>
                </li>
              ))}
            </ul>
          </nav>

          {file !== null && (
            <div className="flex flex-col gap-2">
              <Field label={file.path}>
                {(control) => (
                  <textarea
                    {...control}
                    rows={18}
                    spellCheck={false}
                    className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs"
                    value={file.content}
                    onChange={(event: { target: { value: string } }) => {
                      setFile({ path: file.path, content: event.target.value })
                      setDirty(true)
                    }}
                  />
                )}
              </Field>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={busy || !dirty}
                  onClick={() =>
                    void act(async () => {
                      await writeSandboxFile(token, draft.id, file.path, file.content)
                      setDirty(false)
                      // Saving re-checks: "is it installable now?" is the
                      // question every edit is asking.
                      await refresh()
                      onDone(t('plugins.status.fileSaved'))
                    })
                  }
                >
                  {t('plugins.draft.save')}
                </Button>
                {dirty && (
                  <span className="text-xs text-muted-foreground">
                    {t('plugins.draft.unsaved')}
                  </span>
                )}
              </div>
            </div>
          )}

          <footer className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Button
              type="button"
              disabled={busy || !ready}
              onClick={() =>
                void act(async () => {
                  const deployment = await deploySandbox(token, draft.id, installedAlready)
                  if (!deployment.ok) throw new Error(deployment.problems.join(' '))
                  onDone(
                    installedAlready ? t('plugins.status.replaced') : t('plugins.status.installed'),
                  )
                })
              }
            >
              {installedAlready ? t('plugins.draft.replace') : t('plugins.draft.install')}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await refresh()
                  onDone(t('plugins.status.checked'))
                })
              }
            >
              {t('plugins.draft.check')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (!confirmingDelete) {
                  setConfirmingDelete(true)
                  return
                }
                void act(async () => {
                  await deleteSandbox(token, draft.id)
                  onDone(t('plugins.status.draftDeleted'))
                  onClose()
                })
              }}
            >
              {confirmingDelete ? t('plugins.draft.confirmDelete') : t('plugins.draft.delete')}
            </Button>
            <span className="text-xs text-muted-foreground">{t('plugins.draft.installHelp')}</span>
          </footer>
        </>
      )}
    </section>
  )
}
