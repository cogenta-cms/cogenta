# Proposition d'ADR — à insérer par un humain, pas encore actée

> **Ce fichier n'est pas une décision.** `docs/03-decisions.md` est append-only et
> protégé en écriture par un hook : le texte ci-dessous est une **proposition**
> produite par la tâche 1 du lot L13 (`docs/lots/L10-cms-complet.md`). Tant qu'un
> humain ne l'a pas relue et insérée, le contrat A reste figé en `schema@1.0` et
> **ni les taxonomies ni la corbeille ne doivent être codées**.
>
> **Numéro proposé : ADR-0022.** La dernière ADR présente dans le fichier est
> ADR-0020 ; ADR-0021 (notices/MFA admin) a été rédigée le 2026-08-15 et attend
> elle aussi son insertion — son numéro est donc considéré comme pris.
>
> Si l'ADR est actée, deux fichiers doivent suivre dans le même mouvement :
> `docs/04-contrats.md` (l'en-tête « Figé en `schema@1.0` » du contrat A, la liste
> des champs système, la section « Relations », la section « Versionnement ») et
> le tableau « Contrats figés » de `CLAUDE.md`.

---

## ADR-0022 — Le contrat A monte en `schema@2.0` en une seule fois : taxonomies natives et corbeille

**Statut** : Proposé

**Contexte** — Le contrat A est figé en `schema@1.0` depuis le 2026-08-13. Deux des
manques les plus visibles face à WordPress, Strapi et Drupal le touchent tous les
deux, et aucun des deux ne peut être ajouté sans casser une promesse déjà écrite.

La corbeille d'abord. `ContentStore.delete()` est aujourd'hui un vrai
`delete from <entries>` (`packages/schema/src/store/store.ts`), sans filet : les
versions et les blocs partent avec, par `on delete cascade`
(`packages/schema/src/store/tables.ts`), et une traduction dont on supprime la
source voit son `translation_of` passer à `null` par `on delete set null`. Une
suppression est donc irrécupérable **et** silencieusement destructrice d'une famille
de traduction. C'est le comportement qu'un CMS grand public n'a plus depuis quinze
ans.

Les taxonomies ensuite. Contract A ne connaît que des collections. Une catégorie
est donc bricolée par site, soit en `relation` vers une collection maison, soit en
`select` à valeurs figées. Les deux perdent ce qui fait une taxonomie : une
arborescence, et la **réutilisation entre collections** — la même catégorie
« Cuisine » servant à la fois aux articles et aux recettes.

La tension réelle n'est pas « faut-il ces deux fonctionnalités » : elle est de
savoir **combien de fois le contenu déjà saisi devra migrer**. Le lot L13 nomme ce
piège explicitement (« La tentation de faire toutes les tâches [CONTRAT A] d'un
coup dans une seule montée de version 2.0 »). Une montée majeure impose une note de
migration et une migration réelle du contenu existant ; en imposer deux à six
semaines d'intervalle est le vrai coût à éviter.

**Décision** — Le contrat A monte en `schema@2.0` **une seule fois**, couvrant en un
lot indivisible les taxonomies hiérarchiques natives et la corbeille/soft-delete,
avec une seule note de migration et une seule migration de données. L'autosave n'y
entre pas : il est réalisable sans toucher au contrat (voir « Conséquences »).

Ce que `schema@2.0` ajoute, précisément :

1. **Un champ système `deletedAt: string | null`** sur tout contenu, à côté de
   `status`. `status` n'est **pas** touché : son union fermée reste
   `draft | scheduled | published | archived`.
2. **`delete()` devient une mise à la corbeille** (écrit `deletedAt`), et
   `purge()` devient le seul `delete` SQL réel. `untrash()` annule la mise à la
   corbeille. Toute lecture (`read`, `list`, `translations`, `resolveLocale`,
   `history`) filtre `deletedAt is null` par défaut ; seul un appelant qui demande
   explicitement la corbeille la voit.
3. **Une fenêtre de purge configurable par collection**, sur le modèle de
   `versioning.keep` déjà présent : `trash: { retainDays: 30 }`, `false` pour
   revenir à une suppression dure immédiate.
4. **Un second objet déclarable de premier niveau, `defineTaxonomy()`**, à côté de
   `defineCollection()`. Un terme porte `id`, `parent`, `slug`, `position` et un
   `labels` **indexé par locale**, et n'est pas un contenu : il n'a ni `status`, ni
   `version`, ni `translationOf`.
5. **Un type de champ `taxonomy`**, `f.taxonomy({ of: 'category', many: true })`,
   qui référence des termes d'une taxonomie déclarée.
