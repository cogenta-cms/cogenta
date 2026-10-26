import { type ChangeEvent, type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  applyRedirectsImport,
  exportRedirectsCsv,
  type ImportIssue,
  type ImportPreview,
  type ImportResult,
  previewRedirectsImport,
} from '../api/redirects-client.js'
import {
  Button,
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
import { redirectErrorMessage } from './redirect-errors.js'

/**
 * CSV import/export (fiche 12 task 4).
 *
 * Import is always two calls, never one: `previewRedirectsImport` shows
 * every row's outcome — create, update, a duplicate inside the file, a
 * self-redirect — before anything is written, and only a second, explicit
 * "Apply" click calls `applyRedirectsImport`. There is no single-click path
 * that writes on the strength of a file having been chosen.
 *
 * A `<textarea>` for pasted CSV plus a plain file input that reads into it
 * (`FileReader`, no new dependency) — one text value either way, so the
 * preview/apply pair only ever has one thing to look at.
 */

const OUTCOME_KEY: Record<ImportPreview['rows'][number]['outcome'], string> = {
  create: 'redirects.importOutcomeCreate',
  update: 'redirects.importOutcomeUpdate',
  unchanged: 'redirects.importOutcomeUnchanged',
  duplicate: 'redirects.importOutcomeDuplicate',
  loop: 'redirects.importOutcomeLoop',
}

const ISSUE_KEY: Record<NonNullable<ImportIssue['code']>, string> = {
  'empty-file': 'redirects.importIssue.emptyFile',
  'missing-columns': 'redirects.importIssue.missingColumns',
  'missing-from': 'redirects.importIssue.missingFrom',
  'invalid-status': 'redirects.importIssue.invalidStatus',
  'missing-to': 'redirects.importIssue.missingTo',
  truncated: 'redirects.importIssue.truncated',
}

export function ImportExportPanel({ token }: { readonly token: string }): JSX.Element {
  const { t } = useTranslation()
  const [csv, setCsv] = useState('')
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onFileChosen(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    if (file === undefined) return
    const reader = new FileReader()
    reader.onload = () => {
      setCsv(typeof reader.result === 'string' ? reader.result : '')
      setPreview(null)
      setResult(null)
    }
    reader.onerror = () => setError(t('redirects.importError'))
    reader.readAsText(file)
  }

  function issueText(issue: ImportIssue): string {
    if (issue.code === undefined) return issue.detail
    return t(ISSUE_KEY[issue.code], { value: issue.value })
  }

  function rowDetail(row: ImportPreview['rows'][number]): string | null {
    if (row.outcome === 'loop') return t('redirects.importDetailLoop')
    if (row.outcome === 'duplicate') return t('redirects.importDetailDuplicate')
    if (row.outcome === 'update' && row.current !== undefined) {
      return t('redirects.importDetailUpdate', { to: row.current.to, status: row.current.status })
    }
    return row.detail ?? null
  }

  async function doPreview(): Promise<void> {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      setPreview(await previewRedirectsImport(token, csv))
    } catch (caught) {
      setError(redirectErrorMessage(caught, 'redirects.importError', t))
    } finally {
      setBusy(false)
    }
  }

  async function doApply(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      setResult(await applyRedirectsImport(token, csv))
      setPreview(null)
      setCsv('')
    } catch (caught) {
      setError(redirectErrorMessage(caught, 'redirects.importError', t))
    } finally {
      setBusy(false)
    }
  }

  async function doExport(): Promise<void> {
    setError(null)
    try {
      const { csv: exported, filename } = await exportRedirectsCsv(token)
      const blob = new Blob([exported], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (caught) {
      setError(redirectErrorMessage(caught, 'redirects.exportError', t))
    }
  }

  return (
    <section aria-labelledby="import-export-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="import-export-heading" className="m-0 text-lg leading-7 font-semibold">
          {t('redirects.importExportHeading')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('redirects.importExportDescription')}</p>
      </div>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}

      <Button variant="secondary" onClick={() => void doExport()} className="self-start">
        {t('redirects.exportButton')}
      </Button>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="redirects-import-csv"
          className="font-sans text-sm leading-5 font-medium text-foreground"
        >
          {t('redirects.importLabel')}
        </label>
        <textarea
          id="redirects-import-csv"
          rows={6}
          className="w-full rounded-md border border-input bg-card px-3 py-2 font-mono text-xs leading-5 text-card-foreground shadow-card"
          value={csv}
          onChange={(event) => {
            setCsv(event.target.value)
            setPreview(null)
            setResult(null)
          }}
          placeholder="from,to,status&#10;/ancienne-page,/nouvelle-page,301"
        />
        <FileButton
          accept=".csv,text/csv"
          aria-label={t('redirects.importFileLabel')}
          label={t('common.chooseFile')}
          emptyLabel={t('common.noFileChosen')}
          onChange={onFileChosen}
        />
      </div>

      <div className="flex gap-2">
        <Button onClick={() => void doPreview()} disabled={busy || csv.trim() === ''}>
          {t('redirects.importPreviewButton')}
        </Button>
        {preview !== null && (
          <>
            <Button onClick={() => void doApply()} disabled={busy}>
              {t('redirects.importApplyButton')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setPreview(null)
              }}
            >
              {t('redirects.importCancelButton')}
            </Button>
          </>
        )}
      </div>

      {preview !== null && (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <li>{t('redirects.importSummaryCreate', { count: preview.summary['create'] ?? 0 })}</li>
            <li>{t('redirects.importSummaryUpdate', { count: preview.summary['update'] ?? 0 })}</li>
            <li>
              {t('redirects.importSummaryUnchanged', { count: preview.summary['unchanged'] ?? 0 })}
            </li>
            <li>
              {t('redirects.importSummaryDuplicate', { count: preview.summary['duplicate'] ?? 0 })}
            </li>
            <li>{t('redirects.importSummaryLoop', { count: preview.summary['loop'] ?? 0 })}</li>
            {(preview.summary['invalid'] ?? 0) > 0 && (
              <li>{t('redirects.importSummaryInvalid', { count: preview.summary['invalid'] })}</li>
            )}
          </ul>

          <TableRoot label={t('redirects.importPreviewTableLabel')} stacked>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>{t('redirects.from')}</TableHeader>
                  <TableHeader>{t('redirects.to')}</TableHeader>
                  <TableHeader>{t('redirects.status')}</TableHeader>
                  <TableHeader>{t('redirects.actionsColumn')}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {preview.rows.map((row) => (
                  <TableRow key={`${row.line}-${row.from}`}>
                    <TableCell stack="heading" className="font-mono text-sm">
                      {row.from}
                    </TableCell>
                    <TableCell label={t('redirects.to')} className="font-mono text-sm">
                      {row.to === '' ? '—' : row.to}
                    </TableCell>
                    <TableCell label={t('redirects.status')}>{row.status}</TableCell>
                    <TableCell label={t('redirects.actionsColumn')}>
                      {t(OUTCOME_KEY[row.outcome])}
                      {rowDetail(row) !== null && (
                        <span className="text-muted-foreground"> — {rowDetail(row)}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {preview.issues.map((issue) => (
                  <TableRow key={`issue-${issue.line}`}>
                    <TableCell colSpan={4}>
                      {t('redirects.importLineLabel', { line: issue.line })}: {issueText(issue)}
                    </TableCell>
                  </TableRow>
                ))}
                {preview.rows.length === 0 && preview.issues.length === 0 && (
                  <TableEmpty colSpan={4}>{t('redirects.patternsEmpty')}</TableEmpty>
                )}
              </TableBody>
            </Table>
          </TableRoot>
        </div>
      )}

      {result !== null && (
        <Notice tone="success" live="polite">
          <p>
            {t('redirects.importResultSummary', {
              created: result.created,
              updated: result.updated,
              failed: result.failed.length,
            })}
          </p>
        </Notice>
      )}
    </section>
  )
}
