import { Fragment, type JSX, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { ConfirmAction } from '../ai/confirm-action.js'
import { describeAiErrorLine } from '../ai/server-text.js'
import { useFlash } from '../ai/use-flash.js'
import {
  createPromptTemplate,
  listPromptTemplates,
  type PromptTemplateSummary,
  removePromptTemplate,
  resetPromptTemplate,
  updatePromptTemplate,
} from '../api/prompt-templates-client.js'
import { useAuth } from '../auth/auth-context.js'
import { shippedText } from '../i18n/shipped-text.js'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  Input,
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
 * Fiche 45 — the "Prompt Settings" screen: every utility prompt an
 * `assist.*` tool actually sends the model, editable from here instead of
 * hard-coded, with `{{placeholder}}` slots the tool resolves at call time
 * (`@cogenta/agents`' `resolveInstruction`). A builtin can be edited
 * in place but never removed — the site keeps a working default even if
 * an edit is later reverted by hand — and, while it differs from what
 * Cogenta shipped, can be put back in one click.
 *
 * `category` is a closed list of the words the screens use, plus whatever
 * category an existing template already carries: a free-text box invited
 * "text" and "Text" and "texte" for the same thing.
 */

const CATEGORIES = ['text', 'seo', 'translation', 'moderation', 'agent'] as const

const EMPTY_DRAFT = { name: '', description: '', category: 'text', template: '' }

/** The `{{variable}}` slots a prompt text uses, in order, once each. */
function placeholdersOf(text: string): readonly string[] {
  return [
    ...new Set([...text.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/gu)].map((match) => match[1] ?? '')),
  ]
}

export function PromptSettingsRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [templates, setTemplates] = useState<readonly PromptTemplateSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const flash = useFlash()
  const [pendingRemoval, setPendingRemoval] = useState<PromptTemplateSummary | null>(null)
  const [pendingReset, setPendingReset] = useState<PromptTemplateSummary | null>(null)
  // Fiche 71: which row's edit form is open lives in `?editing=`, not a
  // plain `useState` — an F5 or a shared link used to always collapse back
  // to the plain list, losing the open row.
  const [searchParams, setSearchParams] = useSearchParams()
  const editingId = searchParams.get('editing')
  const setEditingId = useCallback(
    (next: string | null) => {
      const params = new URLSearchParams(searchParams)
      if (next === null) params.delete('editing')
      else params.set('editing', next)
      setSearchParams(params)
    },
    [searchParams, setSearchParams],
  )

  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [editDraft, setEditDraft] = useState(EMPTY_DRAFT)
  const [showErrors, setShowErrors] = useState(false)
  // Tracks which template id the edit fields were last populated from, so a
  // background reload (after creating or removing an unrelated template)
  // never clobbers text the admin is mid-typing in the still-open row.
  const syncedEditIdRef = useRef<string | null>(null)
  const editBoxRef = useRef<HTMLDivElement | null>(null)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      setTemplates(await listPromptTemplates(token))
    } catch (caught) {
      setError(describeAiErrorLine(caught, t, t('promptSettings.loadError')))
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    void load()
  }, [load])

  /** What the list shows for a template: Cogenta's own words while untouched, the owner's otherwise. */
  const nameOf = useCallback(
    (template: PromptTemplateSummary): string =>
      template.builtin
        ? shippedText(`prompts.${template.id}.name`, template.name, t)
        : template.name,
    [t],
  )
  const descriptionOf = useCallback(
    (template: PromptTemplateSummary): string =>
      template.builtin
        ? shippedText(`prompts.${template.id}.description`, template.description, t)
        : template.description,
    [t],
  )
  const categoryLabel = useCallback(
    (category: string): string => shippedText(`promptCategories.${category}`, category, t),
    [t],
  )
  /** A shipped template whose name and description are still Cogenta's: they read in the admin's language, so they are not editable text. */
  const wordsAreShipped = (template: PromptTemplateSummary): boolean =>
    template.builtin &&
    nameOf(template) !== template.name &&
    descriptionOf(template) !== template.description
  const isModified = (template: PromptTemplateSummary): boolean =>
    template.builtin &&
    template.originalTemplate !== undefined &&
    template.originalTemplate !== template.template

  // By category, then by the name the reader sees — the order the server
  // seeds them in is no order at all.
  const sorted = useMemo(
    () =>
      [...templates].sort(
        (a, b) =>
          categoryLabel(a.category).localeCompare(categoryLabel(b.category)) ||
          nameOf(a).localeCompare(nameOf(b)),
      ),
    [templates, categoryLabel, nameOf],
  )

  function problemOf(value: { name: string; template: string }): string | null {
    if (value.name.trim().length === 0) return t('promptSettings.nameRequired')
    if (value.template.trim().length === 0) return t('promptSettings.templateRequired')
    return null
  }

  async function submitCreate(): Promise<void> {
    if (token === null) return
    if (problemOf(draft) !== null) {
      setShowErrors(true)
      return
    }
    setBusy('create')
    setError(null)
    try {
      await createPromptTemplate(token, draft)
      flash.show(t('promptSettings.created', { name: draft.name.trim() }))
      setDraft(EMPTY_DRAFT)
      setCreating(false)
      setShowErrors(false)
      await load()
    } catch (caught) {
      setError(describeAiErrorLine(caught, t, t('promptSettings.saveError')))
    } finally {
      setBusy(null)
    }
  }

  function startEdit(template: PromptTemplateSummary): void {
    setEditingId(template.id)
    setEditDraft({
      name: template.name,
      description: template.description,
      category: template.category,
      template: template.template,
    })
    setShowErrors(false)
    syncedEditIdRef.current = template.id
  }

  // Direct-URL case (fiche 71): loading `?editing=<id>` straight — a
  // bookmark, a shared link, an F5 — with no click through `startEdit` to
  // populate the draft fields first.
  useEffect(() => {
    if (editingId === null) {
      syncedEditIdRef.current = null
      return
    }
    if (syncedEditIdRef.current === editingId) return
    const template = templates.find((candidate) => candidate.id === editingId)
    if (template === undefined) return
    setEditDraft({
      name: template.name,
      description: template.description,
      category: template.category,
      template: template.template,
    })
    syncedEditIdRef.current = editingId
  }, [editingId, templates])

  // The edit form opens beneath its row, which on a long list is off screen:
  // bring it into view when it opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: opening is the trigger; the ref is read once rendered.
  useEffect(() => {
    if (editingId !== null)
      editBoxRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, [editingId, templates.length])

  async function submitEdit(template: PromptTemplateSummary): Promise<void> {
    if (token === null) return
    if (problemOf(editDraft) !== null) {
      setShowErrors(true)
      return
    }
    setBusy(template.id)
    setError(null)
    try {
      // Shipped words that read in the admin's language are not editable
      // here, so they are sent back exactly as they are stored.
      await updatePromptTemplate(
        token,
        template.id,
        wordsAreShipped(template)
          ? { template: editDraft.template }
          : {
              name: editDraft.name,
              description: editDraft.description,
              category: editDraft.category,
              template: editDraft.template,
            },
      )
      setEditingId(null)
      setShowErrors(false)
      flash.show(t('promptSettings.saved', { name: nameOf(template) }))
      await load()
    } catch (caught) {
      setError(describeAiErrorLine(caught, t, t('promptSettings.saveError')))
    } finally {
      setBusy(null)
    }
  }

  async function submitRemove(template: PromptTemplateSummary): Promise<void> {
    if (token === null) return
    setBusy(template.id)
    setError(null)
    try {
      await removePromptTemplate(token, template.id)
      flash.show(t('promptSettings.removed', { name: template.name }))
      await load()
    } catch (caught) {
      setError(describeAiErrorLine(caught, t, t('promptSettings.saveError')))
    } finally {
      setBusy(null)
      setPendingRemoval(null)
    }
  }

  async function submitReset(template: PromptTemplateSummary): Promise<void> {
    if (token === null) return
    setBusy(template.id)
    setError(null)
    try {
      await resetPromptTemplate(token, template.id)
      flash.show(t('promptSettings.resetDone', { name: nameOf(template) }))
      if (editingId === template.id) setEditingId(null)
      await load()
    } catch (caught) {
      setError(describeAiErrorLine(caught, t, t('promptSettings.saveError')))
    } finally {
      setBusy(null)
      setPendingReset(null)
    }
  }

  if (!isAdmin) {
    return (
      <section aria-labelledby="prompt-settings-heading">
        <h1 id="prompt-settings-heading">{t('promptSettings.heading')}</h1>
        <p role="alert">{t('promptSettings.adminOnly')}</p>
      </section>
    )
  }

  /** The category picker: the five known words, plus the template's own when it is something else. */
  function categoryOptions(current: string): readonly string[] {
    return (CATEGORIES as readonly string[]).includes(current)
      ? CATEGORIES
      : [...CATEGORIES, current]
  }

  const createProblem = showErrors && creating ? problemOf(draft) : null

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1
          id="prompt-settings-heading"
          className="m-0 text-2xl leading-tight font-bold tracking-tight"
        >
          {t('promptSettings.heading')}
        </h1>
        <Button size="sm" onClick={() => setCreating((value) => !value)}>
          {t('promptSettings.createTemplate')}
        </Button>
      </div>
      <p className="m-0 text-sm opacity-80">{t('promptSettings.intro')}</p>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
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

      {creating && (
        <Card aria-labelledby="prompt-settings-create-heading" className="min-w-0">
          <CardHeader>
            <CardTitle>
              <h2 id="prompt-settings-create-heading">{t('promptSettings.createTemplate')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <div className="flex min-w-0 flex-col gap-3">
              <p className="m-0 text-xs text-muted-foreground">{t('promptSettings.createHint')}</p>
              <Field
                label={t('promptSettings.name')}
                error={
                  showErrors && draft.name.trim() === '' ? t('promptSettings.nameRequired') : null
                }
              >
                {(control) => (
                  <Input
                    {...control}
                    value={draft.name}
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  />
                )}
              </Field>
              <Field label={t('promptSettings.description')}>
                {(control) => (
                  <Input
                    {...control}
                    value={draft.description}
                    onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  />
                )}
              </Field>
              <Field label={t('promptSettings.category')}>
                {(control) => (
                  <Select
                    {...control}
                    value={draft.category}
                    onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                  >
                    {categoryOptions(draft.category).map((category) => (
                      <option key={category} value={category}>
                        {categoryLabel(category)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field
                label={t('promptSettings.template')}
                description={t('promptSettings.placeholderHint')}
                error={
                  showErrors && draft.name.trim() !== '' && createProblem !== null
                    ? createProblem
                    : null
                }
              >
                {(control) => (
                  <textarea
                    {...control}
                    className="w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 font-mono text-sm leading-5 text-card-foreground shadow-card aria-invalid:border-destructive"
                    rows={6}
                    spellCheck={false}
                    value={draft.template}
                    onChange={(event) => setDraft({ ...draft, template: event.target.value })}
                  />
                )}
              </Field>
              <div className="flex gap-2">
                <Button disabled={busy === 'create'} onClick={() => void submitCreate()}>
                  {t('common.save')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setCreating(false)
                    setShowErrors(false)
                  }}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {loading && <p>{t('common.loading')}</p>}

      {!loading &&
        editingId !== null &&
        !templates.some((template) => template.id === editingId) && (
          <Notice tone="warning" live="polite">
            <p>{t('promptSettings.editingNotFound')}</p>
          </Notice>
        )}

      {!loading && (
        <TableRoot label={t('promptSettings.heading')} stacked>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('promptSettings.name')}</TableHeader>
                <TableHeader>{t('promptSettings.category')}</TableHeader>
                <TableHeader>{t('promptSettings.description')}</TableHeader>
                <TableHeader>{t('promptSettings.origin')}</TableHeader>
                <TableHeader>{t('agents.actions')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.map((template) => {
                const used = placeholdersOf(editDraft.template)
                const missing =
                  template.originalTemplate === undefined
                    ? []
                    : placeholdersOf(template.originalTemplate).filter(
                        (placeholder) => !used.includes(placeholder),
                      )
                const editProblem = showErrors ? problemOf(editDraft) : null
                return (
                  <Fragment key={template.id}>
                    <TableRow key={template.id}>
                      <TableCell stack="heading">{nameOf(template)}</TableCell>
                      <TableCell label={t('promptSettings.category')}>
                        {categoryLabel(template.category)}
                      </TableCell>
                      <TableCell label={t('promptSettings.description')}>
                        {descriptionOf(template)}
                      </TableCell>
                      <TableCell label={t('promptSettings.origin')}>
                        {template.builtin ? (
                          <span className="inline-flex flex-wrap gap-1">
                            <Badge tone="neutral">{t('promptSettings.builtin')}</Badge>
                            {isModified(template) && (
                              <Badge tone="warning">{t('promptSettings.modified')}</Badge>
                            )}
                          </span>
                        ) : (
                          <Badge tone="info">{t('promptSettings.custom')}</Badge>
                        )}
                      </TableCell>
                      <TableCell stack="actions">
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" onClick={() => startEdit(template)}>
                            {t('agents.edit')}
                          </Button>
                          {isModified(template) && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busy === template.id}
                              aria-label={t('promptSettings.resetNamed', {
                                name: nameOf(template),
                              })}
                              onClick={() => setPendingReset(template)}
                            >
                              {t('promptSettings.reset')}
                            </Button>
                          )}
                          {!template.builtin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              disabled={busy === template.id}
                              aria-label={t('promptSettings.removeNamed', { name: template.name })}
                              onClick={() => setPendingRemoval(template)}
                            >
                              {t('agents.remove')}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {editingId === template.id && (
                      <TableRow key={`${template.id}-edit`}>
                        <TableCell colSpan={5} className="min-w-0">
                          <div ref={editBoxRef} className="flex min-w-0 flex-col gap-3 py-2">
                            {wordsAreShipped(template) ? (
                              <p className="m-0 text-sm text-muted-foreground">
                                {t('promptSettings.shippedWords', {
                                  name: nameOf(template),
                                  description: descriptionOf(template),
                                })}
                              </p>
                            ) : (
                              <>
                                <Field
                                  label={t('promptSettings.name')}
                                  error={
                                    showErrors && editDraft.name.trim() === ''
                                      ? t('promptSettings.nameRequired')
                                      : null
                                  }
                                >
                                  {(control) => (
                                    <Input
                                      {...control}
                                      value={editDraft.name}
                                      onChange={(event) =>
                                        setEditDraft({ ...editDraft, name: event.target.value })
                                      }
                                    />
                                  )}
                                </Field>
                                <Field label={t('promptSettings.description')}>
                                  {(control) => (
                                    <Input
                                      {...control}
                                      value={editDraft.description}
                                      onChange={(event) =>
                                        setEditDraft({
                                          ...editDraft,
                                          description: event.target.value,
                                        })
                                      }
                                    />
                                  )}
                                </Field>
                                <Field label={t('promptSettings.category')}>
                                  {(control) => (
                                    <Select
                                      {...control}
                                      value={editDraft.category}
                                      onChange={(event) =>
                                        setEditDraft({ ...editDraft, category: event.target.value })
                                      }
                                    >
                                      {categoryOptions(editDraft.category).map((category) => (
                                        <option key={category} value={category}>
                                          {categoryLabel(category)}
                                        </option>
                                      ))}
                                    </Select>
                                  )}
                                </Field>
                              </>
                            )}
                            <Field
                              label={t('promptSettings.template')}
                              description={t('promptSettings.placeholderHint')}
                              error={
                                editProblem !== null && editDraft.name.trim() !== ''
                                  ? editProblem
                                  : null
                              }
                            >
                              {(control) => (
                                <textarea
                                  {...control}
                                  className="w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 font-mono text-sm leading-5 text-card-foreground shadow-card aria-invalid:border-destructive"
                                  rows={6}
                                  spellCheck={false}
                                  value={editDraft.template}
                                  onChange={(event) =>
                                    setEditDraft({ ...editDraft, template: event.target.value })
                                  }
                                />
                              )}
                            </Field>
                            {used.length > 0 && (
                              <p className="m-0 text-xs text-muted-foreground">
                                {t('promptSettings.variablesUsed', {
                                  variables: used.map((name) => `{{${name}}}`).join(', '),
                                })}
                              </p>
                            )}
                            {missing.length > 0 && (
                              <Notice tone="warning">
                                <p>
                                  {t('promptSettings.variablesMissing', {
                                    variables: missing.map((name) => `{{${name}}}`).join(', '),
                                  })}
                                </p>
                              </Notice>
                            )}
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                disabled={busy === template.id}
                                onClick={() => void submitEdit(template)}
                              >
                                {t('common.save')}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingId(null)
                                  setShowErrors(false)
                                }}
                              >
                                {t('common.cancel')}
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })}
              {templates.length === 0 && (
                <TableEmpty colSpan={5}>{t('promptSettings.noTemplates')}</TableEmpty>
              )}
            </TableBody>
          </Table>
        </TableRoot>
      )}

      <ConfirmAction
        open={pendingRemoval !== null}
        title={t('promptSettings.removeTitle', { name: pendingRemoval?.name ?? '' })}
        confirmLabel={t('promptSettings.removeConfirm')}
        busy={busy !== null}
        onCancel={() => setPendingRemoval(null)}
        onConfirm={() => {
          if (pendingRemoval !== null) void submitRemove(pendingRemoval)
        }}
      >
        <p className="m-0">{t('promptSettings.removeBody')}</p>
      </ConfirmAction>

      <ConfirmAction
        open={pendingReset !== null}
        title={t('promptSettings.resetTitle', {
          name: pendingReset === null ? '' : nameOf(pendingReset),
        })}
        confirmLabel={t('promptSettings.resetConfirm')}
        destructive={false}
        busy={busy !== null}
        onCancel={() => setPendingReset(null)}
        onConfirm={() => {
          if (pendingReset !== null) void submitReset(pendingReset)
        }}
      >
        <p className="m-0">{t('promptSettings.resetBody')}</p>
      </ConfirmAction>
    </section>
  )
}
