# 28 — Tâches planifiées

> **État** : **absent côté admin.** Des traitements planifiés tournent réellement ;
> aucun écran ne les montre.
> **Existant** : planificateur de publication (`packages/schema/src/scheduling/publish.ts`,
> enregistré par `cogenta serve`, toutes les 60 s plus une fois au démarrage),
> `purgeExpired()` de la corbeille, file (`queue`) avec driver dégradé
> **Écran** : aucun
> **Effort** : 3–4 jours
> **ADR requise** : non

---

## 1. Ce qui existe réellement

- **Publication programmée** : le planificateur est réellement enregistré par
  `cogenta serve` et publie une entrée quand sa date arrive. Vérifié, et c'est ce qui
  rend le contrôle de programmation de l'éditeur non fictif.
- **`purgeExpired()`** existe pour la corbeille (`trash.retainDays`, 30 jours par
  défaut). **À vérifier** : est-il réellement planifié par `cogenta serve` ? La fiche
  [07](07-corbeille.md) en dépend, et annoncer une purge qui n'a pas lieu serait pire
  que le silence.
- Une file (`queue`) est configurée, avec driver optimal et dégradé.
- `@cogenta/fleet` a des campagnes par vagues et des rapports planifiés — mais c'est
  le plan de contrôle multi-sites, pas la console d'un site.

**Ce qui manque** : aucun écran ne dit ce qui est planifié, quand cela a tourné pour la
dernière fois, si cela a réussi, et ce qui attend dans la file.

## 2. Ce que font les CMS de référence

| Fonction | WP Crontrol | Drupal 11 | Cogenta |
|---|---|---|---|
| Liste des tâches planifiées | ✅ | ✅ | ❌ |
| Prochaine exécution, dernière exécution | ✅ | ✅ | ❌ |
| Déclencher maintenant | ✅ | ✅ | ❌ |
| Journal d'exécution et erreurs | partiel | ✅ | ❌ |
| File de travaux en attente | ❌ | ✅ | ❌ |
| Alerte quand le planificateur ne tourne plus | ✅ | ✅ | ❌ |
| Ajouter une tâche | ✅ | plugin | ❌ |

## 3. Écarts, classés

### Importants

1. **Aucune visibilité.** Un article programmé qui ne se publie pas est indétectable
   avant qu'un lecteur ne le signale. C'est le mode de panne le plus insidieux d'un
   CMS : silencieux, et découvert par le public.
2. **Aucune alerte.** Si le processus est redémarré ou si le planificateur lève une
   exception, plus rien ne se publie et rien ne le dit.
3. **Rien sur la file.** Les outils de la fiche [24](24-sante-et-outils.md), l'import
   de la fiche [25](25-import.md) et les sauvegardes de la fiche
   [26](26-export-et-sauvegarde.md) passeront tous par la file. Sans écran, un travail
   bloqué est invisible.

### Confort

4. Pas de déclenchement manuel.
5. Pas d'historique d'exécution.

## 4. Plan de développement

### Tâche 1 — Registre des tâches

**Fichiers** : `@cogenta/core` ou `@cogenta/schema` (nouveau module `scheduler`),
`packages/cli/src/commands/serve.ts`.

Aujourd'hui, `serve.ts` enregistre le planificateur de publication en direct. Le
remplacer par un **registre** : chaque tâche déclare un nom, une description, un
intervalle, et sa fonction. Le registre garde, pour chacune : dernière exécution,
durée, résultat, erreur, prochaine exécution.

Tâches à enregistrer dès le départ : publication programmée, purge de la corbeille,
vérification d'intégrité de l'audit (fiche [21](21-journal-d-audit.md)), purge de
rétention analytics (fiche [27](27-analytics.md)), sauvegarde planifiée (fiche
[26](26-export-et-sauvegarde.md)).

**Critère** : ajouter une tâche planifiée = une déclaration, et elle apparaît à
l'écran sans travail d'interface.

### Tâche 2 — Écran

**Fichiers** : nouvelle route `packages/admin/src/routes/scheduled.tsx`,
`shell/nav-items.ts`.

- Tableau des tâches : nom, description, intervalle, dernière exécution, durée,
  résultat, prochaine exécution.
- Bouton « exécuter maintenant » par tâche, avec le résultat affiché — attention aux
  tâches destructives (la purge de corbeille en est une) : confirmation explicite.
- Historique des N dernières exécutions par tâche, avec l'erreur exacte en cas
  d'échec.
- Section « file » : travaux en attente, en cours, échoués, avec possibilité de
  relancer un échec.
- Section « contenu programmé » : la liste des entrées en attente de publication, avec
  leur date — reprend le widget du tableau de bord et l'approfondit.

**Critère** : savoir en un écran que la publication programmée a tourné il y a
quarante secondes et que rien n'est en échec.

