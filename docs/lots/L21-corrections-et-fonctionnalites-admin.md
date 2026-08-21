# L21 — Corrections et fonctionnalités demandées après le reskin Nightops

> **Statut : lot en cours.** Liste de corrections et de fonctionnalités
> demandées directement par l'utilisateur après avoir testé le reskin
> « Nightops » (L20 + thème). Contrairement à L20, ce n'est pas un audit :
> chaque point ci-dessous est une instruction directe, déjà scopée contre le
> code réel (recherche menée avant rédaction — chaque tâche cite les fichiers
> exacts et le comportement actuel).

## Déjà fait, hors lot (corrigé avant ce document)

- **Bug modal introuvable/infermable** — `packages/admin/src/ui/modal.tsx` :
  `Dialog.Content` était positionné en `fixed top-1/2 left-1/2` sans jamais
  être retranslaté de la moitié de sa propre taille, donc le **coin
  supérieur-gauche** de la modale atterrissait au centre de l'écran au lieu
  d'être centrée — poussant la croix de fermeture hors champ en bas à
  droite, sur *toute* modale de l'admin. Corrigé (`-translate-x-1/2
  -translate-y-1/2`), vérifié en direct (création d'utilisateur), commité.

## Méthode

Chaque tâche a été vérifiée contre le code avant d'être écrite ici — jamais
une supposition. Là où l'instruction de l'utilisateur toucherait un contrat
figé (A/B/C/D) ou une décision actée, une alternative sans ADR est proposée
et signalée explicitement.

---

## Tâche 1 — Menu principal du site + renommage « Plan du site »

**Menu principal.** La fonctionnalité existe déjà : chaque menu porte un
champ `location` (texte libre avec suggestions `primary`/`footer`,
`packages/admin/src/routes/menus.tsx:40,413-431`), et le rendu public
(`packages/cli/src/commands/theme-render.ts:250-252,426-473`) résout déjà le
menu d'en-tête via `GET /api/menus/by-location/primary` et celui de pied de
page via `.../footer`. **Le vrai manque est l'ergonomie** : un champ texte
libre avec un indice ne dit pas clairement « ce menu est celui qui s'affiche
sur le site ». Remplacer par un contrôle explicite (select à choix fermés
`Aucun / En-tête (principal) / Pied de page`, ou un badge « Menu principal
actuel » + bouton « Utiliser comme menu principal » qui écrit `location:
'primary'` et déplace l'ancien menu `primary` sur `location: null` si un
seul menu principal doit exister à la fois — à trancher par l'agent selon ce
qui reste le plus simple à comprendre). Aucun changement de schéma requis.

**Renommage « Plan du site ».** Confirmé : `/site-plan` (`SitePlanRoute`,
`packages/admin/src/routes/site-plan.tsx`) est l'assistant IA de création de
site de L19 (téléverser un cahier des charges → proposition de collections/
pages/design → validation élément par élément) — **pas** un sitemap. Le nom
prête à confusion avec la page SEO qui parle justement de sitemap XML.
Renommer le libellé de navigation et la clé i18n (`app-shell.tsx:55`,
`app.tsx:136` et le fichier de traduction associé) en quelque chose de sans
ambiguïté, p. ex. **« Créer un site »** ou **« Assistant de création »**.
Choisir un nom qui ne collisionne pas avec le sous-menu IA « Assistant »
(qui est le chat). Aucun changement fonctionnel — uniquement le libellé, et
le chemin de route si le renommer aussi améliore la clarté (`/site-plan` →
`/create-site` par exemple, avec redirection de l'ancien chemin).

**Fichiers** : `packages/admin/src/routes/menus.tsx`, `app-shell.tsx`,
`app.tsx`, fichiers i18n de l'admin.

---

## Tâche 2 — Système de templates pour l'admin, avec personnalisation

**Ce qui existe déjà et n'a pas besoin d'être refait** : la page Apparence
(`packages/admin/src/routes/appearance.tsx`, 720 lignes) est **déjà** un
sélecteur + personnalisateur complet de thème pour le **site public** —
éditeur de tokens généré depuis `TOKEN_SPECS`/`TOKEN_GROUPS` (contrat D),
galerie de skins avec bouton « Appliquer », génération de skins par IA,
upload de logo/logo sombre/favicon/image de partage via `MediaPicker`,
aperçu live en iframe, export vers fichier. **Ne pas dupliquer ceci.**

**Ce qui manque réellement** : l'**admin lui-même** n'a aucun concept de
template. `theme.css`/`base.css`/`shell.css` sont un thème unique codé en
dur (« Nightops » depuis cette session) — zéro sélecteur, zéro
personnalisation, zéro mécanisme d'application au runtime. C'est une vraie
lacune, sans précédent à réutiliser dans le code existant.

**À construire** :
1. Un mécanisme de **surcharge des tokens CSS de l'admin au runtime** —
   miroir de ce qui existe déjà côté site (contrat D) mais pour
   `packages/admin/src/styles/theme.css`. Concrètement : un enregistrement
   de configuration (nouvelle table/section, p. ex. `admin_theme` dans
   `@cogenta/core`, réservée à un rôle admin) qui stocke le template choisi
   + les surcharges de tokens (couleurs, polices, logo, rayon...), injecté
   au chargement de l'admin sous forme de `<style>` avec des `--color-*`
   etc. qui gagnent en cascade sur les valeurs de `theme.css`.
2. **Au moins deux templates intégrés** au choix : le « Nightops » actuel
   (sombre-par-défaut, vert vif) et un second — réutiliser l'ancien
   `theme.css` d'avant ce reskin (encore dans l'historique git,
   commit précédent le reskin Nightops — `git log -p -- packages/admin/src/styles/theme.css`
   pour le retrouver) comme second template nommé, p. ex. « Atelier » (chaud,
   clair, papier). Un template = un jeu de tokens de départ ; personnaliser
   ne doit **jamais** modifier le template intégré lui-même, seulement la
   surcharge active du site.
3. **Écran de réglage** (nouvel onglet sous Réglages, ou nouvelle section
   « Apparence de l'admin » distincte de la page Apparence existante — à
   ne pas fusionner, ce sont deux surfaces différentes : l'une pour le site
   visité par le public, l'autre pour l'admin que l'équipe utilise) :
   galerie des templates admin, sélection, puis formulaire de
   personnalisation (couleurs primaire/fond/texte, police d'affichage,
   police de texte, logo admin, rayon des coins — même liste de leviers que
   `TOKEN_SPECS` là où c'est pertinent, pour rester cohérent avec le
   vocabulaire déjà utilisé côté site).

**Portée volontairement limitée** : ne pas construire un moteur de plugin de
thèmes tiers pour l'admin (c'est un chantier séparé, hors demande) — deux
templates intégrés + personnalisation de tokens suffit à répondre à la
demande.

**Fichiers** : nouveau store de config dans `@cogenta/core`, nouvel écran
admin, `packages/admin/src/styles/theme.css` (garder comme *defaults*, ne
pas le committer modifié par une personnalisation — la surcharge est
runtime, pas un fichier réécrit).

---

## Tâche 3 — Fusionner SEO + Redirections, rendre le sitemap paramétrable

**État actuel** : `packages/admin/src/routes/seo.tsx` (286 lignes) est
**volontairement en lecture seule** aujourd'hui (diagnostics : comptage
d'URLs du sitemap par collection, aperçu robots.txt, rapports
description-manquante/titre-trop-long/titre-dupliqué) — un commentaire dans
le fichier l'assume explicitement. `redirects.tsx` (379 lignes, route
`/redirects`) est un écran CRUD complet et déjà solide (L20).

**Décision de conception pour ce lot** : le choix « lecture seule » de
`seo.tsx` n'est **pas** une ADR actée dans `docs/03-decisions.md` — c'est un
jugement de scope d'un lot précédent, qu'on peut réviser. Le rendre
éditable ne contredit rien : les réglages SEO (gabarits de titre, inclusion
sitemap par collection, priorité/fréquence, réglages sociaux par défaut)
sont du **réglage éditorial de site**, exactement comme l'écran Paramètres
existant (`packages/admin/src/routes/settings.tsx`, onglets
Général/Lecture/Discussion/Médias/Confidentialité/Avancé, déjà persistés en
base) — pas du schéma figé par ADR-0010. Réutiliser ce même patron de
store, pas en inventer un nouveau.

**À construire** :
1. Regrouper **SEO** et **Redirections** en une seule section de navigation
   avec des onglets internes (comme fait déjà `settings.tsx`) :
   `Général` (gabarits de titre/meta par type de contenu), `Sitemap`
   (inclusion/exclusion par collection, priorité, fréquence de
   changement — vérifier d'abord ce que `@cogenta/seo` sait déjà générer
   avant d'ajouter un champ que rien ne consomme), `Réseaux sociaux`
   (Open Graph/Twitter Card par défaut), `Redirections` (l'écran actuel,
   déplacé tel quel sous cet onglet), `Diagnostic` (les rapports en
   lecture seule qui existent déjà).
2. S'inspirer du vocabulaire des plugins SEO WordPress les plus utilisés
   (Yoast SEO, Rank Math) pour les libellés et les regroupements — pas leur
   code, juste la structure de réglages qui a fait ses preuves.
3. Retirer les deux entrées de navigation séparées « SEO » et
   « Redirections », remplacées par une seule entrée « SEO ».

**Fichiers** : `packages/admin/src/routes/seo.tsx`, `redirects.tsx`
(fusion), `packages/seo` (vérifier le schéma de config existant avant
d'ajouter des champs), navigation (`app-shell.tsx`).

---

## Tâche 4 — Configuration réelle des agents IA

**État actuel** : `packages/admin/src/routes/agents.tsx` (242 lignes)
n'expose que l'activation/désactivation, `autonomy.default` et
`budget.tokensPerDay`/l'usage, tous deux en lecture seule. Rappel du
contexte du projet (déjà noté ailleurs) : **aucun `AgentRegistry` vivant
n'existe dans ce dépôt** — activer un agent ne le fait pas tourner. Ce
constat R2/R6 reste vrai et ne doit **pas** être contredit par cette tâche :
n'exposer que des réglages qui correspondent à un champ **réellement
modélisé côté backend** (`@cogenta/agents-builtin` / `@cogenta/agents`) —
jamais un contrôle qui n'aurait aucun effet réel (ce serait mentir à
l'utilisateur, exactement ce que R6 interdit).

**À construire** : avant tout, lire `@cogenta/agents-builtin` et
`@cogenta/agents` pour établir la liste exacte des champs qu'un agent
modélise déjà (permissions/outils autorisés, planification, budget,
persona/instructions) mais que l'UI ne montre pas encore. Exposer
**seulement ceux-là** en édition : permissions/outils (cases à cocher
contre la vraie taxonomie de permissions du contrat C), planification (si
un champ cron ou équivalent existe déjà dans le modèle), budget par agent
(pas seulement le total actuel). Si un champ que l'utilisateur voudrait
(« responsabilités », « systèmes ») n'a **aucune** contrepartie backend,
ne pas l'inventer — le documenter dans le rapport de fin de tâche comme
hors-portée sans un nouveau modèle de données, et laisser ça pour un futur
lot plutôt que de fabriquer un contrôle inerte.

**Fichiers** : `packages/admin/src/routes/agents.tsx`, lecture de
`packages/agents-builtin`, `packages/agents`.

---

## Tâche 5 — Éditeur riche complet par défaut, source Markdown/HTML, blocs de départ

**État actuel de l'éditeur** (`packages/admin/src/rich-text/`) : Slate avec
titres H2–H4, liste à puces, gras/italique, liens externes/internes, insertion
d'image, menu slash. **Manquent** : liste numérotée, citation, bloc de code,
tableau, et **aucune bascule source Markdown/HTML** (confirmé absent de
`toolbar.tsx`).

**État des blocs par défaut** : une collection à blocs (p. ex. `page`,
`blocks: f.blocks({required:true})`) démarre avec un tableau de blocs
**vide** à la création — aucun mécanisme de « blocs de départ » n'existe.
Un `defineCollection({ defaultBlocks })` au niveau schéma toucherait le
**contrat A figé** (`schema@2.0`) et exigerait une ADR — **à éviter pour ce
lot**. Alternative sans ADR, recommandée : pré-remplir le tableau de blocs
**côté client**, dans le flux admin « Nouvelle entrée », avant le premier
enregistrement — pure UX admin, aucun changement de schéma, et tout reste
éditable/supprimable ensuite comme n'importe quel bloc normal.

**À construire** :
1. Étendre la barre d'outils Slate : liste numérotée, citation, bloc de
   code (avec coloration syntaxique minimale ou brute, au choix — pas de
   nouvelle dépendance si évitable, R9), tableau.
2. Ajouter une **bascule de vue source** (Texte enrichi / Markdown / HTML)
   dans la barre d'outils du champ texte riche — convertir dans les deux
   sens à l'édition ; si une conversion parfaite Slate↔HTML/Markdown existe
   déjà ailleurs dans le code (chercher avant d'écrire), la réutiliser.
3. Dans le flux « Nouvelle entrée » de l'admin, pour une collection à blocs :
   pré-remplir le tableau de blocs avec un jeu de départ raisonnable (un bloc
   texte riche vide au minimum) au lieu de démarrer vide — but explicite :
   un appel MCP qui crée du contenu n'a pas à connaître chaque type de bloc
   pour produire quelque chose de correct par défaut.
4. Rendre ce jeu de blocs de départ **configurable** par l'admin (réglage
   simple, p. ex. dans Paramètres ou dans la page de configuration de
   collection si elle existe) plutôt que codé en dur.

**Fichiers** : `packages/admin/src/rich-text/*`, flux de création d'entrée
dans `packages/admin/src/routes/entry-edit.tsx` (ou équivalent « nouvelle
entrée »), `packages/blocks` (lecture seule — ne pas toucher le contrat B).

---

## Tâche 6 — Menu MCP dédié

**État actuel** : `api-keys.tsx` gère des clés génériques (préfixe + portée
de rôles) pour REST. Le MCP (`cogenta mcp`, `packages/mcp/README.md`) est
**uniquement stdio** — pas de transport HTTP, pas d'auth par jeton ;
l'acteur est résolu via `--email`/`--role` en ligne de commande. **Aucun
moyen aujourd'hui de générer un identifiant MCP depuis l'admin.**

**Voie sans nouvelle architecture, recommandée par la recherche préalable** :
1. Ajouter un support `--api-key <clé>` à `cogenta mcp` (`packages/cli/src/commands/mcp.ts`)
   qui résout l'acteur via le **même** mécanisme de portée que les clés API
   REST existantes — réutiliser le store de clés déjà en place, pas en créer
   un second.
2. Nouvel écran admin **« MCP »**, sous-menu dédié parallèle à « Agents »
   (pas fusionné avec « Clés API » générique — le contenu et l'usage sont
   différents : ici on montre aussi un extrait de configuration client prêt
   à coller). Permet de générer une clé à portée MCP (réutilise le
   composant/flux existant de `api-keys.tsx` autant que possible) et affiche
   un extrait de configuration client (commande `cogenta mcp --api-key …`,
   ou configuration JSON pour un client MCP standard) prêt à copier.

**Fichiers** : `packages/cli/src/commands/mcp.ts`, nouveau
`packages/admin/src/routes/mcp.tsx`, navigation.

---

## Tâche 7 — Section Documentation

**But** : un sous-menu « Documentation » qui explique concrètement, avec
illustrations, comment configurer et utiliser tout l'admin et le site —
pensé pour qu'un nouvel utilisateur démarre vite sans lire le code.

**Portée réaliste** (à annoncer honnêtement dans le rapport de fin de
tâche plutôt que de prétendre à une couverture littéralement exhaustive
de chaque champ de chaque écran) : une page par section principale de la
navigation (Contenu, Apparence, Boutique, IA, Comptes, Réglages), chacune
avec : un résumé de ce que fait la section, un guide de démarrage rapide
pas-à-pas, des captures ou schémas illustratifs, et — pour les 2 ou 3 flux
les plus complexes du produit (p. ex. cycle éditorial d'un contenu depuis
le brouillon jusqu'à la publication, permissions d'un plugin tiers depuis
l'installation jusqu'à la révocation) — un **schéma SVG animé fait main**
(SVG inline avec animation CSS, zéro nouvelle dépendance, R9) illustrant le
flux plutôt qu'un mur de texte.

**Branding dans la doc** : utiliser les deux logos vendorisés dans cette
tâche (voir Tâche 8) pour l'en-tête de la section Documentation.

**Fichiers** : nouveau `packages/admin/src/routes/documentation.tsx` +
contenu (Markdown rendu, ou composants React selon ce qui s'intègre le
mieux avec le reste de l'admin — regarder comment `packages/admin` rend
déjà du contenu long ailleurs, p. ex. les descriptions du marketplace,
avant de choisir), navigation.

---

## Tâche 8 — Logo, image de marque, marque blanche

**État actuel confirmé par la recherche** : **rien n'existe**. La barre de
navigation de l'admin (`app-shell.tsx:300-304`) n'affiche que du texte
(`// Cogenta`), aucune `<img>`. Le pied de page du site public
(`theme-render.ts:594`) n'affiche que le nom du site et le menu de pied de
page — aucune marque Cogenta nulle part à désactiver. Le schéma de
configuration de `@cogenta/core` n'a aucun champ `branding`/`logo`. Tout est
à construire.

**Fichiers logo déjà vendorisés** pour cette tâche :
`packages/admin/public/branding/logo-cogenta.png` (opaque, haute résolution
— **741 Ko, à ne pas servir tel quel dans un usage sidebar/topbar** : produire
une variante compressée/redimensionnée pour l'affichage courant, garder
l'original pour les usages haute résolution comme la page Documentation) et
`logo-cogenta-transparent.png` (fond transparent, mieux adapté au thème
sombre).

**À construire** :
1. Nouvelle section `branding` dans le schéma de config de `@cogenta/core` :
   `showCogentaBranding` (booléen, vrai par défaut), `customLogoMediaId`
   (référence média optionnelle — marque blanche : remplace le logo Cogenta
   par le logo du client quand renseigné).
2. **Site public** : afficher le logo (Cogenta par défaut, ou le logo
   personnalisé si `customLogoMediaId` est renseigné et
   `showCogentaBranding` est faux) dans le pied de page rendu par
   `theme-render.ts`.
3. **Admin** : afficher le logo dans `app-shell.tsx` (à côté ou à la place
   du texte `// Cogenta` — garder au moins le nom en texte pour
   l'accessibilité, cf. le lien `skip-link` déjà en place). Respecter
   `showCogentaBranding`/`customLogoMediaId` de la même façon que côté site.
4. Réglage dans l'admin (Paramètres, nouvel onglet ou section) pour
   basculer `showCogentaBranding` et téléverser un logo personnalisé
   (réutiliser `MediaPicker`, déjà utilisé par `appearance.tsx`).

**Fichiers** : `@cogenta/core` (schéma de config), `packages/admin/src/shell/app-shell.tsx`,
`packages/cli/src/commands/theme-render.ts`, écran Paramètres.

---

## Notes transverses pour les agents

- **Ne pas** toucher aux contrats A/B/C/D figés. Chaque tâche ci-dessus a
  déjà été vérifiée pour tenir sans ADR ; si en cours de route un agent
  découvre qu'une tâche exige réellement une rupture de contrat, s'arrêter
  et le signaler plutôt que de contourner (règle du mode autonomie).
- **Ne pas fabriquer de contrôle inerte** (R6) — si un réglage n'a aucun
  effet réel derrière, ne pas l'exposer.
- Tester dans le navigateur contre `examples/local-playground` avant de
  rendre compte.
- Un changeset est nécessaire pour tout paquet publié touché
  (`@cogenta/core`, `@cogenta/cli`, `@cogenta/seo` si son schéma de config
  change) — `@cogenta/admin` reste privé, sans changeset.
