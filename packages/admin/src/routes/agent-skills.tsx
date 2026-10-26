import {
  type ChangeEvent,
  Fragment,
  type JSX,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { ConfirmAction } from '../ai/confirm-action.js'
import { describeAiErrorLine } from '../ai/server-text.js'
import {
  readSkillFrontmatter,
  skillDisplayDescription,
  skillDisplayName,
} from '../ai/skill-text.js'
import { useFlash } from '../ai/use-flash.js'
import {
  type AgentSkillResourceSummary,
  type AgentSkillSummary,
  createAgentSkill,
  listAgentSkills,
  listSkillResources,
  removeAgentSkill,
  removeSkillResource,
  SKILL_RESOURCE_DIRS,
  type SkillResourceDir,
  updateAgentSkill,
  uploadSkillResource,
} from '../api/agent-skills-client.js'
import { useAuth } from '../auth/auth-context.js'
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  FileButton,
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

const NEW_SKILL_TEMPLATE = '---\nname: \ndescription: \n---\n\n'

function resourcesByDir(
  resources: readonly AgentSkillResourceSummary[],
  dir: SkillResourceDir,
): readonly AgentSkillResourceSummary[] {
  const prefix = `${dir}/`
  return resources.filter((resource) => resource.path.startsWith(prefix))
}

function fileNameOf(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] ?? path
}

/**
 * L22 task 1bis's "Skills" screen: a named instruction text an agent loads
 * into its context — a different concept from L7's marketplace skill
 * registry (see `@cogenta/agents`' `skills/library.ts`). Seeded at install
 * with three defaults (content writing, basic security review,
 * site-structure/menus); a new agent inherits every skill whose
 * `enabledByDefault` is true, and can exclude specific ones (the Agents
 * screen's own checklist).
 *
 * **Editor changed in L24 task 4**, per an explicit user decision: instead
 * of separate name/description/instructions form fields generating a
 * `SKILL.md` behind the scenes, this screen edits the raw Markdown directly
 * — the exact `SKILL.md` text (frontmatter included) the store persists and
 * a real Claude Code/Codex skill ships as. A skill copied verbatim from
 * `.claude/skills/` (or any other standard agent) can be pasted or imported
 * here and used as-is.
 */
