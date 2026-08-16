# Blocages — L13, tranche « duplication / autosave / réinitialisation »

Ce fichier ne liste que ce qui est réellement bloqué, pas ce qui est fait.

## 1. Intégration Postgres / MySQL / MariaDB non exécutée (environnement)

**Ce qui manque** : la case « Tests d'intégration sur les trois bases » de la
définition de terminé, pour les deux surfaces de données ajoutées ici
(`ContentStore.duplicate` et `PasswordResetStore`).

**Pourquoi** : le moteur Docker de cette machine répond `500 Internal Server
Error` à tout appel d'API (`docker ps`, `docker compose ... up`), donc
`pnpm services:up` échoue avant de démarrer quoi que ce soit. Ce n'est pas
une régression du dépôt : le même constat est déjà consigné dans `CLAUDE.md`
pour l'intégration `MediaStore`.

```
unable to get image 'postgres:17-alpine': request returned 500 Internal Server
Error for API route and version .../v1.51/images/postgres:17-alpine/json
```

**Ce qui a quand même été fait** : les tests *sont écrits* et rejoués sur les
quatre dialectes par construction, pas seulement sur SQLite.

- `duplicate()` : les douze tests vivent dans la suite de contrat unique
  `packages/schema/test/store/content-store.contract.ts`, que
  `test/integration/content-store.test.ts` exécute déjà contre Postgres, MySQL
  et MariaDB.
- `PasswordResetStore` : nouvelle suite de contrat
  `packages/auth/test/resets.contract.ts`, plus un nouveau
  `packages/auth/test/integration/resets.test.ts` — c'est le **premier**
  répertoire `test/integration/` de `@cogenta/auth`, qui n'en avait aucun
  jusqu'ici alors que `vitest.integration.config.ts` en attendait un.

Les deux fichiers d'intégration sautent **bruyamment** (un `describe.skip`
nommant la variable d'environnement manquante), jamais silencieusement. Il
n'y a donc rien à écrire pour lever ce blocage : il suffit de le rejouer sur
une machine où Docker fonctionne.

```bash
pnpm services:up
pnpm -F @cogenta/schema test:integration
pnpm -F @cogenta/auth   test:integration
```

Le point le plus sensible à vérifier là-bas est l'unicité d'usage du jeton de
réinitialisation : elle repose sur `update ... where used_at is null` et sur
la valeur de `rowsAffected`, et MySQL a historiquement sa propre définition de
« ligne affectée ».

## 2. Ce qui n'est **pas** un blocage, et pourquoi

- **Taxonomies et corbeille** : non codées, délibérément. Elles dépendent de
  l'ADR proposée dans `ADR-DRAFT-contrat-A-v2.md`, qui n'est pas actée — le
  contrat A reste figé en `schema@1.0`. Rien à débloquer côté code tant qu'un
  humain n'a pas tranché.
- **Absence de transport SMTP réel** : `cogenta users reset-password` écrit un
  vrai message dans `.cogenta/mail` via le transport fichier de
  `@cogenta/channels`, et le dit explicitement dans sa sortie. C'est un manque
  déjà documenté dans `packages/channels/src/providers/email/transport.ts`, pas
  un blocage introduit ici.
- **Absence de route admin de réinitialisation** : le lot L13 demande
  explicitement « CLI d'abord, puis admin une fois L11 avancé ». Le message
  envoyé porte donc le jeton et la commande exacte, jamais un lien qui
  renverrait un 404 aujourd'hui.

---

# BLOCKERS — L12 (thème public)

Ce qui a été rencontré pendant L12 et qui **ne peut pas être décidé par un agent** :
une montée de contrat figé, une RFC de vocabulaire, ou un accès que je n'ai pas.
Rien ici n'est « pas eu le temps » — c'est écrit tâche par tâche, avec ce qu'il
faudrait exactement pour débloquer.

---

## 1. [CONTRAT D] Le mode sombre suppose une skin claire

**Où** : `packages/theme-canonical/src/styles/tokens.css`, section « Colour ».

**Le fait** : contract D (`theme@1.0`) fige **sept** couleurs — `bg`, `fg`,
`accent`, `accentFg`, `muted`, `mutedFg`, `border` — et refuse toute skin qui en
ajoute une. Une palette sombre doit donc être *dérivée* de ces sept. La dérivation
écrite ici prend le `fg` de la skin comme source de la surface sombre et son
`accent` comme source de l'encre et des lignes. Elle est correcte, testée en
contraste AA dans les deux schémas (`test/design-system.test.ts`, quatorze paires),
et vérifiée dans un vrai navigateur.

