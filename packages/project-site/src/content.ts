import type { VocabularyBlock } from '@cogenta/blocks'
import {
  type CollectionDefinition,
  defineCollection,
  f,
  type RichTextDocument,
} from '@cogenta/schema'

/**
 * Cogenta's own project site (L9 task 12). One collection is enough — this
 * is a handful of real, hand-written pages about the project itself, not a
 * blueprint meant to be reused by an installed site.
 */
export const page: CollectionDefinition = defineCollection({
  name: 'page',
  labels: { singular: 'Page', plural: 'Pages' },
  routing: { pattern: '/:slug' },
  fields: {
    title: f.text({ required: true, max: 200 }),
    slug: f.slug({ from: 'title', unique: true }),
    blocks: f.blocks({ required: true }),
  },
  indexes: [['slug']],
  permissions: { read: ['public'], create: ['editor', 'admin'], update: ['editor', 'admin'] },
})

let paragraphKey = 0

/** One `normal`-style rich-text paragraph, unmarked. */
function paragraph(text: string): RichTextDocument[number] {
  paragraphKey += 1
  return {
    _key: `site-${paragraphKey}`,
    _type: 'block',
    style: 'normal',
    children: [{ _key: `site-${paragraphKey}-span`, _type: 'span', text, marks: [] }],
    markDefs: [],
  }
}

const REPO_URL = 'https://github.com/cogenta-cms/cogenta'

const BLUEPRINTS: readonly { readonly name: string; readonly text: string }[] = [
  { name: 'Blog', text: 'Articles, catégories, étiquettes.' },
  { name: 'Vitrine', text: 'Services, témoignages.' },
  { name: 'Magazine', text: 'Articles regroupés par rubrique.' },
  { name: 'Portfolio', text: 'Projets, présentation.' },
  { name: 'Documentation', text: 'Pages de documentation ordonnées.' },
  { name: 'Association', text: 'Événements, appel aux dons.' },
  { name: 'Restaurant', text: 'Menu, contact.' },
  { name: 'SaaS', text: 'Fonctionnalités, tarifs.' },
]

export interface DemoPage {
  readonly title: string
  readonly slug: string
  readonly blocks: readonly VocabularyBlock[]
}

/**
 * Real content, drawn from `docs/00-vision.md` and this session's own real
 * work (`docs/getting-started.md`, `docs/guide-editeur.md`, the eight real
 * blueprints from L9 task 8) — not placeholder text.
 */
export const PROJECT_SITE_PAGES: readonly DemoPage[] = [
  {
    title: 'Cogenta',
    slug: 'home',
    blocks: [
      {
        _key: 'home-hero',
        _type: 'hero',
        _version: '1.0.0',
        eyebrow: 'CMS agentique open source',
        title: 'Le premier CMS qui exploite les sites à votre place.',
        subtitle: 'Il se surveille, se patche, s’optimise, et vous rend des comptes.',
        actions: [
          { label: 'Voir sur GitHub', target: { href: REPO_URL }, emphasis: 'primary' },
          { label: 'Essayer le playground', target: { href: '/playground' } },
        ],
      },
      {
        _key: 'home-prose',
        _type: 'prose',
        _version: '1.0.0',
        body: [
          paragraph(
            'Cogenta n’est pas un CMS avec des fonctions d’IA ajoutées en surface. C’est un CMS ' +
              'dont le runtime multi-agents fait partie du noyau, au même titre que la base de ' +
              'données ou le moteur de rendu — chaque agent avec ses outils, ses permissions, sa ' +
              'mémoire, son budget et son niveau d’autonomie, sous contrôle humain.',
          ),
          paragraph(
            'Sans clé API, sans fournisseur configuré, en panne de réseau : le CMS reste ' +
              'pleinement fonctionnel. Les agents accélèrent ; ils ne conditionnent rien.',
          ),
        ],
      },
      {
        _key: 'home-features',
        _type: 'featureGrid',
        _version: '1.0.0',
        title: 'Ce que Cogenta n’est pas',
        items: [
          {
            _key: 'f1',
            title: 'Pas un builder no-code',
            text: 'Le schéma de contenu est du code, versionné.',
          },
          { _key: 'f2', title: 'Pas un SaaS', text: 'L’auto-hébergement est le mode par défaut.' },
          {
            _key: 'f3',
            title: 'Pas un framework frontend',
            text: 'On s’appuie sur Astro, on n’en réécrit pas un.',
          },
          {
            _key: 'f4',
            title: 'Pas dépendant de l’IA',
            text: 'Les agents accélèrent ; ils ne conditionnent rien.',
          },
        ],
      },
      {
        _key: 'home-cta',
        _type: 'cta',
        _version: '1.0.0',
        title: 'Créer un site en moins de 60 secondes',
        text: 'npm create cogenta',
        actions: [{ label: 'Démarrer', target: { href: '/docs' }, emphasis: 'primary' }],
      },
    ],
  },
  {
    title: 'Blueprints',
    slug: 'blueprints',
    blocks: [
      {
        _key: 'blueprints-prose',
        _type: 'prose',
        _version: '1.0.0',
        body: [
          paragraph(
            'Un blueprint est une configuration complète et cohérente — modèle de contenu, ' +
              'skin, agents préconfigurés, contenu de démo, pages types — pas un thème. On peut ' +
              'ensuite tout changer. Huit sont livrés aujourd’hui :',
          ),
          ...BLUEPRINTS.map((blueprint) => paragraph(`${blueprint.name} — ${blueprint.text}`)),
        ],
      },
    ],
  },
  {
    title: 'Documentation',
    slug: 'docs',
    blocks: [
      {
        _key: 'docs-prose',
        _type: 'prose',
        _version: '1.0.0',
        body: [
          paragraph(
            'Le guide de démarrage technique (docs/getting-started.md) couvre l’installation, ' +
              'la définition d’un schéma et l’écriture d’un bloc de thème, avec des exemples de ' +
              'code exécutés en continu. Le guide de l’éditeur (docs/guide-editeur.md) explique, ' +
              'sans jargon, comment gérer le contenu, les médias et les agents depuis ' +
              'l’administration.',
          ),
        ],
      },
      {
        _key: 'docs-cta',
        _type: 'cta',
        _version: '1.0.0',
        title: 'Le dépôt',
        text: 'Code source, documentation complète et gouvernance du projet.',
        actions: [{ label: 'Voir sur GitHub', target: { href: REPO_URL }, emphasis: 'primary' }],
      },
    ],
  },
  {
    title: 'Playground',
    slug: 'playground',
    blocks: [
      {
        _key: 'playground-prose',
        _type: 'prose',
        _version: '1.0.0',
        body: [
          paragraph(
            'Un bac à sable public exécutant du code arbitraire est une cible — la démo publique ' +
              'de Cogenta est volontairement en lecture seule : toute tentative d’écriture (créer, ' +
              'modifier, publier, supprimer un contenu) est refusée avec l’erreur ' +
              'CONTENT_READ_ONLY, pas silencieusement ignorée. Les lectures fonctionnent ' +
              'normalement. Le contenu de démonstration est régulièrement réinitialisé.',
          ),
          paragraph(
            'Cette page décrit le mécanisme ; l’hébergement public d’une instance n’est pas fait ' +
              'par ce dépôt — c’est une décision de déploiement, pas de code.',
          ),
        ],
      },
    ],
  },
]
