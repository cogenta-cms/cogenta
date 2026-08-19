# 24 — Santé du site et outils

> **État** : partiel — un widget de santé et un miroir de configuration ; aucun outil.
> **Écrans** : widget dans `routes/dashboard.tsx`, `routes/ops-settings.tsx`
> **CLI existante** : `cogenta doctor`, `cogenta migrate`
> **API existante** : `/api/health`, `/api/security-status`, `/api/webhooks-status`
> **Effort** : 4–5 jours
> **ADR requise** : non

---

## 1. Ce qui existe réellement

- `/api/health` renvoie l'état des drivers, et **se décrit honnêtement** : sur une
  installation fraîche, `sqlite` et le stockage local sont rapportés `degraded`, ce
  qui est la convention du projet (driver optimal / driver dégradé) et non une erreur.
- `cogenta doctor` fait un vrai diagnostic — **en ligne de commande uniquement**.
- `cogenta migrate` applique les migrations — en ligne de commande uniquement.
- `ops-settings.tsx` montre ce que le processus applique pour la sécurité et les
  webhooks.

**Ce qui manque** : un écran « Santé » complet, et surtout **aucun outil**. WordPress
et Drupal ont tous deux une page « Outils » ; Cogenta n'en a pas.

## 2. Ce que font les CMS de référence

| Fonction | WordPress | Drupal 11 | Cogenta |
|---|---|---|---|
| Page de santé avec contrôles | ✅ (Site Health) | ✅ (Status report) | widget seulement |
| Info système (versions, extensions PHP/Node) | ✅ | ✅ | partiel |
| État des migrations en attente | — | ✅ (update.php) | CLI seulement |
| Import | ✅ | ✅ | ✅ (fiche 25) |
| Export | ✅ | ✅ | ❌ (fiche 26) |
| Purge des caches | ✅ | ✅ | ❌ |
| Régénération des miniatures | plugin | ✅ | ❌ |
| Réindexation de la recherche | plugin | ✅ | ❌ |
| Vérification des liens morts | plugin | ✅ | ❌ |
| Test d'envoi d'e-mail | plugin | ✅ | ❌ |
| Journal des erreurs serveur | plugin | ✅ (dblog) | ❌ |
| Mode maintenance | plugin | ✅ | ❌ |

## 3. Écarts, classés

### Importants

1. **Aucun outil de maintenance.** Après un import, après un changement de tailles
   d'images, après une modification de l'indexation, il n'existe aucun moyen de
   relancer un traitement sans terminal — et parfois sans aucun moyen du tout.
2. **`cogenta doctor` est invisible depuis l'admin.** Le diagnostic existe, il est bon,
   et personne d'autre qu'un développeur ne le verra jamais.
3. **Les migrations en attente ne sont pas signalées.** Après une mise à jour de
   paquet, un site peut tourner avec un schéma périmé sans que rien ne le dise — et
   les erreurs qui en découlent sont incompréhensibles.
4. **Pas de journal des erreurs.** Une erreur serveur n'est visible que dans la sortie
   du processus. Sur un hébergement mutualisé, personne n'y a accès.

### Confort

5. Pas de mode maintenance.
6. Pas de test d'envoi d'e-mail (indispensable dès que les fiches
   [15](15-commentaires.md), [16](16-formulaires.md) et [17](17-utilisateurs.md)
   dépendent de l'e-mail).
7. Pas de vérification des liens morts.

## 4. Plan de développement

### Tâche 1 — Écran « Santé »

**Fichiers** : nouvelle route `packages/admin/src/routes/health.tsx`,
`shell/nav-items.ts`, `/api/health` (extension).

Reprendre **le contenu de `cogenta doctor`**, pas une deuxième implémentation :
extraire son cœur dans une fonction réutilisable et l'exposer par une route. Sinon les
deux diagnostics divergeront, et celui qu'on lit ne sera pas celui qui a raison.

Sections : drivers (avec optimal/dégradé et **pourquoi**), versions de paquets, version
de Node, migrations en attente, espace disque du stockage local, connectivité de la
base, présence et validité des fournisseurs configurés, état de la file, dernière
vérification d'intégrité de l'audit (fiche [21](21-journal-d-audit.md)).

Chaque ligne : vert / orange / rouge, un texte qui dit **ce que ça change**, et un lien
vers la documentation. Un « dégradé » doit expliquer que c'est normal en
développement — sinon la moitié des installations neuves paraît cassée.

**Critère** : une installation fraîche affiche « tout va bien, deux drivers en mode
dégradé, voici pourquoi c'est normal ».

### Tâche 2 — Migrations depuis l'admin

**Fichiers** : `routes/health.tsx`, `packages/api`, `@cogenta/core` (`migrator`).

- Lister les migrations appliquées et en attente.
- Signaler en haut de l'admin quand des migrations sont en attente (notice de la fiche
  [38](38-notifications-et-notices.md)).
