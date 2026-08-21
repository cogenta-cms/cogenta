import type { ApprovalQueue, ApprovalRequest } from '@cogenta/agents'
import type { RedirectStore } from '@cogenta/schema'
import type { AdminNotice, NoticeSource } from './types.js'

/**
 * L22 task 3's "dashboard" half: the one concrete case this lot ships is a
 * repeatedly-hit 404 the Site Monitor agent (`@cogenta/agents`'
 * `builtins.ts`) suggests a redirect for. Under `co-pilot` autonomy (the
 * agent's own default), `withAutonomyForManifest` (`@cogenta/agents`) never
 * calls `redirects.create` — it only files the call on the `ApprovalQueue`
 * and moves on ("propose... jamais une application automatique"). Nothing
 * before this source ever read that queue back out; a proposal sat there,
 * genuinely pending, invisible.
 *
 * Deliberately narrow, not a generic "pending agent approvals" board: this
 * reads exactly one tool's pending calls (`redirects.create`), because that
 * is the one this lot's own spec asks to surface, and turning a queue entry
 * into a notice for a tool this source has never seen would be a guess at a
 * shape nobody has designed yet (`AGENTS.md`'s own "ne pas introduire une
 * abstraction pour un cas hypothétique"). A future write tool going through
 * `propose` gets its own source, written against its own input shape, the
 * same way this one earns its narrowness by being the first.
 *
 * **Reuses the existing Redirections screen, on purpose — never a second
 * confirmation UI.** The notice states what the agent would create (`from`,
 * `to`) and links straight to `/seo?tab=redirects`
 * (`packages/admin/src/routes/redirects.tsx`), where an admin creates it
 * themselves with the normal form — deciding, in the process, whether to
 * take the suggestion at all. `redirects.create` under `autonomous`
 * (`autopilot`) autonomy never goes through this path at all: the tool
 * executes immediately and the redirect is simply there, in the same
 * screen, the next time it loads.
 *
 * **Resolves itself, like every other source here.** Once an admin creates
 * the redirect by hand (or the agent later applies it under `autopilot`),
 * `from` resolves to something real and the suggestion stops being emitted
 * — not because the underlying `ApprovalQueue` entry was ever decided (L22
 * task 1's queue has no admin surface yet to decide it from), but because
 * the condition the notice was about is no longer true, which is the same
 * rule `scheduled-publish-failed.ts`/`audit-integrity.ts` already follow.
 */

export interface MonitoringRedirectSuggestionOptions {
  readonly approvalQueue: ApprovalQueue
  /** Only `resolve` is used — to check a suggestion has not already been acted on by hand. */
  readonly redirects: Pick<RedirectStore, 'resolve'>
  /** Where the Redirections screen lives. `/seo?tab=redirects` by default (the tab fiche 21 task 3 merged this screen under). */
  readonly redirectsHref?: string
}

interface RedirectProposal {
  readonly id: string
  readonly agentName: string
  readonly from: string
  readonly to: string
}

function asRedirectProposal(request: ApprovalRequest): RedirectProposal | undefined {
  if (request.toolName !== 'redirects.create') return undefined
  const from = request.input.from
  const to = request.input.to
  if (typeof from !== 'string' || typeof to !== 'string') return undefined
  return { id: request.id, agentName: request.agentName, from, to }
}

const DEFAULT_REDIRECTS_HREF = '/seo?tab=redirects'

export function createMonitoringRedirectSuggestionSource(
  options: MonitoringRedirectSuggestionOptions,
): NoticeSource {
  const redirectsHref = options.redirectsHref ?? DEFAULT_REDIRECTS_HREF

  return {
    name: 'monitoring-redirect-suggestion',
    list: async ({ actor }) => {
      // Admin only: a redirect is a routing decision, never content — the
      // same rule `/api/redirects` and `/api/not-found` already apply.
      if (actor.id === null || !actor.roles.includes('admin')) return []

      const pending = await options.approvalQueue.list('pending')
      const notices: AdminNotice[] = []

      for (const request of pending) {
        const proposal = asRedirectProposal(request)
        if (proposal === undefined) continue

        const already = await options.redirects.resolve(proposal.from)
        if (already !== null) continue // acted on already — see the module comment

        notices.push({
          id: `monitoring.redirect-suggestion:${proposal.id}`,
          code: 'monitoring.redirect-suggestion',
          severity: 'info',
          params: { from: proposal.from, to: proposal.to, agent: proposal.agentName },
          dismissible: true,
          action: { code: 'monitoring.redirect-suggestion.action', href: redirectsHref },
        })
      }

      return notices
    },
  }
}
