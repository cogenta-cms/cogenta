import {
  type DragEvent,
  type JSX,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
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
import { useLocalPagination } from '../lib/use-local-pagination.js'
import { useSchema } from '../schema/schema-context.js'
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Notice,
  PageHeader,
  Pagination,
  Select,
} from '../ui/index.js'
import { VisibilityEditor } from '../widgets/visibility-editor.js'
import { WidgetActionsMenu } from '../widgets/widget-actions-menu.js'
import {
  defaultSettings,
  missingRequiredText,
  pluginWidgetType,
  unavailableReason,
  type WidgetSources,
  widgetGroups,
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
const MENU_ITEM =
  'flex min-h-9 w-full cursor-pointer items-center rounded-md border-0 bg-transparent px-2 text-left text-sm text-foreground hover:bg-accent'
/** How long a confirmation stays on screen before it clears itself. */
const STATUS_MS = 6000
/** Below this width the preview would sit under the zones, so it starts closed. */
const WIDE_QUERY = '(min-width: 1280px)'

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
  const [previewOpen, setPreviewOpen] = useState(
    () => typeof window.matchMedia !== 'function' || window.matchMedia(WIDE_QUERY).matches,
  )
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
  // A type a plugin provides has no translation in this bundle — it carries
  // its own label, written by whoever wrote the plugin.
  const typeLabel = (type: WidgetType): string =>
    pluginWidgetType(type)?.label ?? t(`widgets.types.${type}.label`)
  const typeDescription = (type: WidgetType): string => {
    const provided = pluginWidgetType(type)
    return provided === undefined
      ? t(`widgets.types.${type}.description`)
      : t('widgets.fromPlugin', { plugin: provided.plugin })
  }

  const nameOf = (widget: Widget): string => widget.title ?? typeLabel(widget.type)

  // A confirmation must be seen to be believed: it stays on screen for a few
  // seconds (and is announced), then clears itself.
  useEffect(() => {
    if (status === null) return
    const timer = setTimeout(() => setStatus(null), STATUS_MS)
    return () => clearTimeout(timer)
  }, [status])

  /** The copy is hidden and says so in its name, so two rows never read alike. */
  async function duplicate(widget: Widget): Promise<void> {
    if (token === null) return
    await act(async () => {
      const copy = await duplicateWidget(token, widget.id)
      await updateWidget(token, copy.id, {
        title: t('widgets.copyName', { name: nameOf(widget) }),
      })
    }, t('widgets.status.duplicated'))
  }

  function showPreview(): void {
    const next = !previewOpen
    setPreviewOpen(next)
    if (next) {
      // Under the zones on a narrow screen: bring it into view.
      setTimeout(() => {
        document.getElementById('widgets-preview')?.scrollIntoView({ block: 'start' })
      }, 0)
    }
  }

  function addToArea(area: string): void {
    setTargetArea(area)
    document.getElementById('widgets-library')?.scrollIntoView({ block: 'start' })
  }

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
    // Said here, in the screen's own words, before the server's: its message
    // names the widget vocabulary of a package, which is no help to an editor.
    const type = editor.mode === 'create' ? editor.type : editor.widget.type
    const missing = missingRequiredText(type, draft.settings)
    if (missing !== null) {
      setEditorError(t('widgets.editor.required', { field: t(missing) }))
      return
    }
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
              onClick={showPreview}
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
      {/* Fixed, not in the flow: the zones are far below the title, and a
          confirmation that appears above the fold is a confirmation nobody sees. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4"
      >
        {status !== null && (
          <div className="pointer-events-auto max-w-md shadow-lg">
            <Notice tone="success" live="off">
              <p>{status}</p>
            </Notice>
          </div>
        )}
      </div>

      {state === null ? (
        loadError === null && <p>{t('common.loading')}</p>
      ) : (
        <div
          className={`grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] ${
            previewOpen ? 'xl:grid-cols-[17rem_minmax(0,1fr)_minmax(22rem,34rem)]' : ''
          }`}
        >
          <aside
            aria-labelledby="widgets-library"
            className="order-2 flex min-w-0 flex-col gap-4 self-start rounded-xl border border-border bg-card p-4 lg:sticky lg:top-4 lg:order-none"
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
            {widgetGroups().map((group) => {
              const types = group.types.filter(
                (type) =>
                  lowered === '' ||
                  typeLabel(type).toLowerCase().includes(lowered) ||
                  typeDescription(type).toLowerCase().includes(lowered),
              )
              if (types.length === 0) return null
              return (
                <details
                  key={group.id}
                  open={lowered !== '' || group.id === 'content'}
                  className="rounded-md border border-border p-2"
                >
                  <summary className="min-h-11 cursor-pointer px-2 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {t(`widgets.groups.${group.id}`)} ({types.length})
                  </summary>
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
                            className="flex min-h-11 w-full cursor-pointer items-center rounded-md border border-transparent px-2 py-1.5 text-left hover:border-border hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={reason !== null}
                            onClick={() => openCreate(type)}
                            aria-label={t('widgets.addType', { type: typeLabel(type) })}
                            aria-describedby={`widget-type-${type}-description`}
                          >
                            <span className="text-sm font-medium">{typeLabel(type)}</span>
                          </button>
                          <p
                            id={`widget-type-${type}-description`}
                            className="m-0 px-2 pb-1.5 text-xs text-muted-foreground"
                          >
                            {reason === null
                              ? typeDescription(type)
                              : t(`widgets.unavailable.${reason}`)}
                          </p>
                        </li>
                      )
                    })}
                  </ul>
                </details>
              )
            })}
            <p className="m-0 text-xs text-muted-foreground">{t('widgets.noHtml')}</p>
          </aside>

          <div className="order-1 flex flex-col gap-4 lg:order-none">
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
                    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                      <p className="m-0">
                        {t('widgets.emptyArea')}
                        <span className="hidden [@media(pointer:fine)]:inline">
                          {' '}
                          {t('widgets.emptyAreaDrag')}
                        </span>
                      </p>
                      {!area.inactive && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => addToArea(area.id)}
                        >
                          {t('widgets.addHere')}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <WidgetAreaItems widgets={widgets}>
                      {(visibleWidgets, start) => (
                        <ol className="m-0 flex list-none flex-col gap-2 p-0">
                          {visibleWidgets.map((widget, localIndex) => {
                            const index = start + localIndex
                            return (
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
                                        className="w-8 px-0"
                                        title={t('widgets.actions.up')}
                                        disabled={index === 0}
                                        aria-label={t('widgets.actions.upNamed', {
                                          name: nameOf(widget),
                                        })}
                                        onClick={() =>
                                          token !== null &&
                                          void act(
                                            () => moveWidget(token, widget.id, area.id, index - 1),
                                            t('widgets.status.moved'),
                                          )
                                        }
                                      >
                                        <span aria-hidden="true">↑</span>
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="w-8 px-0"
                                        title={t('widgets.actions.down')}
                                        disabled={index === widgets.length - 1}
                                        aria-label={t('widgets.actions.downNamed', {
                                          name: nameOf(widget),
                                        })}
                                        onClick={() =>
                                          token !== null &&
                                          void act(
                                            () => moveWidget(token, widget.id, area.id, index + 1),
                                            t('widgets.status.moved'),
                                          )
                                        }
                                      >
                                        <span aria-hidden="true">↓</span>
                                      </Button>
                                    </>
                                  )}
                                  <WidgetActionsMenu
                                    label={t('widgets.actions.more')}
                                    ariaLabel={t('widgets.actions.moreNamed', {
                                      name: nameOf(widget),
                                    })}
                                  >
                                    <button
                                      type="button"
                                      className={MENU_ITEM}
                                      data-menu-close=""
                                      onClick={() => void duplicate(widget)}
                                    >
                                      {t('widgets.actions.duplicate')}
                                    </button>
                                    <button
                                      type="button"
                                      className={MENU_ITEM}
                                      data-menu-close=""
                                      onClick={() =>
                                        token !== null &&
                                        void act(
                                          () =>
                                            updateWidget(token, widget.id, {
                                              enabled: !widget.enabled,
                                            }),
                                          widget.enabled
                                            ? t('widgets.status.hidden')
                                            : t('widgets.status.shown'),
                                        )
                                      }
                                    >
                                      {widget.enabled
                                        ? t('widgets.actions.hide')
                                        : t('widgets.actions.show')}
                                    </button>
                                    {areas.filter((candidate) => candidate.id !== widget.area)
                                      .length > 0 && (
                                      <>
                                        <p className="m-0 px-2 pt-2 text-xs font-semibold text-muted-foreground">
                                          {t('widgets.actions.moveToPrompt')}
                                        </p>
                                        {areas
                                          .filter((candidate) => candidate.id !== widget.area)
                                          .map((candidate) => (
                                            <button
                                              key={candidate.id}
                                              type="button"
                                              className={MENU_ITEM}
                                              data-menu-close=""
                                              onClick={() =>
                                                token !== null &&
                                                void act(
                                                  () =>
                                                    moveWidget(
                                                      token,
                                                      widget.id,
                                                      candidate.id,
                                                      widgetsIn(candidate.id).length,
                                                    ),
                                                  t('widgets.status.moved'),
                                                )
                                              }
                                            >
                                              {t(`widgets.areas.${candidate.id}`, {
                                                defaultValue: candidate.label,
                                              })}
                                            </button>
                                          ))}
                                      </>
                                    )}
                                    <button
                                      type="button"
                                      className={`${MENU_ITEM} text-destructive`}
                                      data-menu-close=""
                                      onClick={() => setDeleting(widget)}
                                    >
                                      {t('widgets.actions.delete')}
                                    </button>
                                  </WidgetActionsMenu>
                                </div>
                              </li>
                            )
                          })}
                        </ol>
                      )}
                    </WidgetAreaItems>
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

/** Each area's page is independent; moving uses the area's original ordered index. */
function WidgetAreaItems({
  widgets,
  children,
}: {
  readonly widgets: readonly Widget[]
  children(items: readonly Widget[], start: number): ReactNode
}): JSX.Element {
  const { t } = useTranslation()
  const page = useLocalPagination(widgets)
  const pager = (
    <Pagination
      variant="pages"
      page={page.page}
      pageCount={page.pageCount}
      onPageChange={page.onPageChange}
      previousLabel={t('lists.previous')}
      nextLabel={t('lists.next')}
      pageInfo={t('lists.pageInfo', {
        from: page.start + 1,
        to: page.start + page.items.length,
        total: page.total,
      })}
    />
  )
  return (
    <div className="flex flex-col gap-3">
      {pager}
      {children(page.items, page.start)}
      {pager}
    </div>
  )
}
