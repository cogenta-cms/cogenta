import { type JSX, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type Product, updateVariant, type Variant } from '../api/commerce-client.js'
import { ApiError } from '../api/http.js'
import {
  Button,
  Field,
  Input,
  Modal,
  Notice,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '../ui/index.js'
import { formatMinor } from './money.js'

export interface BulkPriceLine {
  readonly product: Product
  readonly variant: Variant
}

/**
 * The catalogue's one bulk action on price (fiche 51 task 2): every variant
 * of every selected product, adjusted by the same percentage — always with a
 * preview the admin sees before a single request is sent, never a single
 * click that moves money on the strength of a percentage typed a moment ago.
 */
export function BulkPriceModal({
  token,
  lines,
  onClose,
  onApplied,
}: {
  readonly token: string
  readonly lines: readonly BulkPriceLine[]
  onClose(): void
  onApplied(): Promise<void>
}): JSX.Element {
  const { t, i18n } = useTranslation()
  const [percentText, setPercentText] = useState('')
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const percent = Number(percentText)
  const validPercent = percentText.trim() !== '' && Number.isFinite(percent)

  const preview = useMemo(() => {
    if (!validPercent) return []
    return lines.map((line) => ({
      ...line,
      newPriceMinor: Math.max(0, Math.round(line.variant.priceMinor * (1 + percent / 100))),
    }))
  }, [lines, percent, validPercent])

  async function apply(): Promise<void> {
    if (!validPercent) return
    setApplying(true)
    setError(null)
    try {
      for (const line of preview) {
        await updateVariant(token, line.variant.id, { priceMinor: line.newPriceMinor })
      }
      await onApplied()
      onClose()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('commerceProducts.bulkPriceError'))
    } finally {
      setApplying(false)
    }
  }

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={t('commerceProducts.bulkPriceHeading')}
      closeLabel={t('commerceProducts.close')}
    >
      <div className="flex flex-col gap-4">
        {error !== null && (
          <Notice tone="danger" live="assertive">
            <p>{error}</p>
          </Notice>
        )}
        <Field
          label={t('commerceProducts.bulkPricePercent')}
          description={t('commerceProducts.bulkPricePercentHint')}
        >
          {(control) => (
            <Input
              {...control}
              type="text"
              inputMode="decimal"
              placeholder="-10"
              value={percentText}
              onChange={(event) => setPercentText(event.target.value)}
            />
          )}
        </Field>

        {validPercent && (
          <TableRoot label={t('commerceProducts.bulkPricePreviewLabel')}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>{t('commerceProducts.titleColumn')}</TableHeader>
                  <TableHeader>{t('commerceProducts.skuColumn')}</TableHeader>
                  <TableHeader>{t('commerceProducts.bulkPriceBefore')}</TableHeader>
                  <TableHeader>{t('commerceProducts.bulkPriceAfter')}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {preview.map((line) => (
                  <TableRow key={line.variant.id}>
                    <TableCell>{line.product.title}</TableCell>
                    <TableCell>{line.variant.sku}</TableCell>
                    <TableCell>
                      {formatMinor(line.variant.priceMinor, line.variant.currency, i18n.language)}
                    </TableCell>
                    <TableCell>
                      {formatMinor(line.newPriceMinor, line.variant.currency, i18n.language)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableRoot>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={!validPercent || applying || lines.length === 0}
            onClick={() => void apply()}
          >
            {t('commerceProducts.bulkPriceApply')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
