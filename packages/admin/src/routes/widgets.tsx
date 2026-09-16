import { type DragEvent, type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { describeApiError } from '../api/describe-error.js'
import { listForms } from '../api/forms-client.js'
import { listMenus } from '../api/menu-client.js'
import {
  createWidget,
  DEFAULT_VISIBILITY,
  deleteWidget,
  duplicateWidget,
  getWidgets,
  moveWidget,
  updateWidget,
  type Widget,
  type WidgetsState,
  type WidgetType,
  type WidgetVisibility,
} from '../api/widgets-client.js'
import { useAuth } from '../auth/auth-context.js'
import { useSchema } from '../schema/schema-context.js'
import { Badge, Button, Field, Input, Modal, Notice, PageHeader, Select } from '../ui/index.js'
import { VisibilityEditor } from '../widgets/visibility-editor.js'
import {
  defaultSettings,
  unavailableReason,
  WIDGET_GROUPS,
  type WidgetSources,
} from '../widgets/widget-catalog.js'
import { loadPreviewTargets, type PreviewTarget, WidgetPreview } from '../widgets/widget-preview.js'
import { WidgetSettingsForm } from '../widgets/widget-settings-form.js'

/**
 * « Widgets » (L30): the areas the active theme offers, the widgets placed in
 * them, a library to add more, and for each widget its settings and the rules
 * of where and for whom it shows — as on WordPress. Every move exists as a
 * named button as well as by dragging, and every write goes through the
 * server, whose refusal is shown in its own words.
 */

type Editor =
  | {
      readonly mode: 'create'
      readonly area: string
      readonly type: WidgetType
      readonly position?: number
    }
  | { readonly mode: 'edit'; readonly widget: Widget }

interface Draft {
  readonly title: string
  readonly settings: Record<string, unknown>
  readonly visibility: WidgetVisibility
  readonly enabled: boolean
}

const INACTIVE = '__inactive__'

export function WidgetsRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const schema = useSchema()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const isAdmin = auth.state.status === 'authenticated' && auth.state.user.roles.includes('admin')

  const [state, setState] = useState<WidgetsState | null>(null)
  const [menus, setMenus] = useState<WidgetSources['menus']>([])
  const [forms, setForms] = useState<WidgetSources['forms']>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [targetArea, setTargetArea] = useState('sidebar')
  const [query, setQuery] = useState('')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [editorError, setEditorError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Widget | null>(null)
  const [dragged, setDragged] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  // The preview is the site itself, reloaded after every write (`version`).
  const [previewOpen, setPreviewOpen] = useState(true)
  const [previewTargets, setPreviewTargets] = useState<readonly PreviewTarget[]>([])
  const [previewPath, setPreviewPath] = useState('/')
  const [previewVersion, setPreviewVersion] = useState(0)

  const load = useCallback(async () => {
    if (token === null) return
    try {
      const [widgets, menuList, formList] = await Promise.all([
        getWidgets(token),
        listMenus(token).catch(() => []),
        listForms(token).catch(() => []),
      ])
      setState(widgets)
      setMenus(menuList.map((menu) => ({ id: menu.id, label: `${menu.label} (${menu.locale})` })))
      setForms(formList.map((form) => ({ name: form.name, label: form.label })))
      setLoadError(null)
    } catch (caught) {
      setLoadError(describeApiError(caught, t('widgets.loadError')).message)
    }
  }, [token, t])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    void loadPreviewTargets(t('widgets.preview.home')).then((targets) => {
      if (!cancelled) setPreviewTargets(targets)
    })
    return () => {
      cancelled = true
    }
  }, [t])

  const sources: WidgetSources = useMemo(() => {
    const document = schema.status === 'ready' ? schema.schema : null
    return {
      collections: (document?.collections ?? []).map((collection) => ({
        name: collection.name,
        label: collection.labels.plural,
        routed: collection.routing !== undefined,
      })),
      taxonomies: (document?.taxonomies ?? []).map((taxonomy) => ({
        name: taxonomy.name,
        label:
          taxonomy.labels.plural?.['fr'] ??
          taxonomy.labels.plural?.['en'] ??
          taxonomy.labels.singular['fr'] ??
          taxonomy.labels.singular['en'] ??
          taxonomy.name,
      })),
      menus,
      forms,
    }
  }, [schema, menus, forms])
  const locales = schema.status === 'ready' ? (schema.schema.site?.locales ?? []) : []

  const areaIds = new Set((state?.areas ?? []).map((area) => area.id))
  const widgetsIn = (area: string): readonly Widget[] =>
    (state?.widgets ?? [])
      .filter((widget) => (area === INACTIVE ? !areaIds.has(widget.area) : widget.area === area))
      .sort((a, b) => a.position - b.position)
  const typeLabel = (type: WidgetType): string => t(`widgets.types.${type}.label`)

  async function act(run: () => Promise<unknown>, done: string): Promise<void> {
    setActionError(null)
    try {
      await run()
      setStatus(done)
      setPreviewVersion((version) => version + 1)
      await load()
    } catch (caught) {
      setActionError(describeApiError(caught, t('widgets.actionError')).message)
    }
  }

  function openCreate(type: WidgetType, area = targetArea, position?: number): void {
    setEditor({ mode: 'create', area, type, ...(position === undefined ? {} : { position }) })
    setDraft({
      title: '',
      settings: defaultSettings(type, sources, {
        sampleText: t('widgets.samples.text'),
        sampleHeading: t('widgets.samples.heading'),
        sampleLink: t('widgets.samples.link'),
      }),
      visibility: DEFAULT_VISIBILITY,
      enabled: true,
    })
    setEditorError(null)
  }

  function openEdit(widget: Widget): void {
    setEditor({ mode: 'edit', widget })
    setDraft({
      title: widget.title ?? '',
      settings: { ...widget.settings },
      visibility: widget.visibility,
      enabled: widget.enabled,
    })
    setEditorError(null)
  }

  async function save(): Promise<void> {
    if (token === null || editor === null || draft === null) return
    setSaving(true)
    setEditorError(null)
    try {
      const input = {
        title: draft.title.trim() === '' ? null : draft.title,
        settings: draft.settings,
        visibility: draft.visibility,
        enabled: draft.enabled,
      }
      if (editor.mode === 'create') {
        await createWidget(token, {
          ...input,
          area: editor.area,
          type: editor.type,
          ...(editor.position === undefined ? {} : { position: editor.position }),
        })
        setStatus(t('widgets.status.added'))
      } else {
        await updateWidget(token, editor.widget.id, input)
        setStatus(t('widgets.status.saved'))
      }
      setEditor(null)
      setDraft(null)
      setPreviewVersion((version) => version + 1)
      await load()
    } catch (caught) {
      const described = describeApiError(caught, t('widgets.actionError'))
      setEditorError(
        described.hint === undefined ? described.message : `${described.message} ${described.hint}`,
      )
    } finally {
      setSaving(false)
    }
  }

  function onDrop(event: DragEvent, area: string, position: number): void {
    event.preventDefault()
    event.stopPropagation()
    if (token === null) return
    const payload = event.dataTransfer.getData('text/plain')
    setDragged(null)
    if (payload.startsWith('type:')) {
      openCreate(payload.slice(5) as WidgetType, area, position)
      return
    }
    if (payload.startsWith('widget:')) {
      const id = payload.slice(7)
      void act(() => moveWidget(token, id, area, position), t('widgets.status.moved'))
    }
  }

  const summary = (widget: Widget): readonly string[] => {
    const parts: string[] = []
    if (widget.visibility.pages.mode === 'only') parts.push(t('widgets.summary.onlySome'))
    if (widget.visibility.pages.mode === 'except') parts.push(t('widgets.summary.exceptSome'))
    if (widget.visibility.audience === 'members') parts.push(t('widgets.summary.members'))
    if (widget.visibility.audience === 'visitors') parts.push(t('widgets.summary.visitors'))
    const devices = widget.visibility.devices
    if (!devices.desktop || !devices.tablet || !devices.mobile)
      parts.push(t('widgets.summary.someDevices'))
    if (widget.visibility.from !== null || widget.visibility.until !== null)
      parts.push(t('widgets.summary.scheduled'))
    if (widget.visibility.locales.length > 0) parts.push(widget.visibility.locales.join(', '))
    return parts
  }

  if (!isAdmin) {
    return (
      <section className="flex flex-col gap-4">
        <h1>{t('widgets.heading')}</h1>
        <Notice tone="warning" live="off">
          <p>{t('widgets.adminOnly')}</p>
        </Notice>
      </section>
    )
  }

  const areas = state?.areas ?? []
  const inactive = widgetsIn(INACTIVE)
  const lowered = query.trim().toLowerCase()

  return (
    <section aria-labelledby="widgets-heading" className="flex flex-col gap-6">
      <PageHeader
        id="widgets-heading"
        title={t('widgets.heading')}
        description={t('widgets.description')}
        actions={
          <div className="flex items-center gap-3">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              aria-pressed={previewOpen}
              onClick={() => setPreviewOpen(!previewOpen)}
            >
              {previewOpen ? t('widgets.preview.hide') : t('widgets.preview.show')}
            </Button>
            <a className="text-sm underline" href="/" target="_blank" rel="noreferrer">
              {t('widgets.viewSite')}
            </a>
          </div>
        }
      />
      {loadError !== null && (
        <Notice tone="danger" live="polite">
          <p>{loadError}</p>
        </Notice>
      )}
      {actionError !== null && (
        <Notice tone="danger" live="polite">
          <p>{actionError}</p>
        </Notice>
      )}
      <p className="sr-only" aria-live="polite">
        {status}
      </p>

      {state === null ? (
        loadError === null && <p>{t('common.loading')}</p>
      ) : (
        <div
          className={`grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] ${
            previewOpen ? 'xl:grid-cols-[17rem_minmax(0,1fr)_minmax(22rem,34rem)]' : ''
          }`}
        >
          <aside
            aria-labelledby="widgets-library"
            className="flex flex-col gap-4 self-start rounded-xl border border-border bg-card p-4 lg:sticky lg:top-4"
          >
            <h2 id="widgets-library" className="m-0 text-base font-semibold">
              {t('widgets.library')}
            </h2>
            <Field label={t('widgets.addTo')}>
              {(control) => (
                <Select
                  {...control}
                  value={targetArea}
                  onChange={(event) => setTargetArea(event.target.value)}
                >
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {t(`widgets.areas.${area.id}`, { defaultValue: area.label })}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('widgets.searchLibrary')}>
              {(control) => (
                <Input
                  {...control}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              )}
            </Field>
            {WIDGET_GROUPS.map((group) => {
              const types = group.types.filter(
                (type) =>
                  lowered === '' ||
                  typeLabel(type).toLowerCase().includes(lowered) ||
                  t(`widgets.types.${type}.description`).toLowerCase().includes(lowered),
              )
              if (types.length === 0) return null
              return (
                <div key={group.id} className="flex flex-col gap-2">
                  <h3 className="m-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {t(`widgets.groups.${group.id}`)}
                  </h3>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0">
                    {types.map((type) => {
                      const reason = unavailableReason(type, sources)
                      return (
                        <li
                          key={type}
                          draggable={reason === null}
                          onDragStart={(event) => {
                            event.dataTransfer.setData('text/plain', `type:${type}`)
                            event.dataTransfer.effectAllowed = 'copy'
                          }}
                        >
                          <button
                            type="button"
                            className="flex w-full cursor-pointer flex-col items-start rounded-md border border-transparent px-2 py-1.5 text-left hover:border-border hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={reason !== null}
                            onClick={() => openCreate(type)}
                            aria-label={t('widgets.addType', { type: typeLabel(type) })}
                          >
                            <span className="text-sm font-medium">{typeLabel(type)}</span>
                            <span className="text-xs text-muted-foreground">
                              {reason === null
                                ? t(`widgets.types.${type}.description`)
                                : t(`widgets.unavailable.${reason}`)}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
            <p className="m-0 text-xs text-muted-foreground">{t('widgets.noHtml')}</p>
          </aside>

          <div className="flex flex-col gap-4">
            {[
              ...areas.map((area) => ({ ...area, inactive: false })),
              ...(inactive.length > 0 ? [{ id: INACTIVE, label: '', inactive: true }] : []),
            ].map((area) => {
              const widgets = widgetsIn(area.id)
              const label = area.inactive
                ? t('widgets.inactive')
                : t(`widgets.areas.${area.id}`, { defaultValue: area.label })
              return (
                <section
                  key={area.id}
                  aria-label={label}
                  className="rounded-xl border border-border bg-card p-4"
                  onDragOver={(event) => {
                    if (area.inactive) return
                    event.preventDefault()
                  }}
                  onDrop={(event) => !area.inactive && onDrop(event, area.id, widgets.length)}
                >
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="m-0 text-base font-semibold">{label}</h2>
                    <span className="text-xs text-muted-foreground">
                      {area.inactive
                        ? t('widgets.inactiveHelp')
                        : t('widgets.count', { count: widgets.length })}
                    </span>
                  </div>
                  {widgets.length === 0 ? (
                    <p className="m-0 rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                      {t('widgets.emptyArea')}
                    </p>
                  ) : (
                    <ol className="m-0 flex list-none flex-col gap-2 p-0">
                      {widgets.map((widget, index) => (
                        <li
                          key={widget.id}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData('text/plain', `widget:${widget.id}`)
                            event.dataTransfer.effectAllowed = 'move'
                            setDragged(widget.id)
                          }}
                          onDragEnd={() => setDragged(null)}
                          onDragOver={(event) => {
                            if (area.inactive) return
                            event.preventDefault()
                          }}
                          onDrop={(event) => !area.inactive && onDrop(event, area.id, index)}
                          className={`flex flex-col gap-2 rounded-lg border border-border bg-background p-3 ${dragged === widget.id ? 'opacity-50' : ''} ${widget.enabled ? '' : 'border-dashed'}`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex min-w-0 flex-col">
                              <span className="truncate text-sm font-semibold">
                                {widget.title ?? typeLabel(widget.type)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {typeLabel(widget.type)}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {!widget.enabled && (
                                <Badge tone="warning">{t('widgets.hidden')}</Badge>
                              )}
                              {summary(widget).map((part) => (
                                <Badge key={part} tone="info">
                                  {part}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => openEdit(widget)}
                            >
                              {t('widgets.actions.edit')}
                            </Button>
                            {!area.inactive && (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={index === 0}
                                  aria-label={t('widgets.actions.upNamed', {
                                    name: widget.title ?? typeLabel(widget.type),
                                  })}
                                  onClick={() =>
                                    token !== null &&
                                    void act(
                                      () => moveWidget(token, widget.id, area.id, index - 1),
                                      t('widgets.status.moved'),
                                    )
                                  }
                                >
                                  {t('widgets.actions.up')}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  disabled={index === widgets.length - 1}
                                  aria-label={t('widgets.actions.downNamed', {
                                    name: widget.title ?? typeLabel(widget.type),
                                  })}
                                  onClick={() =>
                                    token !== null &&
                                    void act(
                                      () => moveWidget(token, widget.id, area.id, index + 1),
                                      t('widgets.status.moved'),
                                    )
                                  }
                                >
                                  {t('widgets.actions.down')}
                                </Button>
                              </>
                            )}
                            <Select
                              aria-label={t('widgets.actions.moveTo', {
                                name: widget.title ?? typeLabel(widget.type),
                              })}
                              className="h-8 w-auto text-xs"
                              value=""
                              onChange={(event) => {
                                const destination = event.target.value
                                if (token === null || destination === '') return
                                void act(
                                  () =>
                                    moveWidget(
                                      token,
                                      widget.id,
                                      destination,
                                      widgetsIn(destination).length,
                                    ),
                                  t('widgets.status.moved'),
                                )
                              }}
                            >
                              <option value="">{t('widgets.actions.moveToPrompt')}</option>
                              {areas
                                .filter((candidate) => candidate.id !== widget.area)
                                .map((candidate) => (
                                  <option key={candidate.id} value={candidate.id}>
                                    {t(`widgets.areas.${candidate.id}`, {
                                      defaultValue: candidate.label,
                                    })}
                                  </option>
                                ))}
                            </Select>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                token !== null &&
                                void act(
                                  () => duplicateWidget(token, widget.id),
                                  t('widgets.status.duplicated'),
                                )
                              }
                            >
                              {t('widgets.actions.duplicate')}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                token !== null &&
                                void act(
                                  () =>
                                    updateWidget(token, widget.id, { enabled: !widget.enabled }),
                                  widget.enabled
                                    ? t('widgets.status.hidden')
                                    : t('widgets.status.shown'),
                                )
                              }
                            >
                              {widget.enabled
                                ? t('widgets.actions.hide')
                                : t('widgets.actions.show')}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeleting(widget)}
                            >
                              {t('widgets.actions.delete')}
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              )
            })}
          </div>

          {previewOpen && (
            <WidgetPreview
              version={previewVersion}
              targets={previewTargets}
              path={previewPath}
              onPathChange={setPreviewPath}
            />
          )}
        </div>
      )}

      <Modal
        open={editor !== null && draft !== null}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setEditor(null)
            setDraft(null)
          }
        }}
        title={
          editor === null
            ? ''
            : editor.mode === 'create'
              ? t('widgets.editor.createTitle', {
                  type: typeLabel(editor.type),
                  area: t(`widgets.areas.${editor.area}`, { defaultValue: editor.area }),
                })
              : t('widgets.editor.editTitle', { type: typeLabel(editor.widget.type) })
        }
        closeLabel={t('widgets.close')}
        className="w-[min(46rem,calc(100vw-2rem))]"
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => {
                setEditor(null)
                setDraft(null)
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>
              {saving ? t('widgets.editor.saving') : t('widgets.editor.save')}
            </Button>
          </>
        }
      >
        {editor !== null && draft !== null && token !== null && (
          <div className="flex flex-col gap-5">
            {editorError !== null && (
              <Notice tone="danger" live="polite">
                <p>{editorError}</p>
              </Notice>
            )}
            <Field label={t('widgets.editor.title')} description={t('widgets.editor.titleHelp')}>
              {(control) => (
                <Input
                  {...control}
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                />
              )}
            </Field>
            <section aria-labelledby="widget-settings" className="flex flex-col gap-3">
              <h3 id="widget-settings" className="m-0 text-sm font-semibold">
                {t('widgets.editor.settings')}
              </h3>
              <p className="m-0 text-xs text-muted-foreground">
                {t(
                  `widgets.types.${editor.mode === 'create' ? editor.type : editor.widget.type}.description`,
                )}
              </p>
              <WidgetSettingsForm
                idPrefix="widget-editor"
                token={token}
                type={editor.mode === 'create' ? editor.type : editor.widget.type}
                settings={draft.settings}
                sources={sources}
                onChange={(settings) => setDraft({ ...draft, settings })}
              />
            </section>
            <details className="rounded-md border border-border p-3">
              <summary className="cursor-pointer text-sm font-semibold">
                {t('widgets.editor.visibility')}
              </summary>
              <div className="mt-4">
                <VisibilityEditor
                  idPrefix="widget-visibility"
                  value={draft.visibility}
                  sources={sources}
                  locales={locales}
                  onChange={(visibility) => setDraft({ ...draft, visibility })}
                />
              </div>
            </details>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
              />
              {t('widgets.editor.enabled')}
            </label>
          </div>
        )}
      </Modal>

      <Modal
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={t('widgets.deleteTitle', {
          name: deleting === null ? '' : (deleting.title ?? typeLabel(deleting.type)),
        })}
        closeLabel={t('widgets.close')}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setDeleting(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const target = deleting
                setDeleting(null)
                if (token !== null && target !== null) {
                  void act(() => deleteWidget(token, target.id), t('widgets.status.deleted'))
                }
              }}
            >
              {t('widgets.actions.delete')}
            </Button>
          </>
        }
      >
        <p className="m-0 text-sm">{t('widgets.deleteHelp')}</p>
      </Modal>
    </section>
  )
}
