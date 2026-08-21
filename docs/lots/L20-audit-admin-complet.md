# L20 — Audit complet de l'admin et plan d'amélioration

> **Statut : audit terminé, pas encore un lot planifié.** Ce document est le
> résultat d'une revue exhaustive demandée par l'utilisateur, une fois les 38
> fiches admin fusionnées : « analyse chaque page, chaque onglet, chaque
> sous-page — quelles fonctionnalités manquent pour que ce soit complet ?
> qu'est-ce qu'on améliore ? qu'est-ce qu'on ajoute ? est-ce au niveau des
> CMS les plus populaires du marché ? ». Il joue le même rôle que
> `L10-cms-complet.md` en son temps : un audit qui doit se traduire en lots
> concrets, pas un lot en lui-même. La suite logique — L11 (design system,
> déjà réservé) et de nouveaux lots à numéroter — reste à trancher par
> l'humain.

## Méthode

Onze audits menés en parallèle, chacun combinant **navigation réelle** dans
un site de test (`examples/local-playground`, blueprint « blog », scaffoldé
avec le code du dépôt — jamais les paquets npm publiés, périmés) et
**lecture du code source** des écrans concernés, avec comparaison nommée aux
CMS de référence (WordPress, Strapi, Drupal, Ghost, WooCommerce/Shopify pour
le commerce). Chaque écran, sous-écran et onglet des 40+ routes admin a été
couvert, plus le rendu public et le serveur MCP.

Chaque constat porte une étiquette — `[BUG]` (dysfonctionnement réel
observé), `[MANQUE-PARITÉ]` (fonctionnalité qu'un concurrent a et que
Cogenta n'a pas), `[AMÉLIORATION]` (ergonomie/clarté), `[IDÉE]` (nouvelle
capacité) — et une priorité (Critique/Élevé/Moyen/Faible).

## Résumé exécutif

Le socle est **solide et souvent en avance** sur des points structurels que
peu de concurrents ont (aperçu de page builder sur le vrai rendu serveur,
export CSV/JSON systématique, journal d'audit à intégrité vérifiable,
passkeys, workflow éditorial natif, simulateurs taxe/livraison qui appellent
le même résolveur que la vraie commande, facturation PDF sans dépendance).
Mais l'audit a trouvé **6 bugs réels reproductibles** — dont un crash pur et
simple de l'éditeur d'entrée — et un écart de finition visuelle net sur les
écrans les plus récents (formulaires, page de recherche publique, fil de
commentaires public), ainsi qu'un constat sévère sur le MCP : **le paquet
existe, est testé, et n'est branché nulle part** — priorité explicite de
l'utilisateur.

---

## 1. Bugs réels à corriger — liste unique, dédupliquée, par priorité

### Critique

1. **Crash de l'éditeur d'entrée en basculant Formulaire ↔ Composition
   visuelle**, reproductible à 100 %. `packages/admin/src/fields/link-target-field.tsx:34` —
   `'collection' in value` plante quand `value === undefined` (le code ne
   garde que contre `null`). Correctif d'une ligne (`value != null` ou test
   explicite des deux cas). Écran cœur du produit, inutilisable dans cet état
   dès qu'une collection a des blocs et un champ lien.
