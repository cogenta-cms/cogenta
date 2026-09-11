import { type FormEvent, type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import {
  type GeneratedImageSize,
  generateImages,
  getImageGenerationStatus,
  type ImageCandidate,
  keepGeneratedImage,
} from '../api/media-client.js'
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
} from '../ui/index.js'

/**
 * Generating an image from a description, and keeping the one that is right.
 *
 * The screen mirrors what the server does, which is deliberately two steps:
 * generating writes nothing at all, so the candidates below are not in the
 * library and closing this panel loses them; keeping is what stores a file,
 * and it is the operator's decision, never the model's — which is also why
 * the alt text is asked for at exactly that moment and not before.
 *
 * On a site with no image model configured the panel simply does not render.
 * That is R2: the feature is absent, not broken, and the rest of the media
 * library is untouched by its absence.
 */
export function GeneratePanel({
  token,
  onKept,
}: {
  readonly token: string
  /** The library reloads rather than being patched: the server minted the row, not this component. */
  onKept(): void
}): JSX.Element | null {
  const { t } = useTranslation()

  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState<GeneratedImageSize>('landscape')
  const [count, setCount] = useState(2)
  const [busy, setBusy] = useState(false)
  // `null` = not asked yet, so nothing flashes on screen before the answer.
  const [available, setAvailable] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [candidates, setCandidates] = useState<readonly ImageCandidate[]>([])
  const [chosen, setChosen] = useState<number | null>(null)
  const [alt, setAlt] = useState('')
  const [filename, setFilename] = useState('')
  const [keeping, setKeeping] = useState(false)
  const [kept, setKept] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getImageGenerationStatus(token)
      .then((status) => {
        if (!cancelled) setAvailable(status.available)
      })
      .catch(() => {
        if (!cancelled) setAvailable(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  // A site that never configured an image model never sees this at all —
  // no empty card, no disabled form (R2).
  if (available !== true) return null

  async function generate(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (prompt.trim() === '' || busy) return
    setBusy(true)
    setError(null)
    setKept(null)
    try {
      const result = await generateImages(token, { prompt: prompt.trim(), count, size })
      setCandidates(result.images)
      setChosen(result.images.length === 0 ? null : 0)
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'ASSIST_NO_IMAGE_PROVIDER') {
        // The model was removed while this screen was open.
        setAvailable(false)
        return
      }
      setError(caught instanceof ApiError ? caught.message : t('media.generate.error'))
    } finally {
      setBusy(false)
    }
  }

  async function keep(): Promise<void> {
    const picked = chosen === null ? undefined : candidates[chosen]
    if (picked === undefined || alt.trim() === '' || keeping) return
    setKeeping(true)
    setError(null)
    try {
      const saved = await keepGeneratedImage(token, {
        dataUrl: picked.dataUrl,
        filename: filename.trim() === '' ? prompt.trim().slice(0, 60) : filename.trim(),
        alt: alt.trim(),
      })
      setKept(saved.filename)
      // The candidates are gone on purpose: they were never stored, and
      // leaving them on screen next to a kept file invites keeping the same
      // picture twice.
      setCandidates([])
      setChosen(null)
      setAlt('')
      setFilename('')
      onKept()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('media.generate.keepError'))
    } finally {
      setKeeping(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t('media.generate.heading')}</h2>
        </CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        <form className="flex flex-col gap-3" onSubmit={(event) => void generate(event)}>
          <Field
            label={t('media.generate.promptLabel')}
            description={t('media.generate.promptHint')}
          >
            {(control) => (
              <textarea
                {...control}
                className="w-full min-h-20 rounded-md border border-input bg-card px-3 py-2 font-sans text-sm leading-5 text-card-foreground"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
            )}
          </Field>

          <div className="flex flex-wrap items-end gap-2">
            <Field label={t('media.generate.sizeLabel')}>
              {(control) => (
                <Select
                  {...control}
                  value={size}
                  onChange={(event) => setSize(event.target.value as GeneratedImageSize)}
                >
                  <option value="landscape">{t('media.generate.sizeLandscape')}</option>
                  <option value="square">{t('media.generate.sizeSquare')}</option>
                  <option value="portrait">{t('media.generate.sizePortrait')}</option>
                </Select>
              )}
            </Field>
            <Field label={t('media.generate.countLabel')}>
              {(control) => (
                <Select
                  {...control}
                  value={String(count)}
                  onChange={(event) => setCount(Number(event.target.value))}
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                </Select>
              )}
            </Field>
            <Button type="submit" disabled={busy || prompt.trim() === ''}>
              {busy ? t('media.generate.generating') : t('media.generate.generateButton')}
            </Button>
          </div>
        </form>

        {error !== null && <Notice tone="danger">{error}</Notice>}
        {kept !== null && (
          <Notice tone="success">{t('media.generate.kept', { name: kept })}</Notice>
        )}

        {candidates.length > 0 && (
          <div className="flex flex-col gap-3">
            {/* Said plainly, because it is the one thing about this screen that
              is not obvious: nothing below exists in the library yet. */}
            <Notice tone="info">{t('media.generate.nothingStored')}</Notice>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">{t('media.generate.chooseLegend')}</legend>
              <div className="flex flex-wrap gap-3">
                {candidates.map((candidate, index) => (
                  <label
                    key={candidate.dataUrl.slice(-32)}
                    className="flex cursor-pointer flex-col gap-1 rounded-md border border-input p-2"
                  >
                    <img
                      src={candidate.dataUrl}
                      alt={t('media.generate.candidateAlt', { index: index + 1 })}
                      className="h-32 w-auto rounded"
                    />
                    <span className="flex items-center gap-2 text-xs">
                      <input
                        type="radio"
                        name="generated-candidate"
                        checked={chosen === index}
                        onChange={() => setChosen(index)}
                      />
                      {t('media.generate.candidateLabel', { index: index + 1 })}
                    </span>
                    {candidate.revisedPrompt !== undefined && (
                      <span className="max-w-48 text-xs text-muted-foreground">
                        {t('media.generate.revised', { prompt: candidate.revisedPrompt })}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </fieldset>

            <Field
              label={t('media.generate.altLabel')}
              description={t('media.generate.altHint')}
              error={alt.trim() === '' ? t('media.generate.altRequired') : null}
            >
              {(control) => (
                <Input {...control} value={alt} onChange={(event) => setAlt(event.target.value)} />
              )}
            </Field>
            <Field label={t('media.generate.filenameLabel')}>
              {(control) => (
                <Input
                  {...control}
                  value={filename}
                  onChange={(event) => setFilename(event.target.value)}
                />
              )}
            </Field>

            <div>
              <Button
                type="button"
                onClick={() => void keep()}
                disabled={keeping || chosen === null || alt.trim() === ''}
              >
                {keeping ? t('media.generate.keeping') : t('media.generate.keepButton')}
              </Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  )
}
