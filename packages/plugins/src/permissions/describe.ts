import { CogentaError } from '@cogenta/core'
import { PLUGIN_CAPABILITY_NAMES, type PluginCapabilityName } from '../manifest.js'

/** How much trust a capability asks for — drives the extra-confirmation gate. */
export type PluginCapabilityRisk = 'low' | 'medium' | 'high'

export interface PluginCapabilityDescription {
  /** Plain-language French, never a raw identifier fragment. */
  readonly sentence: string
  readonly riskLevel: PluginCapabilityRisk
  readonly category: string
}

/**
 * "Écran de permissions en langage clair" (docs/lots/L7-extensibilite.md,
 * task 7). One real sentence and risk judgment per name in the frozen
 * vocabulary (`../manifest.js`'s `PLUGIN_CAPABILITY_NAMES`) — no generic
 * fallback, because a fallback ("ce plugin demande une permission
 * technique") is exactly the kind of raw-identifier-adjacent non-answer the
 * acceptance criterion ("aucun identifiant technique brut") exists to rule
 * out. Risk is a real per-capability judgment, not a formula: destructive or
 * bypass-review actions (publish, delete, site-wide config write, deploy,
 * agent delegation, memory write) are `high`; actions confined to the
 * plugin's own narrow surface or requiring a further human step (draft
 * writes, dependency patches, storage within one's own prefix) are `medium`
 * or `low` depending on blast radius.
 */
const DESCRIPTIONS: Record<
  PluginCapabilityName,
  { sentence: string; riskLevel: PluginCapabilityRisk; category: string }
> = {
  'content.read': {
    sentence: 'Ce plugin pourra lire le contenu du site.',
    riskLevel: 'low',
    category: 'Contenu',
  },
  'content.write_draft': {
    sentence: 'Ce plugin pourra créer et modifier des brouillons, mais pas publier.',
    riskLevel: 'low',
    category: 'Contenu',
  },
  'content.publish': {
    sentence: 'Ce plugin pourra publier du contenu directement, sans validation humaine préalable.',
    riskLevel: 'high',
    category: 'Contenu',
  },
  'content.delete': {
    sentence: 'Ce plugin pourra supprimer du contenu du site.',
    riskLevel: 'high',
    category: 'Contenu',
  },
  'media.read': {
    sentence: 'Ce plugin pourra consulter les images et fichiers du site.',
    riskLevel: 'low',
    category: 'Médias',
  },
  'media.write': {
    sentence: 'Ce plugin pourra ajouter ou modifier des images et fichiers.',
    riskLevel: 'medium',
    category: 'Médias',
  },
  'schema.read': {
    sentence:
      'Ce plugin pourra consulter la structure du contenu (les types de contenu et leurs champs).',
    riskLevel: 'low',
    category: 'Structure',
  },
  'site.config_read': {
    sentence: 'Ce plugin pourra consulter les réglages du site.',
    riskLevel: 'low',
    category: 'Réglages',
  },
  'site.config_write': {
    sentence: 'Ce plugin pourra modifier les réglages du site.',
    riskLevel: 'high',
    category: 'Réglages',
  },
  'deps.scan': {
    sentence:
      'Ce plugin pourra analyser les dépendances du site à la recherche de failles connues.',
    riskLevel: 'low',
    category: 'Maintenance',
  },
  'deps.patch': {
    sentence:
      'Ce plugin pourra proposer des corrections de dépendances, sous forme de suggestion à valider.',
    riskLevel: 'medium',
    category: 'Maintenance',
  },
  'build.trigger': {
    sentence: 'Ce plugin pourra déclencher une reconstruction du site.',
    riskLevel: 'medium',
    category: 'Maintenance',
  },
  'deploy.trigger': {
    sentence: 'Ce plugin pourra déclencher une mise en ligne du site.',
    riskLevel: 'high',
    category: 'Maintenance',
  },
  'http.fetch': {
    sentence: 'Ce plugin pourra envoyer des données à {param}.',
    riskLevel: 'medium',
    category: 'Réseau',
  },
  'storage.read': {
    sentence: 'Ce plugin pourra lire les fichiers qu’il a lui-même stockés.',
    riskLevel: 'low',
    category: 'Stockage',
  },
  'storage.write': {
    sentence: 'Ce plugin pourra créer ou modifier les fichiers qu’il stocke pour son propre usage.',
    riskLevel: 'medium',
    category: 'Stockage',
  },
  'channel.send': {
    sentence:
      'Ce plugin pourra envoyer des messages sur le canal {param} (par exemple Telegram ou Slack).',
    riskLevel: 'medium',
    category: 'Canaux',
  },
  'agent.delegate': {
    sentence: 'Ce plugin pourra déléguer des tâches à un agent du site.',
    riskLevel: 'high',
    category: 'Agents',
  },
  'memory.read': {
    sentence: 'Ce plugin pourra consulter la mémoire des agents (leurs notes et apprentissages).',
    riskLevel: 'medium',
    category: 'Agents',
  },
  'memory.write': {
    sentence: 'Ce plugin pourra modifier la mémoire des agents (leurs notes et apprentissages).',
    riskLevel: 'high',
    category: 'Agents',
  },
}

/**
 * Splits `name` and an optional colon-suffixed parameter the same way
 * `../manifest.js`'s `checkCapability` does, without re-importing its
 * private helpers.
 */
function splitCapability(capability: string): { name: string; parameter: string | undefined } {
  const separatorIndex = capability.indexOf(':')
  return separatorIndex === -1
    ? { name: capability, parameter: undefined }
    : { name: capability.slice(0, separatorIndex), parameter: capability.slice(separatorIndex + 1) }
}

/**
 * Translates one exact capability string (e.g. `http.fetch:api.exemple.com`)
 * into a plain-language description — never the raw `content.write_draft`
 * shape, only what it means. Throws on a capability outside the known
 * vocabulary rather than guessing a description for it: an untranslatable
 * capability is a manifest-validation bug (`../manifest.js` already refuses
 * it at `definePlugin` time), never something this function should paper
 * over with a generic sentence.
 */
export function describeCapability(capability: string): PluginCapabilityDescription {
  const { name, parameter } = splitCapability(capability)
  const entry = DESCRIPTIONS[name as PluginCapabilityName]
  if (entry === undefined) {
    throw new CogentaError({
      code: 'PLUGIN_CAPABILITY_REFUSED',
      message: `No plain-language description exists for capability "${capability}".`,
      hint: 'This capability is outside the known vocabulary (PLUGIN_CAPABILITY_NAMES) — it should have been refused at definePlugin time.',
      details: { capability },
    })
  }
  return {
    sentence:
      parameter === undefined ? entry.sentence : entry.sentence.replace('{param}', parameter),
    riskLevel: entry.riskLevel,
    category: entry.category,
  }
}

/** Every capability name this module can describe — used by `describeCapability`'s own exhaustiveness test. */
export const DESCRIBABLE_CAPABILITY_NAMES: readonly PluginCapabilityName[] = PLUGIN_CAPABILITY_NAMES
