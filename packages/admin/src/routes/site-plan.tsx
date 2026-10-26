import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ConfirmAction } from '../ai/confirm-action.js'
import { formatDateTime } from '../ai/format-date.js'
import {
  describeAiError,
  designDirection,
  localizePlanNote,
  planFollowUp,
  planSkipReason,
} from '../ai/server-text.js'
import { useFlash } from '../ai/use-flash.js'
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
import { NoProviderNotice } from '../assist/no-provider-notice.js'
import { useAuth } from '../auth/auth-context.js'
import {
  Badge,
  Button,
  buttonVariants,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  FileButton,
  Modal,
  Notice,
} from '../ui/index.js'
import { ThemeCandidatePreview } from './theme-generator-preview.js'

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
 * so they are radio buttons — each with a preview of the site in that design,
 * rendered by the same isolated frame the theme generator uses. Choosing one
 * still rejects the others explicitly.
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
  const { t, i18n } = useTranslation()
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
  const [analysing, setAnalysing] = useState(false)
  const [files, setFiles] = useState<readonly File[]>([])
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null)
  const [pendingDiscard, setPendingDiscard] = useState<SitePlanSummary | null>(null)
  const [enlarged, setEnlarged] = useState<{ id: string; label: string } | null>(null)
  const flash = useFlash()

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      const list = await listSitePlans(token)
      setPlans(list.data)
      setPlannerAvailable(list.plannerAvailable)
    } catch (caught) {
      setError(describeAiError(caught, t, t('sitePlan.loadError')))
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    void load()
  }, [load])

  const fail = useCallback(
    (caught: unknown, fallback: string) => {
      setError(describeAiError(caught, t, fallback))
    },
    [t],
  )

  async function analyse(): Promise<void> {
    if (token === null || files.length === 0) return
    setBusy(true)
    setAnalysing(true)
    setError(null)
    setReport(null)
    try {
      const documents = await Promise.all(files.map(toUploadedDocument))
      const detail = await proposeSitePlan(token, documents, undefined, i18n.language)
      setSelected(detail)
      setDecisions({ ...detail.decisions })
      setFiles([])
      await load()
    } catch (caught) {
      fail(caught, t('sitePlan.proposeError'))
    } finally {
      setBusy(false)
      setAnalysing(false)
    }
  }

  async function open(id: string): Promise<void> {
    if (token === null) return
    setBusy(true)
    setError(null)
    setReport(null)
    try {
      const detail = await getSitePlan(token, id, i18n.language)
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
      flash.show(t('sitePlan.progressSaved'))
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

  async function discard(plan: SitePlanSummary): Promise<void> {
    if (token === null) return
    setBusy(true)
    try {
      await deleteSitePlan(token, plan.id)
      if (selected?.id === plan.id) setSelected(null)
      flash.show(t('sitePlan.discarded'))
      await load()
    } catch (caught) {
      fail(caught, t('sitePlan.deleteError'))
    } finally {
      setBusy(false)
      setPendingDiscard(null)
    }
  }

  const total = useMemo(() => itemCount(selected?.sections ?? []), [selected])
  const decided = useMemo(
    () => decidedCount(selected?.sections ?? [], decisions),
    [selected, decisions],
  )
  const remaining = total - decided
  const skinsById = useMemo(
    () =>
      new Map<string, NonNullable<SitePlanDetail['draft']['skins']>[number]>(
        (selected?.draft.skins ?? []).map((skin) => [`skin:${skin.id}`, skin]),
      ),
    [selected],
  )

  if (!isAdmin) {
    return (
      <section aria-labelledby="site-plan-heading">
        <h1 id="site-plan-heading">{t('sitePlan.heading')}</h1>
        <p role="alert">{t('sitePlan.adminOnly')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="site-plan-heading" className="flex min-w-0 flex-col gap-6">
      <div>
        <h1 id="site-plan-heading" className="m-0 text-2xl leading-tight font-bold tracking-tight">
          {t('sitePlan.heading')}
        </h1>
        <p className="m-0 mt-1 max-w-3xl text-sm text-muted-foreground">{t('sitePlan.intro')}</p>
      </div>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error.message}</p>
          {error.hint !== undefined && <p>{error.hint}</p>}
        </Notice>
      )}
      {flash.message !== null && (
        <Notice
          tone="success"
          live="polite"
          onDismiss={flash.clear}
          dismissLabel={t('common.close')}
        >
          <p>{flash.message}</p>
        </Notice>
      )}

      {!plannerAvailable && (
        <NoProviderNotice>
          <p>{t('sitePlan.noProvider')}</p>
        </NoProviderNotice>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('sitePlan.uploadHeading')}</h2>
          </CardTitle>
          <CardDescription>{t('sitePlan.uploadHelp')}</CardDescription>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <label htmlFor="site-plan-upload" className="text-sm font-medium">
            {t('sitePlan.uploadLabel')}
          </label>
          <FileButton
            id="site-plan-upload"
            multiple
            accept=".pdf,.docx,.md,.markdown,.txt"
            label={t('sitePlan.chooseFiles')}
            emptyLabel={t('sitePlan.noFileChosen')}
            disabled={busy || !plannerAvailable}
            onChange={(event) => setFiles([...(event.target.files ?? [])])}
          />
          {files.length > 1 && (
            <p className="m-0 text-xs text-muted-foreground">
              {t('sitePlan.filesChosen', {
                count: files.length,
                names: files.map((f) => f.name).join(', '),
              })}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              disabled={busy || !plannerAvailable || files.length === 0}
              onClick={() => void analyse()}
            >
              {analysing ? t('sitePlan.analysing') : t('sitePlan.analyse')}
            </Button>
            {files.length === 0 && plannerAvailable && (
              <span className="text-xs text-muted-foreground">
                {t('sitePlan.analyseNeedsFile')}
              </span>
            )}
            {analysing && (
              <span role="status" className="text-xs text-muted-foreground">
                {t('sitePlan.analysingHint')}
              </span>
            )}
          </div>
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
          {!loading && plans.length === 0 && (
            <p className="m-0 text-sm text-muted-foreground">{t('sitePlan.noDrafts')}</p>
          )}
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {plans.map((plan) => (
              <li
                key={plan.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="m-0 text-sm font-medium break-words">{plan.activity || plan.id}</p>
                  <p className="m-0 mt-0.5 text-xs text-muted-foreground break-words">
                    {plan.sources.join(', ')} — {formatDateTime(plan.createdAt, i18n.language)}
                  </p>
                  {plan.appliedAt !== undefined && (
                    <Badge tone="success" className="mt-1">
                      {t('sitePlan.appliedOn', {
                        at: formatDateTime(plan.appliedAt, i18n.language),
                      })}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={selected?.id === plan.id ? 'primary' : 'secondary'}
                    disabled={busy}
                    onClick={() => void open(plan.id)}
                  >
                    {t('sitePlan.review')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={busy}
                    onClick={() => setPendingDiscard(plan)}
                  >
                    {t('sitePlan.discard')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {report !== null && (
        <Notice tone="success" live="polite" title={t('sitePlan.appliedTitle')}>
          <p>
            {t('sitePlan.appliedSummary', {
              added: report.added.length,
              entries: report.entriesSeeded,
              pages: report.pagesCreated ?? 0,
            })}
          </p>
          {report.added.length > 0 && <p>{report.added.join(', ')}</p>}
          {report.skipped.map((entry) => (
            <p key={entry.name}>
              {entry.name} : {planSkipReason(entry.reasonKey, entry.reason, t)}
            </p>
          ))}
          {(report.pagesSkipped ?? []).map((page) => (
            <p key={page.title}>
              {page.title} : {planSkipReason(page.reasonKey, page.reason, t)}
            </p>
          ))}
          {report.followUp.map((line, index) => {
            const coded = report.followUpKeys?.[index]
            const worded = coded === undefined ? '' : planFollowUp(coded.key, coded.count, t)
            return <p key={line}>{worded === '' ? line : worded}</p>
          })}
          {/*
            The other half of "the AI builds my site". A plan settles what the
            site *is* — its collections, its pages, its palette — and stops
            there; the theme workshop settles what it *looks like*. They were
            watertight, so an operator who had just had their brief analysed
            was asked to describe their site again in an empty box. This
            carries the brief across.
          */}
          {selected !== null && (
            <p>
              <Link
                className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                to={`/theme-generator?plan=${encodeURIComponent(selected.id)}`}
              >
                {t('sitePlan.generateTheme')}
              </Link>
            </p>
          )}
        </Notice>
      )}

      {selected !== null && (
        <section aria-labelledby="site-plan-review-heading" className="flex flex-col gap-4">
          <h2 id="site-plan-review-heading" className="m-0 text-lg font-semibold">
            {t('sitePlan.reviewHeading')}
          </h2>
          <p className="m-0 text-sm">{selected.draft.brief.summary}</p>

          {selected.draft.violations.map((violation) => (
            <Notice tone="warning" key={violation.explanation}>
              <p>{localizePlanNote(violation.explanation, t)}</p>
            </Notice>
          ))}
          {selected.draft.warnings.map((warning) => (
            <Notice tone="warning" key={warning}>
              <p>{localizePlanNote(warning, t)}</p>
            </Notice>
          ))}

          {selected.appliedAt !== undefined && (
            <Notice tone="info">
              <p>
                {t('sitePlan.appliedOn', { at: formatDateTime(selected.appliedAt, i18n.language) })}
              </p>
            </Notice>
          )}

          {selected.sections.map((section) => (
            <Card key={section.id} className="min-w-0">
              <CardHeader>
                <CardTitle>
                  <h3>{section.title}</h3>
                </CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardBody>
                {section.items.length === 0 && (
                  <p className="m-0 text-sm text-muted-foreground">{t('sitePlan.sectionEmpty')}</p>
                )}

                {section.mode === 'one-of' ? (
                  <fieldset className="m-0 min-w-0 border-0 p-0">
                    <legend className="sr-only">{section.title}</legend>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {section.items.map((item) => {
                        const skin = skinsById.get(item.id)
                        const direction = designDirection(skin?.label ?? item.title, t)
                        const chosen = decisions[item.id] === 'accepted'
                        return (
                          <div
                            key={item.id}
                            className={`flex min-w-0 flex-col gap-2 rounded-lg border p-3 ${
                              chosen ? 'border-primary bg-accent/40' : 'border-border'
                            }`}
                          >
                            {skin !== undefined && token !== null && (
                              <button
                                type="button"
                                aria-label={t('sitePlan.enlargePreview', {
                                  label: direction.label,
                                })}
                                className="block w-full cursor-zoom-in appearance-none border-0 bg-transparent p-0 text-left"
                                onClick={() => setEnlarged({ id: item.id, label: direction.label })}
                              >
                                <ThemeCandidatePreview
                                  token={token}
                                  candidate={{
                                    kind: 'tokens',
                                    id: skin.id,
                                    label: direction.label,
                                    rationale: skin.rationale,
                                    tokens: skin.tokens,
                                  }}
                                  activeThemeName=""
                                  className="h-40"
                                />
                              </button>
                            )}
                            <div className="flex items-start gap-2">
                              <input
                                type="radio"
                                id={item.id}
                                name={`section-${section.id}`}
                                className="mt-1 shrink-0"
                                checked={chosen}
                                onChange={() => choose(section, item.id)}
                              />
                              <label htmlFor={item.id} className="min-w-0 text-sm font-medium">
                                {direction.label}
                                <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                                  {direction.description ?? item.detail}
                                </span>
                              </label>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </fieldset>
                ) : (
                  <ul className="m-0 flex list-none flex-col gap-4 p-0">
                    {section.items.map((item) => {
                      const decision = decisions[item.id]
                      return (
                        <li
                          key={item.id}
                          className="flex min-w-0 flex-col gap-2 border-b border-border pb-4 last:border-b-0 last:pb-0"
                        >
                          <p className="m-0 text-sm font-semibold break-words">{item.title}</p>
                          <p className="m-0 text-sm text-muted-foreground break-words">
                            {item.detail}
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant={decision === 'accepted' ? 'primary' : 'secondary'}
                              aria-pressed={decision === 'accepted'}
                              onClick={() => decide(item.id, 'accepted')}
                            >
                              {t('sitePlan.keep')}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={decision === 'rejected' ? 'primary' : 'secondary'}
                              aria-pressed={decision === 'rejected'}
                              onClick={() => decide(item.id, 'rejected')}
                            >
                              {t('sitePlan.drop')}
                            </Button>
                            {decision === undefined && (
                              <span className="text-xs text-muted-foreground">
                                {t('sitePlan.undecided')}
                              </span>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardBody>
            </Card>
          ))}

          <p role="status" className="m-0 text-sm font-medium">
            {remaining === 0
              ? t('sitePlan.allDecided')
              : t('sitePlan.remaining', { count: remaining })}
          </p>

          <div className="flex flex-wrap gap-3">
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

      <ConfirmAction
        open={pendingDiscard !== null}
        title={t('sitePlan.discardTitle')}
        confirmLabel={t('sitePlan.discardConfirm')}
        busy={busy}
        onCancel={() => setPendingDiscard(null)}
        onConfirm={() => {
          if (pendingDiscard !== null) void discard(pendingDiscard)
        }}
      >
        <p className="m-0">
          {t('sitePlan.discardBody', {
            name: pendingDiscard?.activity || pendingDiscard?.id || '',
          })}
        </p>
      </ConfirmAction>

      <Modal
        open={enlarged !== null}
        onOpenChange={(open) => {
          if (!open) setEnlarged(null)
        }}
        title={t('sitePlan.enlargedTitle', { label: enlarged?.label ?? '' })}
        closeLabel={t('common.close')}
        className="w-[min(72rem,calc(100vw-2rem))]"
      >
        {enlarged !== null && token !== null && skinsById.get(enlarged.id) !== undefined && (
          <ThemeCandidatePreview
            token={token}
            candidate={{
              kind: 'tokens',
              id: skinsById.get(enlarged.id)?.id ?? enlarged.id,
              label: enlarged.label,
              rationale: skinsById.get(enlarged.id)?.rationale ?? '',
              tokens: skinsById.get(enlarged.id)?.tokens ?? {},
            }}
            activeThemeName=""
            className="h-[65vh]"
            interactive
          />
        )}
      </Modal>
    </section>
  )
}