- **Appliquer** depuis l'admin : à peser sérieusement. Une migration est destructive
  par nature, et le projet exige déjà « une confirmation explicite et un backup
  vérifié » pour une migration destructive. Sans écran de sauvegarde (fiche
  [26](26-export-et-sauvegarde.md)), cette exigence n'est pas satisfiable.

**Recommandation** : afficher toujours, **appliquer seulement les migrations non
destructives**, et renvoyer explicitement à la CLI pour les destructives, en donnant
la commande exacte à copier. C'est plus utile qu'un bouton qui refuse sans expliquer.

### Tâche 3 — Outils

**Fichiers** : nouvelle route `packages/admin/src/routes/tools.tsx`.

Chaque outil : ce qu'il fait, sa durée estimée, sa réversibilité, une barre de
progression, et un journal d'exécution.

- **Purger les caches** — sans risque.
- **Réindexer la recherche** — `withSearchIndexing` existe ; il lui faut un
  déclencheur de réindexation complète, indispensable après un import.
- **Réindexer les vecteurs** — `withVectorIndexing` existe (L18), même besoin.
- **Régénérer les variantes d'images** — nécessaire après un changement de tailles
  (fiche [23](23-reglages-du-site.md)) ; les variantes sont produites à l'upload, donc
  les anciennes ne changent jamais toutes seules.
- **Vérifier les liens** — internes d'abord (une entrée liée ou un menu pointant vers
  une entrée absente, dépubliée ou à la corbeille), externes ensuite et **désactivés
  par défaut** (requêtes sortantes, R1).
- **Tester l'envoi d'e-mail** — via `@cogenta/channels`, avec l'erreur exacte du
  transport en cas d'échec.
- **Vider la corbeille expirée** — déclencher `purgeExpired()` à la demande.

Un traitement long ne doit pas être une requête HTTP qui expire : la file existe
(`queue`, avec son driver dégradé). Les outils y passent, et l'écran suit l'avancement.

### Tâche 4 — Journal des erreurs

**Fichiers** : `@cogenta/core` (logger), nouvelle route.

Les N dernières erreurs serveur, avec code, message, horodatage et trace, consultables
depuis l'admin. Bornées (les N dernières, pas tout), purgées, et **sans donnée
personnelle ni secret** (`AGENTS.md` § Logs). Un message d'erreur peut contenir une URL
de base de données : filtrer, comme le fait déjà le garde-fou `CONFIG_SECRET_IN_FILE`.

**Critère** : sur un hébergement mutualisé sans accès à la sortie du processus,
diagnostiquer un 500 depuis l'admin.

### Tâche 5 — Mode maintenance

**Fichiers** : réglages (fiche 23), `theme-render.ts`.

Interrupteur qui sert un 503 avec une page d'attente à tous les visiteurs, tout en
laissant passer les comptes authentifiés. `Retry-After` correct, et **jamais de cache**
sur la réponse — un 503 mis en cache par un intermédiaire survit à la fin de la
maintenance.

## 5. Critères d'acceptation

- Le diagnostic de l'admin est **le même code** que `cogenta doctor`.
- Une installation fraîche n'a pas l'air cassée à cause des drivers dégradés.
- Une migration en attente est signalée avant de causer une erreur incompréhensible.
- Un traitement long passe par la file, avec un avancement visible.
- Aucun secret n'apparaît dans le journal des erreurs.
- Un 503 de maintenance n'est jamais mis en cache.

## 6. Tests exigés

- Unitaires : le diagnostic partagé rend le même résultat en CLI et par l'API.
- Bout en bout : réindexation complète après un import, en vérifiant que la recherche
  retrouve le contenu importé.
- Bout en bout : mode maintenance — 503 pour un anonyme, 200 pour un authentifié.
- Unitaires : filtrage des secrets dans le journal des erreurs.
- Permissions : tout est `admin`.
- Driver dégradé testé pour la file utilisée par les outils.

## 7. Pièges connus

- **Deux diagnostics divergent toujours.** Extraire le cœur de `doctor`, ne pas le
  réécrire.
- **Un traitement long dans une requête HTTP expire** — et pire, il peut être relancé
  par un rechargement de page, en double.
- **« Dégradé » n'est pas « cassé ».** C'est la convention du projet ; l'écran doit
  l'expliquer, sinon il génère des tickets de support inutiles.
- **Un 503 mis en cache est une panne prolongée** après la fin de la maintenance.
- **Le journal des erreurs peut fuiter des secrets et des données personnelles.** Le
  filtrage n'est pas optionnel.
- **Appliquer une migration destructive sans sauvegarde vérifiée** contredit une règle
  écrite du projet.

## 8. Décisions à prendre

- Migrations : afficher seulement, ou appliquer les non destructives (recommandé).
- Vérification des liens externes : désactivée par défaut (recommandé, R1).
- Journal des erreurs : combien d'entrées, quelle rétention.
