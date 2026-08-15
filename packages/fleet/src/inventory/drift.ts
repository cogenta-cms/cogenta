import { compareVersions, parseVersion } from '@cogenta/plugins'
import type { TelemetrySnapshot } from '../control/state.js'

/**
 * Kind of a version-bearing component a site reports. `cms` is its own kind
 * (not a plugin/theme) even though today it is honestly `null` for every
 * real site — no meaningful "Cogenta CMS version" exists anywhere in this
 * codebase yet (pre-alpha; root `package.json` carries no `version` field,
 * `@cogenta/plugins`' own `loadPlugin` documents the identical gap for
 * `engineCompatible`). The `cms` component is included in the SHAPE so a
 * later, real Cogenta version scheme slots in without a breaking change to
 * this module's output — but a `null` `cms` version is never treated as
 * "drifted" against anything (see `computeFleetBaseline`/`detectDrift`
 * below: a component with no real version anywhere in the fleet has no
 * baseline and produces no drift entries, honestly, rather than a fabricated
 * "0.0.0 vs 0.0.0, no drift" result).
 */
export type InventoryComponentKind = 'cms' | 'plugin' | 'theme'

export interface InventoryComponent {
  readonly kind: InventoryComponentKind
  /** The component's own name — `"cms"` for the kind `cms`, a plugin/theme's real name otherwise. */
  readonly name: string
  readonly version: string
}

export interface SiteInventory {
  readonly siteId: string
  /** When this inventory was collected — the site's own real `collectedAt`, not the ingestion time. */
  readonly collectedAt: string
  readonly components: readonly InventoryComponent[]
}

/**
 * Real inventory extraction from a real, already-verified telemetry
 * snapshot (`../control/state.js`'s `SiteStateStore`) — no new data source,
 * just a flatter, component-oriented view of `TelemetryPayload.installedVersions`
 * for the drift-comparison logic below to work over uniformly (cms/plugin/theme
 * treated the same shape, rather than three separately-typed lists).
 */
export function extractInventory(snapshot: TelemetrySnapshot): SiteInventory {
  const { cms, plugins, themes } = snapshot.payload.installedVersions
  const components: InventoryComponent[] = []
  if (cms !== null) components.push({ kind: 'cms', name: 'cms', version: cms })
  for (const plugin of plugins)
    components.push({ kind: 'plugin', name: plugin.name, version: plugin.version })
  for (const theme of themes)
    components.push({ kind: 'theme', name: theme.name, version: theme.version })
  return { siteId: snapshot.siteId, collectedAt: snapshot.collectedAt, components }
}

/** Identifies one real component across the fleet, independent of which site reports it. */
function componentKey(kind: InventoryComponentKind, name: string): string {
  return `${kind}:${name}`
}

export interface FleetBaseline {
  /** The expected/most-common version per real component key (`"plugin:my-plugin"`), computed from what the fleet actually reports — never hardcoded. */
  readonly expectedVersion: ReadonlyMap<string, string>
}

/**
 * "Dérive" implies a baseline to drift FROM. The real, honestly-computable
 * baseline today: the most common (mode) version of each component across
 * the currently-known fleet. A tie is broken by the lexicographically
 * greatest raw version string — an arbitrary but deterministic, real
 * tie-break (not "first seen," which would depend on iteration order and
 * make the baseline non-reproducible for the same inventory set).
 */
export function computeFleetBaseline(inventories: readonly SiteInventory[]): FleetBaseline {
  const counts = new Map<string, Map<string, number>>()

  for (const inventory of inventories) {
    for (const component of inventory.components) {
      const key = componentKey(component.kind, component.name)
      const perVersion = counts.get(key) ?? new Map<string, number>()
      perVersion.set(component.version, (perVersion.get(component.version) ?? 0) + 1)
      counts.set(key, perVersion)
    }
  }

  const expectedVersion = new Map<string, string>()
  for (const [key, perVersion] of counts) {
    let bestVersion: string | undefined
    let bestCount = -1
    for (const [version, count] of perVersion) {
      if (
        count > bestCount ||
        (count === bestCount && bestVersion !== undefined && version > bestVersion)
      ) {
        bestVersion = version
        bestCount = count
      }
    }
    if (bestVersion !== undefined) expectedVersion.set(key, bestVersion)
  }

  return { expectedVersion }
}

export type DriftDirection = 'behind' | 'ahead' | 'different'

export interface DriftEntry {
  readonly siteId: string
  readonly componentKind: InventoryComponentKind
  readonly componentName: string
  readonly version: string
  readonly expectedVersion: string
  /**
   * `behind`/`ahead` when both the site's and the fleet's version parse as
   * real semver (`@cogenta/plugins`'s real, already-tested comparator,
   * reused rather than reimplemented) — `different` when they don't (a raw
   * string mismatch is still real, reportable drift, it just can't be
   * ordered without a parseable version on both sides).
   */
  readonly direction: DriftDirection
}

/**
 * Compares every site's real inventory against the real fleet baseline and
 * reports every component whose version differs — a site agreeing with the
 * baseline on every component produces no entries for it, honestly (no
 * "0 drift" placeholder row).
 */
export function detectDrift(
  inventories: readonly SiteInventory[],
  baseline: FleetBaseline,
): readonly DriftEntry[] {
  const entries: DriftEntry[] = []

  for (const inventory of inventories) {
    for (const component of inventory.components) {
      const key = componentKey(component.kind, component.name)
      const expected = baseline.expectedVersion.get(key)
      if (expected === undefined || expected === component.version) continue

      const siteVersion = parseVersion(component.version)
      const expectedParsed = parseVersion(expected)
      const direction: DriftDirection =
        siteVersion === null || expectedParsed === null
          ? 'different'
          : compareVersions(siteVersion, expectedParsed) < 0
            ? 'behind'
            : 'ahead'

      entries.push({
        siteId: inventory.siteId,
        componentKind: component.kind,
        componentName: component.name,
        version: component.version,
        expectedVersion: expected,
        direction,
      })
    }
  }

  return entries
}
