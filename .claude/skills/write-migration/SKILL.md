---
name: write-migration
description: Use when writing or reviewing a database migration in Cogenta — enforces reversibility, three-dialect correctness, destructive-change confirmation, and the up/down + impact + duration metadata the schema contract requires.
---

# Écrire une migration

## Règles non négociables

- **Toujours réversible.** Une migration porte un `up` **et** un `down` qui restaure
  réellement l'état précédent (AGENTS.md § Migrations).
- Une migration **destructive** exige une confirmation explicite **et** un backup
  préalable **vérifié** — vérifié, pas seulement déclenché.
- Une migration porte : une **version**, une **direction** up/down, un **impact sur les
  données existantes**, une **estimation de durée** (docs/04-contrats.md § Contrat A).
- Elle doit être correcte sur **les trois dialectes**. Appelle `db-dialect-specialist`.

## Ce qui est réversible, et ce qui ne l'est pas

| Changement | `down` |
|---|---|
| Ajouter une colonne nullable | `drop column` — trivial |
| Ajouter une colonne NOT NULL | exige un `default` ou un backfill ; `down` = drop |
| Renommer une colonne | rename inverse — mais **casse le code déployé** entre les deux |
| Supprimer une colonne | **irréversible sans sauvegarde des données** → destructive |
| Changer un type | souvent irréversible (troncature) → destructive |
| Ajouter un index | drop index |
| Backfill de données | exige de conserver l'ancienne valeur pour pouvoir revenir |

Une suppression de colonne se fait en **deux migrations et deux déploiements** :
d'abord on cesse de lire la colonne, ensuite on la supprime. Sinon le rollback du code
casse sur une colonne absente.

## Les pièges des trois dialectes

- **MySQL n'a pas de DDL transactionnel** : une migration en plusieurs instructions peut
  échouer à mi-chemin sans rollback. Une instruction DDL par migration, ou un `down`
  capable de réparer un état partiel.
- **SQLite ne sait pas `ALTER COLUMN`** : il faut recréer la table, recopier, renommer.
  Encapsulé dans la couche db, jamais laissé à l'appelant.
- **Booléens** : `integer` 0/1 sur SQLite, `tinyint(1)` sur MySQL, `boolean` sur Postgres.
- **Longueur d'index** MySQL : 767/3072 octets sur les colonnes texte — un index sur un
  `varchar(255)` en utf8mb4 est déjà à la limite.
- **Dates** : `timestamptz` sur Postgres, pas de fuseau sur MySQL.

## Le champ `provenance`

`provenance` (`human | assisted | generated`) et `provenanceDetail` sont **requis dès la
première migration** — exigés par le cadre européen sur l'IA. Ce n'est pas un champ
optionnel à ajouter plus tard.

## Terminé quand

- `up` puis `down` puis `up` laisse la base dans un état identique, testé sur les trois
  dialectes contre une base réelle (jamais un mock).
- La table de suivi des migrations est correcte après chaque direction.
- Une migration destructive refuse de s'exécuter sans confirmation explicite, testé.
- L'impact et la durée estimée sont renseignés et honnêtes.
