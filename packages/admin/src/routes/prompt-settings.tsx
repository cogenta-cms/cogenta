import { Fragment, type JSX, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { ApiError } from '../api/client.js'
import {
  createPromptTemplate,
  listPromptTemplates,
  type PromptTemplateSummary,
  removePromptTemplate,
  updatePromptTemplate,
} from '../api/prompt-templates-client.js'
import { useAuth } from '../auth/auth-context.js'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Input,
  Notice,
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
 * an edit is later reverted by hand.
 *
 * `category` is a free-text field, not a closed picker: the fiche names a
 * suggested vocabulary ("texte/traduction/agent/image/…") but does not
 * close it, and forcing a `<select>` here would refuse a category this
 * screen's own author never anticipated.
 */

const EMPTY_DRAFT = { name: '', description: '', category: 'text', template: '' }

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
  // Tracks which template id the edit fields were last populated from, so a
  // background reload (after creating or removing an unrelated template)
  // never clobbers text the admin is mid-typing in the still-open row.
  const syncedEditIdRef = useRef<string | null>(null)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      setTemplates(await listPromptTemplates(token))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('promptSettings.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    void load()
  }, [load])

  async function submitCreate(): Promise<void> {
    if (token === null || draft.name.trim().length === 0 || draft.template.trim().length === 0) {
      return
    }
    setBusy('create')
    setError(null)
    try {
      await createPromptTemplate(token, draft)
      setDraft(EMPTY_DRAFT)
      setCreating(false)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('promptSettings.saveError'))
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

  async function submitEdit(id: string): Promise<void> {
    if (token === null) return
    setBusy(id)
    setError(null)
    try {
      await updatePromptTemplate(token, id, editDraft)
      setEditingId(null)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('promptSettings.saveError'))
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
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('promptSettings.saveError'))
    } finally {
      setBusy(null)
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

  return (
    <section aria-labelledby="prompt-settings-heading" className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
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

      {creating && (
        <Card aria-labelledby="prompt-settings-create-heading">
          <CardHeader>
            <CardTitle>
              <h2 id="prompt-settings-create-heading">{t('promptSettings.createTemplate')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <div className="flex flex-col gap-3">
              <label htmlFor="prompt-template-create-name">{t('promptSettings.name')}</label>
              <Input
                id="prompt-template-create-name"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
              <label htmlFor="prompt-template-create-description">
                {t('promptSettings.description')}
              </label>
              <Input
                id="prompt-template-create-description"
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              />
              <label htmlFor="prompt-template-create-category">
                {t('promptSettings.category')}
              </label>
              <Input
                id="prompt-template-create-category"
                value={draft.category}
                onChange={(event) => setDraft({ ...draft, category: event.target.value })}
              />
              <label htmlFor="prompt-template-create-template">
                {t('promptSettings.template')}
              </label>
              <textarea
                id="prompt-template-create-template"
                className="w-full rounded-md border border-input bg-card px-3 py-2 font-mono text-sm leading-5 text-card-foreground shadow-card"
                rows={6}
                spellCheck={false}
                value={draft.template}
                onChange={(event) => setDraft({ ...draft, template: event.target.value })}
              />
              <p className="m-0 text-xs opacity-70">{t('promptSettings.placeholderHint')}</p>
              <div className="flex gap-2">
                <Button
                  disabled={
                    busy === 'create' ||
                    draft.name.trim().length === 0 ||
                    draft.template.trim().length === 0
                  }
                  onClick={() => void submitCreate()}
                >
                  {t('common.save')}
                </Button>
                <Button variant="ghost" onClick={() => setCreating(false)}>
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
        <TableRoot label={t('promptSettings.heading')}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('promptSettings.name')}</TableHeader>
                <TableHeader>{t('promptSettings.category')}</TableHeader>
                <TableHeader>{t('promptSettings.description')}</TableHeader>
                <TableHeader>{t('promptSettings.builtin')}</TableHeader>
                <TableHeader>{t('agents.actions')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {templates.map((template) => (
                <Fragment key={template.id}>
                  <TableRow key={template.id}>
                    <TableCell>{template.name}</TableCell>
                    <TableCell>{template.category}</TableCell>
                    <TableCell>{template.description}</TableCell>
                    <TableCell>{template.builtin ? t('common.yes') : t('common.no')}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => startEdit(template)}>
                          {t('agents.edit')}
                        </Button>
                        {!template.builtin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy === template.id}
                            onClick={() => void submitRemove(template)}
                          >
                            {t('agents.remove')}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {editingId === template.id && (
                    <TableRow key={`${template.id}-edit`}>
                      <TableCell colSpan={5}>
                        <div className="flex flex-col gap-3 py-2">
                          <label htmlFor={`prompt-template-name-${template.id}`}>
                            {t('promptSettings.name')}
                          </label>
                          <Input
                            id={`prompt-template-name-${template.id}`}
                            value={editDraft.name}
                            onChange={(event) =>
                              setEditDraft({ ...editDraft, name: event.target.value })
                            }
                          />
                          <label htmlFor={`prompt-template-description-${template.id}`}>
                            {t('promptSettings.description')}
                          </label>
                          <Input
                            id={`prompt-template-description-${template.id}`}
                            value={editDraft.description}
                            onChange={(event) =>
                              setEditDraft({ ...editDraft, description: event.target.value })
                            }
                          />
                          <label htmlFor={`prompt-template-category-${template.id}`}>
                            {t('promptSettings.category')}
                          </label>
                          <Input
                            id={`prompt-template-category-${template.id}`}
                            value={editDraft.category}
                            onChange={(event) =>
                              setEditDraft({ ...editDraft, category: event.target.value })
                            }
                          />
                          <label htmlFor={`prompt-template-content-${template.id}`}>
                            {t('promptSettings.template')}
                          </label>
                          <textarea
                            id={`prompt-template-content-${template.id}`}
                            className="w-full rounded-md border border-input bg-card px-3 py-2 font-mono text-sm leading-5 text-card-foreground shadow-card"
                            rows={6}
                            spellCheck={false}
                            value={editDraft.template}
                            onChange={(event) =>
                              setEditDraft({ ...editDraft, template: event.target.value })
                            }
                          />
                          <p className="m-0 text-xs opacity-70">
                            {t('promptSettings.placeholderHint')}
                          </p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={
                                busy === template.id || editDraft.template.trim().length === 0
                              }
                              onClick={() => void submitEdit(template.id)}
                            >
                              {t('common.save')}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                              {t('common.cancel')}
                            </Button>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
              {templates.length === 0 && (
                <TableEmpty colSpan={5}>{t('promptSettings.noTemplates')}</TableEmpty>
              )}
            </TableBody>
          </Table>
        </TableRoot>
      )}
    </section>
  )
}
