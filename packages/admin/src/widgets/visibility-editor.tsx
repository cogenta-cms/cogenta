import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import type { PageTarget, WidgetVisibility } from '../api/widgets-client.js'
import { Button, Field, Input, Select } from '../ui/index.js'
import type { WidgetSources } from './widget-catalog.js'

/**
 * Where, for whom, on which screens and when a widget shows (L30 D4), the
 * rules the WordPress visibility extensions add. The server evaluates them
 * for every request; this only edits them.
 */

export interface VisibilityEditorProps {
  readonly idPrefix: string
  readonly value: WidgetVisibility
  readonly sources: WidgetSources
  readonly locales: readonly string[]
  onChange(value: WidgetVisibility): void
}

type TargetKind = PageTarget['kind']

/** `datetime-local` speaks local wall time; the API speaks ISO 8601 with an offset. */
function toLocalInput(iso: string | null): string {
  if (iso === null) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromLocalInput(value: string): string | null {
  if (value === '') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function VisibilityEditor({
  idPrefix,
  value,
  sources,
  locales,
  onChange,
}: VisibilityEditorProps): JSX.Element {
  const { t } = useTranslation()
  const targets = value.pages.targets
  const setTargets = (next: readonly PageTarget[]): void =>
    onChange({ ...value, pages: { ...value.pages, targets: next } })

  const defaultTarget = (kind: TargetKind): PageTarget => {
    switch (kind) {
      case 'collection':
        return { kind, collection: sources.collections.find((c) => c.routed)?.name ?? '' }
      case 'taxonomy':
        return { kind, taxonomy: sources.taxonomies[0]?.name ?? '' }
      case 'path':
        return { kind, path: '/' }
      default:
        return { kind }
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">{t('widgets.visibility.pages')}</legend>
        <Select
          id={`${idPrefix}-mode`}
          aria-label={t('widgets.visibility.pages')}
          value={value.pages.mode}
          onChange={(event) =>
            onChange({
              ...value,
              pages: {
                ...value.pages,
                mode: event.target.value as WidgetVisibility['pages']['mode'],
              },
            })
          }
        >
          <option value="all">{t('widgets.visibility.modeAll')}</option>
          <option value="only">{t('widgets.visibility.modeOnly')}</option>
          <option value="except">{t('widgets.visibility.modeExcept')}</option>
        </Select>
        {value.pages.mode !== 'all' && (
          <div className="flex flex-col gap-2">
            {targets.map((target, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: targets are edited in place
              <div
                key={index}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2"
              >
                <Select
                  aria-label={t('widgets.visibility.targetKind')}
                  className="w-auto"
                  value={target.kind}
                  onChange={(event) =>
                    setTargets(
                      targets.map((item, at) =>
                        at === index ? defaultTarget(event.target.value as TargetKind) : item,
                      ),
                    )
                  }
                >
                  <option value="home">{t('widgets.visibility.targets.home')}</option>
                  <option value="collection">{t('widgets.visibility.targets.collection')}</option>
                  <option value="taxonomy">{t('widgets.visibility.targets.taxonomy')}</option>
                  <option value="dateArchive">{t('widgets.visibility.targets.dateArchive')}</option>
                  <option value="search">{t('widgets.visibility.targets.search')}</option>
                  <option value="path">{t('widgets.visibility.targets.path')}</option>
                </Select>
                {target.kind === 'collection' && (
                  <Select
                    aria-label={t('widgets.settings.collection')}
                    className="w-auto"
                    value={target.collection}
                    onChange={(event) =>
                      setTargets(
                        targets.map((item, at) =>
                          at === index
                            ? { kind: 'collection', collection: event.target.value }
                            : item,
                        ),
                      )
                    }
                  >
                    {sources.collections
                      .filter((collection) => collection.routed)
                      .map((collection) => (
                        <option key={collection.name} value={collection.name}>
                          {collection.label}
                        </option>
                      ))}
                  </Select>
                )}
                {target.kind === 'taxonomy' && (
                  <Select
                    aria-label={t('widgets.settings.taxonomy')}
                    className="w-auto"
                    value={target.taxonomy}
                    onChange={(event) =>
                      setTargets(
                        targets.map((item, at) =>
                          at === index ? { kind: 'taxonomy', taxonomy: event.target.value } : item,
                        ),
                      )
                    }
                  >
                    {sources.taxonomies.map((taxonomy) => (
                      <option key={taxonomy.name} value={taxonomy.name}>
                        {taxonomy.label}
                      </option>
                    ))}
                  </Select>
                )}
                {target.kind === 'path' && (
                  <Input
                    aria-label={t('widgets.visibility.targets.path')}
                    className="w-56"
                    value={target.path}
                    placeholder="/guides/*"
                    onChange={(event) =>
                      setTargets(
                        targets.map((item, at) =>
                          at === index ? { kind: 'path', path: event.target.value } : item,
                        ),
                      )
                    }
                  />
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setTargets(targets.filter((_, at) => at !== index))}
                >
                  {t('widgets.actions.remove')}
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setTargets([...targets, { kind: 'home' }])}
            >
              {t('widgets.visibility.addTarget')}
            </Button>
            <p className="m-0 text-xs text-muted-foreground">{t('widgets.visibility.pathHelp')}</p>
          </div>
        )}
      </fieldset>

      <Field label={t('widgets.visibility.audience')}>
        {(control) => (
          <Select
            {...control}
            value={value.audience}
            onChange={(event) =>
              onChange({ ...value, audience: event.target.value as WidgetVisibility['audience'] })
            }
          >
            <option value="everyone">{t('widgets.visibility.everyone')}</option>
            <option value="visitors">{t('widgets.visibility.visitors')}</option>
            <option value="members">{t('widgets.visibility.members')}</option>
          </Select>
        )}
      </Field>

      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-2 text-sm font-medium">{t('widgets.visibility.devices')}</legend>
        {(['desktop', 'tablet', 'mobile'] as const).map((device) => (
          <label key={device} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.devices[device]}
              onChange={(event) =>
                onChange({
                  ...value,
                  devices: { ...value.devices, [device]: event.target.checked },
                })
              }
            />
            {t(`widgets.visibility.${device}`)}
          </label>
        ))}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('widgets.visibility.from')}>
          {(control) => (
            <Input
              {...control}
              type="datetime-local"
              value={toLocalInput(value.from)}
              onChange={(event) => onChange({ ...value, from: fromLocalInput(event.target.value) })}
            />
          )}
        </Field>
        <Field label={t('widgets.visibility.until')}>
          {(control) => (
            <Input
              {...control}
              type="datetime-local"
              value={toLocalInput(value.until)}
              onChange={(event) =>
                onChange({ ...value, until: fromLocalInput(event.target.value) })
              }
            />
          )}
        </Field>
      </div>

      {locales.length > 1 && (
        <fieldset className="flex flex-wrap gap-4">
          <legend className="mb-2 text-sm font-medium">{t('widgets.visibility.locales')}</legend>
          {locales.map((locale) => (
            <label key={locale} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={value.locales.length === 0 || value.locales.includes(locale)}
                onChange={(event) => {
                  const current = value.locales.length === 0 ? [...locales] : [...value.locales]
                  const next = event.target.checked
                    ? [...new Set([...current, locale])]
                    : current.filter((item) => item !== locale)
                  onChange({ ...value, locales: next.length === locales.length ? [] : next })
                }}
              />
              {locale}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  )
}
