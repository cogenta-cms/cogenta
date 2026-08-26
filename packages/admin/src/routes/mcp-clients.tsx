import { type FormEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import {
  createMcpConnection,
  type ExposedToolInput,
  listMcpConnections,
  type McpConnectionSummary,
  type McpToolCost,
  removeMcpConnection,
  setMcpConnectionEnabled,
  setMcpConnectionExposedTools,
  testMcpConnection,
} from '../api/mcp-connections-client.js'
import { useAuth } from '../auth/auth-context.js'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Modal,
  Notice,
  Select,
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
 * Fiche 58 tasks 2-6 — "MCP Clients": external MCP servers this site's own
 * agents may consume, distinct from `/mcp` ("MCP Server", task 1's rename —
 * this site's *own* MCP server, exposed outward). Nothing here bypasses the
 * server's own floor (`@cogenta/mcp`'s sandboxing, fiche task 1bis) or its
 * mandatory confirmation (`MCP_CONNECTION_CONFIRMATION_REQUIRED`) — this
 * screen shows the warning and gathers the checkbox, but the refusal itself
 * lives server-side; a request built by hand still gets refused without it.
 *
 * `stdio` only for now — `http` is stored by the backing schema (a future
 * transport) but has no working client yet (`@cogenta/mcp`'s own honest
 * `MCP_CONNECTION_TRANSPORT_UNSUPPORTED`-shaped refusal on test/use), so
 * this screen does not offer creating one: showing a form for something
 * that cannot actually connect would be worse than not offering it yet.
 */

const COST_CHOICES: readonly McpToolCost[] = ['low', 'medium', 'high']

function parseArgs(raw: string): readonly string[] {
  return raw
    .split(/\s+/u)
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
}

function parseEnvLines(raw: string): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return env
}

interface ToolDraft {
  readonly checked: boolean
  readonly sideEffects: boolean
  readonly reversible: boolean
  readonly cost: McpToolCost
}

function draftsFor(connection: McpConnectionSummary): Record<string, ToolDraft> {
  const exposedByName = new Map(connection.exposedTools.map((tool) => [tool.remoteName, tool]))
  const drafts: Record<string, ToolDraft> = {}
  for (const tool of connection.discoveredTools) {
    const existing = exposedByName.get(tool.name)
    drafts[tool.name] = {
      checked: existing !== undefined,
      sideEffects: existing?.sideEffects ?? true,
      reversible: existing?.reversible ?? false,
      cost: existing?.cost ?? 'low',
    }
  }
  return drafts
}

