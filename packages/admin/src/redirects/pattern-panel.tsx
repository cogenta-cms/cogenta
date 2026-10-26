import { type FormEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  createRedirectPattern,
  deleteRedirectPattern,
  listRedirectPatterns,
  type RedirectPattern,
} from '../api/redirects-client.js'
import {
  Button,
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
import { redirectErrorMessage } from './redirect-errors.js'

/**
 * Prefix redirects (fiche 12 task 4) — `/blog/*` to `/actualites/*`.
 *
 * There is no status picker beyond 301/302 and no free-text pattern field
 * that could be mistaken for a regular expression: `fromPrefix`/`toPrefix`
 * are matched with a plain `startsWith` on the server (`@cogenta/schema`'s
 * `redirect-patterns.ts`), and this form asks for nothing that would suggest
 * otherwise.
 */

export function PatternPanel({ token }: { readonly token: string }): JSX.Element {
  const { t } = useTranslation()
  const [patterns, setPatterns] = useState<readonly RedirectPattern[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [fromPrefix, setFromPrefix] = useState('')
  const [toPrefix, setToPrefix] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setPatterns(await listRedirectPatterns(token))
    } catch (caught) {
      setError(redirectErrorMessage(caught, 'redirects.patternsLoadError', t))
    } finally {
      setLoading(false)
    }
  }, [token, t])

  useEffect(() => {
    void load()
  }, [load])

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await createRedirectPattern(token, { fromPrefix, toPrefix })
      setFromPrefix('')
      setToPrefix('')
      await load()
    } catch (caught) {
      setError(redirectErrorMessage(caught, 'redirects.patternsCreateError', t))
    } finally {
      setSaving(false)
    }
  }

  async function remove(pattern: RedirectPattern): Promise<void> {
    setError(null)
    try {
      await deleteRedirectPattern(token, pattern.fromPrefix)
      await load()
    } catch (caught) {
      setError(redirectErrorMessage(caught, 'redirects.patternsDeleteError', t))
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 id="patterns-heading" className="m-0 text-lg leading-7 font-semibold">
          {t('redirects.patternsHeading')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('redirects.patternsDescription')}</p>
      </div>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}

      <form onSubmit={(event) => void submit(event)} className="flex flex-wrap items-end gap-4">
        <div className="min-w-48">
          <Field
            label={t('redirects.patternsFromPrefix')}
            description={t('redirects.patternsFromPrefixHint')}
          >
            {(control) => (
              <Input
                {...control}
                required
                placeholder="/blog/*"
                value={fromPrefix}
                onChange={(event) => setFromPrefix(event.target.value)}
              />
            )}
          </Field>
        </div>
        <div className="min-w-48">
          <Field
            label={t('redirects.patternsToPrefix')}
            description={t('redirects.patternsToPrefixHint')}
          >
            {(control) => (
              <Input
                {...control}
                required
                placeholder="/actualites/*"
                value={toPrefix}
                onChange={(event) => setToPrefix(event.target.value)}
              />
            )}
          </Field>
        </div>
        <Button type="submit" disabled={saving}>
          {t('redirects.patternsCreate')}
        </Button>
      </form>

      {loading && <p>{t('common.loading')}</p>}

      {!loading && (
        <TableRoot label={t('redirects.patternsTableLabel')} stacked>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('redirects.patternsFromPrefix')}</TableHeader>
                <TableHeader>{t('redirects.patternsToPrefix')}</TableHeader>
                <TableHeader>{t('redirects.status')}</TableHeader>
                <TableHeader>{t('redirects.actionsColumn')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {patterns.map((pattern) => (
                <TableRow key={pattern.id}>
                  <TableCell stack="heading" className="font-mono text-sm">
                    {pattern.fromPrefix}*
                  </TableCell>
                  <TableCell label={t('redirects.patternsToPrefix')} className="font-mono text-sm">
                    {pattern.toPrefix}*
                  </TableCell>
                  <TableCell label={t('redirects.status')}>{pattern.status}</TableCell>
                  <TableCell stack="actions">
                    <Button variant="destructive" size="sm" onClick={() => void remove(pattern)}>
                      {t('redirects.patternsDelete')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {patterns.length === 0 && (
                <TableEmpty colSpan={4}>{t('redirects.patternsEmpty')}</TableEmpty>
              )}
            </TableBody>
          </Table>
        </TableRoot>
      )}
    </section>
  )
}
