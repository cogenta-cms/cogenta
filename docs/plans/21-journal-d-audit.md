# 21 — Journal d'audit

> **État** : bon — filtres, vérification de la chaîne de hachage. Il manque le détail
> et l'exploitation.
> **Écran** : `packages/admin/src/routes/audit.tsx` (176 lignes)
> **API existante** : `packages/api/src/rest/audit-router.ts`, `@cogenta/auth`
> **Effort** : 2–3 jours
> **ADR requise** : non

---

## 1. Ce qui existe réellement

- Journal **à chaîne de hachage** dans `@cogenta/auth` — chaque entrée dépend de la
  précédente, donc une suppression ou une modification a posteriori se détecte. C'est
  une propriété rare et forte pour un CMS, et elle est réellement implémentée.
- `POST /api/audit/verify` vérifie l'intégrité de la chaîne, et l'écran expose le
  bouton.
- Filtres : acteur, action, collection.
- Colonnes : date, acteur, rôles, action, collection, entrée.
- Lecture seule, `admin` seulement.

## 2. Ce que font les CMS de référence

| Fonction | WP Activity Log | Drupal | Strapi 5 | Cogenta |
|---|---|---|---|---|
| Journal des actions | ✅ | ✅ | ✅ (Enterprise) | ✅ |
| **Intégrité vérifiable** | ❌ | ❌ | ❌ | ✅ **unique** |
| Filtres | ✅ | ✅ | ✅ | ✅ |
| **Détail : qu'est-ce qui a changé** | ✅ | partiel | ✅ | ❌ |
| Lien vers l'objet concerné | ✅ | ✅ | ✅ | ❌ (id brut) |
| Export CSV | ✅ | ✅ | ✅ | ❌ |
| Plage de dates | ✅ | ✅ | ✅ | ❌ |
| Alerte sur événement sensible | ✅ | ✅ | ❌ | partiel (notices) |
| Rétention configurable | ✅ | ✅ | ✅ | ? |
| Pagination | ✅ | ✅ | ✅ | ? à vérifier |
| Actions d'agents distinguées | — | — | — | ❌ |

## 3. Écarts, classés

### Importants

1. **On ne voit pas ce qui a changé.** « editor a modifié article/abc » ne dit pas
   quoi. Or `GET .../diff` existe et produit un diff structurel de qualité (fiche
   [06](06-versions-et-historique.md)). Relier les deux est le gain le plus élevé de
   cette fiche.
2. **Pas de filtre par plage de dates.** C'est le premier filtre qu'on cherche après
   un incident.
3. **Les identifiants sont bruts.** Ni lien vers l'entrée, ni titre, ni e-mail lisible
   pour l'acteur.
4. **Pas d'export.** Un audit qu'on ne peut pas sortir ne sert pas en cas de contrôle.

### Confort

5. Vérification d'intégrité en un bouton, sans planification ni alerte : personne ne
   la lance jamais.
6. Rétention non affichée.
7. Les actions d'agents ne sont pas distinguées de celles des humains — alors que R6
   fait de la traçabilité des agents un principe du produit.

## 4. Plan de développement

### Tâche 1 — Détail d'une entrée

**Fichiers** : `routes/audit.tsx`, `audit-router.ts`.

