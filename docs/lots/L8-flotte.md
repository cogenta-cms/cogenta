# L8 — Flotte

## Objectif

Le plan de contrôle multi-sites : une agence supervise 20 à 100 sites clients depuis une
interface unique. Versions, CVE ouvertes, performances, sauvegardes, mises à jour
groupées, rapports par client.

C'est le lot qui transforme Cogenta d'un bon CMS en un outil dont une agence ne peut
plus se passer.

## Dépendances

L5 (les agents produisent les données de supervision), L6 (les rapports partent sur les
canaux).

## Principe fondateur

**Chaque site reste une installation autonome, avec sa propre base.** Le plan de
contrôle est un observateur et un déclencheur, pas un propriétaire (ADR-0003).

Conséquences non négociables :

- Un site compromis ne peut pas atteindre les autres
- Un client qui part emporte son installation entière, sans démantèlement
- Le plan de contrôle indisponible n'empêche aucun site de fonctionner
- Aucune donnée de contenu ne remonte au plan de contrôle : uniquement des métadonnées
  d'exploitation

## Périmètre

- Enregistrement d'un site auprès d'un plan de contrôle
- Inventaire : versions du CMS, des plugins, des thèmes, des dépendances
- Supervision : disponibilité, CVE ouvertes, Core Web Vitals, état des sauvegardes,
  expiration des certificats et des domaines
- Mises à jour groupées, par vagues, annulables
- Rapports par client, planifiés
- Isolation stricte, y compris pour la mémoire des agents

## Arborescence

```
packages/fleet/
├── src/
│   ├── enrollment/       # appairage site ↔ plan de contrôle
│   ├── agent/            # côté site : émission de télémétrie
│   ├── control/          # côté plan de contrôle : ingestion, état
│   ├── inventory/
│   ├── rollout/          # mises à jour par vagues
│   └── reporting/
```

## Appairage

Un site s'enregistre avec un jeton généré par le plan de contrôle, à usage unique et
limité dans le temps. Après appairage, chacun détient une paire de clés ; toutes les
communications sont mutuellement authentifiées.

**C'est le site qui pousse**, le plan de contrôle n'ouvre jamais de connexion vers le
site. Raison : un site derrière un pare-feu, en mutualisé ou en statique, doit être
supervisable. Et un plan de contrôle compromis ne dispose alors d'aucun canal entrant
vers les sites.

Les commandes du plan de contrôle vers un site sont **récupérées par le site** lors de
son prochain contact, signées, et exécutables uniquement dans une liste blanche
d'actions.

## Ce qui remonte, et ce qui ne remonte pas

**Remonte** : versions installées, empreinte du SBOM, CVE ouvertes et leur statut,
Core Web Vitals agrégés, disponibilité, dates et résultats des sauvegardes, expiration
des certificats, comptes administrateurs (nombre et état MFA, pas les identités), erreurs
agrégées.

**Ne remonte jamais** : contenu, médias, données personnelles des visiteurs, clés API,
mémoire des agents, journaux bruts.

Cette frontière est un critère d'acceptation testé, pas une intention.

## Mises à jour groupées

Le déploiement d'une mise à jour sur une flotte se fait **par vagues** :

1. Sélection d'un site canari
2. Application, vérification automatique (le site répond, les pages clés se rendent,
   pas de régression de performance)
3. Si succès, vague suivante — 10 %, puis 50 %, puis le reste
4. Un échec **arrête toute la campagne** et propose le retour arrière du site concerné

Chaque site conserve son propre historique de version et peut être revenu en arrière
indépendamment. Il n'existe pas d'état global à restaurer.

## Rapports client

Un rapport mensuel par site, généré et envoyé sur le canal choisi ou par email :
disponibilité, incidents de sécurité et leur traitement, performances, contenu publié,
actions des agents, sauvegardes vérifiées.

C'est un livrable commercial pour l'agence, pas un tableau technique. Le format doit
pouvoir être lu par le client final.

## Isolation de la mémoire des agents

**Point de vigilance maximal.** Un agent opérant sur le site A ne doit jamais avoir en
mémoire quoi que ce soit du site B — ni fait, ni exemple, ni formulation. Une fuite de
ce type entre deux clients d'une même agence est un incident grave et immédiatement
visible.

La portée de mémoire est `site`, appliquée au niveau du stockage, avec un test dédié qui
tente explicitement la traversée.

## Tâches, dans l'ordre

1. Protocole d'appairage, clés, révocation
2. Émission de télémétrie côté site, avec filtrage strict de ce qui sort
3. Ingestion et modèle d'état côté plan de contrôle
4. Inventaire et détection de dérive de version
5. Tableau de bord de flotte : tri par risque, pas par ordre alphabétique
6. Récupération de commandes signées, liste blanche d'actions
7. Mises à jour par vagues avec vérification et arrêt sur échec
8. Retour arrière par site
9. Rapports client planifiés
10. Alertes de flotte sur les canaux
11. Tests d'isolation inter-sites

## Critères d'acceptation

- Aucune donnée de contenu ni mémoire d'agent ne traverse la frontière entre deux sites,
  prouvé par test
- Un plan de contrôle indisponible n'affecte aucun site
- Un jeton d'appairage est à usage unique et expire
- Le plan de contrôle n'ouvre jamais de connexion entrante vers un site
- Une mise à jour groupée s'arrête à la première vague en échec
- Un site peut être détaché de la flotte et continuer à fonctionner seul
- Le tableau de bord classe par risque : un site avec une CVE critique passe devant
- Un rapport client est compréhensible par un non-technicien

## Tests exigés

| Type | Portée |
|---|---|
| Sécurité | Tentative de traversée de frontière entre deux sites |
| Sécurité | Rejeu de jeton d'appairage, commande non signée |
| Sécurité | Vérification exhaustive de ce qui sort d'un site |
| Résilience | Plan de contrôle éteint : les sites continuent |
| Intégration | Campagne de mise à jour avec échec injecté en vague 2 |
| Charge | 100 sites simulés émettant leur télémétrie |

## Pièges connus

**La tentation de la centralisation.** Il sera tentant de stocker le contenu au centre
« pour simplifier ». C'est la fin de l'isolation et la mort de l'argument de sécurité.
Refuser systématiquement.

**La télémétrie qui grossit.** Rétention et agrégation dès le départ. Cent sites ×
plusieurs métriques × chaque minute remplit une base très vite.

**Le tableau de bord inutilisable au-delà de vingt sites.** Concevoir directement pour
cent : tri par risque, filtres, regroupement par client, recherche.

**Les faux positifs de disponibilité.** Un réseau instable produit des alertes de panne
inexistantes. Exiger plusieurs échecs consécutifs depuis plusieurs points avant d'alerter.

## Hors périmètre

Facturation client, gestion de contrats, CRM, hébergement fourni par le plan de contrôle.
Le plan de contrôle supervise ; il n'héberge pas.
