import { type FormEvent, type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { AgentSummary } from '../api/agents-client.js'
import { listAgents } from '../api/agents-client.js'
import {
  type AdminApiKey,
  type CreatedApiKey,
  createApiKey,
  listApiKeyRoles,
  listApiKeys,
  purgeApiKey,
  revokeApiKey,
} from '../api/api-keys-client.js'
import { ApiError } from '../api/client.js'
import { getMcpInfo, type McpConnectionInfo } from '../api/mcp-info-client.js'
import { useAuth } from '../auth/auth-context.js'
import { roleLabel } from '../lib/role-label.js'
import { knownRoleNames } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import { useDateTimeFormatter } from '../settings/site-settings-context.js'
import {
  Button,
  buttonVariants,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CopyButton,
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
import {
  claudeCodeHttpCommand,
  claudeCodeHttpJson,
  claudeCodeStdioCommand,
  claudeDesktopHttpJson,
  mcpEndpointUrl,
  stdioJson,
  stdioTerminalCommand,
} from './mcp-snippets.js'
import { RoleCheckboxList, RoleGrantsSummary } from './users.js'

/**
 * "Serveur MCP" — a key for an assistant, and the configuration that makes
 * it work as pasted. There is no second credential store behind this
 * screen: a key generated here is a row of the same `api_keys` table the
 * "Clés API" screen and REST read, with the same roles and revocation.
 *
 * What the screen has to say, because the audit found people concluding
 * that writing "does not work": reads are immediate, and every write waits
 * for a person in Agents → "Actions à approuver". That approval is not a
 * setting — contract C (ADR-0020) and R6 force it for every non-reversible
 * tool, and every MCP write tool is one — so the screen explains it and
 * links to the place, rather than offering a switch that would be a
 * contract violation.
 *
 * The "chat" purpose (L22 task 2) is kept: an `admin`-scoped key and the URL
 * of `POST /api/agents/:name/run`, which itself requires `admin`.
 */

const EXPIRY_CHOICES = ['30d', '90d', '1y', 'never'] as const
type ExpiryChoice = (typeof EXPIRY_CHOICES)[number]
const DAY_MS = 24 * 60 * 60 * 1000

function expiryFieldsFor(choice: ExpiryChoice): { expiresAt?: string; neverExpires?: boolean } {
  if (choice === 'never') return { neverExpires: true }
  const days = choice === '30d' ? 30 : choice === '90d' ? 90 : 365
  return { expiresAt: new Date(Date.now() + days * DAY_MS).toISOString() }
}

type KeyPurpose = 'mcp' | 'chat'

function chatUrlFor(agentName: string): string {
  return `${window.location.origin}/api/agents/${encodeURIComponent(agentName)}/run`
}

function chatCurlSnippetFor(agentName: string, key: string): string {
  return [
    `curl -X POST '${chatUrlFor(agentName)}' \\`,
    `  -H 'Authorization: Bearer ${key}' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '{"instruction": "How many orders came in today?"}'`,
  ].join('\n')
}

/**
 * One HTTP call, one conversational turn — the same request/response shape
 * `runAssistTool`'s `POST /api/assistant/run` already uses, never a second
 * streaming protocol.
 */
function chatResponseFormatSnippet(): string {
  return [
    'Request  — POST, JSON body:',
    '  { "instruction": "<your message>" }',
    '',
    'Response — 200, JSON body:',
    '  {',
    '    "data": {',
    '      "agent": "<agent name>",',
    '      "stopReason": "end_turn" | "max_tokens" | "max_steps" | "cancelled" | "budget_exceeded" | "max_duration" | "killed" | "errored",',
    '      "finalText": "<the reply text, or null>",',
    '      "steps": <number of tool-use steps taken>,',
    '      "usage": { "inputTokens": <number>, "outputTokens": <number> }',
    '    }',
    '  }',
    '',
    'One turn per call — send the running conversation back inside',
    '"instruction" on the next call for a multi-turn exchange.',
  ].join('\n')
}

/** A labelled code block with its own copy button. Long lines wrap: nothing is hidden sideways on a phone. */
function CopyBlock({
  label,
  value,
  hint,
}: {
  readonly label: string
  readonly value: string
  readonly hint?: string
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <CopyButton value={value} label={t('mcp.copy')} copiedLabel={t('mcp.copied')} />
      </div>
      <pre className="m-0 max-w-full overflow-x-auto rounded-md border border-input bg-secondary p-3 font-mono text-xs break-all whitespace-pre-wrap">
        {value}
      </pre>
      {hint !== undefined && <p className="m-0 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function isUsable(key: AdminApiKey, now: number): boolean {
  if (key.revokedAt !== null) return false
  return key.expiresAt === null || new Date(key.expiresAt).getTime() > now
}

/** The configurations for one freshly created key: remote first — the case of a deployed site. */
function ConnectionSnippets({
  apiKey,
  info,
}: {
  readonly apiKey: string
  readonly info: McpConnectionInfo | null
}): JSX.Element {
  const { t } = useTranslation()
  const url = mcpEndpointUrl(
    window.location.origin,
    info ?? { http: { enabled: true, path: '/api/mcp' } },
  )
  const httpEnabled = info?.http.enabled ?? true
  return (
    <div className="mt-4 flex min-w-0 flex-col gap-6">
      <section className="flex min-w-0 flex-col gap-4" aria-labelledby="mcp-remote-heading">
        <h3 id="mcp-remote-heading" className="m-0 text-base font-semibold">
          {t('mcp.remoteHeading')}
        </h3>
        {httpEnabled ? (
          <>
            <CopyBlock
              label={t('mcp.claudeCodeCommandLabel')}
              value={claudeCodeHttpCommand(url, apiKey)}
            />
            <CopyBlock
              label={t('mcp.claudeCodeJsonLabel')}
              value={claudeCodeHttpJson(url, apiKey)}
            />
            <CopyBlock
              label={t('mcp.claudeDesktopJsonLabel')}
              value={claudeDesktopHttpJson(url, apiKey)}
            />
          </>
        ) : (
          <p className="m-0 text-sm">{t('mcp.endpointDisabled')}</p>
        )}
      </section>
      <section className="flex min-w-0 flex-col gap-4" aria-labelledby="mcp-local-heading">
        <h3 id="mcp-local-heading" className="m-0 text-base font-semibold">
          {t('mcp.localHeading')}
        </h3>
        {info?.stdio == null ? (
          <p className="m-0 text-sm">{t('mcp.stdioUnavailable')}</p>
        ) : (
          <>
            <CopyBlock
              label={t('mcp.stdioCommandLabel')}
              value={claudeCodeStdioCommand(info.stdio, apiKey)}
            />
            <CopyBlock label={t('mcp.stdioJsonLabel')} value={stdioJson(info.stdio, apiKey)} />
            <CopyBlock
              label={t('mcp.stdioTerminalLabel')}
              value={stdioTerminalCommand(info.stdio, apiKey)}
              hint={t('mcp.stdioTerminalHint')}
            />
          </>
        )}
      </section>
    </div>
  )
}

export function McpRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const schemaState = useSchema()
  const schema = schemaState.status === 'ready' ? schemaState.schema : null
  const formatWhen = useDateTimeFormatter()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [keys, setKeys] = useState<readonly AdminApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [info, setInfo] = useState<McpConnectionInfo | null>(null)
  const [serverRoles, setServerRoles] = useState<readonly string[] | null>(null)
  const [showRevoked, setShowRevoked] = useState(false)

  const [creating, setCreating] = useState(false)
  const [purpose, setPurpose] = useState<KeyPurpose>('mcp')
  const [newName, setNewName] = useState('')
  const [newScope, setNewScope] = useState<ReadonlySet<string>>(() => new Set(['editor']))
  const [newExpiry, setNewExpiry] = useState<ExpiryChoice>('90d')
  const [createError, setCreateError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedApiKey | null>(null)
  const [createdPurpose, setCreatedPurpose] = useState<KeyPurpose>('mcp')

  const [agents, setAgents] = useState<readonly AgentSummary[]>([])
  const [chatAgentName, setChatAgentName] = useState('')

  const [revoking, setRevoking] = useState<AdminApiKey | null>(null)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      setKeys(await listApiKeys(token))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('mcp.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (token === null || !isAdmin) return
    // Display conveniences: a failure leaves the screen usable (generic
    // snippets, the schema's roles), never blocks creating a key.
    getMcpInfo(token)
      .then(setInfo)
      .catch(() => undefined)
    listApiKeyRoles(token)
      .then(setServerRoles)
      .catch(() => undefined)
    listAgents(token)
      .then((list) => {
        setAgents(list)
        setChatAgentName((current) => current || (list[0]?.name ?? ''))
      })
      .catch(() => undefined)
  }, [token, isAdmin])

  /** The closed list the server enforces when it gives one; the schema's names otherwise. `admin` last — it can do anything. */
  const offeredRoles = useMemo(() => {
    const names = new Set<string>(
      serverRoles ?? ['editor', 'viewer', ...(schema === null ? [] : knownRoleNames(schema))],
    )
    names.delete('admin')
    names.delete('public')
    return [...[...names].sort(), 'admin']
  }, [serverRoles, schema])

  const now = Date.now()
  const usableKeys = keys.filter((key) => isUsable(key, now))
  const retiredKeys = keys.filter((key) => !isUsable(key, now))
  const shownKeys = showRevoked ? keys : usableKeys
  const endpoint = mcpEndpointUrl(
    window.location.origin,
    info ?? { http: { enabled: true, path: '/api/mcp' } },
  )

  function openCreate(): void {
    setCreateError(null)
    setCreating(true)
  }

  async function submitCreate(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null) return
    setCreateError(null)
    if (purpose === 'mcp' && newScope.size === 0) {
      setCreateError(t('mcp.scopeNone'))
      return
    }
    try {
      // `chat` always mints an `admin`-scoped key — the exact role
      // `POST /api/agents/:name/run` itself requires, never looser (R4).
      const result = await createApiKey(token, {
        name: newName,
        scope: purpose === 'chat' ? ['admin'] : [...newScope],
        ...expiryFieldsFor(newExpiry),
      })
      setCreated(result)
      setCreatedPurpose(purpose)
      setCreating(false)
      setNewName('')
      setNewScope(new Set(['editor']))
      setNewExpiry('90d')
      setPurpose('mcp')
      await load()
    } catch (caught) {
      setCreateError(caught instanceof ApiError ? caught.message : t('mcp.createError'))
    }
  }

  async function confirmRevoke(): Promise<void> {
    if (token === null || revoking === null) return
    setActionError(null)
    try {
      await revokeApiKey(token, revoking.id)
      setRevoking(null)
      await load()
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : t('mcp.revokeError'))
    }
  }

  async function purge(key: AdminApiKey): Promise<void> {
    if (token === null) return
    setActionError(null)
    try {
      await purgeApiKey(token, key.id)
      await load()
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : t('mcp.purgeError'))
    }
  }

  function statusOf(key: AdminApiKey): string {
    if (key.revokedAt !== null) return t('mcp.revoked')
    if (key.expiresAt !== null && new Date(key.expiresAt).getTime() <= now) return t('mcp.expired')
    return t('mcp.active')
  }

  if (!isAdmin) {
    return (
      <section aria-labelledby="mcp-heading">
        <h1 id="mcp-heading" className="m-0 text-2xl leading-tight font-bold tracking-tight">
          {t('mcp.heading')}
        </h1>
        <p role="alert">{t('mcp.adminOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="mcp-heading" className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 id="mcp-heading" className="m-0 text-2xl leading-tight font-bold tracking-tight">
            {t('mcp.heading')}
          </h1>
          <p className="m-0 max-w-3xl text-sm leading-6 text-muted-foreground">{t('mcp.intro')}</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          {t('mcp.newButton')}
        </Button>
      </div>

      {created !== null && (
        <Notice
          tone="success"
          live="assertive"
          title={t('mcp.createdTitle', { name: created.name })}
          onDismiss={() => setCreated(null)}
          dismissLabel={t('mcp.createdDismiss')}
        >
          <p>{t('mcp.createdBody')}</p>
          <p className="font-mono text-sm break-all">{created.key}</p>
          <p className="mt-2 font-semibold">{t('mcp.createdWarning')}</p>
          {createdPurpose === 'mcp' ? (
            <ConnectionSnippets apiKey={created.key} info={info} />
          ) : (
            <div className="mt-4 flex flex-col gap-4">
              <p className="text-sm">{t('mcp.chatKeyNote')}</p>
              <CopyBlock label={t('mcp.chatUrlLabel')} value={chatUrlFor(chatAgentName)} />
              <CopyBlock
                label={t('mcp.chatCurlLabel')}
                value={chatCurlSnippetFor(chatAgentName, created.key)}
              />
              <CopyBlock label={t('mcp.chatFormatLabel')} value={chatResponseFormatSnippet()} />
            </div>
          )}
        </Notice>
      )}

      <Card aria-labelledby="mcp-how-heading">
        <CardHeader>
          <CardTitle>
            <h2 id="mcp-how-heading">{t('mcp.howHeading')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex min-w-0 flex-col gap-4 text-sm leading-6">
            <ol className="m-0 flex list-decimal flex-col gap-2 pl-5">
              <li>{t('mcp.howStep1')}</li>
              <li>{t('mcp.howStep2')}</li>
              <li>{t('mcp.howStep3')}</li>
            </ol>
            <p className="m-0 text-muted-foreground">{t('mcp.approvalWhy')}</p>
            <div>
              <Link to="/agents" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                {t('mcp.approvalsLink')}
              </Link>
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <span className="font-medium">{t('mcp.endpointLabel')}</span>
              {info === null || info.http.enabled ? (
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <code className="min-w-0 rounded-md border border-input bg-secondary px-2 py-1 font-mono text-xs break-all">
                    {endpoint}
                  </code>
                  <CopyButton
                    value={endpoint}
                    label={t('mcp.copy')}
                    copiedLabel={t('mcp.copied')}
                  />
                </div>
              ) : (
                <p className="m-0">{t('mcp.endpointDisabled')}</p>
              )}
            </div>
            <p className="m-0 text-muted-foreground">{t('mcp.localNote')}</p>
          </div>
        </CardBody>
      </Card>

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
        <Card aria-labelledby="mcp-keys-heading">
          <CardHeader>
            <CardTitle>
              <h2 id="mcp-keys-heading">{t('mcp.tableHeading')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <div className="flex min-w-0 flex-col gap-3">
              <p className="m-0 text-sm text-muted-foreground">{t('mcp.tableHint')}</p>
              {retiredKeys.length > 0 && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={showRevoked}
                    onChange={(event) => setShowRevoked(event.target.checked)}
                    className="h-4 w-4 rounded-sm border border-input accent-primary"
                  />
                  {t('mcp.showRevoked', { count: retiredKeys.length })}
                </label>
              )}
              <TableRoot label={t('mcp.tableLabel')} stacked>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader>{t('mcp.nameColumn')}</TableHeader>
                      <TableHeader>{t('mcp.prefixColumn')}</TableHeader>
                      <TableHeader>{t('mcp.scopeColumn')}</TableHeader>
                      <TableHeader>{t('mcp.lastUsedColumn')}</TableHeader>
                      <TableHeader>{t('mcp.statusColumn')}</TableHeader>
                      <TableHeader>{t('mcp.actionsColumn')}</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {shownKeys.map((key) => (
                      <TableRow key={key.id}>
                        <TableCell stack="heading">{key.name}</TableCell>
                        <TableCell className="font-mono text-sm" label={t('mcp.prefixColumn')}>
                          {key.prefix}…
                        </TableCell>
                        <TableCell label={t('mcp.scopeColumn')}>
                          {key.scope.map((role) => roleLabel(t, role)).join(', ')}
                        </TableCell>
                        <TableCell label={t('mcp.lastUsedColumn')}>
                          {key.lastUsedAt === null ? t('mcp.never') : formatWhen(key.lastUsedAt)}
                        </TableCell>
                        <TableCell label={t('mcp.statusColumn')}>{statusOf(key)}</TableCell>
                        <TableCell stack="actions">
                          {isUsable(key, now) ? (
                            <Button
                              variant="destructive"
                              size="sm"
                              aria-label={t('mcp.revokeKey', { name: key.name })}
                              onClick={() => setRevoking(key)}
                            >
                              {t('mcp.revokeAction')}
                            </Button>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              aria-label={t('mcp.purgeKey', { name: key.name })}
                              onClick={() => void purge(key)}
                            >
                              {t('mcp.purgeAction')}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {shownKeys.length === 0 && (
                      <TableEmpty colSpan={6}>{t('mcp.empty')}</TableEmpty>
                    )}
                  </TableBody>
                </Table>
              </TableRoot>
            </div>
          </CardBody>
        </Card>
      )}

      <Modal
        open={creating}
        onOpenChange={setCreating}
        title={t('mcp.newHeading')}
        description={t('mcp.newDescription')}
        closeLabel={t('mcp.close')}
      >
        <form onSubmit={submitCreate} className="flex flex-col gap-4">
          <Field label={t('mcp.purposeLabel')} description={t('mcp.purposeHint')}>
            {(control) => (
              <Select
                {...control}
                value={purpose}
                onChange={(event) => setPurpose(event.target.value as KeyPurpose)}
              >
                <option value="mcp">{t('mcp.purposeMcp')}</option>
                <option value="chat">{t('mcp.purposeChat')}</option>
              </Select>
            )}
          </Field>
          <Field label={t('mcp.nameLabel')} description={t('mcp.nameHint')}>
            {(control) => (
              <Input
                {...control}
                required
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
              />
            )}
          </Field>
          {purpose === 'chat' ? (
            <Field label={t('mcp.chatAgentLabel')} description={t('mcp.chatAgentHint')}>
              {(control) => (
                <Select
                  {...control}
                  value={chatAgentName}
                  onChange={(event) => setChatAgentName(event.target.value)}
                >
                  {agents.length === 0 && <option value="">{t('mcp.chatAgentEmpty')}</option>}
                  {agents.map((agent) => (
                    <option key={agent.name} value={agent.name}>
                      {agent.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : (
            <>
              <RoleCheckboxList
                idPrefix="mcp-key-scope"
                legend={t('mcp.scopeLabel')}
                description={t('mcp.scopeHint')}
                roles={offeredRoles}
                selected={newScope}
                onToggle={(role) =>
                  setNewScope((current) => {
                    const next = new Set(current)
                    if (next.has(role)) next.delete(role)
                    else next.add(role)
                    return next
                  })
                }
              />
              <RoleGrantsSummary roles={[...newScope]} schema={schema} locale={i18n.language} />
            </>
          )}
          <Field
            label={t('mcp.expiryLabel')}
            description={newExpiry === 'never' ? t('mcp.expiryNeverWarning') : t('mcp.expiryHint')}
          >
            {(control) => (
              <Select
                {...control}
                value={newExpiry}
                onChange={(event) => setNewExpiry(event.target.value as ExpiryChoice)}
              >
                <option value="30d">{t('mcp.expiry30d')}</option>
                <option value="90d">{t('mcp.expiry90d')}</option>
                <option value="1y">{t('mcp.expiry1y')}</option>
                <option value="never">{t('mcp.expiryNever')}</option>
              </Select>
            )}
          </Field>
          {createError !== null && (
            <p role="alert" className="m-0 text-sm text-destructive">
              {createError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreating(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">{t('mcp.createButton')}</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null)
        }}
        title={t('mcp.confirmRevokeTitle', { name: revoking?.name ?? '' })}
        closeLabel={t('mcp.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRevoking(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={() => void confirmRevoke()}>
              {t('mcp.confirmRevokeButton')}
            </Button>
          </>
        }
      >
        <p>{t('mcp.confirmRevoke')}</p>
      </Modal>
    </section>
  )
}