Ouvrir une entrée affiche : acteur (e-mail, ou nom quand la fiche
[17](17-utilisateurs.md) l'aura ajouté), rôles au moment de l'action, action,
collection, entrée avec son **titre** et un lien, horodatage, contexte technique
(origine de la requête : session admin, clé d'API, agent, canal).

Pour une action de contenu, afficher le **diff** entre la version d'avant et celle
d'après. Deux façons : stocker les numéros de version dans l'entrée d'audit
(nécessite de vérifier ce que le modèle porte déjà), ou retrouver la version par
horodatage — moins fiable. Préférer la première.

**Critère** : répondre à « qui a vidé cette page, et qu'y avait-il ? » sans quitter
l'écran.

### Tâche 2 — Dates, export, pagination

**Fichiers** : `routes/audit.tsx`, `audit-router.ts`.

Filtre par plage de dates, raccourcis (aujourd'hui, 7 jours, 30 jours). Export CSV et
JSON de la vue filtrée, en réutilisant `lib/csv.ts`. Pagination par curseur cohérente
avec le reste de l'API.

**L'export d'un journal d'audit est lui-même un événement à journaliser.**

### Tâche 3 — Vérification d'intégrité, réellement exploitée

**Fichiers** : `audit-router.ts`, fiches [28](28-taches-planifiees.md) et
[38](38-notifications-et-notices.md).

Un bouton qu'on ne presse jamais ne protège de rien. Donc :

- vérification **planifiée** (quotidienne), avec date et résultat du dernier passage
  affichés sur l'écran ;
- **notice de haute sévérité** et alerte de canal (`@cogenta/channels`) en cas de
  rupture — c'est exactement le type d'événement que la file d'alertes de L6 et de L8
  a été construite pour porter ;
- la vérification doit être **bornée** : sur un journal d'un million d'entrées, elle
  ne peut pas tout relire à chaque fois. Vérification incrémentale depuis le dernier
  point vérifié, avec une vérification complète plus rare.

**Critère** : altérer une ligne du journal en base fait apparaître une alerte dans les
24 heures, sans que personne n'ait cliqué.

### Tâche 4 — Distinguer les agents

**Fichiers** : `@cogenta/auth` (modèle d'entrée), `audit-router.ts`,
`routes/audit.tsx`.

R6 : « toute action d'agent est journalisée, diffée et réversible ». Le journal doit
donc dire, sans ambiguïté : action humaine, action d'agent (lequel, quel modèle, quelle
autonomie), ou action par clé d'API (laquelle).

Filtre dédié, et un onglet « actions d'agents » — parce que c'est la question qu'un
exploitant se pose en premier sur un CMS agentique.

Vérifier ce que le modèle porte déjà avant d'ajouter un champ ; `@cogenta/agents` a
déjà une notion de trace.

### Tâche 5 — Rétention

**Fichiers** : configuration, `audit-router.ts`, écran.

Afficher la rétention effective. Si une purge existe, dire quand elle a lieu ; si elle
n'existe pas, dire que le journal croît indéfiniment — ce qui est une information utile
d'exploitation, pas un détail.

**Attention** : purger un journal à chaîne de hachage casse la chaîne à la coupure. Il
faut soit archiver le segment purgé avec son dernier hachage, soit accepter et
documenter une vérification qui ne remonte qu'au point de troncature. Ne pas purger
naïvement.

## 5. Critères d'acceptation

- Une entrée d'audit dit ce qui a changé, pas seulement que quelque chose a changé.
- Une rupture d'intégrité alerte sans intervention humaine.
- Les actions d'agents sont distinguables des actions humaines.
- L'export est possible et lui-même journalisé.
- La purge, si elle existe, ne casse pas silencieusement la vérification.

## 6. Tests exigés

- Bout en bout : modifier une entrée, vérifier que l'audit affiche le bon diff.
- Sécurité : altérer une ligne en base, vérifier que la vérification échoue et que
  l'alerte part (le test qui donne sa valeur à toute la fonctionnalité).
- Unitaires : vérification incrémentale équivalente à la vérification complète.
- Unitaires : la purge conserve la vérifiabilité du segment restant.
- Permissions : `admin` seulement, y compris sur l'export.

## 7. Pièges connus

- **La chaîne de hachage est la fonctionnalité.** Toute évolution qui permettrait de
  réécrire ou de réordonner une entrée la détruit. Passer par `security-reviewer`
  pour toute modification du modèle d'entrée.
- **Le journal contient des données personnelles** (e-mails, actions nominatives). Son
  export est une extraction de données personnelles : réservé à `admin`, journalisé,
  et pris en compte dans la politique de rétention.
- **Ne pas dupliquer le diff.** `GET .../diff` existe ; l'audit doit l'appeler, pas le
  recalculer.
- **La vérification complète est un scan.** Sur un gros journal, elle doit être
  incrémentale, sinon elle sera désactivée par quelqu'un un jour de charge.
- **Un journal qui croît sans limite finit par saturer le disque** d'un hébergement
  mutualisé — le scénario que `docs/hebergement-mutualise.md` cible explicitement.

## 8. Décisions à prendre

- Rétention : durée par défaut, et stratégie d'archivage préservant la vérifiabilité.
- Vérification planifiée : fréquence, et canal d'alerte par défaut.
