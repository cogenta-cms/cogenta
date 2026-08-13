# L7 — Extensibilité

## Objectif

Permettre à des tiers d'étendre Cogenta sans lui donner les clés. API de plugin,
isolation, permissions déclarées, signature, registres.

C'est le lot qui décide si l'écosystème sera un atout ou la vulnérabilité principale.
90 % des compromissions WordPress passent par un plugin.

## Dépendances

L4 (registre d'outils et permissions).

## Périmètre

- API de plugin
- Manifeste unifié plugin / thème
- Isolation en worker avec client RPC limité aux capacités approuvées
- Écran de permissions à l'installation
- Signature et vérification
- Registres : plugins, thèmes, skills, skins
- Galerie de skins

## Arborescence

```
packages/plugins/
├── src/
│   ├── manifest.ts       # schéma et validation
│   ├── loader.ts         # résolution, vérification, chargement
│   ├── host/             # côté noyau : worker, RPC, capacités
│   ├── guest/            # côté plugin : SDK exposé dans le worker
│   ├── permissions/      # traduction manifeste → capacités accordées
│   └── signing/
```

## Ce qu'un plugin peut apporter

- Des **outils** pour les agents
- Des **blocs** hors vocabulaire (avec bloc de repli obligatoire)
- Des **types de champ**
- Des **drivers** (stockage, cache, fournisseur LLM…)
- Des **canaux**
- Des **skills**
- Des **abonnements à événements**

Un plugin ne peut **pas** : injecter du code dans l'admin sans passer par des points
d'extension déclarés, remplacer le moteur de rendu, contourner les permissions, accéder
à la base directement.

## Isolation

Le noyau et les plugins officiels s'exécutent en processus. **Tout plugin tiers
s'exécute dans un worker séparé.**

Dans ce worker, le plugin n'a accès ni à `fs`, ni à `net`, ni à `process`, ni aux
variables d'environnement, ni aux secrets. Il reçoit un objet SDK dont chaque méthode
correspond à une capacité déclarée dans son manifeste et approuvée par l'utilisateur.
Toute méthode non accordée est absente de l'objet — pas présente et refusée : absente.

Communication par messages sérialisés. Aucun objet vivant du noyau ne traverse la
frontière.

Un plugin qui dépasse son temps ou sa mémoire est tué et désactivé, avec alerte. Il ne
peut pas faire tomber le CMS.

## Manifeste

```ts
definePlugin({
  name: '@auteur/mon-plugin',
  version: '1.0.0',
  engine: '^1.0.0',

  capabilities: [                     // ce qu'il demande
    'content.read',
    'http.fetch:api.exemple.com',     // domaine explicite, jamais '*'
    'storage.write:plugins/mon-plugin',
  ],

  provides: {
    tools: ['exemple.analyser'],
    blocks: [],
    fields: [],
    channels: [],
  },

  runtime: 'server',
  isolated: true,
})
```

Règles de validation, en refus dur :

- `http.fetch` sans liste de domaines est refusé
- l'accès au stockage est confiné à un préfixe propre au plugin
- une capacité inconnue est refusée
- un bloc sans `fallback` est refusé

## Écran de permissions

À l'installation, l'utilisateur voit en langage clair ce que le plugin demande, et **ce
que ça implique concrètement**.

Pas « `http.fetch:api.exemple.com` » mais « Ce plugin pourra envoyer des données à
api.exemple.com ». Pas « `content.write_draft` » mais « Ce plugin pourra créer et
modifier des brouillons, mais pas publier ».

Une demande à risque élevé est signalée visuellement et exige une confirmation
supplémentaire. L'installation sans lecture est possible, mais on ne la facilite pas.

Les permissions sont **révisables après installation**, et révocables.

## Signature

Chaque paquet publié dans un registre officiel est signé. La vérification a lieu à
l'installation et à la mise à jour. Une signature invalide bloque, sans possibilité de
passer outre depuis l'interface.

Un plugin installé depuis un chemin local ou un dépôt git est autorisé en mode
développement, avec avertissement permanent dans l'admin.

## Registres

Quatre registres, avec des exigences différentes :

| Registre | Contenu | Exécute du code | Exigences |
|---|---|---|---|
| Plugins | Code isolé | Oui | Signature, manifeste, revue |
| Thèmes | Code de rendu | Oui, isolé par le plan de diffusion | Signature, contrat vérifié |
| Skills | Instructions + ressources | Non | Revue de contenu |
| Skins | JSON de tokens | **Non** | Validation automatique |

La **galerie de skins** est le cas facile et le plus rentable : un skin est un fichier
JSON de quelques kilo-octets, sans exécution de code, validé automatiquement (contraste,
échelle, complétude). C'est de la contribution communautaire à risque nul. À livrer en
premier dans ce lot.

## Tâches, dans l'ordre

1. Schéma de manifeste et validation
2. Résolution et chargement de plugin
3. Worker isolé, protocole de messages
4. SDK côté plugin, construit dynamiquement selon les capacités accordées
5. Traduction capacités → objet SDK, avec absence des méthodes non accordées
6. Limites de temps, de mémoire, arrêt et désactivation
7. Écran de permissions en langage clair
8. Révision et révocation de permissions après installation
9. Signature et vérification
10. Galerie de skins avec validation automatique
11. Registre de skills
12. Registre de thèmes
13. Registre de plugins
14. Documentation d'auteur de plugin et modèle de démarrage

## Critères d'acceptation

- Un plugin de test qui tente d'accéder à `fs`, au réseau non déclaré, à `process` ou
  aux secrets échoue — quatre tests distincts
- Une méthode non accordée est **absente** de l'objet SDK, pas seulement refusée
- Un plugin en boucle infinie est tué et désactivé sans affecter le CMS
- Un plugin avec `http.fetch` sans domaine explicite est refusé au chargement
- Une signature invalide bloque l'installation
- L'écran de permissions ne contient aucun identifiant technique brut
- Le surcoût de latence de l'isolation est mesuré et documenté
- Un skin déposé dans la galerie est validé ou refusé automatiquement, sans revue humaine

## Tests exigés

| Type | Portée |
|---|---|
| Sécurité | Plugin hostile : quatre vecteurs d'évasion |
| Sécurité | Épuisement de ressources |
| Sécurité | Exfiltration vers un domaine non déclaré |
| Unitaire | Validation de manifeste, traduction des capacités |
| Performance | Latence d'un appel isolé contre un appel en processus |
| Intégration | Cycle installation → permissions → usage → révocation |

## Pièges connus

**Le coût de la sérialisation.** Un plugin appelé mille fois par requête tue les
performances. Prévoir le lotissement des appels et documenter le coût pour les auteurs.

**La tentation de l'échappatoire.** Un jour, un plugin légitime aura besoin d'une chose
non prévue. La réponse est d'ajouter une capacité au vocabulaire, pas d'ouvrir une
porte. Une seule exception détruit le modèle.

**Le SDK devient une API publique.** Tout ce qu'on y expose devient impossible à retirer.
Commencer minimal.

**Les mises à jour de plugins.** Une nouvelle version demandant plus de permissions ne
doit **jamais** s'installer automatiquement. Nouvelle approbation exigée.

## Hors périmètre

Marketplace payante, système de paiement, notation et avis, revue automatisée de sécurité
du code des plugins (l'agent Sécurité pourra s'en charger plus tard).