6. **Le vocabulaire d'actions de permission reste figé** (`read`, `create`,
   `update`, `delete`, `publish`). Mettre à la corbeille est `delete` ; purger est
   `delete` aussi, jamais une sixième action.

**Justification** —

*Pourquoi une seule montée majeure, et pourquoi ces deux-là ensemble.* Le coût
d'une montée majeure n'est pas dans le numéro : il est dans la migration du contenu
déjà saisi, dans la note de migration à écrire et à faire lire, et dans les lots
L10-L19 qui doivent se recaler dessus. Ce coût est presque entièrement fixe : le
payer deux fois pour deux ajouts connus le même jour serait un choix, pas une
fatalité. Le lot L13 demande d'ailleurs que la tâche 1 soit traitée **en premier**,
« pour que l'ADR de montée de version soit actée tôt, avant que d'autres lots n'aient
à s'y adapter ».

*Pourquoi la corbeille est bien une rupture majeure, et pas un ajout.* Trois faits
vérifiables dans le code, pas trois opinions :

- `onDelete: 'restrict'` est le défaut du contrat A, et il est aujourd'hui appliqué
  par une **vraie clé étrangère** (`onDeleteClause`, `tables.ts`). Une mise à la
  corbeille n'est pas un `DELETE` : la base ne peut plus rien refuser. « 3 articles
  référencent cet auteur », que le contrat A donne aujourd'hui en exemple de bon
  défaut, doit être **réimplémenté en code applicatif** au moment de la mise à la
  corbeille, sinon la corbeille devient un contournement silencieux de `restrict`.
  C'est une modification du sens d'une garantie écrite, donc majeure.
- Symétriquement, la corbeille **répare** un dégât actuel : le
  `on delete set null` sur `translation_of` détruit aujourd'hui la famille de
  traduction quand on supprime la source. Une source seulement mise à la corbeille
  ne déclenche plus rien, et `untrash()` rend la famille intacte.
- Tout appelant existant de `delete()` change de comportement sans changer de
  ligne. Un changement de sémantique à signature constante est exactement ce qu'une
  version majeure doit signaler.

*Pourquoi `deletedAt` plutôt qu'un statut `trashed`.* Le contrat A déclare `status`
comme une union fermée, et l'ajout d'une valeur y est tentant. Deux raisons de ne
pas le faire. D'abord, une entrée à la corbeille **doit se souvenir de ce qu'elle
était** : sans cela, restaurer un article publié le rend brouillon, ce qui est une
perte d'information et un piège à republication accidentelle. Ensuite,
l'exhaustivité : tout `switch` sur `ContentStatus` du dépôt deviendrait
silencieusement incomplet, alors qu'un champ orthogonal force le compilateur à
signaler chaque lecture qui doit apprendre à filtrer. Un axe orthogonal se modélise
par un champ orthogonal.

*Pourquoi une taxonomie n'est pas une collection.* On pourrait déclarer les
catégories comme une collection ordinaire et s'en tenir là — c'est ce que les sites
font aujourd'hui. Trois choses restent impossibles : garantir l'absence de cycle
dans l'arborescence, réutiliser le même terme entre deux collections sans le
dupliquer, et répondre « tout le contenu de ce sous-arbre » en une requête. La
troisième contraint le stockage : une adjacence simple (`parent_id`) exige un CTE
récursif, dont le support diverge entre Postgres, MySQL/MariaDB et SQLite (ADR-0006
impose les trois). Un **chemin matérialisé** maintenu à l'écriture répond à la même
question par un `like` que les trois dialectes traitent identiquement — même
raisonnement que le stockage des timestamps « en texte, qui veut dire la même chose
partout » déjà retenu par le moteur de migrations.

*Pourquoi les libellés d'un terme sont indexés par locale, alors qu'ADR-0014 impose
une entrée par langue.* ADR-0014 gouverne le **contenu** : une page française et sa
traduction anglaise ont chacune leur cycle de publication, leur `status`, leur
version. Un terme de taxonomie n'a rien de tout ça : « Cuisine » et « Cooking » sont
le même concept de classement, pas deux contenus. Leur appliquer ADR-0014 créerait
une famille de traduction par terme, donc un `translationOf` sur un objet qui n'a ni
`status` ni `version` — un rattachement au contrat A pour rien. ADR-0014 n'est **pas
remplacée** : son périmètre est simplement dit explicitement.

**Conséquences** —

- Une migration réelle sur tout contenu déjà saisi : une colonne `deleted_at` par
  table d'entrées, plus les tables de taxonomie et de jointure. Réversible, comme
  toute migration du projet ; le `down` supprime la colonne, donc **il perd la
  corbeille** — la note de migration doit le dire, c'est une perte de données au
  sens de la règle du projet sur les migrations destructives.