export function McpClientsRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [connections, setConnections] = useState<readonly McpConnectionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCommand, setNewCommand] = useState('')
  const [newArgs, setNewArgs] = useState('')
  const [newEnv, setNewEnv] = useState('')
  const [newAuthKind, setNewAuthKind] = useState<'none' | 'api_key' | 'oauth'>('none')
  const [newSecret, setNewSecret] = useState('')
  const [newSecretEnvVar, setNewSecretEnvVar] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  const [removing, setRemoving] = useState<McpConnectionSummary | null>(null)
  const [managing, setManaging] = useState<McpConnectionSummary | null>(null)
  const [drafts, setDrafts] = useState<Record<string, ToolDraft>>({})

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      setConnections(await listMcpConnections(token))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('mcpClients.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    void load()
  }, [load])

  async function submitCreate(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null) return
    setActionError(null)
    try {
      await createMcpConnection(token, {
        name: newName,
        transport: 'stdio',
        command: newCommand,
        args: parseArgs(newArgs),
        env: parseEnvLines(newEnv),
        authKind: newAuthKind,
        ...(newAuthKind === 'none' ? {} : { secret: newSecret, secretEnvVar: newSecretEnvVar }),
        confirmUnsandboxed: confirmed,
      })
      setCreating(false)
      setNewName('')
      setNewCommand('')
      setNewArgs('')
      setNewEnv('')
      setNewAuthKind('none')
      setNewSecret('')
      setNewSecretEnvVar('')
      setConfirmed(false)
      await load()
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : t('mcpClients.createError'))
    }
  }

  async function runTest(connection: McpConnectionSummary): Promise<void> {
    if (token === null) return
    setActionError(null)
    setBusyId(connection.id)
    try {
      await testMcpConnection(token, connection.id)
      await load()
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : t('mcpClients.testError'))
    } finally {
      setBusyId(null)
    }
  }

  async function toggleEnabled(connection: McpConnectionSummary): Promise<void> {
    if (token === null) return
    setActionError(null)
    try {
      await setMcpConnectionEnabled(token, connection.id, !connection.enabled)
      await load()
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : t('mcpClients.toggleError'))
    }
  }

  async function confirmRemove(): Promise<void> {
    if (token === null || removing === null) return
    setActionError(null)
    try {
      await removeMcpConnection(token, removing.id)
      setRemoving(null)
      await load()
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : t('mcpClients.removeError'))
    }
  }

  function openManage(connection: McpConnectionSummary): void {
    setManaging(connection)
    setDrafts(draftsFor(connection))
  }

  async function saveExposedTools(): Promise<void> {
    if (token === null || managing === null) return
    setActionError(null)
    const tools: ExposedToolInput[] = Object.entries(drafts)
      .filter(([, draft]) => draft.checked)
      .map(([remoteName, draft]) => ({
        remoteName,
        sideEffects: draft.sideEffects,
        reversible: draft.reversible,
        cost: draft.cost,
      }))
    try {
      await setMcpConnectionExposedTools(token, managing.id, tools)
      setManaging(null)
      await load()
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : t('mcpClients.exposeError'))
    }
  }

  function statusLabel(connection: McpConnectionSummary): string {
    if (connection.status === 'ok') return t('mcpClients.statusOk')
    if (connection.status === 'error') return t('mcpClients.statusError')
    return t('mcpClients.statusUnverified')
  }

  if (!isAdmin) {
    return (
      <section aria-labelledby="mcp-clients-heading">
        <h1 id="mcp-clients-heading">{t('mcpClients.heading')}</h1>
        <p role="alert">{t('mcpClients.adminOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="mcp-clients-heading" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="mcp-clients-heading" className="m-0 text-xl leading-7 font-semibold">
            {t('mcpClients.heading')}
          </h1>
          <p className="mt-1 text-sm">{t('mcpClients.intro')}</p>
        </div>
        <Button onClick={() => setCreating(true)}>{t('mcpClients.newButton')}</Button>
      </div>

      {actionError !== null && (
        <Notice tone="danger" live="assertive">
          <p>{actionError}</p>
        </Notice>
      )}
      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}
      {loading && <p>{t('common.loading')}</p>}

      {!loading && error === null && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t('mcpClients.tableHeading')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <TableRoot label={t('mcpClients.tableLabel')}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>{t('mcpClients.nameColumn')}</TableHeader>
                    <TableHeader>{t('mcpClients.transportColumn')}</TableHeader>
                    <TableHeader>{t('mcpClients.statusColumn')}</TableHeader>
                    <TableHeader>{t('mcpClients.toolsColumn')}</TableHeader>
                    <TableHeader>{t('mcpClients.enabledColumn')}</TableHeader>
                    <TableHeader>{t('mcpClients.actionsColumn')}</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {connections.map((connection) => (
                    <TableRow key={connection.id}>
                      <TableCell>{connection.name}</TableCell>
                      <TableCell className="font-mono text-sm">{connection.transport}</TableCell>
                      <TableCell>{statusLabel(connection)}</TableCell>
                      <TableCell>
                        {t('mcpClients.toolsCount', {
                          exposed: connection.exposedTools.length,
                          discovered: connection.discoveredTools.length,
                        })}
                      </TableCell>
                      <TableCell>
                        {connection.enabled ? t('mcpClients.enabled') : t('mcpClients.disabled')}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busyId === connection.id}
                            onClick={() => void runTest(connection)}
                          >
                            {t('mcpClients.testButton')}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={connection.status !== 'ok'}
                            onClick={() => openManage(connection)}
                          >
                            {t('mcpClients.manageToolsButton')}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void toggleEnabled(connection)}
                          >
                            {connection.enabled
                              ? t('mcpClients.disableButton')
                              : t('mcpClients.enableButton')}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setRemoving(connection)}
                          >
                            {t('mcpClients.removeButton')}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {connections.length === 0 && (
                    <TableEmpty colSpan={6}>{t('mcpClients.empty')}</TableEmpty>
                  )}
                </TableBody>
              </Table>
            </TableRoot>
          </CardBody>
        </Card>
      )}

      <Modal
        open={creating}
        onOpenChange={setCreating}
        title={t('mcpClients.newHeading')}
        description={t('mcpClients.newDescription')}
        closeLabel={t('mcpClients.close')}
      >
        <form onSubmit={submitCreate} className="flex flex-col gap-4">
          <Field label={t('mcpClients.nameLabel')} description={t('mcpClients.nameHint')}>
            {(control) => (
              <Input
                {...control}
                required
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
            )}
          </Field>
          <Field label={t('mcpClients.commandLabel')} description={t('mcpClients.commandHint')}>
            {(control) => (
              <Input
                {...control}
                required
                value={newCommand}
                onChange={(event) => setNewCommand(event.target.value)}
                placeholder="/usr/bin/mcp-server"
              />
            )}
          </Field>
          <Field label={t('mcpClients.argsLabel')} description={t('mcpClients.argsHint')}>
            {(control) => (
              <Input
                {...control}
                value={newArgs}
                onChange={(event) => setNewArgs(event.target.value)}
                placeholder="--root /data"
              />
            )}
          </Field>
          <Field label={t('mcpClients.envLabel')} description={t('mcpClients.envHint')}>
            {(control) => (
              <textarea
                {...control}
                className="w-full rounded-md border border-input bg-card px-3 py-2 font-mono text-sm"
                rows={3}
                value={newEnv}
                onChange={(event) => setNewEnv(event.target.value)}
                placeholder={'FOO=bar\nBAZ=qux'}
              />
            )}
          </Field>
          <Field label={t('mcpClients.authKindLabel')} description={t('mcpClients.authKindHint')}>
            {(control) => (
              <Select
                {...control}
                value={newAuthKind}
                onChange={(event) =>
                  setNewAuthKind(event.target.value as 'none' | 'api_key' | 'oauth')
                }
              >
                <option value="none">{t('mcpClients.authKindNone')}</option>
                <option value="api_key">{t('mcpClients.authKindApiKey')}</option>
                <option value="oauth">{t('mcpClients.authKindOauth')}</option>
              </Select>
            )}
          </Field>
          {newAuthKind !== 'none' && (
            <>
              <Field label={t('mcpClients.secretLabel')} description={t('mcpClients.secretHint')}>
                {(control) => (
                  <Input
                    {...control}
                    type="password"
                    value={newSecret}
                    onChange={(event) => setNewSecret(event.target.value)}
                  />
                )}
              </Field>
              <Field
                label={t('mcpClients.secretEnvVarLabel')}
                description={t('mcpClients.secretEnvVarHint')}
              >
                {(control) => (
                  <Input
                    {...control}
                    value={newSecretEnvVar}
                    onChange={(event) => setNewSecretEnvVar(event.target.value)}
                    placeholder="API_KEY"
                  />
                )}
              </Field>
            </>
          )}

          <Notice tone="warning" title={t('mcpClients.unsandboxedWarningTitle')}>
            <p>{t('mcpClients.unsandboxedWarningBody')}</p>
          </Notice>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            <span>{t('mcpClients.unsandboxedConfirm')}</span>
          </label>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreating(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!confirmed}>
              {t('mcpClients.createButton')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={t('mcpClients.confirmRemoveTitle', { name: removing?.name ?? '' })}
        closeLabel={t('mcpClients.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={() => void confirmRemove()}>
              {t('mcpClients.confirmRemoveButton')}
            </Button>
          </>
        }
      >
        <p>{t('mcpClients.confirmRemove')}</p>
      </Modal>

      <Modal
        open={managing !== null}
        onOpenChange={(open) => {
          if (!open) setManaging(null)
        }}
        title={t('mcpClients.manageToolsHeading', { name: managing?.name ?? '' })}
        description={t('mcpClients.manageToolsDescription')}
        closeLabel={t('mcpClients.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setManaging(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void saveExposedTools()}>
              {t('mcpClients.saveToolsButton')}
            </Button>
          </>
        }
      >
        {managing !== null && managing.discoveredTools.length === 0 && (
          <p>{t('mcpClients.noDiscoveredTools')}</p>
        )}
        <ul className="flex flex-col gap-3">
          {managing?.discoveredTools.map((tool) => {
            const draft = drafts[tool.name] ?? {
              checked: false,
              sideEffects: true,
              reversible: false,
              cost: 'low' as McpToolCost,
            }
            return (
              <li key={tool.name} className="rounded-md border border-input p-3">
                <label className="flex items-start gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={draft.checked}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [tool.name]: { ...draft, checked: event.target.checked },
                      }))
                    }
                  />
                  <span>
                    {tool.name}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {tool.description}
                    </span>
                  </span>
                </label>
                {draft.checked && (
                  <div className="mt-2 ml-6 flex flex-wrap items-center gap-4 text-sm">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={draft.sideEffects}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [tool.name]: { ...draft, sideEffects: event.target.checked },
                          }))
                        }
                      />
                      {t('mcpClients.toolSideEffects')}
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={draft.reversible}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [tool.name]: { ...draft, reversible: event.target.checked },
                          }))
                        }
                      />
                      {t('mcpClients.toolReversible')}
                    </label>
                    <label className="flex items-center gap-1">
                      {t('mcpClients.toolCost')}
                      <select
                        className="rounded-md border border-input bg-card px-2 py-1"
                        value={draft.cost}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [tool.name]: { ...draft, cost: event.target.value as McpToolCost },
                          }))
                        }
                      >
                        {COST_CHOICES.map((cost) => (
                          <option key={cost} value={cost}>
                            {cost}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </Modal>
    </section>
  )
}
