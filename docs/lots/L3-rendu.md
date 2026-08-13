# L3 — Rendu

## Objectif

Transformer le contenu en sites. Intégration Astro, contrat de thème, thème canonique,
skins par tokens, trois cibles de build, socle SEO, PWA.

**C'est le lot qui met le blog en production.** À partir d'ici, tout est validé sur un
site réel.

## Dépendances

L1. **Contrat D (thème) figé avant de commencer.**

## Périmètre

- Intégration Astro et chargement du thème actif
- Implémentation du contrat de thème et du `RenderContext`
- Thème canonique implémentant les douze blocs
- Système de skins : tokens, variables CSS, changement à chaud
- Trois cibles de build : statique, Node SSR, edge
- Manifeste de besoins runtime et refus de build explicite
- Socle SEO complet
- PWA
- Pipeline d'images avec repli WASM
- Cache de rendu avec invalidation par tags

## Arborescence

```
packages/
├── render/              # @cogenta/render — intégration Astro, contexte, build
├── theme-canonical/     # @cogenta/theme-canonical
│   ├── theme.config.ts
│   ├── tokens.json
│   └── src/{layouts,blocks,components}/
└── seo/                 # @cogenta/seo — sitemap, JSON-LD, feeds, llms.txt
```

## Points de conception

### Isolation du thème

Le processus de rendu **ne possède ni les secrets ni la connexion à la base**. Il reçoit
un client HTTP vers l'API de contenu, avec un jeton restreint en lecture. C'est la
sandbox, et elle tombe de l'architecture des deux plans (ADR-0004).

Le `RenderContext` expose `site`, `locale`, `url`, `t()`, `image()`, `link()`. Rien
d'autre. Un thème qui importe `node:fs` échoue à la vérification d'installation.

### Skins et changement à chaud

Les tokens sont rendus en variables CSS dans une feuille unique. Changer de skin réécrit
cette feuille : **aucun build**. C'est ce qui donne l'ergonomie WordPress sans sacrifier
l'architecture.

Contraintes vérifiées à l'enregistrement d'un skin, en refus dur :

- contraste AA sur toutes les paires texte/fond déclarées
- échelle typographique monotone croissante
- aucun token manquant
- `prefers-reduced-motion` respecté par les tokens de mouvement

Ce sont ces contraintes qui rendront la génération par IA sûre en L9.

### Les trois cibles

Une seule base de code de thème, trois adaptateurs Astro. La cible est un paramètre de
build, pas une variante de thème.

**Refus explicite en statique** : si un bloc, un thème ou un plugin déclare
`runtime: 'server'` et que la cible est statique, le build échoue avec un message
nommant l'élément, la raison, et les trois options — fonction edge, service externe,
retrait. Jamais de dégradation silencieuse.

### Cache de rendu

Chaque page rendue est mise en cache avec des tags dérivés des contenus qu'elle
consomme. La publication d'un contenu invalide les tags correspondants. C'est le point
que WordPress fait le plus mal, et il faut le faire bien dès ce lot — l'ajouter après
impose de réécrire la couche de données du rendu.

### Socle SEO

`sitemap.xml` (indexé si volumineux), `robots.txt`, JSON-LD dérivé du schéma de contenu,
Open Graph et Twitter Card, images OG générées, RSS et Atom, `hreflang` complet,
canoniques, `llms.txt`, ping IndexNow.

Le JSON-LD est **dérivé du schéma**, pas saisi à la main : un type `article` produit un
`Article` schema.org sans intervention.

### PWA

Manifest, service worker, stratégie de cache par type de ressource, page hors ligne,
installable. Le service worker doit se désinscrire proprement — un service worker
zombie qui sert une ancienne version est un incident classique et difficile à
diagnostiquer.

## Tâches, dans l'ordre

1. Intégration Astro, chargement du thème actif depuis la config
2. `RenderContext` et client de contenu à jeton restreint
3. Vérification d'installation d'un thème (blocs implémentés, imports interdits)
4. Thème canonique : layout de base, routage, les douze blocs
5. Système de tokens et variables CSS
6. Validation de skin (contraste, échelle, complétude)
7. Changement de skin à chaud
8. Pipeline d'images : variantes, srcset, point focal, repli WASM
9. Cible statique
10. Cible Node SSR
11. Cible edge
12. Refus de build sur besoin runtime non satisfait
13. Cache de rendu avec invalidation par tags
14. Socle SEO complet
15. PWA
16. Passe accessibilité et performance du thème canonique

## Critères d'acceptation

- **Le blog du créateur est en production sur Cogenta**
- Lighthouse 100/100/100/100 sur le thème canonique, page d'article et page de liste
- Changer de skin ne déclenche aucun build et prend moins d'une seconde
- Le même contenu produit un résultat équivalent sur les trois cibles
- Un thème qui tente d'importer `node:fs` ou d'accéder à la base est refusé à l'installation
- Un build statique contenant un bloc `runtime: server` échoue avec un message actionnable
- Publier un contenu invalide exactement les pages concernées, pas tout le cache
- Un skin au contraste insuffisant est refusé à l'enregistrement
- Build statique de 1000 pages en moins de 3 minutes

## Tests exigés

| Type | Portée |
|---|---|
| Instantané | Rendu des douze blocs, HTML stable |
| Visuel | Régression sur le thème canonique, plusieurs skins |
| Build | Les trois cibles sur le même contenu, comparaison de sortie |
| Sécurité | Thème hostile : import interdit, tentative d'accès base, échappement |
| SEO | Validation du sitemap, du JSON-LD, des hreflang |
| Performance | Budget Lighthouse en CI, échec si régression |
| Cache | Invalidation par tags : la bonne page, et seulement elle |

## Pièges connus

**Le service worker.** Une mauvaise stratégie sert du contenu périmé indéfiniment.
Prévoir dès le départ le mécanisme de mise à jour et de purge, et un bouton
« vider le cache client » dans l'admin.

**Les variantes d'images explosent.** N formats × M largeurs × K contenus. Génération
paresseuse et cache agressif, jamais tout au build.

**`sharp` ne s'installe pas partout.** Le repli WASM doit être testé en CI, pas
seulement présent dans le code.

**Le rendu incrémental.** Ne pas le tenter dans ce lot. Statique complet d'abord ; l'ISR
viendra quand le cache par tags sera éprouvé.

## Hors périmètre

Marketplace de thèmes, génération de skin par IA (L9), édition visuelle du thème,
rendu incrémental.
