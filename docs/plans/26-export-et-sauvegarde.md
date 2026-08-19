# 26 — Export et sauvegarde

> **État** : **absent.** `cogenta backup` est une commande honnêtement différée ; il
> n'existe aucun export de site.
> **Vérification** : aucune fonction d'export de contenu dans `packages/*/src` ; seul
> l'export CSV d'une page de liste existe (`packages/admin/src/lib/csv.ts`).
> **Effort** : 6–8 jours
> **ADR requise** : non, mais une décision de format est nécessaire

---

## 1. Ce qui existe réellement

- `downloadCsv`/`toCsv` dans l'admin, qui exporte **la page de liste affichée** — pas
  la collection, et sans les blocs ni les relations.
- `cogenta backup` est listée parmi les commandes CLI **honnêtement différées, sans
  stub**, faute de capacité réelle sous-jacente (L9 tâche 9).
- Le widget « sauvegardes » du tableau de bord est un emplacement vide et assumé.

Donc : **un site Cogenta n'a aujourd'hui aucun moyen de sauvegarder ou d'exporter son
contenu**, ni depuis l'admin, ni depuis la CLI. Pour un CMS qui promet qu'un site
s'exploite lui-même, c'est le manque le plus gênant de tout cet ensemble — davantage
que les commentaires ou les formulaires, parce qu'il porte sur la survie des données.

## 2. Ce que font les CMS de référence

| Fonction | WordPress | Drupal 11 | Strapi 5 | Cogenta |
|---|---|---|---|---|
| Export du contenu (fichier) | ✅ (WXR) | ✅ | ✅ | ❌ |
| Export sélectif (type, période, auteur) | ✅ | ✅ | ✅ | ❌ |
| Sauvegarde complète (base + médias) | plugin | ✅ (drush) | ✅ (CLI) | ❌ |
| Sauvegarde planifiée | plugin | ✅ | ❌ | ❌ |
| Restauration | plugin | ✅ | ✅ | ❌ |
| Destination distante (S3, etc.) | plugin | ✅ | ❌ | ❌ |
| Export RGPD des données d'une personne | ✅ | ✅ | ❌ | ❌ |
| Vérification de l'intégrité d'une sauvegarde | plugin | ❌ | ❌ | ❌ |

## 3. Ce qu'il faut décider d'abord

**Trois choses différentes** sont confondues sous le mot « sauvegarde », et les traiter
séparément évite de tout bloquer sur la plus difficile :

| | Contenu | Portabilité | Difficulté |
|---|---|---|---|
| **Export de contenu** | entrées, blocs, taxonomies, menus, redirections | lisible, réimportable, indépendant du moteur de base | **faible** |
| **Sauvegarde de données** | + médias, utilisateurs (hachés), audit, commerce | restauration complète du même site | moyenne |
| **Sauvegarde système** | + configuration, schéma, thème | reconstruction totale | élevée — dépend de l'hébergement |

**Recommandation** : livrer l'**export de contenu** en premier. Il est simple, il est
utile immédiatement (migration, archivage, aller-retour avec la fiche
[25](25-import.md)), et il ne dépend d'aucune décision d'hébergement.

Et une règle qui doit être écrite dès la première ligne : **le format d'export est un
format public**. Il sera consommé par des scripts, des sites et des migrations. Le
versionner (`export@1.0`) et le documenter dans `docs/04-contrats.md` dès le début —
sinon on hérite d'un format de fait, non spécifié, impossible à faire évoluer.

## 4. Plan de développement

### Tâche 1 — Export de contenu

**Fichiers** : nouveau module dans `@cogenta/schema` ou un paquet `@cogenta/export`,
route `/api/export`, nouvelle route admin.

Un fichier JSON (ou NDJSON pour les gros volumes) versionné, contenant : entrées avec
valeurs et blocs, statut, locale, `translationOf`, provenance, taxonomies et termes
(avec leur arbre), menus, redirections, références de médias.

Sélection : collections, plage de dates, statuts, langues, avec ou sans corbeille,
avec ou sans historique de versions.

**Le respect des permissions est obligatoire** : un export est une lecture en masse.
Il passe par la même couche de permission que la lecture normale, sinon c'est une
porte dérobée d'exfiltration — exactement le type de trou trouvé en L10 sur
`/api/media`.

**Critère** : exporter, puis réimporter dans un site vide, et obtenir le même contenu.

### Tâche 2 — Export des médias

**Fichiers** : module d'export.

Deux modes : **références seules** (léger, suppose que le stockage survit) et
**archive complète** (les fichiers avec).

L'archive doit être produite en flux, jamais assemblée en mémoire. `@cogenta/agents`
a déjà un lecteur ZIP sans dépendance (`documents/zip.ts`, écrit pour lire les
`.docx`) — vérifier s'il peut servir de base à l'écriture, sinon écrire un producteur
ZIP en flux (R9 : le format ZIP stocké, sans compression, est simple et suffit pour
des images déjà compressées).

### Tâche 3 — Sauvegarde de données

