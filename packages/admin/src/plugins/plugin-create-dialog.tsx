import { type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PluginTemplateOption } from '../api/plugins-client.js'
import { Button, Field, Input, Modal } from '../ui/index.js'

/**
 * Creating a plugin, asked as the two questions a person can answer: what to
 * call it, and what it should do.
 *
 * What it replaces asked for a "sandbox id" and a plugin name — the first of
 * which is a directory, and neither of which says anything about the plugin.
 * The directory is derived from the name by the host; the second question
 * picks a starting point that already works, so "create" leaves a person in
 * front of running code rather than an empty file.
 */

export interface CreatePluginDialogProps {
  readonly open: boolean
  onOpenChange(open: boolean): void
  readonly templates: readonly PluginTemplateOption[]
  readonly busy: boolean
  onCreate(name: string, template: string): void
}

export function CreatePluginDialog({
  open,
  onOpenChange,
  templates,
  busy,
  onCreate,
}: CreatePluginDialogProps): JSX.Element {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [template, setTemplate] = useState(templates[0]?.id ?? 'blank')

  const close = (): void => {
    setName('')
    setTemplate(templates[0]?.id ?? 'blank')
    onOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={t('plugins.create.title')}
      description={t('plugins.create.description')}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={busy || name.trim() === ''}
            onClick={() => {
              onCreate(name.trim(), template)
              close()
            }}
          >
            {t('plugins.create.submit')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('plugins.create.nameLabel')} description={t('plugins.create.nameHint')}>
          {(control) => (
            <Input
              {...control}
              value={name}
              placeholder={t('plugins.create.namePlaceholder')}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 p-0 text-sm font-semibold">
            {t('plugins.create.templateLabel')}
          </legend>
          {templates.map((option) => (
            <label
              key={option.id}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                template === option.id ? 'border-primary bg-accent/40' : 'border-border'
              }`}
            >
              <input
                type="radio"
                name="plugin-template"
                className="mt-1"
                value={option.id}
                checked={template === option.id}
                onChange={() => setTemplate(option.id)}
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{t(`plugins.template.${option.id}.title`)}</span>
                <span className="text-sm text-muted-foreground">
                  {t(`plugins.template.${option.id}.description`)}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      </div>
    </Modal>
  )
}
