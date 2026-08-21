import type { AutonomyLevel } from './types.js'

/**
 * L22 task 1 item 4 asks for "trois valeurs fermées — report-only / co-pilot
 * / autopilot". Contract C is already figured with a different, frozen
 * vocabulary (`docs/04-contrats.md` § Contrat C, `tools@1.0`): `observe` /
 * `propose` / `execute_with_approval` / `autonomous` — the exact strings
 * `AutonomyLevel` already carries and `withAutonomy` (L4 task 9) already
 * gates on. Renaming that type would be a contract change (a major bump,
 * ADR-required); the lot's three names are a UI simplification on top of it,
 * not a replacement for it.
 *
 * This module is the one, explicit place that reconciles the two: the admin
 * (and any other UI surface) only ever offers these three named levels, each
 * mapped onto one contract-C level. `execute_with_approval` stays reachable
 * as an advanced per-tool override (contract C's own `defineAgent` example
 * uses per-tool overrides already) — it is not one of the three UI defaults,
 * but a level already set that way (by a future admin, or a hand-written
 * agent definition) still displays sensibly via `autonomyLevelToUiLevel`.
 *
 * Mapping, and why:
 * - `report-only` → `observe`: a side-effecting call is never made, only
 *   "observed" — matches "l'agent ne fait que remonter de l'information,
 *   aucune écriture" exactly.
 * - `co-pilot` → `propose`: the call is handed to the approval queue and the
 *   run moves on without blocking — matches "l'agent propose, une action
 *   humaine confirme... jamais une application automatique". Deliberately
 *   not `execute_with_approval`, which blocks the run until a human decides;
 *   an agent that may run unattended (a cron trigger) must not hang
 *   indefinitely waiting on a screen nobody is looking at.
 * - `autopilot` → `autonomous`: the call executes immediately, still bounded
 *   by whatever the tool's own permissions and the actor's role allow (R4).
 */
export const AUTONOMY_UI_LEVELS = ['report-only', 'co-pilot', 'autopilot'] as const
export type AutonomyUiLevel = (typeof AUTONOMY_UI_LEVELS)[number]

const UI_TO_CONTRACT: Readonly<Record<AutonomyUiLevel, AutonomyLevel>> = {
  'report-only': 'observe',
  'co-pilot': 'propose',
  autopilot: 'autonomous',
}

/** `execute_with_approval` has no dedicated UI level — it displays as `co-pilot`, the closest of the three ("a human decides before it runs" either way). */
const CONTRACT_TO_UI: Readonly<Record<AutonomyLevel, AutonomyUiLevel>> = {
  observe: 'report-only',
  propose: 'co-pilot',
  execute_with_approval: 'co-pilot',
  autonomous: 'autopilot',
}

export function uiLevelToAutonomyLevel(level: AutonomyUiLevel): AutonomyLevel {
  return UI_TO_CONTRACT[level]
}

export function autonomyLevelToUiLevel(level: AutonomyLevel): AutonomyUiLevel {
  return CONTRACT_TO_UI[level]
}
