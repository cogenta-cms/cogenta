import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import type { WidgetType } from '../api/widgets-client.js'
import { MediaPicker } from '../fields/media-picker.js'
import type { RichTextDocument } from '../rich-text/portable-text.js'
import { RichTextEditor } from '../rich-text/rich-text-editor.js'
import { Button, Field, Input, Select } from '../ui/index.js'
import type { WidgetSources } from './widget-catalog.js'

/**
 * The settings of one widget, one form per type (L30). Every control writes
 * the whole settings object back through `onChange`; the server validates
 * the result with the widget vocabulary and its message is shown by the
 * caller, so nothing here second-guesses it.
 */

export interface WidgetSettingsFormProps {
  readonly idPrefix: string
  readonly token: string
  readonly type: WidgetType
  readonly settings: Readonly<Record<string, unknown>>
  readonly sources: WidgetSources
  onChange(settings: Record<string, unknown>): void
}

const TEXTAREA =
  'w-full rounded-md border border-input bg-card px-3 py-2 font-sans text-sm leading-5 text-card-foreground shadow-card'

interface LinkValue {
  readonly label: string
  readonly href: string
  readonly newTab: boolean
}

export function WidgetSettingsForm({
  idPrefix,
  token,
  type,
  settings,
  sources,
  onChange,
}: WidgetSettingsFormProps): JSX.Element {
  const { t } = useTranslation()
  const set = (key: string, value: unknown): void => {
    const next: Record<string, unknown> = { ...settings }
    if (value === undefined) delete next[key]
    else next[key] = value
    onChange(next)
  }
  const str = (key: string): string =>
    typeof settings[key] === 'string' ? (settings[key] as string) : ''
  const num = (key: string, fallback: number): number =>
    typeof settings[key] === 'number' ? (settings[key] as number) : fallback
  const bool = (key: string): boolean => settings[key] === true

  const text = (
    key: string,
    label: string,
    options: {
      readonly placeholder?: string
      readonly type?: string
      readonly optional?: boolean
    } = {},
  ) => (
    <Field label={label}>
      {(control) => (
        <Input
          {...control}
          type={options.type ?? 'text'}
          value={str(key)}
          placeholder={options.placeholder}
          onChange={(event) =>
            set(
              key,
              options.optional === true && event.target.value === ''
                ? undefined
                : event.target.value,
            )
          }
        />
      )}
    </Field>
  )
  const longText = (key: string, label: string) => (
    <Field label={label}>
      {(control) => (
        <textarea
          {...control}
          className={TEXTAREA}
          rows={4}
          value={str(key)}
          onChange={(event) => set(key, event.target.value)}
        />
      )}
    </Field>
  )
  const number = (key: string, label: string, fallback: number, min: number, max: number) => (
    <Field label={label}>
      {(control) => (
        <Input
          {...control}
          type="number"
          min={min}
          max={max}
          value={num(key, fallback)}
          onChange={(event) => set(key, Number(event.target.value))}
        />
      )}
    </Field>
  )
  const toggle = (key: string, label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={bool(key)}
        onChange={(event) => set(key, event.target.checked)}
      />
      {label}
    </label>
  )
  const choice = (
    key: string,
    label: string,
    options: readonly { readonly value: string; readonly label: string }[],
  ) => (
    <Field label={label}>
      {(control) => (
        <Select
          {...control}
          value={str(key)}
          onChange={(event) => set(key, event.target.value === '' ? undefined : event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      )}
    </Field>
  )
  const numericChoice = (
    key: string,
    label: string,
    values: readonly number[],
    fallback: number,
    format: (value: number) => string,
  ) => (
    <Field label={label}>
      {(control) => (
        <Select
          {...control}
          value={String(num(key, fallback))}
          onChange={(event) => set(key, Number(event.target.value))}
        >
          {values.map((value) => (
            <option key={value} value={value}>
              {format(value)}
            </option>
          ))}
        </Select>
      )}
    </Field>
  )
  const collections = sources.collections
    .filter((collection) => collection.routed)
    .map((collection) => ({ value: collection.name, label: collection.label }))
  const taxonomies = sources.taxonomies.map((taxonomy) => ({
    value: taxonomy.name,
    label: taxonomy.label,
  }))
  const links = (key: string): readonly LinkValue[] =>
    Array.isArray(settings[key]) ? (settings[key] as LinkValue[]) : []
  const linksEditor = (key: string, optional: boolean) => {
    const items = links(key)
    const write = (next: readonly LinkValue[]): void =>
      set(key, optional && next.length === 0 ? undefined : next)
    return (
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">{t('widgets.settings.links')}</legend>
        {items.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are edited in place and reordered by buttons only
          <div
            key={index}
            className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-2"
          >
            <Input
              aria-label={t('widgets.settings.linkLabel')}
              value={item.label}
              placeholder={t('widgets.settings.linkLabel')}
              onChange={(event) =>
                write(
                  items.map((row, at) =>
                    at === index ? { ...row, label: event.target.value } : row,
                  ),
                )
              }
            />
            <Input
              aria-label={t('widgets.settings.linkHref')}
              value={item.href}
              placeholder="/page"
              onChange={(event) =>
                write(
                  items.map((row, at) =>
                    at === index ? { ...row, href: event.target.value } : row,
                  ),
                )
              }
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={item.newTab}
                onChange={(event) =>
                  write(
                    items.map((row, at) =>
                      at === index ? { ...row, newTab: event.target.checked } : row,
                    ),
                  )
                }
              />
              {t('widgets.settings.newTab')}
            </label>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={index === 0}
                onClick={() => write(swap(items, index, index - 1))}
              >
                {t('widgets.actions.up')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={index === items.length - 1}
                onClick={() => write(swap(items, index, index + 1))}
              >
                {t('widgets.actions.down')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => write(items.filter((_, at) => at !== index))}
              >
                {t('widgets.actions.remove')}
              </Button>
            </div>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => write([...items, { label: '', href: '/', newTab: false }])}
        >
          {t('widgets.settings.addLink')}
        </Button>
      </fieldset>
    )
  }

  switch (type) {
    case 'text':
      return (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('widgets.settings.body')}</span>
          <RichTextEditor
            id={`${idPrefix}-body`}
            value={(settings['body'] as RichTextDocument | undefined) ?? []}
            onChange={(value) => set('body', value)}
          />
        </div>
      )
    case 'image':
      return (
        <div className="flex flex-col gap-4">
          <MediaPicker
            id={`${idPrefix}-media`}
            token={token}
            accept={['image']}
            many={false}
            value={str('media') === '' ? [] : [str('media')]}
            onChange={(ids) => set('media', ids[0] ?? '')}
          />
          {text('alt', t('widgets.settings.alt'))}
          {text('caption', t('widgets.settings.caption'))}
          {text('href', t('widgets.settings.imageHref'), { placeholder: '/page', optional: true })}
        </div>
      )
    case 'gallery':
      return (
        <div className="flex flex-col gap-4">
          <MediaPicker
            id={`${idPrefix}-media`}
            token={token}
            accept={['image']}
            many
            value={Array.isArray(settings['media']) ? (settings['media'] as string[]) : []}
            onChange={(ids) => set('media', ids)}
          />
          {numericChoice('columns', t('widgets.settings.columns'), [2, 3, 4], 3, String)}
        </div>
      )
    case 'embed':
      return (
        <div className="flex flex-col gap-4">
          {text('url', t('widgets.settings.embedUrl'), {
            placeholder: 'https://www.youtube.com/watch?v=…',
            type: 'url',
          })}
          {text('caption', t('widgets.settings.caption'))}
        </div>
      )
    case 'quote':
      return (
        <div className="flex flex-col gap-4">
          {longText('text', t('widgets.settings.quote'))}
          {text('attribution', t('widgets.settings.attribution'))}
          {text('role', t('widgets.settings.role'))}
        </div>
      )
    case 'cta':
      return (
        <div className="flex flex-col gap-4">
          {text('heading', t('widgets.settings.heading'))}
          {longText('body', t('widgets.settings.bodyText'))}
          {text('label', t('widgets.settings.buttonLabel'))}
          {text('href', t('widgets.settings.buttonHref'), { placeholder: '/page' })}
        </div>
      )
    case 'links':
      return linksEditor('items', false)
    case 'contact': {
      const hours = Array.isArray(settings['hours'])
        ? (settings['hours'] as { label: string; value: string }[])
        : []
      return (
        <div className="flex flex-col gap-4">
          {longText('address', t('widgets.settings.address'))}
          {text('phone', t('widgets.settings.phone'), { type: 'tel' })}
          {text('email', t('widgets.settings.email'), { type: 'email' })}
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">{t('widgets.settings.hours')}</legend>
            {hours.map((row, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are edited in place
              <div key={index} className="flex gap-2">
                <Input
                  aria-label={t('widgets.settings.hoursLabel')}
                  value={row.label}
                  placeholder={t('widgets.settings.hoursLabel')}
                  onChange={(event) =>
                    set(
                      'hours',
                      hours.map((item, at) =>
                        at === index ? { ...item, label: event.target.value } : item,
                      ),
                    )
                  }
                />
                <Input
                  aria-label={t('widgets.settings.hoursValue')}
                  value={row.value}
                  placeholder="9:00 – 18:00"
                  onChange={(event) =>
                    set(
                      'hours',
                      hours.map((item, at) =>
                        at === index ? { ...item, value: event.target.value } : item,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    set(
                      'hours',
                      hours.filter((_, at) => at !== index),
                    )
                  }
                >
                  {t('widgets.actions.remove')}
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => set('hours', [...hours, { label: '', value: '' }])}
            >
              {t('widgets.settings.addHours')}
            </Button>
          </fieldset>
        </div>
      )
    }
    case 'about':
      return (
        <div className="flex flex-col gap-4">
          <MediaPicker
            id={`${idPrefix}-media`}
            token={token}
            accept={['image']}
            many={false}
            value={str('media') === '' ? [] : [str('media')]}
            onChange={(ids) => set('media', ids[0])}
          />
          {text('heading', t('widgets.settings.heading'))}
          {longText('body', t('widgets.settings.bodyText'))}
        </div>
      )
    case 'recentEntries':
      return (
        <div className="flex flex-col gap-4">
          {choice('collection', t('widgets.settings.collection'), collections)}
          {number('count', t('widgets.settings.count'), 5, 1, 20)}
          {toggle('showDate', t('widgets.settings.showDate'))}
          {toggle('showExcerpt', t('widgets.settings.showExcerpt'))}
          {toggle('showImage', t('widgets.settings.showImage'))}
        </div>
      )
    case 'relatedEntries':
      return (
        <div className="flex flex-col gap-4">
          <p className="m-0 text-sm text-muted-foreground">{t('widgets.settings.relatedHelp')}</p>
          {number('count', t('widgets.settings.count'), 4, 1, 12)}
          {toggle('showDate', t('widgets.settings.showDate'))}
          {toggle('showImage', t('widgets.settings.showImage'))}
        </div>
      )
    case 'popularEntries':
      return (
        <div className="flex flex-col gap-4">
          {choice('collection', t('widgets.settings.collection'), [
            { value: '', label: t('widgets.settings.anyCollection') },
            ...collections,
          ])}
          {number('count', t('widgets.settings.count'), 5, 1, 20)}
          {numericChoice('days', t('widgets.settings.period'), [7, 30, 90, 365], 30, (days) =>
            t('widgets.settings.days', { count: days }),
          )}
          {toggle('showImage', t('widgets.settings.showImage'))}
        </div>
      )
    case 'terms':
      return (
        <div className="flex flex-col gap-4">
          {choice('taxonomy', t('widgets.settings.taxonomy'), taxonomies)}
          {choice('display', t('widgets.settings.display'), [
            { value: 'list', label: t('widgets.settings.displayList') },
            { value: 'dropdown', label: t('widgets.settings.displayDropdown') },
          ])}
          {toggle('showCounts', t('widgets.settings.showCounts'))}
          {toggle('hierarchical', t('widgets.settings.hierarchical'))}
          {toggle('hideEmpty', t('widgets.settings.hideEmpty'))}
        </div>
      )
    case 'tagCloud':
      return (
        <div className="flex flex-col gap-4">
          {choice('taxonomy', t('widgets.settings.taxonomy'), taxonomies)}
          {number('maxTerms', t('widgets.settings.maxTerms'), 30, 1, 100)}
          {toggle('showCounts', t('widgets.settings.showCounts'))}
        </div>
      )
    case 'archives':
      return (
        <div className="flex flex-col gap-4">
          {choice('collection', t('widgets.settings.collection'), collections)}
          {choice('granularity', t('widgets.settings.granularity'), [
            { value: 'month', label: t('widgets.settings.byMonth') },
            { value: 'year', label: t('widgets.settings.byYear') },
          ])}
          {choice('display', t('widgets.settings.display'), [
            { value: 'list', label: t('widgets.settings.displayList') },
            { value: 'dropdown', label: t('widgets.settings.displayDropdown') },
          ])}
          {toggle('showCounts', t('widgets.settings.showCounts'))}
          {number('limit', t('widgets.settings.limit'), 24, 1, 120)}
        </div>
      )
    case 'calendar':
      return choice('collection', t('widgets.settings.collection'), collections)
    case 'recentComments':
      return number('count', t('widgets.settings.count'), 5, 1, 20)
    case 'search':
      return text('placeholder', t('widgets.settings.placeholder'))
    case 'menu':
      return choice(
        'menuId',
        t('widgets.settings.menu'),
        sources.menus.map((menu) => ({ value: menu.id, label: menu.label })),
      )
    case 'social':
      return (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-sm text-muted-foreground">{t('widgets.settings.socialHelp')}</p>
          {linksEditor('items', true)}
        </div>
      )
    case 'form':
      return (
        <div className="flex flex-col gap-3">
          {choice(
            'form',
            t('widgets.settings.form'),
            sources.forms.map((form) => ({ value: form.name, label: form.label })),
          )}
          <p className="m-0 text-sm text-muted-foreground">{t('widgets.settings.formHelp')}</p>
        </div>
      )
    case 'toc':
      return (
        <div className="flex flex-col gap-3">
          {numericChoice(
            'maxDepth',
            t('widgets.settings.maxDepth'),
            [2, 3, 4],
            3,
            (depth) => `h${depth}`,
          )}
          <p className="m-0 text-sm text-muted-foreground">{t('widgets.settings.tocHelp')}</p>
        </div>
      )
  }
}

function swap<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items]
  const moved = next[from]
  const other = next[to]
  if (moved === undefined || other === undefined) return next
  next[from] = other
  next[to] = moved
  return next
}
