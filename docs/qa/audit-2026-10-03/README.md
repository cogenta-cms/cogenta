# Audit local de Cogenta — 3 octobre 2026

Rapport consolidé : [rapport.html](rapport.html). Matrice détaillée des 52 menus et sous-écrans : [exhaustif/rapport.html](exhaustif/rapport.html). Backlog : [corrections.md](corrections.md)
et [corrections.json](corrections.json). Résumé chiffré :
[evidence/summary.json](evidence/summary.json).

**Verdict : NO GO pour une mise en production générale du commit audité.**
Les constats comportent reproduction, conséquence, correction proposée et critère
de recette. Ce dossier constitue un audit, pas une correction du code produit ni
une certification d'absence de défauts.

## Ouvrir le rapport

Ouvrir `rapport.html` directement dans un navigateur, ou, depuis la racine :

```sh
python3 -m http.server 4180 --bind 127.0.0.1 --directory docs/qa/audit-2026-10-03
```

Puis ouvrir <http://127.0.0.1:4180/rapport.html>. Les principales captures sont
intégrées au HTML. Conserver les dossiers `screenshots/` et `evidence/` à côté du
HTML pour la galerie complète et les preuves. Les filtres et l'agrandissement
fonctionnent sans service externe. La comparaison avec WordPress, Drupal, Strapi,
Ghost et Directus repose sur leurs documentations officielles citées, pas sur une
installation comparative ni un classement de performances.

## Environnement et isolation

- Commit audité : `d28eda09a37be677e429c097da72d257530f4e93`.
- Node 22.22.1, pnpm 10.28.1 via Corepack, Chrome Linux à
  `/usr/bin/google-chrome`, Playwright du workspace.
- Dix sites SQLite neufs sous `.cogenta/qa-2026-10-03/`, langues fr/en, langue
  par défaut fr, sans fournisseur IA ni clé externe.
- Vitrine 4100, Blog 4101, Store 4102, Blank 4103, Magazine 4104, Portfolio 4105,
  Documentation 4106, Association 4107, Restaurant 4108, SaaS 4109.
- Comptes `example.test`, médias et contenus QA dédiés ; aucune donnée du
  playground préexistant modifiée. La charge de menu javascript a été retirée.
- La restauration a ciblé une base neuve distincte `restore-empty`, jamais la
  base existante. Ses 98 tables et 470 lignes ont été recomptées.

Les mots de passe, tokens et sauvegardes contenant les données d'authentification
restent dans le runtime ignoré. Ils ne sont pas nécessaires pour consulter le
rapport. Ne pas publier ce répertoire runtime. La campagne a contrôlé que les
valeurs des mots de passe QA et tokens de rôles ne figurent pas dans les artefacts
textuels livrés. Les captures affichent uniquement les identités et fixtures QA.

## Reproduction sur une nouvelle installation

Les scripts d'exploration effectuent des mutations et utilisent des slugs fixes.
Ne pas relancer leur ensemble sur le même jeu de données : cela provoquerait des
doublons et écraserait des fichiers de preuve. Pour une nouvelle campagne, copier
les scripts dans un nouveau dossier daté et adapter le chemin `runtime` dans
`browser-kit.mjs` et `setup.mjs` ; conserver les preuves originales.

Depuis la racine, construire le code puis installer les dix modèles :

```sh
corepack pnpm -r --workspace-concurrency=2 run build
corepack pnpm -r --workspace-concurrency=2 run typecheck
node docs/qa/audit-2026-10-03/setup.mjs vitrine blog store blank magazine portfolio documentation association restaurant saas
```

Lancer Vitrine dans un terminal séparé :

```sh
cd .cogenta/qa-2026-10-03/vitrine
node ../../../packages/cli/dist/bin.js serve --port 4100 --host 127.0.0.1
```

Puis les autres sites depuis la racine :

```sh
node docs/qa/audit-2026-10-03/serve-sites.mjs
```

