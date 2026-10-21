import type { TFunction } from 'i18next'
import { type ChangeEvent, type JSX, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import {
  analyzeImport,
  applyImportRun,
  cancelImportRun,
  type GenericAnalysis,
  type ImportFieldMapping,
  type ImportRun,
  type ImportSource,
  type JsonAnalysis,
  type WordPressAnalysis,
} from '../api/import-client.js'
import { useAuth } from '../auth/auth-context.js'
import { humanizeFieldName } from '../lib/humanize-field-name.js'
import { useSchema } from '../schema/schema-context.js'
import type { CollectionSummary } from '../schema/types.js'
import {
  Button,
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FileButton,
  Notice,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '../ui/index.js'

/** Never an English sentence from the server: a known code gets its own translated line, anything else the generic one. */
const IMPORT_ERROR_KEYS: Readonly<Record<string, string>> = {
  IMPORT_MAPPING_INVALID: 'importPage.errors.mappingInvalid',
  IMPORT_SOURCE_INVALID: 'importPage.errors.sourceInvalid',
  IMPORT_CSV_INVALID: 'importPage.errors.csvInvalid',
  IMPORT_FEED_INVALID: 'importPage.errors.feedInvalid',
  IMPORT_WXR_PARSE_FAILED: 'importPage.errors.wxrInvalid',
  IMPORT_WXR_UNSAFE_DOCUMENT: 'importPage.errors.unsafe',
  IMPORT_MEDIA_URL_UNSAFE: 'importPage.errors.unsafe',
  IMPORT_RUN_NOT_FOUND: 'importPage.errors.runNotFound',
  IMPORT_ALREADY_APPLIED: 'importPage.errors.alreadyApplied',
}

function importErrorMessage(caught: unknown, fallbackKey: string, t: TFunction): string {
  if (caught instanceof ApiError) {
    const key = IMPORT_ERROR_KEYS[caught.code]
    if (key !== undefined) return t(key)
  }
  return t(fallbackKey)
}

const SOURCES: readonly ImportSource[] = ['wordpress', 'csv', 'json', 'rss']
const SOURCE_LABEL: Readonly<Record<ImportSource, string>> = {
  wordpress: 'importPage.sourceWordpress',
  csv: 'importPage.sourceCsv',
  json: 'importPage.sourceJson',
  rss: 'importPage.sourceRss',
}
const SOURCE_HELP: Readonly<Record<ImportSource, string>> = {
  wordpress: 'importPage.helpWordpress',
  csv: 'importPage.helpCsv',
  json: 'importPage.helpJson',
  rss: 'importPage.helpRss',
}
const SOURCE_ACCEPT: Readonly<Record<ImportSource, string>> = {
  wordpress: '.xml,text/xml,application/xml',
  csv: '.csv,text/csv',
  json: '.json,application/json',
  rss: '.xml,.rss,.atom,text/xml,application/xml',
}

/** The pre-selected collection for a source: the one named `post`/`page` for WordPress, the first one for rows. */
function defaultTarget(
  collections: readonly CollectionSummary[],
  preferred: string | undefined,
): string {
  if (preferred !== undefined && collections.some((collection) => collection.name === preferred)) {
    return preferred
  }
  return preferred === undefined ? (collections[0]?.name ?? '') : ''
}

/**
 * Import content from a file: WordPress, a spreadsheet, a JSON export or a
 * feed. One flow for all of them — choose the file, read what it contains and
 * where it will go, then import (fiche 25's preview/apply/undo machinery).
 *
 * Admin only, same courtesy-plus-server-check split every other admin-only
 * screen uses: the 403 the router produces is what actually stops anyone else
 * (R4).
 */
export function ImportRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const schemaState = useSchema()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const isAdmin = roles.includes('admin')
  const collections = useMemo<readonly CollectionSummary[]>(
    () => (schemaState.status === 'ready' ? schemaState.schema.collections : []),
    [schemaState],
  )

  const [source, setSource] = useState<ImportSource>('wordpress')
  const [postTarget, setPostTarget] = useState('')
  const [pageTarget, setPageTarget] = useState('')
  const [rowTarget, setRowTarget] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [run, setRun] = useState<ImportRun | null>(null)
  const [mapping, setMapping] = useState<Readonly<Record<string, string | null>>>({})
  const [busy, setBusy] = useState<'analyze' | 'apply' | 'cancel' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fileKey, setFileKey] = useState(0)

  // Defaults are chosen once the schema is known: the collections named
  // `post` and `page` when the site has them, the first collection for rows.
  useEffect(() => {
    if (collections.length === 0) return
    setPostTarget((current) => (current === '' ? defaultTarget(collections, 'post') : current))
    setPageTarget((current) => (current === '' ? defaultTarget(collections, 'page') : current))
    setRowTarget((current) => (current === '' ? defaultTarget(collections, undefined) : current))
  }, [collections])

  async function analyze(
    chosen: File,
    overrides: { post?: string; page?: string; rows?: string } = {},
  ): Promise<void> {
    if (token === null) return
    setBusy('analyze')
    setError(null)
    setRun(null)
    const post = overrides.post ?? postTarget
    const page = overrides.page ?? pageTarget
    const rows = overrides.rows ?? rowTarget
    try {
      const result = await analyzeImport(token, {
        source,
        file: chosen,
        ...(source === 'wordpress'
          ? {
              ...(post === '' ? {} : { targetCollection: post }),
              ...(page === '' ? {} : { pageCollection: page }),
            }
          : source === 'json' || rows === ''
            ? {}
            : { targetCollection: rows }),
      })
      setRun(result)
      setMapping(result.mapping?.fields ?? {})
    } catch (caught) {
      setError(importErrorMessage(caught, 'importPage.analyzeError', t))
    } finally {
      setBusy(null)
    }
  }

  function onFileChosen(event: ChangeEvent<HTMLInputElement>): void {
    const [chosen] = event.target.files ?? []
    if (chosen === undefined) return
    setFile(chosen)
    void analyze(chosen)
  }

  /** Changing where content goes re-reads the file already chosen, so the preview never describes a stale destination. */
  function changeTarget(kind: 'post' | 'page' | 'rows', value: string): void {
    if (kind === 'post') setPostTarget(value)
    else if (kind === 'page') setPageTarget(value)
    else setRowTarget(value)
    if (file !== null) void analyze(file, { [kind]: value })
  }

  function changeSource(next: ImportSource): void {
    setSource(next)
    setRun(null)
    setFile(null)
    setError(null)
    setFileKey((key) => key + 1)
  }

  async function apply(): Promise<void> {
    if (token === null || run === null) return
    setBusy('apply')
    setError(null)
    try {
      const edited: ImportFieldMapping | undefined =
        (source === 'csv' || source === 'rss') && run.mapping !== null
          ? { targetCollection: run.mapping.targetCollection, fields: mapping }
          : undefined
      setRun(await applyImportRun(token, run.id, edited))
    } catch (caught) {
      setError(importErrorMessage(caught, 'importPage.applyError', t))
    } finally {
      setBusy(null)
    }
  }

  async function undo(): Promise<void> {
    if (token === null || run === null) return
    setBusy('cancel')
    setError(null)
    try {
      setRun(await cancelImportRun(token, run.id))
    } catch (caught) {
      setError(importErrorMessage(caught, 'importPage.cancelError', t))
    } finally {
      setBusy(null)
    }
  }

  if (!isAdmin) {
    return (
      <section aria-labelledby="import-heading">
        <h1 id="import-heading">{t('importPage.heading')}</h1>
        <p role="alert">{t('importPage.adminOnly')}</p>
      </section>
    )
  }

  const collectionOptions = collections.map((collection) => (
    <option key={collection.name} value={collection.name}>
      {collection.labels.plural}
    </option>
  ))

  return (
    <section aria-labelledby="import-heading" className="flex flex-col gap-6">
      <div>
        <h1 id="import-heading" className="m-0 text-2xl leading-tight font-bold tracking-tight">
          {t('importPage.heading')}
        </h1>
        <p className="mt-1 mb-0 max-w-3xl text-sm text-muted-foreground">{t('importPage.intro')}</p>
      </div>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('importPage.sourceHeading')}</h2>
          </CardTitle>
          <CardDescription>{t(SOURCE_HELP[source])}</CardDescription>
        </CardHeader>
        <CardBody className="max-w-md">
          <Field label={t('importPage.sourceLabel')}>
            {(control) => (
              <Select
                {...control}
                value={source}
                disabled={busy !== null}
                onChange={(event) => changeSource(event.target.value as ImportSource)}
              >
                {SOURCES.map((option) => (
                  <option key={option} value={option}>
                    {t(SOURCE_LABEL[option])}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </CardBody>
      </Card>

      {source !== 'json' && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t('importPage.destinationHeading')}</h2>
            </CardTitle>
            <CardDescription>{t('importPage.destinationHelp')}</CardDescription>
          </CardHeader>
          <CardBody className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
            {source === 'wordpress' ? (
              <>
                <Field label={t('importPage.postsInto')}>
                  {(control) => (
                    <Select
                      {...control}
                      value={postTarget}
                      disabled={busy !== null}
                      onChange={(event) => changeTarget('post', event.target.value)}
                    >
                      <option value="">{t('importPage.automatic')}</option>
                      {collectionOptions}
                    </Select>
                  )}
                </Field>
                <Field label={t('importPage.pagesInto')}>
                  {(control) => (
                    <Select
                      {...control}
                      value={pageTarget}
                      disabled={busy !== null}
                      onChange={(event) => changeTarget('page', event.target.value)}
                    >
                      <option value="">{t('importPage.automatic')}</option>
                      {collectionOptions}
                    </Select>
                  )}
                </Field>
              </>
            ) : (
              <Field label={t('importPage.rowsInto')}>
                {(control) => (
                  <Select
                    {...control}
                    value={rowTarget}
                    disabled={busy !== null}
                    onChange={(event) => changeTarget('rows', event.target.value)}
                  >
                    {collectionOptions}
                  </Select>
                )}
              </Field>
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t('importPage.fileHeading')}</h2>
          </CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <Field label={t('importPage.fileLabel')}>
            {(control) => (
              <FileButton
                {...control}
                key={fileKey}
                accept={SOURCE_ACCEPT[source]}
                disabled={busy !== null}
                label={t('importPage.chooseFile')}
                emptyLabel={t('importPage.noFile')}
                onChange={onFileChosen}
              />
            )}
          </Field>
          {busy === 'analyze' && (
            <p className="m-0 text-sm text-muted-foreground" role="status">
              {t('importPage.analyzing')}
            </p>
          )}
        </CardBody>
      </Card>

      {run !== null && (
        <RunCard
          run={run}
          source={source}
          collections={collections}
          mapping={mapping}
          onMappingChange={(column, field) =>
            setMapping((current) => ({ ...current, [column]: field }))
          }
          busy={busy}
          onApply={() => void apply()}
          onUndo={() => void undo()}
        />
      )}
    </section>
  )
}

function RunCard({
  run,
  source,
  collections,
  mapping,
  onMappingChange,
  busy,
  onApply,
  onUndo,
}: {
  readonly run: ImportRun
  readonly source: ImportSource
  readonly collections: readonly CollectionSummary[]
  readonly mapping: Readonly<Record<string, string | null>>
  onMappingChange(column: string, field: string | null): void
  readonly busy: 'analyze' | 'apply' | 'cancel' | null
  onApply(): void
  onUndo(): void
}): JSX.Element {
  const { t } = useTranslation()
  const finished = run.status === 'done'
  const canApply = run.status === 'analyzed' || run.status === 'failed'

  return (
    <Card aria-labelledby="import-run-heading">
      <CardHeader>
        <CardTitle>
          <h2 id="import-run-heading">
            {finished ? t('importPage.resultHeading') : t('importPage.previewHeading')}
          </h2>
        </CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-5">
        {run.status === 'cancelled' ? (
          <Notice tone="info" live="polite">
            <p>{t('importPage.undone')}</p>
          </Notice>
        ) : (
          <>
            {!finished && source === 'wordpress' && (
              <WordPressPreview analysis={run.analysis as WordPressAnalysis} />
            )}
            {!finished && (source === 'csv' || source === 'rss') && (
              <GenericPreview
                analysis={run.analysis as GenericAnalysis}
                collection={collections.find(
                  (collection) => collection.name === run.mapping?.targetCollection,
                )}
                mapping={mapping}
                onChange={onMappingChange}
              />
            )}
            {!finished && source === 'json' && (
              <JsonPreview analysis={run.analysis as JsonAnalysis} />
            )}

            {run.status === 'failed' && (
              <Notice tone="danger" live="assertive">
                <p>{t('importPage.failedRun')}</p>
              </Notice>
            )}
            {canApply && (
              <div>
                <Button disabled={busy !== null} onClick={onApply} loading={busy === 'apply'}>
                  {run.status === 'failed'
                    ? t('importPage.resumeButton')
                    : t('importPage.applyButton')}
                </Button>
              </div>
            )}
            {busy === 'apply' && (
              <p className="m-0 text-sm text-muted-foreground" role="status">
                {t('importPage.applying')}
              </p>
            )}

            {finished && <RunResult run={run} source={source} />}
            {finished && (
              <div className="flex flex-col items-start gap-2 border-t border-border pt-4">
                <p className="m-0 text-sm text-muted-foreground">{t('importPage.undoHint')}</p>
                <Button variant="secondary" disabled={busy !== null} onClick={onUndo}>
                  {busy === 'cancel' ? t('importPage.undoing') : t('importPage.undoButton')}
                </Button>
              </div>
            )}
          </>
        )}
      </CardBody>
    </Card>
  )
}

function TechnicalNotes({
  heading,
  lines,
}: {
  readonly heading: string
  readonly lines: readonly string[]
}): JSX.Element | null {
  const { t } = useTranslation()
  if (lines.length === 0) return null
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">
        {heading} ({lines.length})
      </summary>
      <p className="mt-1 mb-1 text-xs text-muted-foreground">{t('importPage.noteDetails')}</p>
      <ul className="m-0 max-h-64 overflow-y-auto pl-5 text-xs text-muted-foreground">
        {lines.map((line, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a static report, never reordered
          <li key={index}>{line}</li>
        ))}
      </ul>
    </details>
  )
}

function WordPressPreview({ analysis }: { readonly analysis: WordPressAnalysis }): JSX.Element {
  const { t } = useTranslation()
  const countKeys = ['posts', 'pages', 'categories', 'tags', 'comments', 'attachments'] as const

  return (
    <div className="flex flex-col gap-5">
      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-6">
        {countKeys.map((key) => (
          <li
            key={key}
            className="flex flex-col gap-0.5 rounded-md border border-border bg-background p-3"
          >
            <span className="text-xs font-medium text-muted-foreground">
              {t(`importPage.counts.${key}`)}
            </span>
            <span className="font-mono text-xl font-bold">{analysis.counts[key]}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3">
        <h3 className="m-0 text-base font-semibold">{t('importPage.mappingHeading')}</h3>
        {(['post', 'page'] as const).map((kind) => {
          const target = analysis.targets[kind]
          return (
            <div key={kind} className="flex flex-col gap-1 rounded-md border border-border p-3">
              <p className="m-0 text-sm font-semibold">
                {t(kind === 'post' ? 'importPage.mappingPosts' : 'importPage.mappingPages', {
                  name: target.collection,
                })}
              </p>
              <p className="m-0 text-xs text-muted-foreground">
                {target.mapped ? t('importPage.mappingOwnModel') : t('importPage.mappingBuiltIn')}
              </p>
              {target.mapped && (
                <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-0.5 p-0 text-sm">
                  {Object.entries(target.fields).map(([datum, field]) => (
                    <li key={datum}>
                      {t('importPage.fieldArrow', {
                        datum: t(`importPage.datum.${datum}`, { defaultValue: datum }),
                        field,
                      })}
                    </li>
                  ))}
                </ul>
              )}
              {target.mapped && target.unmapped.length > 0 && (
                <p className="m-0 text-xs text-warning">
                  {t('importPage.unmapped', {
                    list: target.unmapped
                      .map((datum) => t(`importPage.datum.${datum}`, { defaultValue: datum }))
                      .join(', '),
                  })}
                </p>
              )}
            </div>
          )
        })}
        {analysis.targets.category === null && analysis.counts.categories > 0 && (
          <p className="m-0 text-sm text-warning">{t('importPage.categoriesSkipped')}</p>
        )}
        {analysis.targets.tag === null && analysis.counts.tags > 0 && (
          <p className="m-0 text-sm text-warning">{t('importPage.tagsSkipped')}</p>
        )}
      </div>

      {(analysis.slugConflicts.length > 0 || analysis.ignored.length > 0) && (
        <div className="flex flex-col gap-1 text-sm">
          {analysis.slugConflicts.length > 0 && (
            <p className="m-0">
              {t('importPage.slugConflicts', { count: analysis.slugConflicts.length })}
            </p>
          )}
          {analysis.ignored.length > 0 && (
            <p className="m-0">{t('importPage.ignored', { count: analysis.ignored.length })}</p>
          )}
        </div>
      )}
      <TechnicalNotes heading={t('importPage.noteHeading')} lines={analysis.warnings} />
    </div>
  )
}

function GenericPreview({
  analysis,
  collection,
  mapping,
  onChange,
}: {
  readonly analysis: GenericAnalysis
  readonly collection: CollectionSummary | undefined
  readonly mapping: Readonly<Record<string, string | null>>
  onChange(column: string, field: string | null): void
}): JSX.Element {
  const { t } = useTranslation()
  const columns = analysis.sourceFields

  return (
    <div className="flex flex-col gap-5">
      <p className="m-0 text-sm font-medium">
        {t('importPage.records', { count: analysis.totalRecords })}
      </p>

      {columns.length > 0 && collection !== undefined && (
        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-base font-semibold">{t('importPage.csvMappingHeading')}</h3>
          <p className="m-0 text-sm text-muted-foreground">{t('importPage.csvMappingHelp')}</p>
          <TableRoot label={t('importPage.csvMappingHeading')} stacked>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>{t('importPage.columnFile')}</TableHeader>
                  <TableHeader>{t('importPage.columnField')}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {columns.map((column) => (
                  <TableRow key={column}>
                    <TableCell stack="heading">{column}</TableCell>
                    <TableCell label={t('importPage.columnField')}>
                      <Select
                        aria-label={`${t('importPage.columnField')} — ${column}`}
                        value={mapping[column] ?? ''}
                        onChange={(event) =>
                          onChange(column, event.target.value === '' ? null : event.target.value)
                        }
                      >
                        <option value="">{t('importPage.ignoreColumn')}</option>
                        {collection.fields.map((field) => (
                          <option key={field.name} value={field.name}>
                            {field.admin?.label ?? humanizeFieldName(field.name)}
                          </option>
                        ))}
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableRoot>
        </div>
      )}

      {analysis.sample.length > 0 && columns.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-base font-semibold">{t('importPage.sampleHeading')}</h3>
          <TableRoot label={t('importPage.sampleHeading')}>
            <Table>
              <TableHead>
                <TableRow>
                  {columns.map((column) => (
                    <TableHeader key={column}>{column}</TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {analysis.sample.map((row, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a read-only sample
                  <TableRow key={index}>
                    {columns.map((column) => (
                      <TableCell key={column} className="max-w-64 truncate">
                        {row[column] ?? ''}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableRoot>
        </div>
      )}
      <TechnicalNotes heading={t('importPage.noteHeading')} lines={analysis.warnings} />
    </div>
  )
}

function JsonPreview({ analysis }: { readonly analysis: JsonAnalysis }): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm font-medium">
        {t('importPage.records', { count: analysis.totalRecords })}
      </p>
      <h3 className="m-0 text-base font-semibold">{t('importPage.jsonCollections')}</h3>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {Object.entries(analysis.byCollection).map(([name, count]) => (
          <li
            key={name}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          >
            {name} <span className="font-mono text-muted-foreground">{count}</span>
          </li>
        ))}
      </ul>
      {analysis.unknownCollections.length > 0 && (
        <p className="m-0 text-sm text-warning">
          {t('importPage.jsonUnknown', { list: analysis.unknownCollections.join(', ') })}
        </p>
      )}
    </div>
  )
}

interface WordPressReport {
  readonly imported: {
    readonly posts: number
    readonly pages: number
    readonly categories: number
    readonly tags: number
    readonly media: number
    readonly authors: number
    readonly comments: number
  }
  readonly redirectsCreated: number
  readonly skipped: readonly {
    readonly type: string
    readonly wpId: string
    readonly title: string
    readonly reason: string
  }[]
  readonly unconvertedBlocks: readonly {
    readonly postTitle: string
    readonly source: string
    readonly reason: string
  }[]
  readonly warnings: readonly string[]
}

interface GenericReport {
  readonly imported?: number
  readonly resumedSkips?: number
  readonly errors?: readonly { readonly sourceId: string; readonly message: string }[]
}

function RunResult({
  run,
  source,
}: {
  readonly run: ImportRun
  readonly source: ImportSource
}): JSX.Element {
  const { t } = useTranslation()

  if (source === 'wordpress' && run.report !== null) {
    const report = run.report as WordPressReport
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="success" live="polite">
          <p>
            {t('importPage.wpSummary', {
              posts: report.imported.posts,
              pages: report.imported.pages,
              categories: report.imported.categories,
              tags: report.imported.tags,
              media: report.imported.media,
              authors: report.imported.authors,
              comments: report.imported.comments,
              redirects: report.redirectsCreated,
            })}
          </p>
        </Notice>
        <TechnicalNotes
          heading={t('importPage.skippedHeading')}
          lines={report.skipped.map(
            (item) => `[${item.type} ${item.wpId}] “${item.title}” — ${item.reason}`,
          )}
        />
        <TechnicalNotes
          heading={t('importPage.unconvertedHeading')}
          lines={report.unconvertedBlocks.map(
            (note) => `“${note.postTitle}” — ${note.source}: ${note.reason}`,
          )}
        />
        <TechnicalNotes heading={t('importPage.warningsHeading')} lines={report.warnings} />
      </div>
    )
  }

  const report = (run.report ?? {}) as GenericReport
  return (
    <div className="flex flex-col gap-2">
      <Notice tone="success" live="polite">
        <p>{t('importPage.createdCount', { count: report.imported ?? 0 })}</p>
        {(report.resumedSkips ?? 0) > 0 && (
          <p>{t('importPage.alreadyThere', { count: report.resumedSkips ?? 0 })}</p>
        )}
      </Notice>
      {(report.errors?.length ?? 0) > 0 && (
        <TechnicalNotes
          heading={t('importPage.rowErrors', { count: report.errors?.length ?? 0 })}
          lines={(report.errors ?? []).map((item) => `${item.sourceId}: ${item.message}`)}
        />
      )}
    </div>
  )
}
