import { Fragment, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  type AgentSkillSummary,
  createAgentSkill,
  listAgentSkills,
  removeAgentSkill,
  updateAgentSkill,
} from '../api/agent-skills-client.js'
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
 * L22 task 1bis's "Skills" screen: a named instruction text an agent loads
 * into its context — a different concept from L7's marketplace skill
 * registry (see `@cogenta/agents`' `skills/library.ts`). Seeded at install
 * with three defaults (content writing, basic security review,
 * site-structure/menus); a new agent inherits every skill whose
 * `enabledByDefault` is true, and can exclude specific ones (the Agents
 * screen's own checklist).
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
  const [editingId, setEditingId] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [instructions, setInstructions] = useState('')

  const [editDescription, setEditDescription] = useState('')
  const [editInstructions, setEditInstructions] = useState('')
  const [editEnabledByDefault, setEditEnabledByDefault] = useState(true)

  const load = useCallback(async () => {
    if (token === null || !isAdmin) return
    setLoading(true)
    setError(null)
    try {
      setSkills(await listAgentSkills(token))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('agentSkills.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, isAdmin, t])

  useEffect(() => {
    void load()
  }, [load])

  async function submitCreate(): Promise<void> {
    if (token === null || name.trim().length === 0) return
    setBusy('create')
    setError(null)
    try {
      await createAgentSkill(token, { name: name.trim(), description, instructions })
      setName('')
      setDescription('')
      setInstructions('')
      setCreating(false)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('agentSkills.saveError'))
    } finally {
      setBusy(null)
    }
  }

  function startEdit(skill: AgentSkillSummary): void {
    setEditingId(skill.id)
    setEditDescription(skill.description)
    setEditInstructions(skill.instructions)
    setEditEnabledByDefault(skill.enabledByDefault)
  }

  async function submitEdit(id: string): Promise<void> {
    if (token === null) return
    setBusy(id)
    setError(null)
    try {
      await updateAgentSkill(token, id, {
        description: editDescription,
        instructions: editInstructions,
        enabledByDefault: editEnabledByDefault,
      })
      setEditingId(null)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('agentSkills.saveError'))
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
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('agentSkills.saveError'))
    } finally {
      setBusy(null)
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

  return (
    <section aria-labelledby="agent-skills-heading" className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 id="agent-skills-heading" className="m-0 text-xl leading-7 font-semibold">
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

      {creating && (
        <Card aria-labelledby="agent-skills-create-heading">
          <CardHeader>
            <CardTitle>
              <h2 id="agent-skills-create-heading">{t('agentSkills.createSkill')}</h2>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <div className="flex flex-col gap-3">
              <Field label={t('agentSkills.name')}>
                {(control) => (
                  <Input
                    {...control}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                )}
              </Field>
              <Field label={t('agentSkills.description')}>
                {(control) => (
                  <Input
                    {...control}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                )}
              </Field>
              <Field label={t('agentSkills.instructions')}>
                {(control) => (
                  <textarea
                    {...control}
                    className="w-full rounded-md border border-input bg-card px-3 py-2 font-sans text-sm leading-5 text-card-foreground shadow-card"
                    rows={5}
                    value={instructions}
                    onChange={(event) => setInstructions(event.target.value)}
                  />
                )}
              </Field>
              <div className="flex gap-2">
                <Button
                  disabled={busy === 'create' || name.trim().length === 0}
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

      {!loading && (
        <TableRoot label={t('agentSkills.heading')}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('agentSkills.name')}</TableHeader>
                <TableHeader>{t('agentSkills.description')}</TableHeader>
                <TableHeader>{t('agentSkills.enabledByDefault')}</TableHeader>
                <TableHeader>{t('agents.actions')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {skills.map((skill) => (
                <Fragment key={skill.id}>
                  <TableRow key={skill.id}>
                    <TableCell>{skill.name}</TableCell>
                    <TableCell>{skill.description}</TableCell>
                    <TableCell>
                      {skill.enabledByDefault ? t('common.yes') : t('common.no')}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => startEdit(skill)}>
                          {t('agents.edit')}
                        </Button>
                        {!skill.builtin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy === skill.id}
                            onClick={() => void submitRemove(skill)}
                          >
                            {t('agents.remove')}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {editingId === skill.id && (
                    <TableRow key={`${skill.id}-edit`}>
                      <TableCell colSpan={4}>
                        <div className="flex flex-col gap-3 py-2">
                          <Field label={t('agentSkills.description')}>
                            {(control) => (
                              <Input
                                {...control}
                                value={editDescription}
                                onChange={(event) => setEditDescription(event.target.value)}
                              />
                            )}
                          </Field>
                          <Field label={t('agentSkills.instructions')}>
                            {(control) => (
                              <textarea
                                {...control}
                                className="w-full rounded-md border border-input bg-card px-3 py-2 font-sans text-sm leading-5 text-card-foreground shadow-card"
                                rows={5}
                                value={editInstructions}
                                onChange={(event) => setEditInstructions(event.target.value)}
                              />
                            )}
                          </Field>
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={editEnabledByDefault}
                              onChange={(event) => setEditEnabledByDefault(event.target.checked)}
                            />
                            {t('agentSkills.enabledByDefault')}
                          </label>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={busy === skill.id}
                              onClick={() => void submitEdit(skill.id)}
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
              {skills.length === 0 && (
                <TableEmpty colSpan={4}>{t('agentSkills.noSkills')}</TableEmpty>
              )}
            </TableBody>
          </Table>
        </TableRoot>
      )}
    </section>
  )
}
