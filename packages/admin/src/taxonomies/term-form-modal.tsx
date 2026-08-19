import { type FormEvent, type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import type { Term } from '../api/taxonomy-client.js'
import { Button, Field, Input, Modal, Notice } from '../ui/index.js'
import { childrenOf, isSelfOrDescendant, subtreeSize } from './term-tree-utils.js'

/**
 * Create or edit a term, in a modal (`08-taxonomies.md`, task 1).
 *
 * One modal for both: creating is editing a term that does not exist yet
 * with an empty slug and no labels. The label is a field **per site
 * locale** — the previous screen wrote `{ [i18n.language]: label }`, which
 * amputated every language a bilingual site did not happen to be looking at
 * when the term was typed.
 *
 * The parent picker is the tree itself, not a `<select>` of raw slugs (task
 * 2): a nested list of radio buttons, indented the same way the tree is,
 * excluding — while editing — the term itself and everything beneath it,
 * since the server would refuse that as a cycle anyway and there is no
 * reason to let an editor pick an option that can only fail.
 */

export interface TermFormModalProps {
  readonly open: boolean
  onOpenChange(open: boolean): void
  readonly locales: readonly string[]
  readonly terms: readonly Term[]
  /** `null` creates a new root-eligible term; otherwise the term being edited. */
  readonly editing: Term | null
  onSave(input: {
    readonly slug: string
    readonly labels: Readonly<Record<string, string>>
    readonly parent: string | null
  }): Promise<void>
}

const LARGE_SUBTREE = 5

export function TermFormModal({
  open,
  onOpenChange,
  locales,
  terms,
  editing,
  onSave,
}: TermFormModalProps): JSX.Element {
  const { t } = useTranslation()
  const [slug, setSlug] = useState('')
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [parent, setParent] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setSlug(editing?.slug ?? '')
    setLabels({ ...(editing?.labels ?? {}) })
    setParent(editing?.parent ?? null)
    setError(null)
  }, [open, editing])

  const movedSize =
    editing !== null && parent !== editing.parent ? subtreeSize(terms, editing.id) : 0

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onSave({ slug, labels, parent })
      onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('taxonomies.saveError'))
    } finally {
      setSaving(false)
    }
  }

  function renderParentOptions(parentId: string | null, depth: number): JSX.Element[] {
    return childrenOf(terms, parentId).flatMap((term) => {
      // A term cannot become its own parent, nor the parent of one of its
      // own descendants — the server refuses both as `TAXONOMY_CYCLE`, so
      // the picker never shows an option that could only fail.
      if (editing !== null && isSelfOrDescendant(terms, editing.id, term.id)) return []

      const label = term.labels[locales[0] ?? ''] ?? Object.values(term.labels)[0] ?? term.slug
      return [
        <label
          key={term.id}
          className="flex items-center gap-2 py-0.5 text-sm"
          style={{ paddingLeft: `${depth * 1.25}rem` }}
        >
          <input
            type="radio"
            name="term-parent"
            value={term.id}
            checked={parent === term.id}
            onChange={() => setParent(term.id)}
          />
          {label}
        </label>,
        ...renderParentOptions(term.id, depth + 1),
      ]
    })
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={editing === null ? t('taxonomies.newTerm') : t('taxonomies.editTerm')}
      closeLabel={t('common.cancel')}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="term-form" disabled={saving}>
            {t('taxonomies.save')}
          </Button>
        </>
      }
    >
      <form id="term-form" onSubmit={(event) => void submit(event)} className="flex flex-col gap-4">
        {error !== null && (
          <Notice tone="danger" live="assertive">
            <p>{error}</p>
          </Notice>
        )}

        {movedSize > 0 && (
          <Notice tone={movedSize > LARGE_SUBTREE ? 'warning' : 'info'}>
            <p>{t('taxonomies.subtreeWarning', { count: movedSize })}</p>
          </Notice>
        )}

        {locales.map((locale) => (
          <Field key={locale} label={t('taxonomies.labelForLocale', { locale })}>
            {(control) => (
              <Input
                {...control}
                value={labels[locale] ?? ''}
                required={locale === locales[0]}
                onChange={(event) =>
                  setLabels((current) => ({ ...current, [locale]: event.target.value }))
                }
              />
            )}
          </Field>
        ))}

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

        <fieldset className="flex flex-col gap-1 rounded-md border border-input p-3">
          <legend className="px-1 text-sm font-medium">{t('taxonomies.parent')}</legend>
          <label className="flex items-center gap-2 py-0.5 text-sm">
            <input
              type="radio"
              name="term-parent"
              value=""
              checked={parent === null}
              onChange={() => setParent(null)}
            />
            {t('taxonomies.noParent')}
          </label>
          <div className="max-h-48 overflow-y-auto">{renderParentOptions(null, 0)}</div>
        </fieldset>
      </form>
    </Modal>
  )
}