**La limite** : elle suppose une skin **claire d'abord** (`bg` plus clair que
`fg`), ce qu'utilisent la skin par défaut et les neuf blueprints. Une skin déjà
sombre (fond foncé, texte clair) verrait son « mode sombre » rendre un fond clair,
puisque CSS ne peut pas brancher sur la luminance d'une valeur de token.

**Ce qu'il faudrait** : un second groupe de couleurs dans le contrat D (par
exemple `colorDark`, optionnel, avec repli sur la dérivation actuelle quand il est
absent) — donc une montée `theme@2.0` et une ADR. Ce n'est pas contournable côté
thème : le thème n'a aucun moyen de connaître la luminance d'un token.

**En attendant** : la limite est documentée dans le commentaire de `tokens.css` et
le rendu est correct pour toutes les skins réellement livrées.

---

## 2. [CONTRAT B] Les nouveaux blocs de la tâche 3 sont un changement de vocabulaire

**Ce que demande le lot (tâche 3)** : navigation/header riche (méga-menu), footer
structuré, témoignages, tarification, timeline, équipe, newsletter, recherche.

**Le fait** : ce ne sont pas des variantes de rendu, ce sont **huit nouveaux types
de blocs**. Le vocabulaire est fermé et exhaustif — `renderBlock`
(`src/render/render-block.ts`) est vérifié exhaustif par le compilateur sur
`VocabularyBlock`, et `theme.config.ts` déclare `implements: VOCABULARY_NAMES`,
testé égal au vocabulaire de `@cogenta/blocks` (`test/isolation.test.ts`). Ajouter
un bloc, c'est modifier `@cogenta/blocks`, donc le contrat B (`blocks@1.0`), figé
depuis le 2026-08-13.

`AGENTS.md` l'interdit d'ailleurs explicitement, deux fois :
« Ajouter un bloc au vocabulaire sans passer par une RFC » figure dans « Ce qu'il
ne faut pas faire », et le lot lui-même marque **[CONTRAT B]** ce type de
changement.

**Ce qu'il faudrait**, dans cet ordre :
1. une RFC par bloc (ou une RFC groupée) décrivant la forme des **données**, pas
   du rendu — R3 : un bloc ne stocke jamais de HTML ni de CSS ;
2. une ADR de montée `blocks@2.0` avec note de migration du contenu déjà saisi ;
3. seulement ensuite, l'implémentation — qui est alors du travail mécanique, le
   système de tokens et les onze blocs refaits donnant déjà tous les motifs
   (carte, panneau, badge, chevron, grille, ruban de défilement).

**Remarque de cadrage** : deux des huit n'ont pas besoin du contrat B et sont
bloqués ailleurs — la **navigation** et le **footer** ne sont pas des blocs de
contenu mais des éléments de gabarit (`Base.astro` a déjà des `<slot>` pour eux, et
`cogenta serve` rend maintenant un header/footer minimal réel) ; les remplir
suppose un modèle de menu, qui est du contrat A. La **recherche** est branchée sur
L10 (le moteur plein texte existe, aucune route ne l'expose) et la **newsletter**
sur L13 pour l'envoi.

---

## 3. [CONTRAT A/B] Les sections réutilisables de la tâche 4

**Ce que demande le lot (tâche 4)** : composer une page à partir de sections
nommées réutilisables, pas seulement d'une liste plate de blocs.

**Le fait** : « réutilisable » veut dire qu'une page **référence** une section
stockée ailleurs. C'est une nouvelle forme de donnée (une collection de sections,
et une référence depuis une zone de blocs), donc contrat A et contrat B, tous deux
figés. Le rendu, lui, est trivial une fois la donnée définie : `renderPage` prend
déjà une liste de blocs, et une section n'est qu'une liste de blocs nommée.

**Ce qu'il faudrait** : une ADR qui tranche **où** vit une section — une
collection système (contrat A) ou un type de bloc « référence de section »
(contrat B) — avant toute ligne de code. Deviner ce choix en cours de route est
exactement ce que la règle de gouvernance interdit.

---

## 4. Lighthouse CI n'est pas branché

**Ce que demande le lot (tâche 5)** : « Mesure réelle Lighthouse en CI sur au
moins un blueprint, avec seuil qui fait échouer la build en cas de régression ».

