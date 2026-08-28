# 70 — SEO : niveau plateforme complète (AIOSEO / SEO Framework / MonsterInsights / Site Kit)

> **État** : fiches 13 et 50 satisfaites — panneau SEO par entrée, écran diagnostic,
> vérification Google/Bing, IndexNow, éditeur robots.txt, llms.txt. **Mais ces deux
> fiches ne comparaient Cogenta qu'à Yoast et Rank Math.** L'utilisateur avait
> explicitement demandé une recherche sur six outils : Yoast, Rank Math, AIOSEO,
> The SEO Framework, MonsterInsights, Site Kit. Les quatre derniers n'ont jamais été
> regardés — cette fiche corrige l'oubli.
> **Paquet** : `@cogenta/seo`, `packages/admin/src/routes/seo.tsx`,
> `packages/admin/src/seo/seo-panel.tsx`
> **Effort** : 6–8 jours
> **ADR** : **ADR-0032, tranchée avec l'utilisateur le 2026-08-28** — connecteur
> Search Console optionnel accepté, désactivé par défaut, rédigée et remise à
> l'humain pour insertion (`docs/03-decisions.md` protégé en écriture par un hook).

---

## 1. Recherche réelle sur les quatre outils jamais regardés

**AIOSEO** — philosophie « boîte à outils modulaire », chaque bloc de fonctionnalité
s'active/se désactive indépendamment. TruSEO : analyse en temps réel du contenu
pendant la rédaction, plus de 100 points de contrôle répartis en « analyse du mot-clé
principal » et « analyse de la page ». Link Assistant : suggère des liens internes à
ajouter avec l'ancre appropriée, et signale les articles orphelins (aucun lien interne
entrant). Author SEO : profil auteur avec balisage `Person`/E-E-A-T. Search
Statistics : données Search Console réellement rapatriées dans le tableau de bord
WordPress.

**The SEO Framework** — positionnement inverse de Rank Math : configuration
automatique sensée dès l'activation, interface volontairement épurée plutôt que
dense. Onglets Réglages d'accueil et Réglages sociaux (5 sous-onglets) séparés du
reste. Aucune fonctionnalité radicalement nouvelle, mais une leçon de conception
directement applicable : **des valeurs par défaut qui marchent sans qu'on y touche**
plutôt qu'un écran dense à configurer — cohérent avec la demande déjà actée de
l'utilisateur sur les paramètres optimisés par défaut.

**MonsterInsights** — widget de tableau de bord avec de vraies données Google
Analytics (visiteurs, pages vues, sources de trafic) directement dans l'admin, sans
clic supplémentaire. Suivi automatique des soumissions de formulaire. Alertes en
temps réel sur une anomalie de trafic (pic ou chute).

**Site Kit (Google)** — tableau de bord unifiant Search Console (clics,
impressions, position moyenne par page), Analytics et PageSpeed Insights, avec des
métriques par article individuel en plus du site entier.

**Constat commun aux quatre** : le vrai différenciateur qui manque à Cogenta n'est
pas la production de métadonnées (déjà bonne) mais **la donnée de performance
elle-même** — combien de fois une page apparaît dans Google, sur quels mots-clés,
avec quel taux de clic. Rien de tout ça n'existe dans Cogenta aujourd'hui : la
vérification Search Console de la fiche 50 ne fait que poser une balise `<meta>`, elle
ne lit jamais l'API.

## 2. Ce qui existe déjà et ne doit pas être refait

- Génération JSON-LD automatique avec 8 types (`Article`, `WebPage`, `Product`,
  `Event`, `Recipe`, `FAQPage`, `Course`, `Book`) — comparable en couverture au
  générateur de schéma d'AIOSEO, juste non éditable manuellement par type.
- Panneau SEO par entrée, diagnostic, IndexNow, llms.txt, robots.txt personnalisé,
  vérification Google/Bing par balise meta (fiches 13 et 50).
- `assist.find_duplicates` (détection de contenu dupliqué, R2-pur, hors périmètre IA).

## 3. Écarts, classés

### Importants

1. **Aucune donnée de performance réelle dans l'admin** — pas de clics, pas
   d'impressions, pas de position moyenne. C'est l'écart le plus visible face aux
   quatre outils recherchés ici.