### Tâche 3 — Détection d'arrêt

**Fichiers** : registre, fiche [38](38-notifications-et-notices.md).

Une tâche dont la dernière exécution est plus vieille que deux fois son intervalle est
**en retard**. L'écran le signale, une notice apparaît, et une alerte peut partir sur
un canal (`@cogenta/channels`).

Cas particulier à traiter : si le processus est arrêté, le détecteur l'est aussi. La
détection doit donc reposer sur un **horodatage persisté** relu au démarrage
(« la publication programmée n'a pas tourné depuis 14 heures ») plutôt que sur un
minuteur en mémoire. C'est la seule forme qui survit à un redémarrage — et c'est
précisément dans ce cas qu'on veut être prévenu.

**Critère** : arrêter le serveur une nuit, le rallumer, et voir immédiatement que
trois publications programmées ont été manquées et rattrapées.

### Tâche 4 — Fiabilité de la publication programmée

**Fichiers** : `packages/schema/src/scheduling/publish.ts`.

Trois points à vérifier et, si nécessaire, à corriger :

- **Rattrapage** : une entrée dont la date est passée pendant l'arrêt doit se publier
  au démarrage. Le planificateur tourne « une fois au démarrage », ce qui suggère que
  c'est déjà le cas — le vérifier par un test explicite.
- **Concurrence** : deux processus (déploiement à plusieurs instances) ne doivent pas
  publier deux fois. Un verrou en base ou un `UPDATE … WHERE status = 'scheduled'` qui
  gagne la course. Le test de concurrence du stock commerce est le modèle exact à
  copier : fichier SQLite réel, deux connexions, et un contre-test qui prouve que la
  version naïve échoue.
- **Échec** : une entrée dont la publication échoue (validation, permission) ne doit
  pas être réessayée en boucle indéfiniment ni rester silencieusement `scheduled`.
  Elle doit apparaître en échec dans l'écran.

### Tâche 5 — Le cas de l'hébergement mutualisé

**Fichiers** : documentation, `packages/cli`.

`docs/hebergement-mutualise.md` cible explicitement les hébergements où le processus
peut être arrêté entre deux requêtes. Un planificateur en mémoire n'y tourne pas de
façon fiable.

Prévoir une seconde voie : `cogenta cron` (une commande qui exécute les tâches dues et
sort), appelable depuis le cron du panneau d'hébergement. L'écran doit alors dire
quel mode est actif — planificateur interne ou cron externe — et signaler si le cron
externe est déclaré mais n'a jamais appelé.

**Critère** : un site en mutualisé publie ses articles programmés à l'heure, et l'admin
dit lequel des deux mécanismes le fait.

## 5. Critères d'acceptation

- On voit ce qui est planifié, quand cela a tourné, et si cela a réussi.
- Une tâche en retard est signalée sans intervention.
- Une publication programmée manquée pendant un arrêt est rattrapée, et le rattrapage
  est visible.
- Deux processus ne publient pas deux fois la même entrée.
- Un travail en échec dans la file est visible et relançable.
- Un hébergement sans processus permanent dispose d'une voie documentée.

## 6. Tests exigés

- Bout en bout : programmer une entrée dans le passé, démarrer le serveur, vérifier la
  publication et l'horodatage d'exécution.
- Concurrence réelle : deux connexions, une seule publication — avec un contre-test
  prouvant que l'implémentation naïve publie deux fois (le motif du test de stock du
  contrat E).
- Unitaires : détection de retard à partir d'un horodatage persisté.
- Bout en bout : `cogenta cron` exécute les tâches dues et sort avec le bon code.
- Permissions : écran `admin` seulement ; « exécuter maintenant » journalisé.
- Driver dégradé de la file testé, pas seulement l'optimal.

## 7. Pièges connus

- **Un planificateur en mémoire ne survit pas à un redémarrage.** La détection de
  retard doit être persistée, sinon elle repart à zéro exactement au moment où elle
  serait utile.
- **Plusieurs instances = double publication**, si rien ne verrouille.
- **« Exécuter maintenant » sur une purge est destructif.** Confirmation.
- **Une tâche qui échoue en boucle** peut saturer les journaux et la file. Limiter les
  reprises, puis marquer en échec.
- **Le mutualisé est un scénario cible documenté** : un écran qui suppose un processus
  permanent y mentira.
- **Ne pas confondre avec `@cogenta/fleet`.** La flotte planifie des campagnes
  multi-sites en push-only (ADR-0003) ; cet écran parle des tâches d'un site.

## 8. Décisions à prendre

- `cogenta cron` : à livrer avec cette fiche (recommandé, pour le mutualisé) ou plus
  tard.
- Verrouillage de la publication concurrente : verrou en base ou course sur `UPDATE`.
  Le second est plus simple et suffit — à confirmer sur les trois moteurs.
