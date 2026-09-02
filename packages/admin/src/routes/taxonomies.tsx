import { type JSX, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import {
  createTerm,
  deleteTerm,
  listTerms,
  moveTerm,
  type Term,
  updateTerm,
} from '../api/taxonomy-client.js'
import { useAuth } from '../auth/auth-context.js'
import { canPerformOnTerms } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import type { TaxonomySummary } from '../schema/types.js'
import { DeleteTermModal } from '../taxonomies/delete-term-modal.js'
import { TermFormModal } from '../taxonomies/term-form-modal.js'
import { TermTree } from '../taxonomies/term-tree.js'
import { type ReorderPlan, subtreeSize } from '../taxonomies/term-tree-utils.js'
import {
  Button,
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
 * Taxonomy terms (`schema@2.0`, ADR-0022) — `08-taxonomies.md` in full: a
 * term can be renamed and moved, the tree is a real tree, usage is visible
 * before a deletion, and every button still goes through the real API,
 * following the declared permissions of the taxonomy the way the previous,
 * plainer version of this screen already did.
 *
 * Search and "unused only" filter the **already-loaded** term list in the
 * browser rather than asking the server to filter what `TermTree` renders:
 * the API's own `?q=`/`?unused=1` (tested at `packages/api/test/rest/
 * taxonomy-router.test.ts`) truncate the returned array, which is exactly
 * right for a flat consumer but wrong for a tree — a match three levels
 * deep with a non-matching parent would arrive as an orphan `TermTree` has
 * no parent row to hang it under. So a filter switches the screen to a flat
 * result list instead (each row showing its ancestry), and the nested tree
 * is shown only when nothing is filtered.
 */

function foldForSearch(text: string): string {
  return text.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase()
}

const COMBINING_MARKS = /[̀-ͯ]/gu

function matchesQuery(term: Term, foldedQuery: string): boolean {
  if (foldForSearch(term.slug).includes(foldedQuery)) return true
  return Object.values(term.labels).some((label) => foldForSearch(label).includes(foldedQuery))
}

function ancestryOf(terms: readonly Term[], term: Term, locale: string): string {
  const chain: string[] = []
  let current = term.parent === null ? undefined : terms.find((t) => t.id === term.parent)
  while (current !== undefined) {
    chain.unshift(current.labels[locale] ?? Object.values(current.labels)[0] ?? current.slug)
    current = current.parent === null ? undefined : terms.find((t) => t.id === current?.parent)
  }
  return chain.join(' › ')
}

export function TaxonomiesRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const schemaState = useSchema()

  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []
  const locales =
    schemaState.status === 'ready'
      ? (schemaState.schema.site?.locales ?? [i18n.language])
      : [i18n.language]

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
  const [query, setQuery] = useState('')
  const [unusedOnly, setUnusedOnly] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editingTerm, setEditingTerm] = useState<Term | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Term | null>(null)

  const selected = taxonomies.find((taxonomy) => taxonomy.name === selectedName) ?? taxonomies[0]
  const current = selected?.name ?? null

  const mayCreate = selected !== undefined && canPerformOnTerms('create', selected, roles)
  const mayUpdate = selected !== undefined && canPerformOnTerms('update', selected, roles)
  const mayDelete = selected !== undefined && canPerformOnTerms('delete', selected, roles)

  const load = useCallback(async () => {
    if (token === null || current === null) return
    setLoading(true)
    setError(null)
    try {
      setTerms(await listTerms(token, current, { counts: true }))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('taxonomies.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, current, t])

  useEffect(() => {
    void load()
  }, [load])

  const foldedQuery = foldForSearch(query.trim())
  const filtering = foldedQuery !== '' || unusedOnly
  const flatResults = useMemo(() => {
    if (!filtering) return []
    return terms.filter((term) => {
      if (foldedQuery !== '' && !matchesQuery(term, foldedQuery)) return false
      if (unusedOnly && (term.entryCount?.own ?? 0) !== 0) return false
      return true
    })
  }, [terms, foldedQuery, unusedOnly])

  function openCreate(): void {
    setEditingTerm(null)
    setFormOpen(true)
  }

  function openEdit(term: Term): void {
    setEditingTerm(term)
    setFormOpen(true)
  }

  async function saveTerm(input: {
    readonly slug: string
    readonly labels: Readonly<Record<string, string>>
    readonly parent: string | null
  }): Promise<void> {
    if (token === null || current === null) return

    if (editingTerm === null) {
      await createTerm(token, current, input)
    } else {
      await updateTerm(token, current, editingTerm.id, { slug: input.slug, labels: input.labels })
      if (input.parent !== editingTerm.parent) {
        await moveTerm(token, current, editingTerm.id, input.parent)
      }
    }
    await load()
  }

  async function confirmDelete(cascade: boolean): Promise<void> {
    if (token === null || current === null || deleteTarget === null) return
    await deleteTerm(token, current, deleteTarget.id, { cascade })
    await load()
  }

  async function reorder(plan: ReorderPlan): Promise<void> {
    if (token === null || current === null) return
    setError(null)
    try {
      if (plan.move !== undefined) {
        await moveTerm(token, current, plan.move.id, plan.move.parent)
      }
      for (const assignment of plan.positions) {
        await updateTerm(token, current, assignment.id, { position: assignment.position })
      }
      await load()
    } catch (caught) {
      // The store refuses a cycle or a subtree past the depth bound — its
      // message says which, and is shown rather than guessed at.
      setError(caught instanceof ApiError ? caught.message : t('taxonomies.reorderError'))
    }
  }

  if (schemaState.status === 'loading') return <p>{t('common.loading')}</p>
  if (schemaState.status === 'error') {
    return <p role="alert">{t('common.schemaError', { message: schemaState.message })}</p>
  }

  return (
    <section aria-labelledby="taxonomies-heading" className="flex flex-col gap-6">
      <h1 id="taxonomies-heading" className="m-0 text-2xl leading-tight font-bold tracking-tight">
        {t('taxonomies.heading')}
      </h1>

      {taxonomies.length === 0 ? (
        <p>{t('taxonomies.none')}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-4">
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

            <div className="max-w-xs flex-1">
              <Field label={t('taxonomies.search')}>
                {(control) => (
                  <Input
                    {...control}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                )}
              </Field>
            </div>

            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={unusedOnly}
                onChange={(event) => setUnusedOnly(event.target.checked)}
              />
              {t('taxonomies.unusedOnly')}
            </label>

            {mayCreate && (
              <Button onClick={openCreate} className="mb-0.5">
                {t('taxonomies.newTerm')}
              </Button>
            )}
          </div>

          {error !== null && (
            <Notice tone="danger" live="assertive">
              <p>{error}</p>
            </Notice>
          )}
          {loading && <p>{t('common.loading')}</p>}

          {!loading && filtering && (
            <TableRoot label={t('taxonomies.caption')}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeader>{t('taxonomies.term')}</TableHeader>
                    <TableHeader>{t('taxonomies.slug')}</TableHeader>
                    <TableHeader>{t('taxonomies.ancestry')}</TableHeader>
                    {(mayUpdate || mayDelete) && (
                      <TableHeader>{t('taxonomies.actions')}</TableHeader>
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {flatResults.map((term) => (
                    <TableRow key={term.id}>
                      <TableCell>{labelFor(term, i18n.language)}</TableCell>
                      <TableCell>{term.slug}</TableCell>
                      <TableCell>{ancestryOf(terms, term, i18n.language) || '—'}</TableCell>
                      {(mayUpdate || mayDelete) && (
                        <TableCell>
                          <div className="flex gap-2">
                            {mayUpdate && (
                              <Button size="sm" variant="secondary" onClick={() => openEdit(term)}>
                                {t('taxonomies.edit', { term: labelFor(term, i18n.language) })}
                              </Button>
                            )}
                            {mayDelete && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setDeleteTarget(term)}
                              >
                                {t('taxonomies.delete', { term: labelFor(term, i18n.language) })}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {flatResults.length === 0 && (
                    <TableEmpty colSpan={mayUpdate || mayDelete ? 4 : 3}>
                      {t('taxonomies.noMatch')}
                    </TableEmpty>
                  )}
                </TableBody>
              </Table>
            </TableRoot>
          )}

          {!loading &&
            !filtering &&
            (terms.length === 0 ? (
              <p>{t('taxonomies.empty')}</p>
            ) : (
              <TermTree
                taxonomyName={current ?? ''}
                terms={terms}
                locale={i18n.language}
                mayUpdate={mayUpdate}
                mayDelete={mayDelete}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
                onReorder={(plan) => void reorder(plan)}
              />
            ))}
        </>
      )}

      <TermFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        locales={locales}
        terms={terms}
        editing={editingTerm}
        onSave={saveTerm}
      />

      <DeleteTermModal
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        term={deleteTarget}
        descendantCount={deleteTarget === null ? 0 : subtreeSize(terms, deleteTarget.id)}
        ownCount={deleteTarget?.entryCount?.own ?? null}
        onConfirm={confirmDelete}
      />
    </section>
  )
}

function labelOf(taxonomy: TaxonomySummary, locale: string): string {
  return (
    taxonomy.labels.singular[locale] ?? Object.values(taxonomy.labels.singular)[0] ?? taxonomy.name
  )
}

function labelFor(term: Term, locale: string): string {
  return term.labels[locale] ?? Object.values(term.labels)[0] ?? term.slug
}