2. **Aucune analyse de contenu en temps réel** — pas de score, pas de checklist
   pendant la rédaction (fiche 13 l'avait classé « confort, à ne faire que si
   demandé » — c'est désormais demandé).
3. **Aucun assistant de maillage interne** — pas de suggestion de lien, pas de
   détection d'article orphelin.
4. **Pas de grille de fonctionnalités activables/désactivables** — chaque réglage
   SEO existe, mais il n'y a pas d'écran unique listant « ce module est actif / pas
   actif », contrairement à la demande explicite (« il y a des choses qu'on peut
   activer et désactiver »).

### Confort

5. Balisage auteur / E-E-A-T par entrée.
6. Réglages par défaut plus affirmés à l'installation (esprit The SEO Framework) —
   transverse à toute la fiche, pas une tâche à part.

## 4. Plan de développement

### Tâche 1 — Score de contenu en temps réel (TruSEO-like)

**Fichiers** : nouveau `packages/seo/src/content-analysis.ts`,
`packages/admin/src/seo/seo-panel.tsx`.

Fonction pure, zéro dépendance (R9) : reçoit le texte riche + focus keyword + titre +
description, rend une liste de contrôles booléens (mot-clé dans le titre, dans la
meta description, dans la première phrase, longueur de phrase, densité approximative,
présence de sous-titres, longueur totale) et un score global à trois niveaux
(rouge/orange/vert — jamais un chiffre précis qui prétendrait à une science exacte
qu'aucun de ces outils n'a réellement). Rendu dans le panneau SEO existant, sous
l'aperçu Google déjà là.

### Tâche 2 — Assistant de maillage interne

**Fichiers** : nouveau `packages/seo/src/link-assistant.ts`, route
`GET /api/seo/link-suggestions`, section dans l'écran Diagnostic.

Parcourt le texte riche de toutes les entrées publiées d'une collection routée,
construit un graphe de liens internes déjà posés (déjà fait implicitement par
`internalLink` du contrat A), et signale : les entrées **orphelines** (aucun lien
entrant), et pour une entrée donnée, jusqu'à cinq autres entrées de la même
collection dont le titre partage des mots avec son propre titre — candidates
plausibles, pas une recommandation IA. Un bouton « proposer via l'IA » en complément
optionnel (R2 : le calcul de base ne dépend de rien).

### Tâche 3 — Grille de fonctionnalités

**Fichiers** : `packages/admin/src/routes/seo.tsx`, nouvel onglet ou section en tête
d'écran.

Une grille de cartes, une par sous-fonctionnalité (IndexNow, llms.txt, vérification
Search Console, éditeur robots.txt personnalisé, score de contenu, assistant de
maillage), chacune avec son interrupteur et une phrase expliquant ce qu'elle fait —
même sans fournisseur IA, tout reste listé (grisé si dépendant d'un réglage absent,
jamais caché).

### Tâche 4 — Connecteur Search Console optionnel (ADR-0032)

**Fichiers** : nouveau `packages/seo/src/search-console.ts` (client `fetch`-only,
sans SDK Google — R9), `packages/api/src/rest/seo-router.ts` (routes OAuth
callback + lecture des métriques), section « Performance réelle » dans l'écran
Diagnostic.

Flux OAuth désactivé par défaut ; une fois activé par site, jeton stocké chiffré
au repos (même mécanisme que les clés de fournisseur LLM, AES-256-GCM, clé dérivée
de `COGENTA_AUTH_SIGNING_KEY`), jamais transmis en clair à l'admin après l'échange
initial. Lecture seule : clics/impressions/position moyenne par page des 28
derniers jours, rapatriés à la demande (pas de tâche planifiée qui interrogerait
l'API en continu). Sans connecteur configuré, la section est absente — jamais
vide ni en erreur (R1/R2), exactement comme `GET /api/assistant` répond
`{available:false}`.

**Ordre d'implémentation** : cette tâche vient en dernier, après les tâches 1-3 —
les trois autres tâches doivent être livrées et fonctionner intégralement d'abord,
puisque c'est la condition posée par l'utilisateur en acceptant l'ADR
(« même sans l'activer la fonctionnalité doit être excellente »).

## 5. Critères d'acceptation

- Le score de contenu change en direct pendant la frappe, sans appel réseau bloquant.
- Un article sans aucun lien entrant apparaît dans la liste des orphelins.
- La grille de fonctionnalités reflète l'état réel de chaque réglage — activer une
  carte doit changer exactement le même réglage que l'écran d'origine, jamais un
  doublon.
- Sans fournisseur IA, tout fonctionne (R2) sauf le bouton optionnel de suggestion
  de lien.
- Aucun contrat figé modifié sans ADR.

## 6. Tests exigés

- Unitaires : le score de contenu détecte l'absence du mot-clé dans le titre, dans
  la description, une phrase trop longue.
- Unitaires : un article sans lien entrant est détecté orphelin ; un lien ajouté le
  retire de la liste.
- Bout en bout : activer/désactiver une carte de la grille change le réglage
  correspondant et se reflète après rechargement.
- Permissions : `GET /api/seo/link-suggestions` suit `update` sur la collection
  (jamais `admin`, un éditeur doit pouvoir l'utiliser sur ce qu'il édite).

## 7. Pièges connus

- **Le score n'est pas une vérité scientifique.** Trois niveaux, jamais un
  pourcentage à la décimale près — un faux sentiment de précision est pire qu'une
  absence de score.
- **L'assistant de maillage ne doit jamais écrire dans le texte riche sans clic** —
  suggestion affichée, jamais appliquée automatiquement (R6).
- **La tâche 4 ne se code pas sans trancher la question OAuth d'abord** — c'est le
  seul point bloquant de toute la fiche.

## 8. Décision actée

Tranchée avec l'utilisateur le 2026-08-28 : option (b), connecteur OAuth optionnel
vers Search Console, désactivé par défaut — voir ADR-0032 (rédigée, remise à
l'humain pour insertion dans `docs/03-decisions.md`, protégé en écriture par un
hook). Plus une question ouverte pour cette fiche : la tâche 4 est la dernière à
implémenter, seulement après que les tâches 1-3 tournent intégralement sans elle.
