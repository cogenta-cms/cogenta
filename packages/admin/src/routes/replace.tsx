import type { TFunction } from 'i18next'
import { type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { type ReplaceReport, replaceContent, restoreVersion } from '../api/content-client.js'
import { describeApiError } from '../api/describe-error.js'
import { useAuth } from '../auth/auth-context.js'
import { Badge, Button, Card, CardBody, Field, Input, Notice, PageHeader } from '../ui/index.js'

/**
 * « Rechercher et remplacer » (L34) — the tool for the day a brand is renamed
 * or a domain moves.
 *
 * Built around one rule the screen makes visible rather than merely follows:
 * **it shows before it writes**. Searching produces a preview, entry by entry,
 * with each change in context; the button that writes only exists once there
 * is something shown to write, and it writes what was shown. Change the
 * phrase and the preview is gone — an application of a search nobody has
 * looked at is exactly what this screen refuses to offer.
 *
 * Every replacement lands as an ordinary edit: a new version in each entry's
 * history, restorable there one entry at a time.
 */
/**
 * Where a match sits, said the way an editor would: `title` stays the field
 * name it is, `blocks.blocks[2].data.heading` becomes "block 3 · heading".
 * The raw path is kept as a tooltip for whoever needs the exact location.
 */
function describeHitPath(path: string, t: TFunction): string {
  const block = /^blocks\.([^[]+)\[(\d+)\](?:\.data)?\.?(.*)$/u.exec(path)
  if (block === null) return path
  const [, zone = '', index = '0', rest = ''] = block
  return t(zone === 'blocks' ? 'replace.inBlock' : 'replace.inZoneBlock', {
    position: Number(index) + 1,
    zone,
    field: rest === '' ? '—' : rest,
  })
}

export function ReplaceRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null

  const [find, setFind] = useState('')
  const [replace, setReplace] = useState('')
  const [caseInsensitive, setCaseInsensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [preview, setPreview] = useState<ReplaceReport | null>(null)
  const [result, setResult] = useState<ReplaceReport | null>(null)
  // L34 left "pas d'annulation groupée" open: undoing a brand rename across
  // forty entries meant opening forty History tabs. Each entry is restored to
  // the exact version it stood at before the replacement, through the very
  // same restore route the History tab uses — one real version per entry, no
  // second write path. Offered while the report is on screen: leaving the
  // screen does not lose anything, the History tab still has every version.
  const [undone, setUndone] = useState<{ readonly done: number; readonly failed: number } | null>(
    null,
  )
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Any change to what is being searched throws the preview away: the
  // button that writes must only ever apply a search someone has seen.
  const forget = (): void => {
    setPreview(null)
    setResult(null)
    setConfirming(false)
  }

  const options = { find, replace, caseInsensitive, wholeWord }

  const search = (): void => {
    if (token === null || find === '') return
    setBusy(true)
    setError(null)
    setResult(null)
    setConfirming(false)
    replaceContent(token, options)
      .then(setPreview)
      .catch((caught: unknown) => setError(describeApiError(caught, t('replace.failed')).message))
      .finally(() => setBusy(false))
  }

  const undoAll = async (): Promise<void> => {
    const positions = result?.undo ?? []
    if (token === null || positions.length === 0) return
    setBusy(true)
    setError(null)
    let done = 0
    let failed = 0
    for (const position of positions) {
      try {
        await restoreVersion(token, position.collection, position.entryId, position.version)
        done += 1
      } catch {
        // One entry someone has edited since must not stop the others: it is
        // reported, and its own History tab still holds the version.
        failed += 1
      }
    }
    setUndone({ done, failed })
    setResult(null)
    setBusy(false)
  }

  const apply = (): void => {
    if (token === null) return
    if (!confirming) {
      setConfirming(true)
      return
    }
    setBusy(true)
    setError(null)
    replaceContent(token, { ...options, apply: true })
      .then((report) => {
        setResult(report)
        setUndone(null)
        setPreview(null)
        setConfirming(false)
      })
      .catch((caught: unknown) => setError(describeApiError(caught, t('replace.failed')).message))
      .finally(() => setBusy(false))
  }

  // "Cogenta" → "Cogenta SA": the replacement still contains the phrase, so
  // searching again finds the same entries, and applying again would write
  // "Cogenta SA SA". Said before the first application, not discovered after
  // the second.
  const replacementContainsPhrase =
    find !== '' &&
    (caseInsensitive
      ? replace.toLocaleLowerCase().includes(find.toLocaleLowerCase())
      : replace.includes(find))

  const totalOccurrences = (preview?.entries ?? []).reduce(
    (total, entry) => total + entry.occurrences,
    0,
  )

  return (
    <section aria-labelledby="replace-heading" className="flex flex-col gap-6">
      <PageHeader
        id="replace-heading"
        title={t('replace.heading')}
        description={t('replace.description')}
      />

      <Card>
        <CardBody className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t('replace.find')}>
              {(control) => (
                <Input
                  {...control}
                  value={find}
                  disabled={busy}
                  onChange={(event) => {
                    setFind(event.target.value)
                    forget()
                  }}
                />
              )}
            </Field>
            <Field label={t('replace.replaceWith')}>
              {(control) => (
                <Input
                  {...control}
                  value={replace}
                  disabled={busy}
                  onChange={(event) => {
                    setReplace(event.target.value)
                    forget()
                  }}
                />
              )}
            </Field>
          </div>
          <fieldset className="m-0 flex flex-wrap gap-4 border-0 p-0">
            <legend className="sr-only">{t('replace.options')}</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={caseInsensitive}
                disabled={busy}
                onChange={(event) => {
                  setCaseInsensitive(event.target.checked)
                  forget()
                }}
              />
              {t('replace.caseInsensitive')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={wholeWord}
                disabled={busy}
                onChange={(event) => {
                  setWholeWord(event.target.checked)
                  forget()
                }}
              />
              {t('replace.wholeWord')}
            </label>
          </fieldset>
          <p className="m-0 text-xs text-muted-foreground">{t('replace.scope')}</p>
          <div>
            <Button type="button" disabled={busy || find === ''} onClick={search}>
              {t('replace.search')}
            </Button>
          </div>
        </CardBody>
      </Card>

      {error !== null && (
        <Notice tone="danger" live="polite">
          <p>{error}</p>
        </Notice>
      )}

      {result !== null && (
        <Notice tone="success" live="polite">
          <p className="m-0">{t('replace.done', { count: result.entries.length })}</p>
          {(result.skipped ?? []).length > 0 && (
            <p className="m-0 mt-1">
              {t('replace.skipped', { count: result.skipped?.length ?? 0 })}
            </p>
          )}
          {(result.undo ?? []).length > 0 && (
            <p className="m-0 mt-2">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void undoAll()}
              >
                {t('replace.undoAll', { count: result.undo?.length ?? 0 })}
              </Button>
            </p>
          )}
        </Notice>
      )}

      {undone !== null && (
        <Notice tone={undone.failed === 0 ? 'success' : 'warning'} live="polite">
          <p className="m-0">{t('replace.undone', { count: undone.done })}</p>
          {undone.failed > 0 && (
            <p className="m-0 mt-1">{t('replace.undoFailed', { count: undone.failed })}</p>
          )}
        </Notice>
      )}

      {preview !== null && (
        <section aria-labelledby="replace-preview" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="replace-preview" className="m-0 text-base font-semibold">
              {preview.entries.length === 0
                ? t('replace.nothing')
                : t('replace.found', {
                    occurrences: t('replace.occurrences', { count: totalOccurrences }),
                    entries: t('replace.entries', { count: preview.entries.length }),
                  })}
            </h2>
            {preview.entries.length > 0 && (
              <div className="flex items-center gap-2">
                {confirming && (
                  <span className="text-sm font-medium">
                    {t('replace.confirmQuestion', { count: preview.entries.length })}
                  </span>
                )}
                <Button
                  type="button"
                  variant={confirming ? 'destructive' : 'primary'}
                  disabled={busy}
                  onClick={apply}
                >
                  {confirming ? t('replace.confirm') : t('replace.apply')}
                </Button>
              </div>
            )}
          </div>
          {preview.entries.length > 0 && replacementContainsPhrase && (
            <Notice tone="warning" live="off">
              <p>{t('replace.reapplies')}</p>
            </Notice>
          )}
          {preview.truncated && (
            <Notice tone="warning" live="off">
              <p>{t('replace.truncated', { count: preview.entries.length })}</p>
            </Notice>
          )}
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {preview.entries.map((entry) => (
              <li key={`${entry.collection}:${entry.entryId}`}>
                <Card>
                  <CardBody className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        className="font-medium"
                        to={`/collections/${encodeURIComponent(entry.collection)}/${encodeURIComponent(entry.entryId)}`}
                      >
                        {entry.title === '' ? t('replace.untitled') : entry.title}
                      </Link>
                      <Badge tone="neutral">{entry.collection}</Badge>
                      <Badge tone="neutral">{entry.locale}</Badge>
                      <Badge tone="neutral">
                        {t('replace.occurrences', { count: entry.occurrences })}
                      </Badge>
                    </div>
                    <ul className="m-0 flex list-none flex-col gap-2 p-0">
                      {entry.hits.map((hit) => (
                        <li
                          key={hit.path}
                          className="flex flex-col gap-1 border-t border-border pt-2 text-sm first:border-t-0 first:pt-0"
                        >
                          <span className="text-xs text-muted-foreground" title={hit.path}>
                            {describeHitPath(hit.path, t)}
                          </span>
                          <del className="break-words text-muted-foreground">{hit.before}</del>
                          <ins className="break-words no-underline">{hit.after}</ins>
                        </li>
                      ))}
                    </ul>
                  </CardBody>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  )
}
