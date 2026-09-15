import type { DatabaseHandle } from '@cogenta/core'
import { createWidgetStore, ensureWidgetTables } from '@cogenta/widgets'

/**
 * The widgets a blueprint places in its theme's areas (L30): a sidebar a
 * reader of that kind of site expects, a contact column in a restaurant's
 * footer. Site setup rather than demo content, like menus, so a scaffold
 * seeds them whether or not it seeds demo entries; each goes through the
 * real `WidgetStore`, which validates type, settings and visibility exactly
 * as the admin's writes are validated.
 */
export interface BlueprintWidget {
  readonly area: string
  readonly type: string
  readonly title?: string
  /**
   * The widget's settings, or a function of the demo media ids when they
   * name a picture. A function that returns `null` skips the widget: a
   * scaffold without demo media has no picture to show.
   */
  readonly settings:
    | Readonly<Record<string, unknown>>
    | ((media: Readonly<Record<string, string>>) => Readonly<Record<string, unknown>> | null)
  /** Partial visibility rules; everything left out takes its default (everywhere, everyone). */
  readonly visibility?: Readonly<Record<string, unknown>>
}

export function blueprintWidgetSettings(
  widget: BlueprintWidget,
  media: Readonly<Record<string, string>>,
): Readonly<Record<string, unknown>> | null {
  return typeof widget.settings === 'function' ? widget.settings(media) : widget.settings
}

/** Seeds a blueprint's widgets in order, one position after another per area. Returns how many were written. */
export async function seedBlueprintWidgets(
  db: DatabaseHandle,
  widgets: readonly BlueprintWidget[],
  media: Readonly<Record<string, string>>,
): Promise<number> {
  if (widgets.length === 0) return 0
  await ensureWidgetTables(db)
  const store = createWidgetStore({ db })
  let seeded = 0
  for (const widget of widgets) {
    const settings = blueprintWidgetSettings(widget, media)
    if (settings === null) continue
    await store.create({
      area: widget.area,
      type: widget.type,
      title: widget.title ?? null,
      settings,
      ...(widget.visibility === undefined ? {} : { visibility: widget.visibility }),
    })
    seeded += 1
  }
  return seeded
}
