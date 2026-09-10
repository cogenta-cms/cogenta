import { type JSX, useEffect, useRef, useState } from 'react'
import { Badge } from './badge.js'
import { cn } from './cn.js'

/**
 * A run log: the ordered, timestamped trace of what a long-running agent job
 * actually did, kept readable after the job has ended.
 *
 * The eighth design-system component, and it clears the "no abstraction
 * before a real second use" bar the same way `Pagination` did: the theme
 * generator workshop and the agent chat feed both grew their own ad hoc
 * "list of grey italic lines" for exactly this, and both lost the trace the
 * moment the run finished — which is the single complaint this component
 * exists to answer. It renders steps, never clears them; a caller decides
 * when to replace the entries, and the log stays readable (collapsed, never
 * emptied) once `status` leaves `'running'`.
 *
 * Presentational only. Every string is a prop: the admin is translated, and
 * a design-system component must not reach for `useTranslation` on a
 * caller's behalf — the same reason `Modal` takes `closeLabel`.
 */

export type ActivityKind = 'thinking' | 'tool-start' | 'tool-success' | 'tool-failure' | 'info'

export interface ActivityEntry {
  readonly id: string
  readonly kind: ActivityKind
  readonly message: string
  /** Epoch milliseconds, as the job reported it. Absent means "no clock on this line". */
  readonly at?: number
  /** The tool this line is about, when the message names one — rendered as its own chip. */
  readonly tool?: string
}

export interface ActivityLogLabels {
  readonly title: string
  readonly running: string
  readonly done: string
  readonly failed: string
  readonly empty: string
  readonly show: string
  readonly hide: string
  /** Read out before each line, so a screen reader hears "failure" rather than only a colour. */
  readonly kinds: Readonly<Record<ActivityKind, string>>
}

export interface ActivityLogProps {
  readonly entries: readonly ActivityEntry[]
  readonly status: 'running' | 'done' | 'failed'
  readonly labels: ActivityLogLabels
  readonly className?: string
  readonly 'data-testid'?: string
}

const MARKER_CLASSES: Readonly<Record<ActivityKind, string>> = {
  thinking: 'border-border bg-muted',
  'tool-start': 'border-info bg-info-surface',
  'tool-success': 'border-success bg-success-surface',
  'tool-failure': 'border-destructive bg-destructive-surface',
  info: 'border-border bg-muted',
}

const MESSAGE_CLASSES: Readonly<Record<ActivityKind, string>> = {
  thinking: 'text-muted-foreground',
  'tool-start': 'text-foreground',
  'tool-success': 'text-foreground',
  'tool-failure': 'text-destructive',
  info: 'text-foreground',
}

/**
 * The server's own classification, mapped onto this component's vocabulary.
 * `@cogenta/agents`' progress events carry a `kind` (and the tool a line is
 * about) alongside the message, so the common path is a lookup, not a guess.
 */
const SERVER_KINDS: Readonly<Record<string, ActivityKind>> = {
  thinking: 'thinking',
  'tool-call': 'tool-start',
  'tool-ok': 'tool-success',
  'tool-failed': 'tool-failure',
  stage: 'info',
  warning: 'tool-failure',
}

/**
 * Reads one progress line from an agent run into a kind, plus the tool it is
 * about.
 *
 * `kind`, when the server sent one, is the answer — no interpretation. The
 * regexes below are the fallback for a line that predates structured events
 * or comes from a reporter that supplies none; they read the runtime's own
 * wording ("Thinking… (step 3)", `Calling tool "x"…`, `Tool "x" finished.`,
 * `Tool "x" failed: …`). Keeping them means an older job still renders
 * correctly instead of collapsing to a wall of undifferentiated lines.
 *
 * Failure is tested before success on purpose — an unclassifiable line is
 * `info`, never a silently green "finished".
 */
