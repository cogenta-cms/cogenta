import { type ChangeEvent, type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import {
  type AppliedPlanReport,
  applySitePlan,
  deleteSitePlan,
  getSitePlan,
  listSitePlans,
  type PlanItemDecision,
  type PlanSection,
  proposeSitePlan,
  recordSitePlanDecisions,
  type SitePlanDetail,
  type SitePlanSummary,
  toUploadedDocument,
} from '../api/site-plan-client.js'
import { useAuth } from '../auth/auth-context.js'
import {
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  Notice,
} from '../ui/index.js'

/**
 * L19 tasks 5 and 7 — upload a specification, read what the agent understood,
 * and decide on it one item at a time.
 *
 * The shape of this screen is the requirement, not a style choice. The lot
 * says "validation section par section, jamais une case « tout accepter » qui
 * masque le détail", so:
 *
 * - Every item is its own pair of buttons, with what it actually means
 *   printed beside it — a collection's fields, a constraint's quoted
 *   sentence, a demonstration entry's values.
 * - There is no control anywhere on this page that decides more than one
 *   item. Not a "select all", not a section-level toggle, not a keyboard
 *   shortcut.
 * - "Apply" stays disabled until every item has been answered, and says how
 *   many are left. The server refuses an incomplete plan anyway; the button
 *   simply does not pretend otherwise.
 *
 * A design section is the one exception in shape: its items are alternatives,
 * so they are radio buttons. Choosing one still rejects the others explicitly.
 */

type Decisions = Record<string, PlanItemDecision>

function decidedCount(sections: readonly PlanSection[], decisions: Decisions): number {
  return sections.reduce(
    (total, section) =>
      total + section.items.filter((item) => decisions[item.id] !== undefined).length,
    0,
  )
}

function itemCount(sections: readonly PlanSection[]): number {
  return sections.reduce((total, section) => total + section.items.length, 0)
}

export function SitePlanRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [plans, setPlans] = useState<readonly SitePlanSummary[]>([])
  const [plannerAvailable, setPlannerAvailable] = useState(true)
  const [selected, setSelected] = useState<SitePlanDetail | null>(null)
  const [decisions, setDecisions] = useState<Decisions>({})
  const [report, setReport] = useState<AppliedPlanReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      const list = await listSitePlans(token)
      setPlans(list.data)
      setPlannerAvailable(list.plannerAvailable)
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? { message: caught.message, ...(caught.hint === undefined ? {} : { hint: caught.hint }) }
          : { message: t('sitePlan.loadError') },
      )
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    void load()
  }, [load])

  const fail = useCallback((caught: unknown, fallback: string) => {
    setError(
      caught instanceof ApiError
        ? { message: caught.message, ...(caught.hint === undefined ? {} : { hint: caught.hint }) }
        : { message: fallback },
    )
  }, [])

  async function upload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    if (token === null || files.length === 0) return
    setBusy(true)
    setError(null)
    setReport(null)
    try {
      const documents = await Promise.all(files.map(toUploadedDocument))
      const detail = await proposeSitePlan(token, documents)
      setSelected(detail)
      setDecisions({ ...detail.decisions })
      await load()
    } catch (caught) {
      fail(caught, t('sitePlan.proposeError'))
    } finally {
      setBusy(false)
    }
  }

  async function open(id: string): Promise<void> {
    if (token === null) return
    setBusy(true)
    setError(null)
    setReport(null)
    try {
      const detail = await getSitePlan(token, id)
      setSelected(detail)
      setDecisions({ ...detail.decisions })
    } catch (caught) {
      fail(caught, t('sitePlan.loadError'))
    } finally {
      setBusy(false)
    }
  }

  function decide(itemId: string, decision: PlanItemDecision): void {
    setDecisions((current) => ({ ...current, [itemId]: decision }))
  }

  function choose(section: PlanSection, itemId: string): void {
    setDecisions((current) => {
      const next = { ...current }
      // Choosing one alternative rejects the others explicitly, so what was
      // refused is recorded rather than merely absent.
      for (const item of section.items) next[item.id] = item.id === itemId ? 'accepted' : 'rejected'
      return next
    })
  }

  async function save(): Promise<void> {
    if (token === null || selected === null) return
    setBusy(true)
    setError(null)
    try {
      await recordSitePlanDecisions(token, selected.id, decisions)
      await load()
    } catch (caught) {
      fail(caught, t('sitePlan.saveError'))
    } finally {
      setBusy(false)
    }
  }

  async function apply(): Promise<void> {
    if (token === null || selected === null) return
    setBusy(true)
    setError(null)
    try {
      await recordSitePlanDecisions(token, selected.id, decisions)
      const applied = await applySitePlan(token, selected.id)
      await load()
      // Re-read first, then show the report: `open` clears it, and the
      // report is the one thing the operator must not lose on this screen.
      await open(selected.id)
      setReport(applied.report)
    } catch (caught) {
      fail(caught, t('sitePlan.applyError'))
    } finally {
      setBusy(false)
    }
  }

  async function discard(id: string): Promise<void> {
    if (token === null) return
    setBusy(true)
    try {
      await deleteSitePlan(token, id)
      if (selected?.id === id) setSelected(null)
      await load()
    } catch (caught) {
      fail(caught, t('sitePlan.deleteError'))
    } finally {
      setBusy(false)
    }
  }

  const total = useMemo(() => itemCount(selected?.sections ?? []), [selected])
  const decided = useMemo(
    () => decidedCount(selected?.sections ?? [], decisions),
    [selected, decisions],
  )
  const remaining = total - decided

  if (!isAdmin) {
    return (
      <section aria-labelledby="site-plan-heading">
        <h1 id="site-plan-heading">{t('sitePlan.heading')}</h1>
        <p role="alert">{t('sitePlan.adminOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="site-plan-heading" className="flex flex-col gap-6">
      <div>
        <h1 id="site-plan-heading">{t('sitePlan.heading')}</h1>
        <p className="text-muted-foreground">{t('sitePlan.intro')}</p>
      </div>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error.message}</p>
          {error.hint !== undefined && <p>{error.hint}</p>}
        </Notice>
      )}

      {!plannerAvailable && (
        <Notice tone="info">
          <p>{t('sitePlan.noProvider')}</p>
        </Notice>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('sitePlan.uploadHeading')}</h2>
          </CardTitle>
          <CardDescription>{t('sitePlan.uploadHelp')}</CardDescription>
        </CardHeader>
        <CardBody>
          <label htmlFor="site-plan-upload">{t('sitePlan.uploadLabel')}</label>
          <input
            id="site-plan-upload"
            type="file"
            multiple
            accept=".pdf,.docx,.md,.markdown,.txt"
            disabled={busy || !plannerAvailable}
            onChange={(event) => void upload(event)}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('sitePlan.draftsHeading')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody>
          {loading && <p>{t('common.loading')}</p>}
          {!loading && plans.length === 0 && <p>{t('sitePlan.noDrafts')}</p>}
          <ul>
            {plans.map((plan) => (
              <li key={plan.id}>
                <Button type="button" variant="ghost" onClick={() => void open(plan.id)}>
                  {plan.activity || plan.id}
                </Button>
                <span>
                  {' '}
                  {plan.sources.join(', ')} — {plan.createdAt}
                  {plan.appliedAt === undefined
                    ? ''
                    : ` — ${t('sitePlan.appliedOn', { at: plan.appliedAt })}`}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void discard(plan.id)}
                >
                  {t('sitePlan.discard')}
                </Button>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {report !== null && (
        <Notice tone="success" live="polite">
          <p>
            {t('sitePlan.appliedSummary', {
              added: report.added.length,
              entries: report.entriesSeeded,
            })}
          </p>
          {report.added.length > 0 && <p>{report.added.join(', ')}</p>}
          {report.skipped.map((entry) => (
            <p key={entry.name}>
              {entry.name}: {entry.reason}
            </p>
          ))}
          {report.followUp.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </Notice>
      )}

      {selected !== null && (
        <section aria-labelledby="site-plan-review-heading" className="flex flex-col gap-4">
          <h2 id="site-plan-review-heading">{t('sitePlan.reviewHeading')}</h2>
          <p>{selected.draft.brief.summary}</p>

          {selected.draft.violations.map((violation) => (
            <Notice tone="warning" key={violation.explanation}>
              <p>{violation.explanation}</p>
            </Notice>
          ))}
          {selected.draft.warnings.map((warning) => (
            <Notice tone="warning" key={warning}>
              <p>{warning}</p>
            </Notice>
          ))}

          {selected.appliedAt !== undefined && (
            <Notice tone="info">
              <p>{t('sitePlan.appliedOn', { at: selected.appliedAt })}</p>
            </Notice>
          )}

          {selected.sections.map((section) => (
            <Card key={section.id}>
              <CardHeader>
                <CardTitle>
                  <h3>{section.title}</h3>
                </CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardBody>
                {section.items.length === 0 && <p>{t('sitePlan.sectionEmpty')}</p>}

                {section.mode === 'one-of' ? (
                  <fieldset>
                    <legend>{section.title}</legend>
                    {section.items.map((item) => (
                      <div key={item.id}>
                        <input
                          type="radio"
                          id={item.id}
                          name={`section-${section.id}`}
                          checked={decisions[item.id] === 'accepted'}
                          onChange={() => choose(section, item.id)}
                        />
                        <label htmlFor={item.id}>{item.title}</label>
                        <p>{item.detail}</p>
                      </div>
                    ))}
                  </fieldset>
                ) : (
                  <ul>
                    {section.items.map((item) => (
                      <li key={item.id}>
                        <p>
                          <strong>{item.title}</strong>
                        </p>
                        <p>{item.detail}</p>
                        <Button
                          type="button"
                          variant={decisions[item.id] === 'accepted' ? 'primary' : 'secondary'}
                          aria-pressed={decisions[item.id] === 'accepted'}
                          onClick={() => decide(item.id, 'accepted')}
                        >
                          {t('sitePlan.keep')}
                        </Button>
                        <Button
                          type="button"
                          variant={decisions[item.id] === 'rejected' ? 'primary' : 'secondary'}
                          aria-pressed={decisions[item.id] === 'rejected'}
                          onClick={() => decide(item.id, 'rejected')}
                        >
                          {t('sitePlan.drop')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          ))}

          <p role="status">
            {remaining === 0
              ? t('sitePlan.allDecided')
              : t('sitePlan.remaining', { count: remaining })}
          </p>

          <div>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void save()}>
              {t('sitePlan.saveProgress')}
            </Button>
            <Button
              type="button"
              disabled={busy || remaining > 0 || selected.appliedAt !== undefined}
              onClick={() => void apply()}
            >
              {t('sitePlan.apply')}
            </Button>
          </div>
        </section>
      )}
    </section>
  )
}
