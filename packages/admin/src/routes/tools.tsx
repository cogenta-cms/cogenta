import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import {
  listToolRuns,
  listTools,
  readToolRun,
  runTool,
  type ToolDefinition,
  type ToolRun,
} from '../api/tools-client.js'
import { useAuth } from '../auth/auth-context.js'
import { Button, Card, CardBody, CardHeader, CardTitle, Notice } from '../ui/index.js'

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

export function ToolsRoute(): JSX.Element | null {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [tools, setTools] = useState<readonly ToolDefinition[]>([])
  const [runs, setRuns] = useState<readonly ToolRun[]>([])
  const [active, setActive] = useState<ToolRun | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [emailTarget, setEmailTarget] = useState('')
  const [externalLinks, setExternalLinks] = useState(false)

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

  if (token === null || !isAdmin) return null

  async function start(id: string): Promise<void> {
    if (token === null) return
    setError(null)
    try {
      const input: { external?: boolean; email?: string } = {}
      if (id === 'check-links' && externalLinks) input.external = true
      if (id === 'test-email' && emailTarget !== '') input.email = emailTarget
      const { id: runId } = await runTool(token, id, input)
      const run = await readToolRun(token, runId)
      setActive(run)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('tools.runError'))
    }
  }

  return (
    <section aria-labelledby="tools-heading" className="flex flex-col gap-6">
      <h1 id="tools-heading" className="m-0 text-xl leading-7 font-semibold">
        {t('tools.heading')}
      </h1>
      <p className="m-0 text-sm text-muted-foreground">{t('tools.intro')}</p>

      {error !== null && (
        <Notice tone="danger" title={t('tools.errorTitle')}>
          {error}
        </Notice>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {tools.map((tool) => (
          <Card key={tool.id} aria-labelledby={`tool-${tool.id}-heading`}>
            <CardHeader>
              <CardTitle>
                <h2 id={`tool-${tool.id}-heading`}>{t(tool.labelKey)}</h2>
              </CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-3">
              <p className="m-0 text-xs text-muted-foreground">
                {t(tool.reversible ? 'tools.reversibleYes' : 'tools.reversibleNo')} ·{' '}
                {t(tool.estimatedDurationKey)}
              </p>
              {tool.id === 'test-email' && (
                <label className="flex flex-col gap-1 text-xs">
                  {t('tools.testEmailLabel')}
                  <input
                    type="email"
                    value={emailTarget}
                    onChange={(event) => setEmailTarget(event.target.value)}
                    className="rounded border border-input bg-background px-2 py-1 text-sm"
                    placeholder="you@example.com"
                  />
                </label>
              )}
              {tool.id === 'check-links' && (
                <label className="flex items-center gap-2 text-xs">
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
                disabled={
                  active !== null && (active.status === 'queued' || active.status === 'running')
                }
                onClick={() => void start(tool.id)}
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
                {t('tools.activeHeading', { status: active.status })}
              </h2>
            </CardTitle>
          </CardHeader>
          <CardBody>
            {active.error !== undefined && (
              <Notice tone="danger" live="off">
                {active.error}
              </Notice>
            )}
            <pre className="m-0 max-h-64 overflow-auto whitespace-pre-wrap text-xs">
              {active.log.join('\n')}
            </pre>
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
            <ul className="m-0 flex flex-col gap-1 pl-0 list-none text-sm">
              {runs.map((run) => (
                <li key={run.id}>
                  <span className="font-mono text-xs text-muted-foreground">{run.startedAt}</span>{' '}
                  {run.tool} — {run.status}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </section>
  )
}
