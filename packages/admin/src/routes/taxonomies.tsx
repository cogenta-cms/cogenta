import { type FormEvent, type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import { createTerm, deleteTerm, listTerms, type Term } from '../api/taxonomy-client.js'
import { useAuth } from '../auth/auth-context.js'
import { canPerformOnTerms } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import type { TaxonomySummary } from '../schema/types.js'
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Notice,
  Select,
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
 * Taxonomy terms (`schema@2.0`, ADR-0022): list a tree, add to it, remove
 * from it.
 *
 * Plain on purpose — L11 owns how the admin looks. What matters here is that
 * every button goes through the real API, and that what is shown follows the
 * declared permissions of the taxonomy: the create form appears only for an
 * actor who may create, the delete button only for one who may delete. The
 * server refuses the rest regardless (R4); hiding it is courtesy, not
 * security.
 */
export function TaxonomiesRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const schemaState = useSchema()

  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []

  const taxonomies: readonly TaxonomySummary[] =
    schemaState.status === 'ready'
      ? (schemaState.schema.taxonomies ?? []).filter((taxonomy) =>
          canPerformOnTerms('read', taxonomy, roles),
        )
      : []

  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [terms, setTerms] = useState<readonly Term[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slug, setSlug] = useState('')
  const [label, setLabel] = useState('')
  const [parent, setParent] = useState('')
  const [saving, setSaving] = useState(false)

  const selected = taxonomies.find((taxonomy) => taxonomy.name === selectedName) ?? taxonomies[0]
  const current = selected?.name ?? null

  const mayCreate = selected !== undefined && canPerformOnTerms('create', selected, roles)
  const mayDelete = selected !== undefined && canPerformOnTerms('delete', selected, roles)

  const load = useCallback(async () => {
    if (token === null || current === null) return
    setLoading(true)
    setError(null)
    try {
      setTerms(await listTerms(token, current))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('taxonomies.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, current, t])

  useEffect(() => {
    void load()
  }, [load])

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (token === null || current === null) return

    setSaving(true)
    setError(null)
    try {
      await createTerm(token, current, {
        slug,
        // One locale here — the current interface language. A term's labels
        // are per locale by contract; editing all of them at once is L11's
        // problem, not a reason to store none.
        labels: { [i18n.language]: label },
        parent: parent === '' ? null : parent,
      })
      setSlug('')
      setLabel('')
      setParent('')
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('taxonomies.createError'))
    } finally {
      setSaving(false)
    }
  }

  async function remove(term: Term): Promise<void> {
    if (token === null || current === null) return
    setError(null)
    try {
      await deleteTerm(token, current, term.id)
      await load()
    } catch (caught) {
      // The server refuses a term that still has children unless cascade is
      // asked for. Its message says so; showing it is more useful than
      // guessing, and cascading silently would be worse than either.
      setError(caught instanceof ApiError ? caught.message : t('taxonomies.deleteError'))
    }
  }

  if (schemaState.status === 'loading') return <p>{t('common.loading')}</p>
  if (schemaState.status === 'error') {
    return <p role="alert">{t('common.schemaError', { message: schemaState.message })}</p>
  }

  return (
    <section aria-labelledby="taxonomies-heading" className="flex flex-col gap-6">
      <h1 id="taxonomies-heading" className="m-0 text-xl leading-7 font-semibold">
        {t('taxonomies.heading')}
      </h1>

      {taxonomies.length === 0 ? (
        <p>{t('taxonomies.none')}</p>
      ) : (
        <>
          <div className="max-w-xs">
            <Field label={t('taxonomies.taxonomy')}>
              {(control) => (
                <Select
                  {...control}
                  value={current ?? ''}
                  onChange={(event) => setSelectedName(event.target.value)}
                >
                  {taxonomies.map((taxonomy) => (
                    <option key={taxonomy.name} value={taxonomy.name}>
                      {labelOf(taxonomy, i18n.language)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          {error !== null && (
            <Notice tone="danger" live="assertive">
              <p>{error}</p>
            </Notice>
          )}
          {loading && <p>{t('common.loading')}</p>}

          {!loading && (
            <TableRoot label={t('taxonomies.caption')}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>{t('taxonomies.term')}</TableHeader>
                    <TableHeader>{t('taxonomies.slug')}</TableHeader>
                    {mayDelete && <TableHeader>{t('taxonomies.actions')}</TableHeader>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {terms.map((term) => (
                    <TableRow key={term.id}>
                      {/* The tree comes back in tree order, so indenting by
                          depth is all it takes to render it. */}
                      <TableCell style={{ paddingLeft: `${term.depth * 1.5 + 1}rem` }}>
                        {term.labels[i18n.language] ?? Object.values(term.labels)[0] ?? term.slug}
                      </TableCell>
                      <TableCell>{term.slug}</TableCell>
                      {mayDelete && (
                        <TableCell>
                          <Button variant="destructive" size="sm" onClick={() => void remove(term)}>
                            {t('taxonomies.delete')}
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {terms.length === 0 && (
                    <TableEmpty colSpan={mayDelete ? 3 : 2}>{t('taxonomies.empty')}</TableEmpty>
                  )}
                </TableBody>
              </Table>
            </TableRoot>
          )}

          {mayCreate && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>{t('taxonomies.newTerm')}</h2>
                </CardTitle>
              </CardHeader>
              <CardBody>
                <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
                  <Field label={t('taxonomies.label')}>
                    {(control) => (
                      <Input
                        {...control}
                        value={label}
                        required
                        onChange={(event) => setLabel(event.target.value)}
                      />
                    )}
                  </Field>
                  <Field label={t('taxonomies.slug')}>
                    {(control) => (
                      <Input
                        {...control}
                        value={slug}
                        required
                        onChange={(event) => setSlug(event.target.value)}
                      />
                    )}
                  </Field>
                  {selected?.hierarchical === true && (
                    <Field label={t('taxonomies.parent')}>
                      {(control) => (
                        <Select
                          {...control}
                          value={parent}
                          onChange={(event) => setParent(event.target.value)}
                        >
                          <option value="">{t('taxonomies.noParent')}</option>
                          {terms.map((term) => (
                            <option key={term.id} value={term.id}>
                              {term.slug}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                  )}
                  <div className="flex justify-end">
                    <Button type="submit" disabled={saving}>
                      {t('taxonomies.create')}
                    </Button>
                  </div>
                </form>
              </CardBody>
            </Card>
          )}
        </>
      )}
    </section>
  )
}

function labelOf(taxonomy: TaxonomySummary, locale: string): string {
  return (
    taxonomy.labels.singular[locale] ?? Object.values(taxonomy.labels.singular)[0] ?? taxonomy.name
  )
}
