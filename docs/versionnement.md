# Politique de versionnement et de dépréciation

Deux échelles de version distinctes coexistent dans ce dépôt, et il ne faut pas les
confondre.

## 1. Les paquets publiés (`@cogenta/*`, `create-cogenta`)

Chaque paquet publiable porte sa propre version semver, gérée par
[Changesets](https://github.com/changesets/changesets) (`pnpm changeset`,
`.changeset/config.json`). Toute PR qui touche le `src/` d'un paquet publié doit porter
un changeset — c'est déjà une règle de `AGENTS.md` (« Définition de terminé »), pas une
nouveauté de cette page.

- **Patch** — correctif sans changement de forme observable (bug, faute, dépendance
  interne mise à jour sans impact).
- **Minor** — ajout rétrocompatible : un nouveau champ optionnel, une nouvelle fonction
  exportée, un nouveau driver derrière une interface existante.
- **Major** — rupture : une signature exportée change, un comportement par défaut
  change, un champ requis apparaît là où rien n'était requis avant.

Tant que le dépôt est pré-1.0 (tous les `package.json` de `packages/*` portent
aujourd'hui `0.0.0`), rien n'est encore publié sur le registre npm public — la
discipline de version s'applique déjà en interne, pour que le jour de la première
publication ne soit pas celui où on découvre qu'un historique de breaking changes n'a
jamais été tenu.

## 2. Les quatre contrats d'interface (A/B/C/D)

Distincts des versions de paquet. `docs/04-contrats.md` définit le semver **de chaque
contrat lui-même** (`schema@1.0`, `blocks@1.0`, `tools@1.0`, `theme@1.1` — les quatre
sont figés, voir `docs/rfc/README.md` § « État des contrats »). Une rupture de contrat
majeure a un rayon d'action bien plus large qu'une rupture de paquet ordinaire : elle
touche potentiellement tout contenu déjà saisi, tout thème publié, tout plugin
tiers. C'est pour cette raison qu'un changement de contrat exige une RFC
(`docs/rfc/README.md`) avant même d'être codé, et non simplement un changeset après
coup.

- **Majeure** — la forme change de façon incompatible. Exige : une RFC acceptée, une
  ADR si le changement est structurant (`docs/03-decisions.md`), et **une note de
  migration pour le contenu déjà saisi** — jamais une rupture qui abandonne le contenu
  existant sans chemin de mise à niveau.
- **Mineure** — ajout compatible. Exemple donné par le contrat D lui-même : ajouter une
  entrée à `ctx` (`RenderContext`) est mineur, en retirer une est majeur.

## 3. Dépréciation

Aucun mécanisme de dépréciation automatisée n'existe aujourd'hui (pas de champ
`@deprecated` généré, pas d'avertissement à l'exécution) — ce n'est pas encore
construit, pas volontairement omis. La règle qui s'applique en attendant :

1. Une fonctionnalité dépréciée est annoncée dans le `CHANGELOG` généré par
   Changesets et, si le rayon d'action le justifie (un contrat, un bloc du vocabulaire),
   documentée dans une ADR marquant l'ancien choix `Remplacée par ADR-XXXX` — jamais
   supprimée du texte, conformément à la règle append-only de `03-decisions.md`.
2. Une dépréciation ne devient une suppression qu'à la version majeure suivante du
   paquet ou du contrat concerné, jamais dans la même version qui l'introduit.
3. Un bloc retiré du vocabulaire (contrat B) est le cas le plus coûteux : chaque thème
   qui l'implémentait doit avoir un chemin de repli déclaré (`docs/rfc/README.md`
   mentionne déjà ce mécanisme pour l'ajout d'un bloc propre à un thème — la même
   logique de repli s'applique en sens inverse à un retrait).

## Roadmap publique

`docs/06-lots.md` **est** la roadmap publique du projet — le découpage en dix lots, leur
ordre de dépendance, et l'état d'avancement de chacun. `README.md` y pointe directement
plutôt que de dupliquer un second document qui pourrait diverger.
