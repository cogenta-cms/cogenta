import { type JSX, useId } from 'react'
import type { AdminThemeOverrides, AdminThemeTemplate } from '../api/admin-theme-client.js'
import { Button, Card, CardBody, CardHeader, CardTitle } from '../ui/index.js'
import { buildAdminThemeCss } from './admin-theme-css.js'
import { useTheme } from './theme-context.js'

/**
 * A real, self-contained preview of one admin theme template (fiche 49 tasks
 * 2-3) — the actual `Card`/`Button` components this admin renders
 * everywhere else, painted by the *exact* CSS a template (plus any pending,
 * not-yet-saved overrides) would apply, scoped to this panel alone.
 *
 * No iframe, no second server-render pipeline: unlike the public site's own
 * "Apparence" (fiche 48), `@cogenta/admin` has no render pipeline of its own
 * to point an iframe at — a scoped container sharing the real UI components
 * is the accurate preview available without inventing one (fiche's own
 * "décision à prendre", settled this way while coding).
 *
 * The scoping mechanism is `buildAdminThemeCss`'s `selector` parameter, given
 * a unique attribute selector via `useId()` — never `:root`, and never a
 * write to `<head>`. That is what makes this panel safe to feed pending,
 * unsaved form state (the customisation screen's live preview, task 3):
 * whatever it renders can never repaint the running admin around it, only
 * itself. The container mirrors `theme-context.tsx`'s own light/dark
 * mechanism (`data-theme` wins over `prefers-color-scheme` in both
 * directions) so a dark-mode reader previews the template the same way the
 * real page would apply it.
 */

export interface AdminThemePreviewProps {
  readonly template: AdminThemeTemplate
  /** Pending, not-yet-saved overrides — omit to preview the template exactly as it ships. */
  readonly overrides?: AdminThemeOverrides
}

export function AdminThemePreview({ template, overrides }: AdminThemePreviewProps): JSX.Element {
  const rawId = useId()
  const scope = `[data-admin-theme-preview="${rawId}"]`
  const { mode } = useTheme()

  const css = buildAdminThemeCss(
    {
      active: {
        templateId: template.id,
        overrides: overrides ?? {},
        updatedAt: null,
        updatedBy: null,
      },
      templates: [template],
    },
    scope,
  )

  return (
    // Decorative: a stand-in for a page nobody can click through, not a
    // second copy of the real navigation. Every focusable element inside it
    // is neutralised (`tabIndex={-1}`) so a keyboard user never tabs into a
    // button that does nothing.
    <div
      aria-hidden="true"
      data-admin-theme-preview={rawId}
      data-theme={mode === 'system' ? undefined : mode}
      className="overflow-hidden rounded-md border p-3"
      style={{ background: 'var(--background)', borderColor: 'var(--border)' }}
    >
      <style>{css}</style>
      <Card className="gap-0">
        <CardHeader className="gap-0.5 px-3 pt-3 pb-2">
          <CardTitle>
            <p className="m-0" style={{ fontFamily: 'var(--font-display)' }}>
              {template.name}
            </p>
          </CardTitle>
        </CardHeader>
        <CardBody className="gap-2 px-3 pt-0 pb-3">
          <p className="m-0 text-xs" style={{ color: 'var(--muted-foreground)' }}>
            {template.description}
          </p>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" tabIndex={-1}>
              Aa
            </Button>
            <Button variant="secondary" size="sm" tabIndex={-1}>
              Aa
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
