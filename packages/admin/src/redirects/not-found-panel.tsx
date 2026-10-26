import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { dismissNotFound, listNotFound, type NotFoundEntry } from '../api/redirects-client.js'
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
import { redirectErrorMessage } from './redirect-errors.js'

/**
 * The 404 log (fiche 12 task 1) — the missing half of the redirect table:
 * without it, a broken link is only ever noticed when a visitor complains.
 *
 * Read-only except for "dismiss" and "create a redirect": the log fills
 * itself from the public GET path in `cogenta serve`, never from this
 * screen. "Create a redirect" hands the path to the caller rather than
 * posting to `/api/redirects` itself — the create form above already owns
 * that submission, and duplicating it here would be a second place a
 * redirect could be created slightly differently.
 */

export interface NotFoundPanelProps {
  readonly token: string
  readonly onCreateRedirect: (path: string) => void
}

function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleString()
}

export function NotFoundPanel({ token, onCreateRedirect }: NotFoundPanelProps): JSX.Element {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<readonly NotFoundEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setEntries(await listNotFound(token))
    } catch (caught) {
      setError(redirectErrorMessage(caught, 'redirects.notFoundLoadError', t))
    } finally {
      setLoading(false)
    }
  }, [token, t])

  useEffect(() => {
    void load()
  }, [load])

  async function dismiss(path: string): Promise<void> {
    setError(null)
    try {
      await dismissNotFound(token, path)
      await load()
    } catch (caught) {
      setError(redirectErrorMessage(caught, 'redirects.notFoundDismissError', t))
    }
  }

  return (
    <section aria-labelledby="not-found-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="not-found-heading" className="m-0 text-lg leading-7 font-semibold">
          {t('redirects.notFoundHeading')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('redirects.notFoundDescription')}</p>
      </div>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}

      {loading && <p>{t('common.loading')}</p>}

      {!loading && (
        <TableRoot label={t('redirects.notFoundTableLabel')} stacked>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('redirects.notFoundPath')}</TableHeader>
                <TableHeader>{t('redirects.notFoundHits')}</TableHeader>
                <TableHeader>{t('redirects.notFoundLastSeen')}</TableHeader>
                <TableHeader>{t('redirects.notFoundReferrer')}</TableHeader>
                <TableHeader>{t('redirects.actionsColumn')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.path}>
                  <TableCell stack="heading" className="font-mono text-sm">
                    {entry.path}
                  </TableCell>
                  <TableCell label={t('redirects.notFoundHits')}>{entry.hits}</TableCell>
                  <TableCell label={t('redirects.notFoundLastSeen')}>
                    {formatDate(entry.lastSeen)}
                  </TableCell>
                  <TableCell label={t('redirects.notFoundReferrer')} className="max-w-64 truncate">
                    {entry.lastReferrer ?? '—'}
                  </TableCell>
                  <TableCell stack="actions" className="flex gap-2">
                    <Button size="sm" onClick={() => onCreateRedirect(entry.path)}>
                      {t('redirects.notFoundCreateRedirect')}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => void dismiss(entry.path)}
                    >
                      {t('redirects.notFoundDismiss')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {entries.length === 0 && (
                <TableEmpty colSpan={5}>{t('redirects.notFoundEmpty')}</TableEmpty>
              )}
            </TableBody>
          </Table>
        </TableRoot>
      )}
    </section>
  )
}
