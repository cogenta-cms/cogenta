import type { TFunction } from 'i18next'
import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ApiError } from '../api/client.js'
import {
  listToolRuns,
  listTools,
  readToolRun,
  runTool,
  type ToolDefinition,
  type ToolRun,
  type ToolRunItem,
} from '../api/tools-client.js'
import { useAuth } from '../auth/auth-context.js'
import { useSchema } from '../schema/schema-context.js'
import { useDateTimeFormatter } from '../settings/site-settings-context.js'
import {
  Badge,
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
} from '../ui/index.js'

/**
 * "Outils" — fiche 24 task 3.
 *
 * Every tool is a `POST` that returns a run id right away (202) and is then
 * polled — a maintenance task that ran inline in this request would be
 * exactly the "requête HTTP qui expire" the lot's known pitfall warns about,
 * and polling is what lets this screen show real progress instead of a
 * spinner with nothing behind it.
 */

const POLL_MS = 1500

/** "blocks.blocks[6].data.items[0].link.href" as a place an editor can find: "Bloc 7, élément 1, lien". */
function describeLocation(at: string, t: TFunction): string {
  const parts: string[] = []
  const block = /^blocks\.blocks\[(\d+)\]/u.exec(at)
  if (block !== null) parts.push(t('tools.where.block', { n: Number(block[1]) + 1 }))
  else parts.push(t('tools.where.field', { name: at.split(/[.[]/u)[0] ?? at }))
  const item = /items\[(\d+)\]/u.exec(at)
  if (item !== null) parts.push(t('tools.where.item', { n: Number(item[1]) + 1 }))
  if (/link|href|url/iu.test(at)) parts.push(t('tools.where.link'))
  return parts.join(', ')
}

function ToolItem({ item }: { readonly item: ToolRunItem }): JSX.Element {
  const { t } = useTranslation()
  const schema = useSchema()
  const params = item.params
  if (item.code === 'link-broken') {
    const collectionName = String(params['collection'])
    const collection =
      schema.status === 'ready'
        ? schema.schema.collections.find((candidate) => candidate.name === collectionName)
        : undefined
    return (
      <li className="flex flex-col gap-0.5">
        <span>
          {t('tools.item.linkBroken', {
            collection: collection?.labels.singular ?? collectionName,
            locale: String(params['locale']).toUpperCase(),
            where: describeLocation(String(params['at']), t),
            reason: t(`tools.linkReason.${String(params['reason'])}`, {
              defaultValue: t('tools.linkReason.unknown'),
              status: String(params['status'] ?? ''),
            }),
          })}
        </span>
        <span className="text-xs text-muted-foreground">
          {t('tools.item.pointsTo')} <code>{String(params['target'])}</code>
          {' · '}
          <Link
            to={`/collections/${encodeURIComponent(collectionName)}/${encodeURIComponent(String(params['entryId']))}`}
            className="underline"
          >
            {t('tools.item.openEntry')}
          </Link>
        </span>
      </li>
    )
  }
  const translated = t(`tools.item.${item.code}`, { ...params, defaultValue: '' })
  return <li>{translated === '' ? t('tools.item.unknown') : translated}</li>
}

export function ToolsRoute(): JSX.Element | null {
  const { t } = useTranslation()
  const formatWhen = useDateTimeFormatter()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [tools, setTools] = useState<readonly ToolDefinition[]>([])
  const [runs, setRuns] = useState<readonly ToolRun[]>([])
  const [active, setActive] = useState<ToolRun | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [emailTarget, setEmailTarget] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [externalLinks, setExternalLinks] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)

  const loadTools = useCallback(async () => {
    if (token === null || !isAdmin) return
    try {
      const [{ tools: list }, { runs: recent }] = await Promise.all([
        listTools(token),
        listToolRuns(token),
      ])
      setTools(list)
      setRuns(recent)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('tools.loadError'))
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    void loadTools()
  }, [loadTools])

  // Polls the active run until it leaves 'queued'/'running'.
  useEffect(() => {
    if (token === null || active === null) return
    if (active.status !== 'queued' && active.status !== 'running') return
    const timer = setInterval(() => {
      readToolRun(token, active.id)
        .then((run) => {
          setActive(run)
          if (run.status === 'completed' || run.status === 'failed') void loadTools()
        })
        .catch(() => undefined)
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [token, active, loadTools])

  if (token === null) return null
  if (!isAdmin) {
    return (
      <section aria-labelledby="tools-heading" className="flex flex-col gap-4">
        <h1 id="tools-heading">{t('tools.heading')}</h1>
        <p role="alert">{t('common.adminPageOnly')}</p>
      </section>
    )
  }

  const busy = active !== null && (active.status === 'queued' || active.status === 'running')
  const labelOf = (toolId: string): string => {
    const definition = tools.find((tool) => tool.id === toolId)
    return definition === undefined ? toolId : t(definition.labelKey)
  }

  async function start(id: string): Promise<void> {
    if (token === null) return
    setError(null)
    setEmailError(null)
    if (id === 'test-email' && !/^\S+@\S+\.\S+$/u.test(emailTarget.trim())) {
      setEmailError(t('tools.emailInvalid'))
      return
    }
    try {
      const input: { external?: boolean; email?: string } = {}
      if (id === 'check-links' && externalLinks) input.external = true
      if (id === 'test-email') input.email = emailTarget.trim()
      const { id: runId } = await runTool(token, id, input)
      const run = await readToolRun(token, runId)
      setActive(run)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('tools.runError'))
    }
  }

  return (
    <section aria-labelledby="tools-heading" className="flex flex-col gap-6">
      <div>
        <h1 id="tools-heading" className="m-0 text-2xl leading-tight font-bold tracking-tight">
          {t('tools.heading')}
        </h1>
        <p className="mt-1 mb-0 max-w-3xl text-sm text-muted-foreground">{t('tools.intro')}</p>
      </div>

      {error !== null && (
        <Notice tone="danger" title={t('tools.errorTitle')}>
          {error}
        </Notice>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {tools.map((tool) => (
          <Card key={tool.id} aria-labelledby={`tool-${tool.id}-heading`}>
            <CardHeader>
              <CardTitle>
                <h2 id={`tool-${tool.id}-heading`}>{t(tool.labelKey)}</h2>
              </CardTitle>
              <CardDescription>{t(`tools.help.${tool.id}`, { defaultValue: '' })}</CardDescription>
            </CardHeader>
            <CardBody className="flex h-full flex-col justify-end gap-3">
              <p className="m-0 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge tone={tool.reversible ? 'neutral' : 'warning'}>
                  {t(tool.reversible ? 'tools.reversibleYes' : 'tools.reversibleNo')}
                </Badge>
                <span>{t(tool.estimatedDurationKey)}</span>
              </p>
              {tool.id === 'test-email' && (
                <Field label={t('tools.testEmailLabel')} error={emailError}>
                  {(control) => (
                    <Input
                      {...control}
                      type="email"
                      value={emailTarget}
                      onChange={(event) => setEmailTarget(event.target.value)}
                      placeholder={t('tools.emailPlaceholder')}
                    />
                  )}
                </Field>
              )}
              {tool.id === 'check-links' && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={externalLinks}
                    onChange={(event) => setExternalLinks(event.target.checked)}
                  />
                  {t('tools.checkExternalLinks')}
                </label>
              )}
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                aria-label={t('tools.runToolAction', { name: t(tool.labelKey) })}
                onClick={() =>
                  tool.id === 'purge-trash' ? setConfirming(tool.id) : void start(tool.id)
                }
              >
                {t('tools.runButton')}
              </Button>
            </CardBody>
          </Card>
        ))}
      </div>

      {active !== null && (
        <Card aria-labelledby="tools-active-heading">
          <CardHeader>
            <CardTitle>
              <h2 id="tools-active-heading">
                {t('tools.activeHeading', { tool: labelOf(active.tool) })}
              </h2>
            </CardTitle>
            <CardDescription>
              <Badge
                tone={
                  active.status === 'completed'
                    ? 'success'
                    : active.status === 'failed'
                      ? 'danger'
                      : 'info'
                }
              >
                {t(`tools.status.${active.status}`)}
              </Badge>
            </CardDescription>
          </CardHeader>
          <CardBody className="flex flex-col gap-3">
            {active.status === 'failed' && (
              <Notice tone="danger" live="assertive">
                <p>
                  {t(`tools.failure.${active.errorCode ?? 'unknown'}`, {
                    defaultValue: t('tools.failure.unknown'),
                  })}
                </p>
              </Notice>
            )}
            {(active.items ?? []).length > 0 ? (
              <ul className="m-0 flex max-h-96 list-none flex-col gap-2 overflow-auto p-0 text-sm">
                {(active.items ?? []).map((item, index) => (
                  <ToolItem key={`${item.code}-${index}`} item={item} />
                ))}
              </ul>
            ) : (
              active.status !== 'failed' && (
                <p className="m-0 text-sm text-muted-foreground">
                  {busy ? t('tools.running') : t('tools.noDetails')}
                </p>
              )
            )}
          </CardBody>
        </Card>
      )}

      {runs.length > 0 && (
        <Card aria-labelledby="tools-history-heading">
          <CardHeader>
            <CardTitle>
              <h2 id="tools-history-heading">{t('tools.historyHeading')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
              {runs.map((run) => (
                <li key={run.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-muted-foreground">{formatWhen(run.startedAt)}</span>
                  <span className="font-medium">{labelOf(run.tool)}</span>
                  <Badge
                    tone={
                      run.status === 'completed'
                        ? 'success'
                        : run.status === 'failed'
                          ? 'danger'
                          : 'info'
                    }
                  >
                    {t(`tools.status.${run.status}`)}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('tools.showRun', { name: labelOf(run.tool) })}
                    onClick={() => setActive(run)}
                  >
                    {t('tools.showResult')}
                  </Button>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {confirming !== null && (
        <Modal
          open
          onOpenChange={(open) => {
            if (!open) setConfirming(null)
          }}
          title={t('tools.confirmTitle', { name: labelOf(confirming) })}
          closeLabel={t('common.cancel')}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirming(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  const id = confirming
                  setConfirming(null)
                  void start(id)
                }}
              >
                {t('tools.confirmRun')}
              </Button>
            </>
          }
        >
          <p>{t('tools.confirmBody')}</p>
        </Modal>
      )}
    </section>
  )
}
