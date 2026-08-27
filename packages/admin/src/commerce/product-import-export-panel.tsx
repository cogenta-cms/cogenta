import { type ChangeEvent, type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  applyProductsImport,
  exportProductsCsv,
  type ProductImportPreview,
  type ProductImportResult,
  previewProductsImport,
} from '../api/commerce-client.js'
import { ApiError } from '../api/http.js'
import {
  Button,
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
 * CSV import/export for the catalogue (fiche 51 task 6) — the exact
 * preview-then-apply shape `redirects/import-export-panel.tsx` already
 * established: nothing is written until an explicit second click on a
 * preview that has already named every row's outcome. Column matching is the
 * server's job (`@cogenta/commerce`'s `csv.ts` matches the header row by
 * name, case-insensitively, in any order) — this panel only shows what it
 * decided.
 */
const OUTCOME_KEY: Record<ProductImportPreview['rows'][number]['outcome'], string> = {
  create: 'commerceProducts.importOutcomeCreate',
  update: 'commerceProducts.importOutcomeUpdate',
  duplicate: 'commerceProducts.importOutcomeDuplicate',
}

export function ProductImportExportPanel({
  token,
  onImported,
}: {
  readonly token: string
  /** Called once an apply really wrote something, so the product list behind this panel is never left showing a stale page after an import. */
  onImported(): Promise<void>
}): JSX.Element {
  const { t } = useTranslation()
  const [csv, setCsv] = useState('')
  const [preview, setPreview] = useState<ProductImportPreview | null>(null)
  const [result, setResult] = useState<ProductImportResult | null>(null)
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
    reader.onerror = () => setError(t('commerceProducts.importError'))
    reader.readAsText(file)
  }

  async function doPreview(): Promise<void> {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      setPreview(await previewProductsImport(token, csv))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('commerceProducts.importError'))
    } finally {
      setBusy(false)
    }
  }

  async function doApply(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      setResult(await applyProductsImport(token, csv))
      setPreview(null)
      setCsv('')
      await onImported()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('commerceProducts.importError'))
    } finally {
      setBusy(false)
    }
  }

  async function doExport(): Promise<void> {
    setError(null)
    try {
      const { csv: exported, filename } = await exportProductsCsv(token)
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
      setError(caught instanceof ApiError ? caught.message : t('commerceProducts.exportError'))
    }
  }

  return (
    <section aria-labelledby="commerce-import-export-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="commerce-import-export-heading" className="m-0 text-lg leading-7 font-semibold">
          {t('commerceProducts.importExportHeading')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('commerceProducts.importExportDescription')}
        </p>
      </div>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}

      <Button variant="secondary" onClick={() => void doExport()} className="self-start">
        {t('commerceProducts.exportButton')}
      </Button>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="commerce-import-csv"
          className="font-sans text-sm leading-5 font-medium text-foreground"
        >
          {t('commerceProducts.importLabel')}
        </label>
        <textarea
          id="commerce-import-csv"
          rows={6}
          className="w-full rounded-md border border-input bg-card px-3 py-2 font-mono text-xs leading-5 text-card-foreground shadow-card"
          value={csv}
          onChange={(event) => {
            setCsv(event.target.value)
            setPreview(null)
            setResult(null)
          }}
          placeholder="handle,title,status,sku,variant,price,currency,onhand,…"
        />
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label={t('commerceProducts.importFileLabel')}
          onChange={onFileChosen}
        />
      </div>

      <div className="flex gap-2">
        <Button onClick={() => void doPreview()} disabled={busy || csv.trim() === ''}>
          {t('commerceProducts.importPreviewButton')}
        </Button>
        {preview !== null && (
          <>
            <Button onClick={() => void doApply()} disabled={busy}>
              {t('commerceProducts.importApplyButton')}
            </Button>
            <Button variant="secondary" onClick={() => setPreview(null)}>
              {t('commerceProducts.importCancelButton')}
            </Button>
          </>
        )}
      </div>

      {preview !== null && (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <li>
              {t('commerceProducts.importSummaryCreate', { count: preview.summary['create'] ?? 0 })}
            </li>
            <li>
              {t('commerceProducts.importSummaryUpdate', { count: preview.summary['update'] ?? 0 })}
            </li>
            <li>
              {t('commerceProducts.importSummaryDuplicate', {
                count: preview.summary['duplicate'] ?? 0,
              })}
            </li>
            {(preview.summary['invalid'] ?? 0) > 0 && (
              <li>
                {t('commerceProducts.importSummaryInvalid', { count: preview.summary['invalid'] })}
              </li>
            )}
          </ul>

          <TableRoot label={t('commerceProducts.importPreviewTableLabel')}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>{t('commerceProducts.handleColumn')}</TableHeader>
                  <TableHeader>{t('commerceProducts.skuColumn')}</TableHeader>
                  <TableHeader>{t('commerceProducts.actionsColumn')}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {preview.rows.map((row) => (
                  <TableRow key={`${row.line}-${row.sku}`}>
                    <TableCell className="font-mono text-sm">{row.handle}</TableCell>
                    <TableCell className="font-mono text-sm">{row.sku}</TableCell>
                    <TableCell>
                      {t(OUTCOME_KEY[row.outcome])}
                      {row.detail !== undefined && (
                        <span className="text-muted-foreground"> — {row.detail}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {preview.issues.map((issue) => (
                  <TableRow key={`issue-${issue.line}`}>
                    <TableCell colSpan={2}>
                      {t('commerceProducts.importLineLabel', { line: issue.line })}: {issue.detail}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))}
                {preview.rows.length === 0 && preview.issues.length === 0 && (
                  <TableEmpty colSpan={3}>{t('commerceProducts.empty')}</TableEmpty>
                )}
              </TableBody>
            </Table>
          </TableRoot>
        </div>
      )}

      {result !== null && (
        <Notice tone="success" live="polite">
          <p>
            {t('commerceProducts.importResultSummary', {
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
