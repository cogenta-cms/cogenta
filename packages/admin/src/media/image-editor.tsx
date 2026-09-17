import {
  type JSX,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../api/client.js'
import {
  editMedia,
  fetchMediaBlobUrl,
  type ImageEdit,
  type MediaAsset,
  restoreMedia,
} from '../api/media-client.js'
import { Button } from '../ui/index.js'
import {
  type CropRect,
  clampRect,
  FULL_CROP,
  moveRect,
  RATIO_PRESETS,
  type RatioPreset,
  rectForRatio,
  resizeRect,
  turned,
} from './image-edit-geometry.js'

/**
 * Crop and rotate an image in place (L39). The editor always works on the
 * untouched original — the server applies every edit to it again — so what
 * is shown is the original, turned, with the frame the edit will keep.
 *
 * Nothing here is pointer-only: the frame moves with the arrow keys and
 * resizes with Shift + arrows, and every other action is a button.
 */

type Drag =
  | {
      readonly kind: 'move'
      readonly startX: number
      readonly startY: number
      readonly from: CropRect
    }
  | {
      readonly kind: 'resize'
      readonly corner: 'nw' | 'ne' | 'sw' | 'se'
      readonly startX: number
      readonly startY: number
      readonly from: CropRect
    }

const KEY_STEP = 0.01

export function ImageEditor({
  token,
  asset,
  onDone,
  onCancel,
}: {
  readonly token: string
  readonly asset: MediaAsset
  onDone(asset: MediaAsset): void
  onCancel(): void
}): JSX.Element {
  const { t } = useTranslation()
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [rotate, setRotate] = useState<ImageEdit['rotate']>(0)
  const [mirror, setMirror] = useState<ImageEdit['mirror']>(undefined)
  const [crop, setCrop] = useState<CropRect>(FULL_CROP)
  const [ratio, setRatio] = useState<RatioPreset>('free')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const frameRef = useRef<HTMLDivElement | null>(null)
  const drag = useRef<Drag | null>(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    fetchMediaBlobUrl(token, asset.id, { original: true, version: asset.contentHash })
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        objectUrl = url
        const loaded = new Image()
        loaded.onload = () => {
          if (!cancelled) setImage(loaded)
        }
        loaded.onerror = () => {
          if (!cancelled) setLoadError(true)
        }
        loaded.src = url
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
    return () => {
      cancelled = true
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
    }
  }, [token, asset.id, asset.contentHash])

  // Memoised: the canvas is redrawn when the picture or its turn changes, not
  // on every movement of the frame.
  const size = useMemo(
    () =>
      image === null
        ? null
        : turned({ width: image.naturalWidth, height: image.naturalHeight }, rotate),
    [image, rotate],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas === null || image === null || size === null) return
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (context === null) return
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, size.width, size.height)
    context.translate(size.width / 2, size.height / 2)
    // Mirror after the turn, exactly as the server applies it — the preview
    // would otherwise show a different picture from the one written.
    if (mirror === 'horizontal') context.scale(-1, 1)
    if (mirror === 'vertical') context.scale(1, -1)
    context.rotate((rotate * Math.PI) / 180)
    context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)
  }, [image, rotate, mirror, size])

  function turn(delta: 90 | -90): void {
    setRotate((current) => ((current + delta + 360) % 360) as ImageEdit['rotate'])
    // A frame drawn on the old orientation means nothing on the new one.
    setCrop(FULL_CROP)
    setRatio('free')
  }

  /**
   * A mirror is its own opposite, so the same button both sets and clears it;
   * mirroring across the other axis replaces it rather than stacking, because
   * "horizontal then vertical" is simply a half turn, which the turn buttons
   * already do.
   */
  function flip(axis: 'horizontal' | 'vertical'): void {
    setMirror((current) => (current === axis ? undefined : axis))
    setCrop(FULL_CROP)
    setRatio('free')
  }

  function chooseRatio(next: RatioPreset): void {
    setRatio(next)
    if (size !== null) setCrop(rectForRatio(next, size))
  }

  function pointAt(event: PointerEvent): { x: number; y: number } | null {
    const box = frameRef.current?.getBoundingClientRect()
    if (box === undefined || box.width === 0 || box.height === 0) return null
    return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height }
  }

  function startDrag(event: PointerEvent, corner?: 'nw' | 'ne' | 'sw' | 'se'): void {
    const point = pointAt(event)
    if (point === null) return
    event.preventDefault()
    event.stopPropagation()
    ;(event.target as Element).setPointerCapture?.(event.pointerId)
    drag.current =
      corner === undefined
        ? { kind: 'move', startX: point.x, startY: point.y, from: crop }
        : { kind: 'resize', corner, startX: point.x, startY: point.y, from: crop }
  }

  function onDrag(event: PointerEvent): void {
    const current = drag.current
    const point = pointAt(event)
    if (current === null || point === null || size === null) return
    const dx = point.x - current.startX
    const dy = point.y - current.startY
    setCrop(
      current.kind === 'move'
        ? moveRect(current.from, dx, dy)
        : resizeRect(current.from, current.corner, dx, dy, ratio, size),
    )
  }

  function onKey(event: KeyboardEvent): void {
    if (size === null) return
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-KEY_STEP, 0],
      ArrowRight: [KEY_STEP, 0],
      ArrowUp: [0, -KEY_STEP],
      ArrowDown: [0, KEY_STEP],
    }
    const step = directions[event.key]
    if (step === undefined) return
    event.preventDefault()
    setCrop((current) =>
      event.shiftKey
        ? resizeRect(current, 'se', step[0], step[1], ratio, size)
        : moveRect(current, step[0], step[1]),
    )
  }

  async function apply(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const whole = clampRect(crop)
      const isWhole = whole.x === 0 && whole.y === 0 && whole.width === 1 && whole.height === 1
      onDone(
        await editMedia(token, asset.id, {
          rotate,
          ...(mirror === undefined ? {} : { mirror }),
          crop: isWhole ? null : whole,
        }),
      )
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('imageEditor.applyError'))
    } finally {
      setBusy(false)
    }
  }

  async function restore(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      onDone(await restoreMedia(token, asset.id))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('imageEditor.restoreError'))
    } finally {
      setBusy(false)
    }
  }

  if (loadError) return <p role="alert">{t('imageEditor.loadError')}</p>

  return (
    <section className="flex flex-col gap-3" aria-label={t('imageEditor.heading')}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => turn(-90)}
        >
          {t('imageEditor.rotateLeft')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => turn(90)}
        >
          {t('imageEditor.rotateRight')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mirror === 'horizontal' ? 'primary' : 'secondary'}
          aria-pressed={mirror === 'horizontal'}
          disabled={busy}
          onClick={() => flip('horizontal')}
        >
          {t('imageEditor.mirrorHorizontal')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mirror === 'vertical' ? 'primary' : 'secondary'}
          aria-pressed={mirror === 'vertical'}
          disabled={busy}
          onClick={() => flip('vertical')}
        >
          {t('imageEditor.mirrorVertical')}
        </Button>
      </div>

      <fieldset className="m-0 flex flex-wrap items-center gap-1 border-0 p-0">
        <legend className="mb-1 p-0 text-sm font-medium">{t('imageEditor.ratioLabel')}</legend>
        {RATIO_PRESETS.map((preset) => (
          <Button
            key={preset}
            type="button"
            size="sm"
            variant={ratio === preset ? 'primary' : 'ghost'}
            aria-pressed={ratio === preset}
            disabled={busy || size === null}
            onClick={() => chooseRatio(preset)}
          >
            {/* i18next reads `:` as a namespace separator: `1:1` is looked up as `1x1`. */}
            {t(`imageEditor.ratio.${preset.replace(':', 'x')}`)}
          </Button>
        ))}
      </fieldset>

      {size === null ? (
        <p>{t('common.loading')}</p>
      ) : (
        <div
          ref={frameRef}
          className="relative w-full select-none"
          style={{ aspectRatio: `${size.width} / ${size.height}`, maxWidth: '100%' }}
          onPointerMove={onDrag}
          onPointerUp={() => {
            drag.current = null
          }}
        >
          <canvas
            ref={canvasRef}
            className="block h-full w-full"
            role="img"
            aria-label={asset.alt === '' ? t('imageEditor.previewLabel') : asset.alt}
          />
          {/* Outside the frame is dimmed by a shadow clipped to the picture, so the
              editor's own buttons are never dimmed with it. */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <div
              className="absolute"
              style={{
                left: `${crop.x * 100}%`,
                top: `${crop.y * 100}%`,
                width: `${crop.width * 100}%`,
                height: `${crop.height * 100}%`,
                boxShadow: '0 0 0 100vmax rgb(0 0 0 / 0.45)',
              }}
            />
          </div>
          <div
            role="slider"
            tabIndex={0}
            aria-label={t('imageEditor.frameLabel')}
            aria-valuetext={t('imageEditor.frameValue', {
              x: Math.round(crop.x * 100),
              y: Math.round(crop.y * 100),
              width: Math.round(crop.width * 100),
              height: Math.round(crop.height * 100),
            })}
            aria-valuenow={Math.round(crop.width * 100)}
            className="absolute cursor-move outline-2 outline-offset-0 outline-primary focus-visible:outline-4"
            style={{
              left: `${crop.x * 100}%`,
              top: `${crop.y * 100}%`,
              width: `${crop.width * 100}%`,
              height: `${crop.height * 100}%`,
              outlineStyle: 'solid',
            }}
            onPointerDown={(event) => startDrag(event)}
            onKeyDown={onKey}
          >
            {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
              <span
                key={corner}
                aria-hidden="true"
                className="absolute size-3 border-2 border-background bg-primary"
                style={{
                  cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize',
                  left: corner.endsWith('w') ? '-0.4rem' : undefined,
                  right: corner.endsWith('e') ? '-0.4rem' : undefined,
                  top: corner.startsWith('n') ? '-0.4rem' : undefined,
                  bottom: corner.startsWith('s') ? '-0.4rem' : undefined,
                }}
                onPointerDown={(event) => startDrag(event, corner)}
              />
            ))}
          </div>
        </div>
      )}

      <p className="m-0 text-sm text-muted-foreground">{t('imageEditor.hint')}</p>
      {size !== null && (
        <p className="m-0 text-sm" aria-live="polite">
          {t('imageEditor.resultSize', {
            width: Math.max(1, Math.round(crop.width * size.width)),
            height: Math.max(1, Math.round(crop.height * size.height)),
          })}
        </p>
      )}

      {error !== null && (
        <p role="alert" className="entry-form__error">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={busy || size === null} onClick={() => void apply()}>
          {busy ? t('imageEditor.applying') : t('imageEditor.apply')}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        {asset.edited === true && (
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void restore()}>
            {t('imageEditor.restore')}
          </Button>
        )}
      </div>
    </section>
  )
}