2. **Recherche publique (`/search`) ne renvoie jamais aucun résultat** pour
   du contenu semé par un blueprint (`seedDemoContent` écrit directement en
   base, en contournant le chemin `ContentStore` que `withSearchIndexing`
   décore — l'index reste vide). Un site fraîchement installé via
   `npm create cogenta` avec le blueprint blog a une recherche cassée dès le
   premier jour.
3. **Graphique « Vues par jour » (Analytics) illisible** sur tout site
   neuf/petit — un seul point de données produit un unique rectangle plein
   sans axes. Cause identifiée : `barWidth` calculé sur `data.length` sans
   garantir un créneau par jour de la période choisie (avec des zéros pour
   les jours sans vue). Première impression très négative pour un nouvel
   utilisateur.

### Élevé

4. **Onglet « Interroger le site » (Assistant) totalement vide** — aucun
   message, aucun formulaire, alors que le reste de l'écran gère très
   proprement le cas « pas de fournisseur configuré ».
5. **Écran Agents affiche une erreur brute** (`No route matches this path.`)
   sous la bannière honnête « aucun agent ne tourne » — `GET /api/agents`
   répond 404 (aucun `AgentRegistry` n'est jamais construit côté serveur) et
   le composant affiche l'erreur telle quelle au lieu de la masquer/traduire.
6. **Tâches planifiées (`/admin/scheduled`) affiche un bandeau d'erreur
   permanent** (« No route matches this path. ») dès le chargement, avant
   même le contenu — une route appelée par cet écran n'existe pas côté
   serveur.
7. **Outils (`/admin/tools`) : « Purger les caches » reste bloqué à
   « queued » indéfiniment**, sans jamais passer à « terminé », malgré la
   promesse affichée d'un polling d'avancement.
8. **Page de recherche publique et page de formulaire public
   (`/search`, `/forms/{name}`) sans aucun style du thème** — les deux
   partagent une fonction `shell()` (`packages/cli/src/commands/forms-page.ts`)
   qui construit son propre HTML minimal au lieu de passer par le vrai
   gabarit `renderPage`/skin. Le CSS du thème est chargé mais ne définit
   aucune règle pour leurs classes (`cg-search__*`, `cg-form`, etc.). Visible
   par tout visiteur, dégrade fortement l'image du produit.
9. **Fil de commentaires public entièrement non stylé** en bas de chaque
   article — même famille de cause que le point 8, feuille de style du skin
   jamais conçue pour ce balisage.
10. **Page builder : l'aperçu « Ordinateur » déborde de sa colonne**,
    scrollbar horizontale interne dès le premier essai sur un écran de
    largeur normale — l'iframe est bien redimensionnée en pixels CSS réels
    mais rien ne la fait tenir dans le conteneur disponible (un
    `transform: scale()` proportionnel réglerait ça).
11. **Création de produit (Boutique) : aucun feedback de succès** — le modal
    se vide silencieusement après soumission, sans fermeture ni message ;
    le produit est bien créé côté serveur mais l'utilisateur croira à un
    échec et recréera en double.

### Moyen / Faible

12. Santé (`/admin/health`) : descriptions de pilotes codées en dur en
    anglais au milieu d'un écran traduit en français.
13. Corbeille : colonne « Supprimée par » affiche un UUID brut au lieu d'un
    nom/e-mail (seul écran concerné — audit, versions, etc. résolvent
    correctement l'acteur).
14. Journal d'audit : colonne « Acteur » affiche aussi un UUID brut ; dates
    en ISO brut non localisées.
15. Badge de la barre latérale (commentaires, corbeille) qui ne se
    rafraîchit pas immédiatement après une action dans la même session
    (`ChromeStatus` récupéré une fois par session).
16. Deux accordéons vides sans message de repli dans l'éditeur d'entrée
    (« Assistant », « Traductions ») quand la fonctionnalité sous-jacente
    est inactive — lit comme cassé plutôt que comme non applicable.
17. Menus : la langue sélectionnée à la création ne correspond pas à celle
    du menu créé (à confirmer, observé une fois).
18. Champ « Identifiant »/« Nom » qui ne se pré-remplit pas automatiquement
    depuis le titre/libellé sur Produits et Formulaires (les collections et
    menus le font).

---

## 2. Le MCP — priorité explicite de l'utilisateur

**Constat central : le serveur MCP (`packages/mcp`) existe, compile, passe
ses tests — et n'est branché nulle part.** Aucune commande CLI ne l'invoque
(`cogenta mcp` n'existe pas), `cogenta serve` ne le monte pas. Un
utilisateur ne peut littéralement pas démarrer de serveur MCP pour son site
aujourd'hui. Le raccordement lui-même est trivial : `buildManifest`
(`@cogenta/agents`) construit déjà le `ExecutableTool[]` nécessaire, il
suffit de l'appeler dans une commande `cogenta mcp`. Symétriquement, le
**client** MCP n'est référencé nulle part dans le runtime d'agents, alors
que `docs/02-architecture.md` §4.2 nomme les serveurs MCP externes comme
« troisième source d'outils ».

État par capacité :

| Capacité | État |
|---|---|
| Transport | stdio uniquement (serveur et client). Aucun HTTP/SSE streamable — impossible d'être un MCP distant. |
| Tools | seule primitive implémentée, correcte dans son fonctionnement, mais la liste effective exposée est vide de facto (rien n'appelle `createMcpServer`). |
| Resources | absentes — contenu/médias/schéma non adressables par URI. |
| Prompts | absents — aucun prompt réutilisable prédéfini. |
| Sampling / notifications de progression / pagination | absents. |
| Authentification | absente à ce niveau — aucun `AccessContext` ne traverse `McpServer.handle`, donc R4 est structurellement inapplicable dès qu'un transport réseau existera. |
| Découvrabilité | nulle — aucun README, aucune section doc, aucun moyen simple de connecter Claude Desktop/Claude Code/Cursor. |
| Admin | aucun écran de gestion des connexions/jetons/journal des appels MCP. |

### Plan d'action MCP, priorisé

**Critique**
1. Câbler `cogenta mcp` comme vraie commande CLI (`buildManifest` +
   `createMcpServer` + `serveMcpOverStdio` sur les vrais flux). Correctif
   du vrai bug, quelques heures, zéro nouvelle capacité requise.
2. Faire traverser un `AccessContext` réel à travers `McpServer.handle` —
   sans ça R4 reste inapplicable ; le manifeste exposé doit être scopé au
   rôle de qui a lancé la commande.
3. Documenter et exposer la connexion — README dans `packages/mcp`, section
   dans `docs/getting-started.md`, `cogenta mcp --print-config` générant le
   JSON à coller dans `claude_desktop_config.json`.

**Élevé**
4. Resources MCP pour le contenu publié, les médias et le schéma de
   collections (`cogenta://collections/{name}/{id}`).
5. Transport HTTP streamable, pour qu'un site hébergé devienne un vrai MCP
   distant — n'a de sens qu'après l'authentification du point 2.
6. Écran admin « Connexions MCP » — jetons, clients autorisés, journal des
   appels, activation par outil (réutilise le vocabulaire des clés API,
   fiche 20).
7. Câbler le client MCP dans le runtime d'agents, avec les mêmes
   garde-fous R4/R7 qu'un outil interne.

**Moyen**
8. Prompts MCP prédéfinis pour les flux éditoriaux courants (réutilisent
   les outils `assist.*` déjà écrits).
9. Réponses structurées (pas seulement du texte brut).
10. Pagination sur `tools/list`.

**Faible**
11. Notifications de progression pour les outils longs. 12. Sampling.

---

## 3. Par domaine — bilan détaillé

### 3.1 Cœur éditorial (Tableau de bord, Collections, Éditeur d'entrée)

Au-delà du crash listé en §1 : l'historique de versions avec diff est
**au-dessus** du niveau WordPress core (pas de diff visuel sans plugin) et
comparable à Strapi Enterprise — à préserver. Manques de parité : pas de
Quick Edit sur la liste de collections (WordPress l'a depuis toujours), pas
de filtre par taxonomie/relation dans la liste, **aucun panneau SEO par
entrée** dans l'éditeur (seulement une page SEO globale — Yoast/RankMath et
le plugin SEO Strapi l'ont tous deux directement dans l'écran d'édition avec
aperçu SERP), labels de champs bruts non humanisés (`title`, `slug` plutôt
que « Titre », « Identifiant »), préférence de mode formulaire/visuel
stockée globalement plutôt que par collection (a directement causé le crash
du point 1).

### 3.2 Organisation du contenu (Médiathèque, Menus, Taxonomies, Corbeille, Traductions, Recherche)

**Médiathèque** : manque le plus visible du cluster — aucune recherche,
aucun filtre par type, aucune action de masse, pas de glisser-déposer pour
l'upload, aucune indication d'usage avant suppression. Bloquant dès qu'un
site dépasse ~20 médias. Point positif : discipline alt-text obligatoire
au-dessus du défaut WordPress.

**Menus** : réorganisation par boutons ↑↓, **pas de glisser-déposer** —
incohérence interne notable puisque le page builder et l'arbre de
taxonomies, eux, l'ont (doublé de contrôles clavier). Aperçu live et
duplication cross-langue en revanche absents de WordPress natif.

**Taxonomies** : le code est en réalité riche (arbre glisser-déposer +
clavier, recherche, cascade, compteurs d'usage) — bien au-delà de ce que
CLAUDE.md décrit comme « volontairement brut ». Le vrai problème est un
défaut de **dogfooding** : aucun blueprint (`blank`, `blog`) n'utilise
`defineTaxonomy()` — le blueprint blog gère catégories/tags via de simples
`f.relation()`. Sur un site fraîchement scaffoldé, l'écran affiche « ce
site ne déclare aucune taxonomie » alors que la fonctionnalité est solide.
Migrer le blueprint blog vers `defineTaxonomy()` la rendrait enfin visible.

**Corbeille** : au niveau ou au-dessus de WordPress (horodatage du balayage,
purge affichée par ligne) hormis le bug de résolution d'acteur (§1.13).

**Recherche publique** : cf. bug §1.2 et §1.8.

### 3.3 Engagement & workflow éditorial (Commentaires, Formulaires, Soumissions, Relecture)

**Formulaires** : le constat le plus sévère de tout l'audit sur la
*maturité visuelle* — pas un vrai constructeur glisser-déposer avec aperçu
en direct comme WPForms/Typeform/Gravity Forms, mais un formulaire
générique auto-généré depuis le schéma JSON, labels bruts non traduits
(« name », « kind », « help »), sélecteur de type de champ sans icônes.
Fonctionnellement complet (le flux de bout en bout marche, vérifié
end-to-end), mais des années en retard visuellement sur le reste de
l'admin qui a un vrai design system.

**Soumissions** : solide, flux RGPD conforme, mais pas de vue détail dédiée
par soumission (tout en accordéon), pas de notes internes.

**Relecture** : vraie avance sur Strapi (aucun workflow éditorial natif) et
proche d'un plugin PublishPress — mais nativement intégré. Mérite d'être
mis en avant plutôt que caché derrière une condition d'activation par
collection.

### 3.4 Apparence & publication (Apparence, Page builder, Redirections, SEO, Marketplace)

**SEO** : c'est un **diagnostic en lecture seule**, jamais un panneau de
réglages — écart majeur avec Yoast/Rank Math (aucun gabarit de titre par
défaut, pas d'image OG par défaut, pas de type Schema.org par collection,
pas d'aperçu SERP). Le plus gros écart de parité de tout ce cluster.

**Marketplace** : infrastructure solide (permissions en langage clair,
signature Ed25519, révocation — L7) mais **catalogue « Découvrir » vide** —
l'équivalent d'un WordPress.org sans un seul plugin dedans. Sans contenu
réel, l'écran ne peut pas être évalué en usage.

**Redirections** : pas d'import/export en masse, pas de lien avec les 404
réelles du site (`NotFoundLog` existe côté serveur, jamais relié à cet
écran pour suggérer une redirection).

### 3.5 Boutique (e-commerce complet)

Deux vraies avances sur la concurrence directe : facturation PDF
séquentielle (Shopify ne l'a pas nativement) et simulateurs taxe/livraison
qui appellent le même résolveur que la vraie commande (aucun concurrent ne
l'offre). Mais trois vrais trous : **paiement limité à Stripe + virement**
(WooCommerce en propose des dizaines, Shopify a des wallets natifs — le
plus gros manque de toute la boutique) ; **paniers abandonnés** à moitié
construits (le statut existe en base, aucun écran ni email de relance) ;
remboursement volontairement limité au montant total (documenté comme choix
MVP, pas un oubli).

### 3.6 Comptes & accès

Le profil utilisateur est le meilleur écran du cluster, souvent au-dessus
de la concurrence (passkeys, langue par utilisateur, journal d'activité
personnel). Deux vrais manques : clés API dont la portée est un **rôle
entier**, pas des permissions fines par collection/action (Strapi et GitHub
le font) ; écran Rôles en lecture seule diagnostique, aucune édition
possible depuis l'admin (les permissions vivent uniquement dans le schéma
comme code — cohérent avec l'architecture, mais un vrai manque pour un
non-développeur en production).

### 3.7 Opérations & maintenance

Cluster avec le plus de bugs de robustesse (§1.5, 1.6, 1.7, 1.12). Points
positifs réels : Audit dépasse la concurrence sur l'export double
CSV/JSON et la vérification d'intégrité de chaîne en un clic ; Analytics a
un argument RGPD réellement différenciant (zéro cookie, zéro IP stockée)
une fois le bug du graphique corrigé.

### 3.8 IA & agentique — le différenciateur central du produit

Verdict : la promesse « un site qui s'exploite lui-même : il se surveille,
se patche, s'optimise » **n'est pas tenue** au sens strict — aucun
`AgentRegistry` vivant n'existe nulle part dans le dépôt, ce que l'écran
Agents dit lui-même honnêtement (une fois le bug §1.5 corrigé). Ce qui
tourne aujourd'hui, ce sont des outils IA à la demande (assistant, plan de
site), pas des agents opérant seuls dans le temps. C'est un choix honnête et
documenté, pas un mensonge marketing — mais l'écart avec la vision reste
entier. Aucun concurrent (WordPress, Strapi, Drupal, Ghost, Contentful,
Sanity) n'a d'équivalent à un seul des trois écrans (Assistant/Agents/Plan
de site), donc Cogenta est seul sur ce terrain malgré l'exécution inégale.
Le Plan de site (L19) est le plus abouti des trois et devrait servir de
modèle de gestion d'état vide aux deux autres écrans.

### 3.9 Rendu public & thème canonique

`<head>` d'article réellement complet (OG, Twitter Card, JSON-LD) mais
JSON-LD `BlogPosting` sans `author`/`datePublished`/`image`. **Aucun flux
RSS/Atom** — standard WordPress/Ghost par défaut, absence totale ici, sans
compromis assumé documenté. Design du thème par défaut fonctionnel et
accessible (skip-link, `prefers-reduced-motion`, `prefers-color-scheme`)
mais visuellement générique face aux thèmes par défaut de WordPress/Ghost.

### 3.10 Paramètres (réglages éditoriaux du site)

Onglet Médias le plus pauvre — largeurs de variantes WebP codées en dur,
même pas affichées en lecture. Changement de langue par défaut du site
possible seulement en éditant `cogenta.config.mjs`, pas depuis l'UI.

---

## 4. Proposition de regroupement en lots

Cette section propose un découpage exploitable — à confirmer/renuméroter
par l'humain, pas une décision actée.

- **Lot immédiat — corrections critiques** : les 11 bugs du §1 Critique/Élevé.
  Petit périmètre, gain de confiance immédiat, aucun ne touche un contrat
  figé.
- **L11 — Design system unifié** (déjà réservé) : absorbe le manque de
  finition visuelle des écrans les plus récents (formulaires, page de
  recherche/formulaire publique, fil de commentaires public) — le vrai fil
  conducteur derrière plusieurs constats §3.3/§3.9 est que ces écrans n'ont
  jamais reçu de passe de style cohérente avec le reste de l'admin/thème.
- **Nouveau lot — MCP natif complet** : le plan détaillé du §2, à isoler
  vu la priorité explicite de l'utilisateur et l'ampleur du chantier
  (câblage CLI, auth, resources, transport HTTP, écran admin).
- **L17 — Marketplace** (déjà réservé) : le volet manquant est du contenu
  (catalogue réel), pas de l'infrastructure — confirmé par cet audit.
- **Nouveau lot — Panel SEO par entrée + réglages SEO globaux** : comble
  l'écart le plus net identifié en §3.4, réutilise `@cogenta/seo` existant.
- **Nouveau lot — Médiathèque niveau CMS moderne** : recherche, filtres,
  actions de masse, glisser-déposer, indication d'usage avant suppression.
- **Nouveau lot — Boutique : paiement élargi + paniers abandonnés** :
  deuxième driver de paiement grand public, écran + relance email pour les
  paniers abandonnés déjà stockés en base.
- **Nouveau lot — Dogfooding taxonomies** : migrer le blueprint blog vers
  `defineTaxonomy()` pour rendre visible une fonctionnalité déjà solide.

## 5. Ce qui est déjà au niveau ou au-dessus de la concurrence

À ne pas perdre de vue en priorisant les corrections — ces points sont de
vrais différenciateurs déjà en place : workflow éditorial natif, historique
de versions avec diff, passkeys, journal d'audit à intégrité vérifiable et
double export, simulateurs taxe/livraison sans divergence possible avec la
vraie commande, facturation PDF sans dépendance, analytics sans cookies,
page builder sur le vrai rendu serveur (jamais une réimplémentation
divergente), et — une fois le plan du §2 exécuté — un MCP natif qu'aucun
concurrent CMS n'offre à ce niveau.