- `ContentStore` gagne `purge()` et `untrash()`, et `delete()` change de sens.
  `withReadOnlyStore` doit refuser les trois.
- `restrict` doit être vérifié en code applicatif au moment de la mise à la
  corbeille. Ne pas le faire est un défaut de sécurité de la donnée, pas un détail.
- Le nom `restore` est déjà pris par la restauration de version
  (`ContentStore.restore(id, version)`). La sortie de corbeille s'appelle donc
  `untrash()`, jamais `restore()` : deux opérations différentes ne partagent pas un
  nom.
- Le lot L14 (headless) et le lot L10 (branchement du SEO/recherche) doivent
  apprendre à ne jamais servir une entrée à la corbeille. C'est la raison pour
  laquelle le filtre est **par défaut** et l'inclusion explicite, et non l'inverse.
- **L'autosave n'entre pas dans cette montée**, et c'est un constat de code, pas un
  arbitrage : `history()` ne distingue aujourd'hui *aucune* sauvegarde d'une autre
  (elle rend toutes les lignes de la table des versions, dont chaque `update()`
  crée une), donc un autosave qui passerait par `update()` polluerait l'historique
  et ferait sortir de vraies versions de la fenêtre `keep`. La conclusion n'est pas
  d'ajouter un discriminant au contrat A : c'est que l'autosave ne doit pas écrire
  de version du tout. Un brouillon en cours de frappe vit hors du magasin de
  versions jusqu'à ce qu'un humain enregistre.
- La duplication de contenu n'entre pas non plus : elle ne fait que composer
  `read` + `create`, et la duplication est couverte par l'action `create` déjà figée.

**Renoncement assumé** —

- Le contenu déjà saisi migre, une fois. Aucune promesse de « mise à jour sans
  migration » n'est tenable ici, et prétendre le contraire ferait perdre la
  confiance qui rend un contrat figé utile.
- `delete()` change de sens sans changer de signature. Tout code externe écrit
  contre `schema@1.0` qui comptait sur une suppression dure — un script d'import qui
  nettoie, un test qui remet à zéro — continuera de « marcher » en laissant des
  lignes derrière lui. C'est le pire mode de rupture (silencieux), et il est accepté
  parce que l'inverse — garder `delete()` dur et appeler la corbeille autrement —
  laisserait le défaut par défaut dangereux, ce qui est pire.
- **Les statuts personnalisables du workflow éditorial (L13 tâche 7) ne sont pas
  pré-ouverts.** Si le besoin se confirme, ils imposeront une `schema@3.0` et donc
  une seconde migration du contenu — exactement ce que cette ADR cherche à éviter.
  Le choix est assumé : aucune spécification n'existe aujourd'hui pour ces statuts,
  et figer maintenant une forme devinée coûterait plus cher qu'une migration
  supplémentaire (la règle du projet interdit l'abstraction pour un cas
  hypothétique).
- Un terme de taxonomie n'a pas d'historique de versions. On perd « qui a renommé
  cette catégorie » ; le journal d'audit (`@cogenta/auth`) reste la réponse, et
  suffit.

**Écarté** —

- **Deux montées majeures séparées (`2.0` taxonomies, `3.0` corbeille).** Plus
  propre à lire dans le journal des décisions, deux fois plus cher pour toute
  personne qui exploite un site. Le coût d'une montée est porté par l'utilisateur,
  pas par le fichier d'ADR.
- **Une valeur `trashed` ajoutée à `status`.** Écartée pour deux raisons données
  plus haut : la perte du statut d'origine, et la rupture silencieuse de
  l'exhaustivité de tous les `switch` existants.
- **La corbeille en dehors du contrat A, comme un plugin ou une table annexe.**
  Techniquement possible (une table « corbeille » où l'on déplace la ligne), et
  écartée : la ligne déplacée perdrait ses clés étrangères, donc ses relations et
  ses blocs, donc la restauration ne restaurerait pas. Une corbeille qui ne rend
  pas exactement ce qu'elle a pris ne mérite pas son nom.
- **Les taxonomies comme simple collection avec un champ `parent`.** C'est le
  contournement actuel. Écarté parce qu'il ne donne ni l'absence de cycle, ni la
  réutilisation entre collections, ni la requête de sous-arbre — c'est-à-dire aucune
  des trois raisons d'avoir des taxonomies.
- **Un CTE récursif plutôt qu'un chemin matérialisé.** Écarté sur ADR-0006 : trois
  dialectes obligatoires, trois comportements à tester, pour une requête qu'un
  `like` sur un chemin résout partout de la même façon.