export function AgentSkillsRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')

  const [skills, setSkills] = useState<readonly AgentSkillSummary[]>([])
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

  const flash = useFlash()
  const [pendingRemoval, setPendingRemoval] = useState<AgentSkillSummary | null>(null)
  /** Set once a save was attempted, so an untouched form is not shown as wrong. */
  const [showCreateErrors, setShowCreateErrors] = useState(false)
  const [showEditErrors, setShowEditErrors] = useState(false)

  const [creating, setCreating] = useState(false)
  const [content, setContent] = useState(NEW_SKILL_TEMPLATE)
  const [enabledByDefault, setEnabledByDefault] = useState(true)

  const [editContent, setEditContent] = useState('')
  const [editEnabledByDefault, setEditEnabledByDefault] = useState(true)
  // Tracks which skill id the edit fields were last populated from, so a
  // background reload (after creating or removing an unrelated skill) never
  // clobbers text the admin is mid-typing in the still-open row.
  const syncedEditIdRef = useRef<string | null>(null)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      setSkills(await listAgentSkills(token))
    } catch (caught) {
      setError(describeAiErrorLine(caught, t, t('agentSkills.loadError')))
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    void load()
  }, [load])

  function readFileInto(
    event: ChangeEvent<HTMLInputElement>,
    setter: (value: string) => void,
  ): void {
    const [file] = event.target.files ?? []
    event.target.value = ''
    if (file === undefined) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setter(reader.result)
    }
    reader.readAsText(file)
  }

  /** A skill with no name or no description is a blank row nobody can tell apart: refuse it before it is sent. */
  function skillProblem(text: string): string | null {
    const { name, description } = readSkillFrontmatter(text)
    if (name === '') return t('agentSkills.nameRequired')
    if (description === '') return t('agentSkills.descriptionRequired')
    return null
  }

  async function submitCreate(): Promise<void> {
    if (token === null) return
    if (skillProblem(content) !== null) {
      setShowCreateErrors(true)
      return
    }
    setBusy('create')
    setError(null)
    try {
      const created = readSkillFrontmatter(content).name
      await createAgentSkill(token, { content, enabledByDefault })
      setContent(NEW_SKILL_TEMPLATE)
      setEnabledByDefault(true)
      setCreating(false)
      setShowCreateErrors(false)
      flash.show(t('agentSkills.created', { name: created }))
      await load()
    } catch (caught) {
      setError(describeAiErrorLine(caught, t, t('agentSkills.saveError')))
    } finally {
      setBusy(null)
    }
  }

  function startEdit(skill: AgentSkillSummary): void {
    setEditingId(skill.id)
    setEditContent(skill.content)
    setEditEnabledByDefault(skill.enabledByDefault)
    syncedEditIdRef.current = skill.id
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
    const skill = skills.find((candidate) => candidate.id === editingId)
    if (skill === undefined) return
    setEditContent(skill.content)
    setEditEnabledByDefault(skill.enabledByDefault)
    syncedEditIdRef.current = editingId
  }, [editingId, skills])

  async function submitEdit(id: string): Promise<void> {
    if (token === null) return
    if (skillProblem(editContent) !== null) {
      setShowEditErrors(true)
      return
    }
    setBusy(id)
    setError(null)
    try {
      await updateAgentSkill(token, id, {
        content: editContent,
        enabledByDefault: editEnabledByDefault,
      })
      setEditingId(null)
      setShowEditErrors(false)
      flash.show(t('agentSkills.updated', { name: readSkillFrontmatter(editContent).name }))
      await load()
    } catch (caught) {
      setError(describeAiErrorLine(caught, t, t('agentSkills.saveError')))
    } finally {
      setBusy(null)
    }
  }

  async function submitRemove(skill: AgentSkillSummary): Promise<void> {
    if (token === null) return
    setBusy(skill.id)
    setError(null)
    try {
      await removeAgentSkill(token, skill.id)
      flash.show(t('agentSkills.removed', { name: skillDisplayName(skill, t) }))
      await load()
    } catch (caught) {
      setError(describeAiErrorLine(caught, t, t('agentSkills.saveError')))
    } finally {
      setBusy(null)
      setPendingRemoval(null)
    }
  }

  if (!isAdmin) {
    return (
      <section aria-labelledby="agent-skills-heading">
        <h1 id="agent-skills-heading">{t('agentSkills.heading')}</h1>
        <p role="alert">{t('agentSkills.adminOnly')}</p>
      </section>
    )
  }

  const editedSkill = skills.find((skill) => skill.id === editingId)
  const createProblem = showCreateErrors ? skillProblem(content) : null
  const editProblem = showEditErrors ? skillProblem(editContent) : null

  return (
    <section className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1
          id="agent-skills-heading"
          className="m-0 text-2xl leading-tight font-bold tracking-tight"
        >
          {t('agentSkills.heading')}
        </h1>
        <Button size="sm" onClick={() => setCreating((value) => !value)}>
          {t('agentSkills.createSkill')}
        </Button>
      </div>
      <p className="m-0 text-sm opacity-80">{t('agentSkills.intro')}</p>

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
        <Card aria-labelledby="agent-skills-create-heading" className="min-w-0">
          <CardHeader>
            <CardTitle>
              <h2 id="agent-skills-create-heading">{t('agentSkills.createSkill')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="agent-skill-create-import" className="text-sm font-medium">
                  {t('agentSkills.importLabel')}
                </label>
                <FileButton
                  id="agent-skill-create-import"
                  accept=".md,text/markdown,text/plain"
                  label={t('agentSkills.chooseFile')}
                  emptyLabel={t('agentSkills.noFileChosen')}
                  size="sm"
                  onChange={(event) => readFileInto(event, setContent)}
                />
              </div>
              <label htmlFor="agent-skill-create-content" className="text-sm font-medium">
                {t('agentSkills.content')}
              </label>
              <textarea
                id="agent-skill-create-content"
                className="w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 font-mono text-sm leading-5 text-card-foreground shadow-card aria-invalid:border-destructive"
                rows={14}
                spellCheck={false}
                value={content}
                aria-invalid={createProblem !== null ? true : undefined}
                aria-describedby={createProblem !== null ? 'agent-skill-create-problem' : undefined}
                onChange={(event) => setContent(event.target.value)}
              />
              {createProblem !== null && (
                <p
                  id="agent-skill-create-problem"
                  role="alert"
                  className="m-0 text-xs font-medium text-destructive"
                >
                  {createProblem}
                </p>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={enabledByDefault}
                  onChange={(event) => setEnabledByDefault(event.target.checked)}
                />
                {t('agentSkills.enabledByDefault')}
              </label>
              <div className="flex gap-2">
                <Button disabled={busy === 'create'} onClick={() => void submitCreate()}>
                  {t('common.save')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setCreating(false)
                    setShowCreateErrors(false)
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

      {!loading && editingId !== null && editedSkill === undefined && (
        <Notice tone="warning" live="polite">
          <p>{t('agentSkills.editingNotFound')}</p>
        </Notice>
      )}

      {!loading && (
        <TableRoot label={t('agentSkills.heading')} stacked>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('agentSkills.name')}</TableHeader>
                <TableHeader>{t('agentSkills.description')}</TableHeader>
                <TableHeader>{t('agentSkills.defaultColumn')}</TableHeader>
                <TableHeader>{t('agents.actions')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {skills.map((skill) => (
                <Fragment key={skill.id}>
                  <TableRow key={skill.id}>
                    <TableCell stack="heading">
                      {skillDisplayName(skill, t)}
                      {skill.builtin && (
                        <Badge tone="neutral" className="ml-2 align-middle">
                          {t('agentSkills.builtin')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell label={t('agentSkills.description')}>
                      {skillDisplayDescription(skill, t)}
                    </TableCell>
                    <TableCell label={t('agentSkills.defaultColumn')}>
                      {skill.enabledByDefault ? t('common.yes') : t('common.no')}
                    </TableCell>
                    <TableCell stack="actions">
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => startEdit(skill)}>
                          {t('agents.edit')}
                        </Button>
                        {!skill.builtin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            disabled={busy === skill.id}
                            aria-label={t('agentSkills.removeNamed', { name: skill.name })}
                            onClick={() => setPendingRemoval(skill)}
                          >
                            {t('agents.remove')}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {editingId === skill.id && (
                    <TableRow key={`${skill.id}-edit`}>
                      <TableCell colSpan={4} className="min-w-0">
                        <div className="flex min-w-0 flex-col gap-3 py-2">
                          {skill.builtin && (
                            <Notice tone="info">
                              <p>{t('agentSkills.builtinNote')}</p>
                            </Notice>
                          )}
                          <div className="flex flex-col gap-1.5">
                            <label
                              htmlFor={`agent-skill-import-${skill.id}`}
                              className="text-sm font-medium"
                            >
                              {t('agentSkills.importLabel')}
                            </label>
                            <FileButton
                              id={`agent-skill-import-${skill.id}`}
                              accept=".md,text/markdown,text/plain"
                              label={t('agentSkills.chooseFile')}
                              emptyLabel={t('agentSkills.noFileChosen')}
                              size="sm"
                              onChange={(event) => readFileInto(event, setEditContent)}
                            />
                          </div>
                          <label
                            htmlFor={`agent-skill-content-${skill.id}`}
                            className="text-sm font-medium"
                          >
                            {t('agentSkills.content')}
                          </label>
                          <textarea
                            id={`agent-skill-content-${skill.id}`}
                            className="w-full min-w-0 rounded-md border border-input bg-card px-3 py-2 font-mono text-sm leading-5 text-card-foreground shadow-card aria-invalid:border-destructive"
                            rows={14}
                            spellCheck={false}
                            value={editContent}
                            aria-invalid={editProblem !== null ? true : undefined}
                            aria-describedby={
                              editProblem !== null ? `agent-skill-problem-${skill.id}` : undefined
                            }
                            onChange={(event) => setEditContent(event.target.value)}
                          />
                          {editProblem !== null && (
                            <p
                              id={`agent-skill-problem-${skill.id}`}
                              role="alert"
                              className="m-0 text-xs font-medium text-destructive"
                            >
                              {editProblem}
                            </p>
                          )}
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={editEnabledByDefault}
                              onChange={(event) => setEditEnabledByDefault(event.target.checked)}
                            />
                            {t('agentSkills.enabledByDefault')}
                          </label>
                          {token !== null && (
                            <SkillResourcesPanel token={token} skillId={skill.id} />
                          )}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={busy === skill.id}
                              onClick={() => void submitEdit(skill.id)}
                            >
                              {t('common.save')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingId(null)
                                setShowEditErrors(false)
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
              ))}
              {skills.length === 0 && (
                <TableEmpty colSpan={4}>{t('agentSkills.noSkills')}</TableEmpty>
              )}
            </TableBody>
          </Table>
        </TableRoot>
      )}

      <ConfirmAction
        open={pendingRemoval !== null}
        title={t('agentSkills.removeTitle', {
          name: pendingRemoval === null ? '' : skillDisplayName(pendingRemoval, t),
        })}
        confirmLabel={t('agentSkills.removeConfirm')}
        busy={busy !== null}
        onCancel={() => setPendingRemoval(null)}
        onConfirm={() => {
          if (pendingRemoval !== null) void submitRemove(pendingRemoval)
        }}
      >
        <p className="m-0">{t('agentSkills.removeBody')}</p>
      </ConfirmAction>
    </section>
  )
}

/**
 * "Fichiers de référence" (fiche 57 task 4) — the standard `references/`,
 * `scripts/`, `assets/` layout `AgentSkillStore` creates at `create()`.
 * Self-contained: it loads its own list on mount/skill-id-change rather than
 * sharing state with the parent, since it only ever exists while a single
 * skill's edit row is expanded.
 */
function SkillResourcesPanel({ token, skillId }: { token: string; skillId: string }): JSX.Element {
  const { t } = useTranslation()
  const [resources, setResources] = useState<readonly AgentSkillResourceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setResources(await listSkillResources(token, skillId))
    } catch (caught) {
      setError(describeAiErrorLine(caught, t, t('agentSkills.resources.loadError')))
    } finally {
      setLoading(false)
    }
  }, [token, skillId, t])

  useEffect(() => {
    void load()
  }, [load])

  async function onUpload(
    dir: SkillResourceDir,
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const [file] = event.target.files ?? []
    event.target.value = ''
    if (file === undefined) return
    setBusy(`upload-${dir}`)
    setError(null)
    try {
      await uploadSkillResource(token, skillId, dir, file.name, file)
      await load()
    } catch (caught) {
      setError(describeAiErrorLine(caught, t, t('agentSkills.resources.uploadError')))
    } finally {
      setBusy(null)
    }
  }

  async function onRemove(path: string): Promise<void> {
    setBusy(path)
    setError(null)
    try {
      await removeSkillResource(token, skillId, path)
      await load()
    } catch (caught) {
      setError(describeAiErrorLine(caught, t, t('agentSkills.resources.removeError')))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-md border border-input p-3">
      <div>
        <h2 className="m-0 text-sm font-semibold">{t('agentSkills.resources.heading')}</h2>
        <p className="m-0 text-xs opacity-80">{t('agentSkills.resources.intro')}</p>
      </div>
      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}
      {loading ? (
        <p>{t('common.loading')}</p>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-3">
          {SKILL_RESOURCE_DIRS.map((dir) => (
            <div key={dir} className="flex flex-col gap-2">
              <div>
                <h3 className="m-0 text-sm font-medium">{t(`agentSkills.resources.${dir}`)}</h3>
                <p className="m-0 text-xs opacity-70">{t(`agentSkills.resources.${dir}Hint`)}</p>
              </div>
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                {resourcesByDir(resources, dir).map((resource) => (
                  <li key={resource.path} className="flex items-center justify-between gap-2">
                    <span className="truncate">{fileNameOf(resource.path)}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === resource.path}
                      onClick={() => void onRemove(resource.path)}
                    >
                      {t('agentSkills.resources.remove')}
                    </Button>
                  </li>
                ))}
                {resourcesByDir(resources, dir).length === 0 && (
                  <li className="text-xs opacity-70">{t('agentSkills.resources.noFiles')}</li>
                )}
              </ul>
              <div>
                <label htmlFor={`skill-resource-upload-${skillId}-${dir}`} className="sr-only">
                  {t('agentSkills.resources.upload')}
                </label>
                <FileButton
                  id={`skill-resource-upload-${skillId}-${dir}`}
                  label={t('agentSkills.chooseFile')}
                  emptyLabel={t('agentSkills.noFileChosen')}
                  size="sm"
                  disabled={busy === `upload-${dir}`}
                  onChange={(event) => void onUpload(dir, event)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