Le superviseur arrête ses neuf enfants sur SIGINT/SIGTERM. Il ne supervise pas
Vitrine. En fin d'audit, les neuf sites annexes ont été arrêtés ; Vitrine reste
accessible localement. Les scripts navigateur peuvent utiliser `QA_BASE` et
`QA_SITE` ; les scripts métier supposent majoritairement Vitrine et des fixtures
créées par les étapes précédentes.

### Navigation et captures

```sh
node docs/qa/audit-2026-10-03/sweep-admin.mjs
node docs/qa/audit-2026-10-03/sweep-public.mjs
node docs/qa/audit-2026-10-03/editorial-e2e.mjs
```

`browser-kit.mjs` réalise le login HTTP réel pour l'administration, crée un
contexte Chrome et charge les images lazy avant capture. Formats principaux :
1440×1000 et 390×844. Les sweeps enregistrent DOM, liens, champs, erreurs réseau/JS,
mesures de largeur et axe. Une visite sans erreur ne prouve pas toutes les
mutations d'une fonctionnalité.

### Parcours métier explorés

Les scripts `api-audit.mjs`, `followup.mjs`, `closing-tests.mjs`,
`verified-tests.mjs`, `permissions-final.mjs`, `content-extras.mjs`,
`mcp-e2e.mjs`, `tabs-e2e.mjs` et `ui-final.mjs` documentent les requêtes et
contre-tests. Ils dépendent des fixtures et sessions précédentes ; les lire avant
exécution. Certaines preuves complémentaires ont été produites par des commandes
ciblées, notamment GraphQL, recherche MCP fr/en, backup/restore et Lighthouse.
Leurs résultats sont conservés dans `evidence/`.