**Fichiers** : `packages/cli` (`cogenta backup`), route admin.

- Export de toutes les tables, y compris utilisateurs (mots de passe **hachés**),
  audit et commerce.
- Format **indépendant du moteur** — pas un `pg_dump`, qui exigerait un binaire absent
  d'un hébergement mutualisé et interdirait de restaurer sur un autre moteur.
- Somme de contrôle et manifeste (version, date, contenu, comptes de lignes).
- **Chiffrement optionnel** avec une phrase de passe : une sauvegarde contient tous
  les hachages de mots de passe, tout le journal d'audit et toutes les données
  personnelles du site. Un fichier laissé dans un dossier public serait une
  compromission totale.
- `cogenta backup` prend enfin corps, et l'admin déclenche la même chose.

### Tâche 4 — Restauration

**Fichiers** : `packages/cli` (`cogenta restore`), route admin.

- **Vérifier avant d'écrire** : somme de contrôle, version, compatibilité de schéma.
- Prévisualisation : ce qui sera écrasé, ce qui sera ajouté.
- **Restauration complète réservée à la CLI.** Une restauration écrase la base sur
  laquelle tourne l'admin qui l'a déclenchée : c'est la scier sous ses propres pieds.
  L'admin peut restaurer un **export de contenu** (additif, réversible par la
  corbeille) ; la restauration système reste en ligne de commande. Cette limite est
  une décision, pas un manque — l'écrire.

### Tâche 5 — Planification et destinations

**Fichiers** : fiche [28](28-taches-planifiees.md), configuration.

- Sauvegarde planifiée (quotidienne/hebdomadaire), rétention par nombre et par âge.
- Destinations : disque local (toujours), puis S3/compatible via le driver de stockage
  existant. **R1** : le local doit suffire, le distant est un bonus.
- **Le widget « sauvegardes » du tableau de bord trouve enfin sa source de données** —
  dernière sauvegarde, taille, résultat.
- Alerte si aucune sauvegarde depuis N jours (fiche
  [38](38-notifications-et-notices.md)).

### Tâche 6 — Export RGPD d'une personne

**Fichiers** : module d'export, fiche [17](17-utilisateurs.md).

Rassembler, pour une adresse e-mail : compte, contenu rédigé, soumissions de
formulaire (fiche 16), commentaires (fiche 15), commandes (contrat E). Export dans un
format lisible, et suppression sur demande — qui renvoie à l'anonymisation de la fiche
17.

Ce n'est pas un raffinement : c'est une obligation légale dès que le site collecte des
données personnelles, et les fiches 15 et 16 en créent.

## 5. Critères d'acceptation

- Un export réimporté dans un site vide reproduit le contenu.
- Un export respecte les permissions de l'acteur qui le demande.
- Une sauvegarde porte une somme de contrôle vérifiée avant restauration.
- Une sauvegarde peut être chiffrée.
- La restauration complète n'est pas déclenchable depuis l'admin, et l'écran dit
  pourquoi.
- Le widget « sauvegardes » du tableau de bord affiche une donnée réelle.
- Aucun assemblage d'archive en mémoire.

## 6. Tests exigés

- Bout en bout : export → import dans une base vide → comparaison entrée par entrée,
  blocs et taxonomies compris.
- Bout en bout : sauvegarde puis restauration sur un **moteur différent** (SQLite →
  Postgres), qui est l'argument même du format indépendant.
- Sécurité : un rôle sans permission de lecture n'obtient pas ce contenu dans son
  export.
- Unitaires : somme de contrôle, refus d'une sauvegarde corrompue.
- Unitaires : chiffrement / déchiffrement.
- Intégration trois bases.

## 7. Pièges connus

- **Un export est une exfiltration si les permissions ne s'appliquent pas.** C'est le
  même trou que `GET /api/media` avant L10, en pire.
- **Une sauvegarde non chiffrée dans un dossier accessible** compromet le site
  entier. Ne jamais l'écrire sous la racine servie.
- **`pg_dump` n'existe pas sur un hébergement mutualisé** — le scénario que
  `docs/hebergement-mutualise.md` cible explicitement.
- **Assembler une archive en mémoire** échoue au premier site de plusieurs Go.
- **Restaurer depuis l'admin coupe l'admin.** À traiter comme une limite volontaire.
- **Le format d'export devient un contrat de fait** dès la première version publiée.
  Le versionner tout de suite.
- **R9** : ni bibliothèque d'archive, ni bibliothèque de chiffrement. `node:zlib` et
  `node:crypto` suffisent — le précédent existe : les lecteurs PDF/DOCX/ZIP de L19 ont
  été écrits sans une seule dépendance.

## 8. Décisions à prendre

- Format d'export : JSON unique (simple) ou NDJSON (flux, gros volumes).
  Recommandation : NDJSON pour le contenu, JSON pour le manifeste.
- Chiffrement : optionnel (recommandé) ou obligatoire pour toute sauvegarde contenant
  des utilisateurs.
- Versionner le format dans `docs/04-contrats.md` — recommandé, dès la première
  version.