export function classifyActivityMessage(
  message: string,
  detail?: { readonly kind?: string; readonly tool?: string },
): {
  readonly kind: ActivityKind
  readonly tool?: string
} {
  const serverKind = detail?.kind === undefined ? undefined : SERVER_KINDS[detail.kind]
  if (serverKind !== undefined) {
    return { kind: serverKind, ...(detail?.tool === undefined ? {} : { tool: detail.tool }) }
  }
  const text = message.trim()
  const quoted = /["“«]\s*([^"”»]+?)\s*["”»]/u.exec(text)
  const tool = quoted?.[1] === undefined ? {} : { tool: quoted[1] }
  if (/^thinking\b|^réflexion\b/iu.test(text)) return { kind: 'thinking', ...tool }
  if (/\bfail(ed|s|ure)?\b|\berrors?\b|\béchec\b/iu.test(text))
    return { kind: 'tool-failure', ...tool }
  if (/^calling tool\b|^appel\b/iu.test(text)) return { kind: 'tool-start', ...tool }
  if (/\bfinished\b|\bdone\b|\bterminé\b/iu.test(text)) return { kind: 'tool-success', ...tool }
  return { kind: 'info', ...tool }
}

function formatClock(at: number): string {
  const date = new Date(at)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function ActivityLog({
  entries,
  status,
  labels,
  className,
  'data-testid': testId,
}: ActivityLogProps): JSX.Element {
  // Open while it runs, and still open when it stops: the whole point is that
  // the trace survives the run. Collapsing is the operator's choice, never a
  // side effect of the job ending.
  const [open, setOpen] = useState(true)
  const listRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    if (status !== 'running' || !open) return
    // jsdom implements neither `scrollTo` on elements nor smooth behaviour —
    // optional-chain the method itself, the same guard `agent-chat-feed.tsx`
    // already needed.
    listRef.current?.scrollTo?.({ top: listRef.current.scrollHeight })
  }, [entries, status, open])

  const tone = status === 'failed' ? 'danger' : status === 'done' ? 'success' : 'info'
  const statusLabel =
    status === 'failed' ? labels.failed : status === 'done' ? labels.done : labels.running

  return (
    <section
      className={cn('flex flex-col rounded-md border border-border bg-card', className)}
      aria-label={labels.title}
      data-testid={testId}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <h3 className="m-0 text-sm leading-5 font-semibold text-card-foreground">
            {labels.title}
          </h3>
          <Badge tone={tone}>{statusLabel}</Badge>
        </div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="cursor-pointer appearance-none rounded-md border border-border bg-transparent px-2 py-1 font-sans text-xs leading-4 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {open ? labels.hide : labels.show}
        </button>
      </div>

      {open && (
        <ol
          ref={listRef}
          // `polite`, and only while the job runs: an ended log that keeps
          // announcing itself on every collapse would talk over the result.
          aria-live={status === 'running' ? 'polite' : 'off'}
          className="m-0 flex max-h-64 list-none flex-col gap-0 overflow-y-auto p-0"
        >
          {entries.length === 0 && (
            <li className="px-3 py-2 text-xs leading-5 text-muted-foreground">{labels.empty}</li>
          )}
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-start gap-2 border-b border-border px-3 py-1.5 last:border-b-0"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'mt-1.5 size-2 shrink-0 rounded-[2px] border',
                  MARKER_CLASSES[entry.kind],
                )}
              />
              {entry.at !== undefined && (
                <span className="mt-0.5 shrink-0 font-mono text-[0.7rem] leading-5 text-muted-foreground tabular-nums">
                  {formatClock(entry.at)}
                </span>
              )}
              <span className={cn('text-xs leading-5 break-words', MESSAGE_CLASSES[entry.kind])}>
                <span className="sr-only">{`${labels.kinds[entry.kind]} : `}</span>
                {entry.message}
              </span>
              {entry.tool !== undefined && (
                <span className="ml-auto shrink-0 rounded-[2px] border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.7rem] leading-4 text-muted-foreground">
                  {entry.tool}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
