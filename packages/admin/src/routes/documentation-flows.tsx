import type { TFunction } from 'i18next'
import type { JSX } from 'react'

/**
 * The two hand-authored, animated flow diagrams fiche 21 task 7 asks for —
 * inline SVG with CSS animation (`../styles/documentation.css`), zero new
 * dependency (R9). Both diagrams are decorative (`aria-hidden`): the actual
 * information lives in the ordered list each one sits next to, which is what
 * a screen reader announces and what the route's own tests query against —
 * the same split `icons.tsx` uses for every glyph in this admin ("it decorates
 * a labelled element, it never carries meaning on its own").
 *
 * Both flows were verified against the real implementation, not guessed:
 *
 * - The editorial cycle reflects `packages/schema/src/store/review-transitions.ts`
 *   (`REVIEW_TRANSITION_TABLE`: `submit`/`approve`/`requestChanges`, gated on
 *   a collection's own `workflow: { enabled: true }`, ADR-0027) and
 *   `packages/schema/src/scheduling/publish.ts` (a `scheduled` entry is
 *   picked up by the queue at `publishedAt`).
 * - The plugin permission lifecycle reflects `packages/plugins/src/permissions/`
 *   (`grants.ts`'s `PluginGrantStore`, `resolve.ts`'s
 *   `resolveGrantedCapabilities` — the intersection of what a manifest
 *   declares and what is actually granted reaches the plugin's SDK, never
 *   the full manifest — and `disabled.ts`'s `PluginDisableStore`, the
 *   automatic kill-switch on a timeout/memory/crash violation). One honest
 *   caveat, called out in the route's own copy rather than hidden: granting
 *   or revoking one *specific* capability after install has a data model and
 *   presentational components (`plugins/permission-review.tsx`,
 *   `plugins/granted-permissions.tsx`) but no wired route yet — this diagram
 *   draws the model those components already express, and the route text
 *   says plainly that today's lever is coarser (deactivate or uninstall).
 */

interface Point {
  readonly x: number
  readonly y: number
}

/** A small hand-drawn triangle, tip at the origin, pointing right before rotation. */
function arrowhead(tip: Point, angleDeg: number, variant?: 'branch'): JSX.Element {
  return (
    <polygon
      className={variant === 'branch' ? 'doc-flow__arrowhead--branch' : 'doc-flow__arrowhead'}
      points="0,-5 10,0 0,5"
      transform={`translate(${tip.x} ${tip.y}) rotate(${angleDeg})`}
    />
  )
}

interface FlowNodeProps {
  readonly cx: number
  readonly cy: number
  readonly label: string
  readonly labelAbove?: boolean
  readonly delay: string
  /** The step number shown in the circle, matching the ordered list beside the diagram. */
  readonly step?: number
  /** A small drawing instead of a number, for a side branch (drawn around the node's centre). */
  readonly glyph?: 'loop' | 'clock' | 'pause'
}

/** Side-branch pictograms, drawn in a 20 x 20 box centred on the node. */
function glyphFor(kind: NonNullable<FlowNodeProps['glyph']>, cx: number, cy: number): JSX.Element {
  const common = {
    className: 'doc-flow__glyph',
    transform: `translate(${cx - 10} ${cy - 10})`,
  }
  if (kind === 'clock') {
    return (
      <g {...common}>
        <circle cx={10} cy={10} r={7.5} />
        <path d="M10 5.5V10l3 2" />
      </g>
    )
  }
  if (kind === 'pause') {
    return (
      <g {...common}>
        <path d="M7 5v10M13 5v10" />
      </g>
    )
  }
  return (
    <g {...common}>
      <path d="M15.5 7A6.5 6.5 0 1 0 16 11" />
      <path d="M16 3.5V7h-3.5" />
    </g>
  )
}

function FlowNode({
  cx,
  cy,
  label,
  labelAbove = true,
  delay,
  step,
  glyph,
}: FlowNodeProps): JSX.Element {
  const labelY = labelAbove ? cy - 34 : cy + 40
  return (
    <g>
      <circle
        className="doc-flow__node-circle"
        cx={cx}
        cy={cy}
        r={22}
        style={{ animationDelay: delay }}
      />
      {step !== undefined && (
        <text className="doc-flow__node-step" x={cx} y={cy + 4} textAnchor="middle">
          {step}
        </text>
      )}
      {glyph !== undefined && glyphFor(glyph, cx, cy)}
      <text className="doc-flow__node-label" x={cx} y={labelY} textAnchor="middle">
        {label}
      </text>
    </g>
  )
}

/**
 * The editorial cycle: create → (optional review) → publish, plus the
 * scheduled-publication bypass. Placed on the "Contenu" tab.
 */
