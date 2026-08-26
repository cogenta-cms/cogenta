# 69 — Mise à jour de la documentation du projet

> **État** : découverte centrale de toute cette vague — `CLAUDE.md` documente en
> détail les lots L0-L24 (`docs/lots/`) mais **ne mentionne nulle part** le système
> de fiches (`docs/plans/01.md` à `38.md`), pourtant intégralement implémenté
> **après** les lots, en 60 commits entre le 2026-08-19 et le 2026-08-22. Cette
> fiche corrige la source du problème plutôt qu'un symptôme isolé.
> **Fichiers** : `CLAUDE.md`, `docs/00-vision.md`, `docs/02-architecture.md`,
> `docs/plans/README.md`
> **Effort** : continu — une tâche de clôture par fiche, plus une passe de fond
> **ADR requise** : non

---

## 1. Ce qui existe réellement (constat vérifié)

- **60 commits** contiennent « fiche » dans leur message sur `main`, du
  2026-08-19 au 2026-08-22 (trois derniers libellés « fiche L23 » — chevauchement
  de nomenclature à cet endroit).
- **`CLAUDE.md` ne mentionne les fiches nulle part** : une seule occurrence
  insensible à la casse de « fiche », un faux positif (« la fiche produit »,
  section L15 commerce, sans rapport).
- **`docs/00-vision.md` et `docs/02-architecture.md`** : zéro occurrence de
  « fiche », « contrat F », « contrat G » ou `reviewState` dans le premier ; une
  seule occurrence de « fiche » dans le second (faux positif, « détecte »). Les
  deux documents de vision/architecture ne sont pas à jour pour les contrats F
  (commentaires), G (formulaires) ni le workflow éditorial `schema@2.1`.
- **`docs/04-contrats.md` est en revanche déjà à jour** : contrat A affiché en
  `schema@2.1` (ADR-0027, workflow éditorial), sections Contrat F et Contrat G
  présentes et détaillées.
- **6 paquets absents de `CLAUDE.md`**, texte narratif compris : `analytics`,
  `comments`, `forms`, `observability`, `export`. `commerce` est déjà couvert
  (section L15). Les 5 thèmes (`theme-portfolio`, `theme-magazine`,
  `theme-ecommerce`, `theme-entreprise`, `theme-kit`) sont déjà documentés dans le
  texte narratif de la section L23.
- **`CLAUDE.md` fait 224 lignes**, concentrées en quelques lignes de tableau
  Markdown gigantesques — une réécriture complète est lourde ; une **addition
  ciblée** est nettement plus réaliste et cohérente avec le style d'accumulation
  déjà en place.

## 2. Plan de développement

**Tâche 1 — Nouvelle entrée dans le tableau « État courant » de `CLAUDE.md`** :
une ligne ou une section dédiée résumant le système de fiches — sa nature (60
commits, 2026-08-19 → 2026-08-22), son emplacement (`docs/plans/`), et un renvoi
vers `docs/plans/README.md` plutôt qu'une paraphrase de chaque fiche individuelle
(déjà indexées là-bas). **Critère** : un lecteur de `CLAUDE.md` seul apprend que le
système de fiches existe et où le trouver, sans avoir à connaître son existence au
préalable.

**Tâche 2 — Ligne « Paquets publiés »/« Paquets internes »** : ajouter
`analytics`, `comments`, `forms`, `observability`, `export` à la liste (déjà
présente pour `commerce` et les 5 thèmes).

**Tâche 3 — `docs/00-vision.md`** : vérifier si la vision produit doit refléter
les nouveaux domaines (commentaires, formulaires, workflow éditorial) — probable
mise à jour légère, pas une réécriture (la vision reste vraie, elle est
simplement incomplète).

**Tâche 4 — `docs/02-architecture.md`** : ajouter les contrats F et G à toute
liste de contrats déjà présente, et le paquet `@cogenta/observability` s'il y a une
section d'architecture d'observabilité déjà esquissée.

**Tâche 5 — `docs/plans/README.md`** : déjà mis à jour par cette vague elle-même
(section « Vague 2 », index 39-69, table de parallélisation) — vérifier sa
cohérence finale une fois toutes les fiches 39-69 closes.

**Tâche 6 — Clôture par fiche** : chaque fiche 39-69, une fois son travail terminé,
met à jour la documentation qu'elle touche spécifiquement (ex. fiche 48 → contrat D
et `docs/plans/14-apparence-et-theme.md` ; fiche 63 → éventuelle nouvelle ADR).
Cette tâche n'est pas un travail séparé : c'est un critère d'acceptation déjà
inscrit dans chaque fiche individuelle, rappelé ici pour qu'aucune ne soit fusionnée
sans lui.

## 3. Critères d'acceptation

- `CLAUDE.md` mentionne explicitement le système de fiches et renvoie vers son
  index.
- Les 5 paquets manquants apparaissent dans la liste des paquets.
- Aucune fiche 39-69 n'est considérée close sans que sa propre tâche de mise à
  jour documentaire (contrat, ADR, `docs/plans/`) soit faite.

## 4. Tests exigés

Aucun test automatisé — vérification par lecture (`docs-sync` agent, à appeler en
fin de vague plutôt qu'après chaque fiche individuelle pour éviter 31 revues
redondantes).

## 5. Pièges connus

- Ne pas réécrire `CLAUDE.md` en entier — le fichier est volumineux par
  accumulation volontaire (append-only en esprit, comme les ADR) ; une addition
  ciblée respecte ce style, une réécriture le romprait.
- `docs/04-contrats.md` est déjà correct — vérifier avant de le modifier, pour ne
  pas introduire une régression dans un document déjà à jour.

## 6. Décisions à prendre

Format exact de la nouvelle entrée « fiches » dans `CLAUDE.md` (nouvelle ligne de
tableau vs. nouvelle section hors tableau) — à trancher en écrivant, aucun impact
sur le reste du projet.
