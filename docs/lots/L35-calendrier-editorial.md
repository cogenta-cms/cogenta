# L35 — Le calendrier éditorial

> Troisième manque de l'inventaire WordPress. Pas dans le cœur de WordPress non
> plus : c'est l'extension « Editorial Calendar » que toute rédaction installe
> dès qu'elle publie plus d'un article par semaine.

## Le problème

La programmation existe (une entrée `scheduled` avec un `publishedAt` futur
est publiée par la file de tâches), mais on ne la voit qu'entrée par entrée.
Personne ne peut répondre à « qu'est-ce qui sort la semaine prochaine ? », voir
un trou dans le planning ni déplacer une parution sans ouvrir l'entrée.

## Un défaut trouvé avant de commencer, corrigé d'abord

Chaque enregistrement d'une entrée programmée met une tâche en file et
n'annule jamais la précédente ; la tâche qui arrive à échéance relisait
l'entrée mais ne vérifiait que son statut. **Une parution repoussée de lundi à
vendredi sortait lundi.** Or déplacer une date est précisément le geste
principal d'un calendrier. Corrigé en premier (`isPublicationDue` : c'est la
date *actuelle* de l'entrée qui décide), prouvé par un test de bout en bout
qui échouait avant la correction.

## Décisions

1. **Aucun contrat ne bouge.** Le calendrier lit `publishedAt`, un champ
   ordinaire que les collections qui publient déclarent déjà, et reprogramme
   par la route existante (`unpublish` avec `status: 'scheduled'`), gardée par
   `publish`. Une collection sans `publishedAt` n'apparaît pas : elle ne peut
   pas être programmée.
2. **Une lecture, une porte.** `GET /api/content/-/calendar?from=&to=` ne
   parcourt que les collections où l'acteur peut lire le non-publié, et passe
   chaque entrée par la même porte que les listes (brouillons, visibilité).
   Chaque entrée dit si l'acteur peut la reprogrammer.
3. **Rien ne s'obtient uniquement en glissant** (même règle que le page
   builder, L16) : glisser une entrée sur un jour la reprogramme, et la même
   action existe par un bouton et un champ date.
4. **On ne déplace que ce qui n'est pas encore sorti.** Une entrée publiée est
   affichée à sa date et n'est pas déplaçable : changer la date d'une page en
   ligne, c'est antidater un contenu, pas planifier. Un jour passé n'accepte
   pas de dépôt.
5. **Borné et honnête.** Le filtre par date s'évalue au-dessus du magasin
   (`ListOptions` ne connaît que l'égalité) : la lecture est bornée en lignes
   parcourues et dit quand elle s'est arrêtée.

## Étapes

| Étape | Contenu | État |
|---|---|---|
| 1 | Prérequis : une parution repoussée ne sort plus à l'ancienne date | **fait** |
| 2 | La lecture : `GET /api/content/-/calendar`, portes et bornes, entrées à programmer | **fait** |
| 3 | L'écran : mois, entrées par jour, glisser et bouton pour reprogrammer, brouillons à programmer | **fait** |
| 4 | Documentation et clôture | **fait** |

## Pièges connus, écrits avant de coder

1. **Le fuseau horaire.** Le serveur stocke un instant UTC ; un jour du
   calendrier est un jour *local*. Le regroupement par jour se fait côté
   navigateur, et la plage demandée couvre toute la grille affichée.
2. **Garder l'heure.** Glisser une parution de 9 h du mardi au jeudi la met au
   jeudi 9 h, pas à minuit.
3. **Aujourd'hui.** Déposer un brouillon sur aujourd'hui à une heure déjà
   passée le publierait au prochain passage de la file : l'heure proposée est
   donc l'heure pleine suivante.

## Rapport de clôture (2026-09-16)

**Le défaut d'abord.** Chaque enregistrement d'une entrée programmée met une
tâche en file sans annuler la précédente, et le gestionnaire ne vérifiait que
le statut : une parution repoussée sortait à l'ancienne date. Un test de bout
en bout sur un vrai serveur l'a reproduit (programmée dans une demi-seconde,
repoussée d'une heure, **publiée** au passage suivant) avant la correction :
`isPublicationDue` (`@cogenta/schema`) fait décider la date *actuelle* de
l'entrée, la tâche périmée ne fait rien et celle du dernier enregistrement
publie à l'heure. Ce défaut existait avant le calendrier, depuis l'éditeur
d'entrée ; le calendrier l'aurait rendu quotidien.

**La lecture** (`GET /api/content/-/calendar?from=&to=`, `@cogenta/api`) ne
parcourt que les collections qui déclarent `publishedAt` et dont l'acteur peut
lire le non-publié, fait passer chaque entrée par la porte des listes
(brouillons, visibilité), renvoie les parutions de la fenêtre triées et les
brouillons à programmer, dit pour chacune si l'acteur peut la déplacer
(`publish`). Fenêtre de 93 jours au plus, parcours borné à 5 000 lignes et qui
le dit.

**L'écran** (Contenu → Calendrier éditorial) : grille de six semaines,
semaine commençant le lundi (le dimanche en anglais), regroupement par jour
**local** dans le navigateur. Déposer une entrée et valider la boîte de dialogue
appellent la même fonction, qui appelle la même route que l'éditeur d'entrée.
Les règles de date (heure conservée, 9 h par défaut, heure pleine suivante
aujourd'hui, refus d'un jour passé) vivent dans un module pur testé à part.

Aucun contrat touché, pas d'ADR.

### Vérifié

`@cogenta/schema` (`isPublicationDue`, 3 tests), `@cogenta/cli` (programmation
de bout en bout, dont la parution repoussée), `@cogenta/api` (calendrier,
4 tests ; suite REST complète 1 020 verte), `@cogenta/admin` (règles de date,
7 tests ; écran, 4 tests : jour d'affichage, reprogrammation sans glisser,
glisser en gardant l'heure, entrée publiée non déplaçable). Dans un navigateur
sur `examples/local-playground` : le mois de septembre avec les parutions
réelles, un brouillon glissé sur un jour (programmé à 9 h locale), puis
reprogrammé par la boîte de dialogue (vendredi 14 h), vérifié par l'API, puis
supprimé.

### Reste ouvert, assumé

- **Pas de vue semaine ni liste** : le mois suffit à voir un planning ; une vue
  semaine avec les heures serait l'étape suivante si des rédactions publient
  plusieurs fois par jour.
- **Le filtre de date s'évalue au-dessus du magasin** : `ListOptions` ne
  connaît que l'égalité. Au-delà de 5 000 entrées par lecture, le calendrier le
  dit ; le vrai remède est un filtre par plage dans le magasin, qui touche
  l'interface du contrat A.
- **Pas de glisser au clavier** : l'alternative clavier est la boîte de
  dialogue, comme pour le page builder.
