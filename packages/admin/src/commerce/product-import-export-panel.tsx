import { type ChangeEvent, type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  applyProductsImport,
  exportProductsCsv,
  type ProductImportIssue,
  type ProductImportPreview,
  type ProductImportResult,
  previewProductsImport,
} from '../api/commerce-client.js'
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
import { commerceErrorMessage } from './commerce-errors.js'
import { formatMinor } from './money.js'

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

/** One import problem in the admin's language: its stable code, with the offending value where there is one. */
function useIssueText(): (issue: ProductImportIssue) => string {
  const { t } = useTranslation()
  return (issue) => {
    const key = `commerceCsv.issue.${issue.code ?? 'INTERNAL'}`
    const translated = t(key, { value: issue.value ?? '', max: issue.max ?? 0 })
    if (translated !== key) return translated
    const errorKey = `commerceErrors.${issue.code ?? 'INTERNAL'}`
    const fromErrors = t(errorKey)
    return fromErrors === errorKey ? t('commerceCsv.issue.INTERNAL') : fromErrors
  }
}

export function ProductImportExportPanel({
  token,
  onImported,
}: {
  readonly token: string
  /** Called once an apply really wrote something, so the product list behind this panel is never left showing a stale page after an import. */
  onImported(): Promise<void>
}): JSX.Element {
  const { t, i18n } = useTranslation()
  const issueText = useIssueText()
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
      setError(commerceErrorMessage(t, caught, 'commerceProducts.importError'))
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
      setError(commerceErrorMessage(t, caught, 'commerceProducts.importError'))
    } finally {
      setBusy(false)
    }
  }

  async function download(template: boolean): Promise<void> {
    setError(null)
    try {
      const { csv: exported, filename } = await exportProductsCsv(token, { template })
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
      setError(commerceErrorMessage(t, caught, 'commerceProducts.exportError'))
    }
  }

  const applicable = (preview?.summary['create'] ?? 0) + (preview?.summary['update'] ?? 0)

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

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void download(false)}>
          {t('commerceProducts.exportButton')}
        </Button>
        <Button variant="secondary" onClick={() => void download(true)}>
          {t('commerceProducts.templateButton')}
        </Button>
      </div>

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
        <div>
          <FileButton
            accept=".csv,text/csv"
            label={t('commerceProducts.importFileLabel')}
            emptyLabel={t('common.noFileChosen')}
            aria-label={t('commerceProducts.importFileLabel')}
            onChange={onFileChosen}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={() => void doPreview()} disabled={busy || csv.trim() === ''}>
          {t('commerceProducts.importPreviewButton')}
        </Button>
        {preview !== null && (
          <>
            <Button onClick={() => void doApply()} disabled={busy || applicable === 0}>
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
          <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-sm text-muted-foreground">
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
                      {row.detailCode === 'duplicate_sku' && (
                        <span className="text-muted-foreground">
                          {' — '}
                          {t('commerceCsv.duplicateSku')}
                        </span>
                      )}
                      {row.detailCode === 'current_price' &&
                        row.currentPriceMinor !== undefined && (
                          <span className="text-muted-foreground">
                            {' — '}
                            {t('commerceCsv.currentPrice', {
                              amount: formatMinor(
                                row.currentPriceMinor,
                                row.currentCurrency ?? 'EUR',
                                i18n.language,
                              ),
                            })}
                          </span>
                        )}
                    </TableCell>
                  </TableRow>
                ))}
                {preview.issues.map((issue) => (
                  <TableRow key={`issue-${issue.line}`}>
                    <TableCell colSpan={2}>
                      {t('commerceProducts.importLineLabel', { line: issue.line })}{' '}
                      {issueText(issue)}
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
      {result !== null && result.failed.length > 0 && (
        <Notice tone="warning" live="polite">
          <ul className="m-0 list-none p-0">
            {result.failed.map((issue) => (
              <li key={`failed-${issue.line}`}>
                {t('commerceProducts.importLineLabel', { line: issue.line })} {issueText(issue)}
              </li>
            ))}
          </ul>
        </Notice>
      )}
    </section>
  )
}