**Ce qui manque** : la mesure a besoin (a) d'un Chrome headless dans le runner,
(b) d'une nouvelle dépendance directe `@lhci/cli` — R9 impose de la justifier
explicitement, et (c) d'un site réel qui tourne : scaffolder via `create-cogenta`,
générer une clé de signature, lancer `cogenta serve`, mesurer, arrêter. C'est un
workflow e2e complet, que je ne peux pas exécuter ici pour le vérifier (pas de
Chrome dans l'environnement de build). Écrire un workflow CI non exécuté serait
pire que de ne rien écrire : il passerait vert sans rien mesurer.

**Ce qui a été fait à la place, et qui est réel** : le CSS servi est minifié et
mis en cache avec un ETag ; le thème n'embarque toujours aucun JavaScript client ;
les images portent déjà `loading="lazy"` (sauf le média du hero, `eager`, parce
que c'est le LCP par construction), `sizes` et `srcset` dès que le contexte de
rendu en fournit un ; les animations d'entrée sont derrière `@supports
(animation-timeline: view())` et `prefers-reduced-motion`, donc elles ne bloquent
jamais le rendu.

---

## 5. Le `srcset` du thème attend le pipeline d'images (L10)

**Le fait** : `src/render/media.ts` émet déjà `srcset`, `sizes`, `width`,
`height`, `loading` et `decoding` — la moitié « thème » de la tâche 5 est faite
depuis L3. Ce qu'elle rend dépend entièrement de ce que `ctx.image()` retourne.

Dans `cogenta serve`, `ctx.image()` **lève** aujourd'hui
`THEME_IMAGE_UNSUPPORTED` (`packages/cli/src/commands/theme-render.ts`) : aucun
pipeline n'y est câblé. Vérifié : aucun des neuf blueprints ne place de média dans
un bloc, donc aucun site scaffoldé ne déclenche ce refus — mais une page éditée à
la main qui ajoute un `hero` avec média fera une 500, pas une image manquante.

**Ce qu'il faudrait** : que L10 branche `packages/render/src/images/` au média
téléversé et fournisse un `ctx.image()` réel. Le thème n'a alors **rien** à
changer : le `srcset` s'allume tout seul. Il y a aussi une décision de permissions
à prendre au passage — la route de fichier média (`/api/media/:id/file`) exige une
session, donc un visiteur anonyme ne peut pas voir une image ; c'est un choix
L10/L14, pas un choix de thème.

---

## 6. Aucune police ne peut être préchargée dans le contrat D actuel

**Ce que demande le lot (tâche 5)** : « Préchargement des polices,
`font-display: swap` ».

**Le fait** : contract D donne trois tokens de police (`sans`, `serif`, `mono`) et
ce sont des **familles**, pas des fichiers. La skin par défaut n'y met que des
piles système (`ui-sans-serif, system-ui, …`) : rien n'est téléchargé, donc il n'y
a ni `@font-face` à écrire, ni fichier à précharger, et `font-display` n'a rien
sur quoi agir. Une skin qui nommerait une police web ne dit nulle part **où** est
le fichier — le contrat n'a pas de token pour ça.

**Ce qu'il faudrait** : un token de source de police dans le contrat D (donc
`theme@2.0`, même ADR que le point 1). Tant qu'il n'existe pas, « précharger les
polices » n'a pas de référent, et le thème est déjà dans le meilleur cas possible
pour les Core Web Vitals : zéro requête de police.

---

## 7. Tâche 6 (passe de contenu sur les blueprints) — faite

Plus un blocage. Les huit blueprints à pack de contenu ont reçu leur passe
(`featureGrid` partout, `faq` sur quatre, `quote` sur `magazine`, `stats` sur
`vitrine`), et un test valide désormais chaque bloc de démonstration contre le
vrai registre du contrat B. Le neuvième blueprint, `blank`, n'a par définition
aucun contenu à enrichir.

Reste volontairement en dehors : aucun bloc de démonstration ne référence de
média, parce que `cogenta serve` n'a pas encore de pipeline d'images (point 5) et
qu'un site fraîchement scaffoldé doit rendre au premier lancement.

---

# Blocages — L19, « création de site pilotée par l'IA »

## 8. Appliquer un plan sur un site **en production** : refusé, ADR requise

**Le conflit.** `docs/lots/L10-cms-complet.md`, section L19, demande
explicitement le volet post-installation : « un site déjà **en production** peut
recevoir de nouveaux documents à tout moment […] et l'agent propose une
évolution du modèle de contenu / des pages / du design ».

ADR-0010, actée, dit le contraire, mot pour mot : « L'éditeur visuel de schéma
écrit ces fichiers, mais **uniquement en mode développement**. En production le
schéma est en lecture seule. »

Appliquer un plan de site écrit `cogenta.schema.*` et crée des tables. C'est
l'éditeur de schéma, arrivé par une autre porte. La décision s'y applique sans
adaptation.

**Ce qui a été fait, plutôt que de contourner.** AGENTS.md est sans ambiguïté :
« Ne jamais rediscuter une décision actée. Si elle semble mauvaise, le dire et
attendre — ne pas contourner. » Donc :

- Proposer et relire un plan restent disponibles **partout**, y compris en
  production : c'est de la lecture et de l'écriture dans `.cogenta/site-plans/`,
  pas dans le schéma.
- **Appliquer** n'est possible que sous `cogenta dev`. `cogenta serve` ne
  construit aucun applier ; la route répond `CONTENT_READ_ONLY` avec le chemin
  de sortie réel (« lancez `cogenta dev` sur une copie de développement,
  appliquez-y, committez le fichier de schéma »). La relecture déjà faite est
  conservée, pas perdue.
- Un test le prouve dans les deux sens :
  `packages/cli/test/serve-site-plan.test.ts`, « refuses to apply on
  `cogenta serve`, because ADR-0010 keeps the schema read-only in production ».

**Ce qu'il faut pour débloquer** : une décision humaine, sous forme d'ADR. Le
texte ci-dessous est prêt à insérer dans `docs/03-decisions.md` (fichier
protégé en écriture, append-only — je ne peux pas l'y mettre moi-même). Il
**ne remplace pas** ADR-0010, il en nomme une exception étroite.

```markdown
## ADR-0023 — Un plan de site validé peut écrire le schéma, en développement seulement

**Statut** : Proposée

**Décision** — L19 (« création de site pilotée par l'IA ») applique un plan de
site en réécrivant `cogenta.schema.*` et en créant les tables correspondantes.
Cette écriture est soumise à ADR-0010 sans exception : elle n'est possible que
sous `cogenta dev`. Sur `cogenta serve`, un plan peut être proposé, relu et
validé élément par élément, mais jamais appliqué — la route répond
`CONTENT_READ_ONLY` et indique la marche à suivre.

**Justification** — Appliquer un plan est l'éditeur visuel de schéma d'ADR-0010,
arrivé par une autre porte : mêmes fichiers écrits, même dérive de configuration
entre environnements à la clé, même risque qu'un thème référence un champ
supprimé. Le périmètre de L19 demandait le contraire (« un site déjà en
production peut recevoir de nouveaux documents ») ; entre un document de lot et
une décision actée, la décision gagne.

**Renoncement assumé** — Le volet post-installation de L19 est utile mais pas
immédiat : il faut une copie de développement, un `cogenta dev`, et un commit.
C'est exactement le pipeline de déploiement qu'ADR-0010 assume déjà comme
« conséquence ».

**Alternative écartée** — Autoriser l'écriture en production derrière une
confirmation supplémentaire. Écartée : ADR-0010 ne pose pas une question
d'ergonomie mais d'intégrité entre environnements, et une confirmation ne
recrée pas le fichier manquant dans git.

**Conséquence** — `RunServeOptions` gagne `development`, positionné par
`cogenta dev` et par lui seul. C'est aujourd'hui la seule différence de
comportement entre `cogenta serve` et `cogenta dev`.
```

## 9. Aucune exécution contre un vrai fournisseur LLM

**Ce qui manque** : tout le pipeline L19 (analyse de brief, modèle de contenu,
gabarits, contenu de démo) est testé contre un `ProviderClient` scripté, et
côté installeur contre le vrai `fetchImpl` de `llm-setup.ts`. Le câblage est
donc prouvé de bout en bout ; la **qualité réelle** des sorties d'un modèle ne
l'est pas.

**Pourquoi** : aucune clé API dans cet environnement — c'est un accès humain,
pas du travail en attente (même statut que la case cPanel de L9).

**Ce qui limite la casse en attendant** : rien dans ce lot ne fait confiance au
modèle sur le point qui compte. Les contraintes explicites sont lues du texte
brut de façon déterministe et **imposées** après coup (`enforceOn*`), les
gabarits passent par la validation contrat D existante, les collections par le
vrai `defineCollection`, et les entrées de démo par `collectionInputSchema`. Un
modèle qui répond mal produit un refus nommé, pas un site faux.