Les scripts initiaux étaient exploratoires : leurs statuts `failed` incluent des
attentes et sélecteurs erronés. Le rapport explique les corrections (HTTP aperçu
201, champs anti-abus, endpoints réels, libellés d'onglets, logout, GraphQL). Utiliser
les preuves finales indiquées dans chaque constat, pas une somme brute de tous les
échecs de scripts. Ces scripts ne remplacent pas une suite E2E maintenue en CI.

### Tests du workspace

```sh
corepack pnpm lint
corepack pnpm docs:check
node docs/qa/audit-2026-10-03/unit-runner.mjs
corepack pnpm test:integration
```

La campagne unitaire passe les paquets successivement avec deux workers. Les
premiers runs admin/CLI/create ont été interrompus par un plafond de cinq minutes
du harnais ; le script conservé utilise vingt minutes. Des reprises complètes
longues et des reprises ciblées des fichiers échoués sont conservées séparément.
La forte charge locale a produit des timeouts : les résultats complets restent
visibles même lorsqu'une reprise ciblée passe. Les tests d'intégration ont ignoré
105 tests faute de services externes dans cette session ; ce n'est pas une preuve
de compatibilité des trois bases. La CI configure des services, mais son résultat
n'a pas été vérifié ici.

La commande officielle `test:e2e` n'a pas de configuration/suite navigateur dédiée
utilisable dans ce commit. Son inventaire a été interrompu. L'audit navigateur
ci-dessus a été exécuté indépendamment ; voir QA-01.

## Regénérer et vérifier les artefacts

```sh
node docs/qa/audit-2026-10-03/build-report.mjs
node docs/qa/audit-2026-10-03/validate-report.mjs
```

Le générateur consomme les preuves présentes et `findings.mjs`. Le validateur
contrôle les références locales et la navigation du rapport sur ordinateur/mobile,
les filtres, la galerie et l'agrandissement. Le serveur 4180 doit être actif pour
la partie navigateur.

La configuration Biome de ce dossier conserve les règles du dépôt pour les scripts
de QA. Elle exclut les sorties générées et les rapports Lighthouse tiers du
formatage/lint afin de préserver leurs preuves originales. Aucun test ou contrôle
du code produit n'est désactivé ; le HTML livré a son contrôle navigateur dédié.

`manifest.sha256` contient les empreintes des fichiers livrés. Depuis ce dossier,
`sha256sum --check manifest.sha256 --quiet` vérifie leur intégrité. Une
regénération du rapport ou des preuves nécessite de renouveler ce manifeste.

## Recette restante avant GO

Corriger et rejouer les P0/P1 du périmètre livré, puis couvrir PostgreSQL,
MySQL/MariaDB, Redis/S3, paiements signés sandbox, facturation configurée,
programmation, import complet, sandbox/extensions et fournisseurs IA réels.
Compléter Firefox/WebKit, lecteurs d'écran, appareil mobile réel, sauvegarde des
fichiers/configuration/secrets et mesures de performance sur machine stable.
Les limitations ne sont pas des passes. Les critères proposés dans le rapport
définissent des preuves à obtenir ; ils ne changent aucune décision actée du projet.

## Campagne complémentaire sur tous les menus

L’inventaire provient de `nav-items.ts`, des routes React et des déclarations
d’interaction. Il contient 52 menus, 69 déclarations de routes et 549 marqueurs
JSX, qui ne sont pas 549 fonctions distinctes validées. Navigation à 1440/390 px,
sous-écrans/dialogues/onglets, matrice de rôles, puis scénarios de mutation
avec vérification de sauvegarde, rechargement et résultat API/public.
Les visites et absences de contrôles sont séparées des succès fonctionnels.
Voir [exhaustif/evidence/coverage-summary.json](exhaustif/evidence/coverage-summary.json)
pour les comptes issus des journaux finaux, et les limites par menu dans le HTML.

Trois copies isolées complètent les dix packs : `complet` (4200),
`billing` (localhost:4220 pour WebAuthn) et `field-lab` (4225). Elles ne modifient
pas la base du playground utilisateur. `complet` réutilise les fournisseurs IA
existants, copiés et chiffrés dans sa configuration privée. Après crédit par
l’utilisateur, DeepSeek et OpenAI répondent 200 : outils textuels, génération
d’image, thème et plan de site, RAG et agents ont fait des appels réels.
Douze des treize agents intégrés terminent le scénario de lecture seule ;
l’agent d’accessibilité échoue sur un outil absent. Cela ne valide pas toutes
leurs mutations autonomes, approbations, délégations et réversions.

Paiement : l’utilisateur confirme l’absence de clés de paiement de test.
Les scénarios locaux de paiement manuel, facture PDF, livraison, remboursement
partiel et avoir sont exécutés ; Stripe/PayPal réels restent non validés.
Les emails de reset et de maintenance sont effectivement écrits par le
transport fichier. Ils ne constituent pas une livraison SMTP.

Les scripts `exhaustif/*.mjs` sont des scénarios d’audit à relire avant replay.
Ils créent des fixtures, peuvent purger des données QA, utilisent parfois
l’API/SDK pour préparer un état, et consomment des crédits IA si les
fournisseurs sont actifs. Ne pas lancer leur ensemble sur des données réelles.
Les journaux précisent UI/API/SDK : l’amorçage SDK d’un paiement manuel ou
d’un abonnement ne prouve pas un checkout public. L’export WordPress miniature
échoue sur le schéma post préexistant ; une migration de vrai site n’est pas
certifiée. Les contre-tests corrigent les faux échecs de sélecteur, de délai
de formulaire, de réponse asynchrone et de RP ID WebAuthn.

Pour reconstruire les rapports à partir des preuves conservées :

```sh
node docs/qa/audit-2026-10-03/exhaustif/build-report.mjs
node docs/qa/audit-2026-10-03/build-report.mjs
node docs/qa/audit-2026-10-03/exhaustif/validate-report.mjs
node docs/qa/audit-2026-10-03/validate-report.mjs
```

La comparaison WordPress/Drupal/Strapi/Ghost/Directus reste documentaire et
s’appuie sur les liens officiels du rapport principal. Aucun classement de
performances entre produits installés n’est avancé. Aucun code produit n’est
corrigé ; 43 constats sont livrés avec preuves et critères de recette.
