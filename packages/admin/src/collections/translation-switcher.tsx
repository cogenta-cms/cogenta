import { type JSX, useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ApiError } from '../api/client.js'
import { type Entry, getTranslations } from '../api/content-client.js'

/**
 * One entry per language, linked by `translationOf` (ADR-0014) — never a
 * per-locale map inside one row. This is the UI for that family: which
 * locales already have their own entry, and a way to start the missing
 * ones, seeded from the entry open right now.
 */
export function TranslationSwitcher({
  token,
  collection,
  entryId,
  currentLocale,
  locales,
  currentValues,
}: {
  readonly token: string
  readonly collection: string
  readonly entryId: string
  readonly currentLocale: string
  readonly locales: readonly string[]
  /** Handed to a new translation as its starting point — copied wholesale, not merged field by field, since only the editor knows which `localized` fields still need translating. */
  readonly currentValues: Readonly<Record<string, unknown>>
}): JSX.Element | null {
  const navigate = useNavigate()
  const [family, setFamily] = useState<readonly Entry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getTranslations(token, collection, entryId)
      .then((entries) => {
        if (!cancelled) setFamily(entries)
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(
            caught instanceof ApiError ? caught.message : 'Impossible de charger les traductions.',
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [token, collection, entryId])

  if (locales.length < 2) return null

  return (
    <section aria-labelledby="translations-heading" className="translation-switcher">
      <h2 id="translations-heading">Traductions</h2>
      {error !== null && <p role="alert">{error}</p>}
      {family === null && error === null && <p>Chargement…</p>}
      {family !== null && (
        <ul>
          {locales.map((locale) => {
            const existing = family.find((entry) => entry.locale === locale)
            return (
              <li key={locale}>
                {locale === currentLocale ? (
                  <strong>{locale} (courant)</strong>
                ) : existing !== undefined ? (
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        `/collections/${encodeURIComponent(collection)}/${encodeURIComponent(existing.id)}`,
                      )
                    }
                  >
                    {locale}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/collections/${encodeURIComponent(collection)}/new`, {
                        state: { locale, translationOf: entryId, values: currentValues },
                      })
                    }
                  >
                    {locale} — créer la traduction
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
