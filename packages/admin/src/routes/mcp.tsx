import { type FormEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type AdminApiKey,
  type CreatedApiKey,
  createApiKey,
  listApiKeys,
  revokeApiKey,
} from '../api/api-keys-client.js'
import { ApiError } from '../api/client.js'
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
 * L21 task 6 — a screen dedicated to the MCP (Model Context Protocol) use
 * case, parallel to "Agents" rather than folded into the generic "Clés API"
 * screen (`api-keys.tsx`): the audience and the job are different here — an
 * admin wiring up Claude Desktop, Claude Code or Cursor wants a key *and* a
 * ready-to-paste client configuration, not a general credentials table.
 *
 * There is no second credential store behind this screen. A "key generated
 * here" is exactly a row in the same `api_keys` table `api-keys.tsx` and
 * REST already read and write (`../api/api-keys-client.js`, unchanged) — the
 * only thing genuinely new is what this screen shows *after* creating one:
 * the exact `cogenta mcp --api-key …` invocation and a standard MCP client
 * JSON block, built from the raw key the server just handed back. Nothing
 * here can show that raw key a second time — like `api-keys.tsx`, it lives
 * only in `created`, set once from the create call's own response, and
 * disappears the moment its notice is dismissed.
 *
 * `cogenta mcp --api-key` resolves the actor through the very same
 * `ApiKeyStore` (`packages/cli/src/commands/mcp.ts`) — a role this screen's
 * key was not granted is refused by the same `PermissionLayer` REST uses,
 * exactly as it would be over HTTP (R4).
 */

const EXPIRY_CHOICES = ['30d', '90d', '1y', 'never'] as const
type ExpiryChoice = (typeof EXPIRY_CHOICES)[number]
const DAY_MS = 24 * 60 * 60 * 1000

function expiryFieldsFor(choice: ExpiryChoice): { expiresAt?: string; neverExpires?: boolean } {
  if (choice === 'never') return { neverExpires: true }
  const days = choice === '30d' ? 30 : choice === '90d' ? 90 : 365
  return { expiresAt: new Date(Date.now() + days * DAY_MS).toISOString() }
}

function parseScope(raw: string): string[] {
  return raw
    .split(',')
    .map((role) => role.trim())
    .filter((role) => role.length > 0)
}

function cliSnippetFor(key: string): string {
  return `cogenta mcp --api-key ${key}`
}

function jsonSnippetFor(key: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        cogenta: {
          command: 'npx',
          args: ['cogenta', 'mcp', '--api-key', key],
          cwd: '/absolute/path/to/your-site',
        },
      },
    },
    null,
    2,
  )
}

/** A labelled code block with its own "copy" button — the one interaction this screen adds over `api-keys.tsx`. */
function CopyBlock({
  label,
  value,
}: {
  readonly label: string
  readonly value: string
}): JSX.Element {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const copy = useCallback(() => {
    void navigator.clipboard
      .writeText(value)
      .then(() => setCopied(true))
      .catch(() => setCopied(false))
  }, [value])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <Button type="button" variant="secondary" size="sm" onClick={copy}>
          {copied ? t('mcp.copied') : t('mcp.copy')}
        </Button>
      </div>
      <pre className="m-0 overflow-x-auto rounded-md border border-input bg-secondary p-3 font-mono text-xs whitespace-pre-wrap">
        {value}
      </pre>
    </div>
  )
}

export function McpRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [keys, setKeys] = useState<readonly AdminApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newScope, setNewScope] = useState('editor')
  const [newExpiry, setNewExpiry] = useState<ExpiryChoice>('90d')
  const [created, setCreated] = useState<CreatedApiKey | null>(null)

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

  async function submitCreate(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null) return
    setActionError(null)
    try {
      const result = await createApiKey(token, {
        name: newName,
        scope: parseScope(newScope),
        ...expiryFieldsFor(newExpiry),
      })
      setCreated(result)
      setCreating(false)
      setNewName('')
      setNewScope('editor')
      setNewExpiry('90d')
      await load()
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : t('mcp.createError'))
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

  function statusOf(key: AdminApiKey): string {
    if (key.revokedAt !== null) return t('mcp.revoked')
    if (key.expiresAt !== null && new Date(key.expiresAt).getTime() <= Date.now()) {
      return t('mcp.expired')
    }
    return t('mcp.active')
  }

  if (!isAdmin) {
    return (
      <section aria-labelledby="mcp-heading">
        <h1 id="mcp-heading">{t('mcp.heading')}</h1>
        <p role="alert">{t('mcp.adminOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="mcp-heading" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 id="mcp-heading" className="m-0 text-xl leading-7 font-semibold">
            {t('mcp.heading')}
          </h1>
          <p className="mt-1 text-sm">{t('mcp.intro')}</p>
        </div>
        <Button onClick={() => setCreating(true)}>{t('mcp.newButton')}</Button>
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
          <div className="mt-4 flex flex-col gap-4">
            <CopyBlock label={t('mcp.cliLabel')} value={cliSnippetFor(created.key)} />
            <CopyBlock label={t('mcp.jsonLabel')} value={jsonSnippetFor(created.key)} />
          </div>
        </Notice>
      )}

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
              <h2>{t('mcp.tableHeading')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <TableRoot label={t('mcp.tableLabel')}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>{t('mcp.nameColumn')}</TableHeader>
                    <TableHeader>{t('mcp.prefixColumn')}</TableHeader>
                    <TableHeader>{t('mcp.scopeColumn')}</TableHeader>
                    <TableHeader>{t('mcp.statusColumn')}</TableHeader>
                    <TableHeader>{t('mcp.actionsColumn')}</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {keys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell>{key.name}</TableCell>
                      <TableCell className="font-mono text-sm">{key.prefix}…</TableCell>
                      <TableCell>{key.scope.join(', ')}</TableCell>
                      <TableCell>{statusOf(key)}</TableCell>
                      <TableCell>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={key.revokedAt !== null}
                          onClick={() => setRevoking(key)}
                        >
                          {t('mcp.revokeKey', { name: key.name })}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {keys.length === 0 && <TableEmpty colSpan={5}>{t('mcp.empty')}</TableEmpty>}
                </TableBody>
              </Table>
            </TableRoot>
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
          <Field label={t('mcp.scopeLabel')} description={t('mcp.scopeHint')}>
            {(control) => (
              <Input
                {...control}
                required
                value={newScope}
                onChange={(event) => setNewScope(event.target.value)}
              />
            )}
          </Field>
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
