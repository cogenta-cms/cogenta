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
| 2 | La lecture : `GET /api/content/-/calendar`, portes et bornes, entrées à programmer | à faire |
| 3 | L'écran : mois, entrées par jour, glisser et bouton pour reprogrammer, brouillons à programmer | à faire |
| 4 | Documentation et clôture | à faire |

## Pièges connus, écrits avant de coder

1. **Le fuseau horaire.** Le serveur stocke un instant UTC ; un jour du
   calendrier est un jour *local*. Le regroupement par jour se fait côté
   navigateur, et la plage demandée couvre toute la grille affichée.
2. **Garder l'heure.** Glisser une parution de 9 h du mardi au jeudi la met au
   jeudi 9 h, pas à minuit.
3. **Aujourd'hui.** Déposer un brouillon sur aujourd'hui à une heure déjà
   passée le publierait au prochain passage de la file : l'heure proposée est
   donc l'heure pleine suivante.