export function EditorialFlowDiagram({ t }: { readonly t: TFunction }): JSX.Element {
  return (
    <svg className="doc-flow" viewBox="0 0 600 230" role="img" aria-hidden="true" focusable="false">
      {/* Main reviewed path */}
      <line className="doc-flow__connector" x1={76} y1={54} x2={186} y2={54} />
      {arrowhead({ x: 188, y: 54 }, 0)}
      <line className="doc-flow__connector" x1={232} y1={54} x2={342} y2={54} />
      {arrowhead({ x: 344, y: 54 }, 0)}
      <line className="doc-flow__connector" x1={388} y1={54} x2={498} y2={54} />
      {arrowhead({ x: 500, y: 54 }, 0)}

      {/* Change-request loop under "Soumis" */}
      <path
        className="doc-flow__connector doc-flow__connector--branch"
        d="M200,74 Q188,101 200,128"
      />
      {arrowhead({ x: 200, y: 130 }, 90, 'branch')}
      <path
        className="doc-flow__connector doc-flow__connector--branch"
        d="M222,128 Q234,101 222,74"
      />
      {arrowhead({ x: 222, y: 72 }, -90, 'branch')}

      {/* Scheduled bypass, from "Brouillon" straight to "Publié" */}
      <path
        className="doc-flow__connector doc-flow__connector--branch"
        d="M68,72 C68,140 200,170 288,170"
      />
      {arrowhead({ x: 290, y: 170 }, 8, 'branch')}
      <path
        className="doc-flow__connector doc-flow__connector--branch"
        d="M328,170 C420,170 500,150 508,72"
      />
      {arrowhead({ x: 510, y: 68 }, -72, 'branch')}

      <FlowNode
        cx={54}
        cy={54}
        label={t('documentation.flows.editorial.draft')}
        delay="0s"
        step={1}
      />
      <FlowNode
        cx={210}
        cy={54}
        label={t('documentation.flows.editorial.pending')}
        delay="0.9s"
        step={2}
      />
      <FlowNode
        cx={366}
        cy={54}
        label={t('documentation.flows.editorial.approved')}
        delay="1.8s"
        step={3}
      />
      <FlowNode
        cx={522}
        cy={54}
        label={t('documentation.flows.editorial.published')}
        delay="2.7s"
        step={4}
      />
      <FlowNode
        cx={210}
        cy={150}
        label={t('documentation.flows.editorial.changes')}
        labelAbove={false}
        delay="1.2s"
        glyph="loop"
      />
      <FlowNode
        cx={308}
        cy={170}
        label={t('documentation.flows.editorial.scheduled')}
        labelAbove={false}
        delay="0.4s"
        glyph="clock"
      />
    </svg>
  )
}

/**
 * The plugin permission lifecycle: declare → review & install → run scoped
 * → revoke, plus the automatic disable/re-enable kill-switch. Placed on the
 * "Réglages" tab.
 */
export function PluginPermissionFlowDiagram({ t }: { readonly t: TFunction }): JSX.Element {
  return (
    <svg className="doc-flow" viewBox="0 0 600 230" role="img" aria-hidden="true" focusable="false">
      <line className="doc-flow__connector" x1={76} y1={54} x2={186} y2={54} />
      {arrowhead({ x: 188, y: 54 }, 0)}
      <line className="doc-flow__connector" x1={232} y1={54} x2={342} y2={54} />
      {arrowhead({ x: 344, y: 54 }, 0)}
      <line className="doc-flow__connector" x1={388} y1={54} x2={498} y2={54} />
      {arrowhead({ x: 500, y: 54 }, 0)}

      {/* Auto-disable / re-enable loop under "Exécution encadrée" */}
      <path
        className="doc-flow__connector doc-flow__connector--branch"
        d="M356,74 Q344,101 356,128"
      />
      {arrowhead({ x: 356, y: 130 }, 90, 'branch')}
      <path
        className="doc-flow__connector doc-flow__connector--branch"
        d="M378,128 Q390,101 378,74"
      />
      {arrowhead({ x: 378, y: 72 }, -90, 'branch')}

      <FlowNode
        cx={54}
        cy={54}
        label={t('documentation.flows.plugin.manifest')}
        delay="0s"
        step={1}
      />
      <FlowNode
        cx={210}
        cy={54}
        label={t('documentation.flows.plugin.install')}
        delay="0.9s"
        step={2}
      />
      <FlowNode
        cx={366}
        cy={54}
        label={t('documentation.flows.plugin.scoped')}
        delay="1.8s"
        step={3}
      />
      <FlowNode
        cx={522}
        cy={54}
        label={t('documentation.flows.plugin.revoke')}
        delay="2.7s"
        step={4}
      />
      <FlowNode
        cx={366}
        cy={150}
        label={t('documentation.flows.plugin.disabled')}
        labelAbove={false}
        delay="1.2s"
        glyph="pause"
      />
    </svg>
  )
}
