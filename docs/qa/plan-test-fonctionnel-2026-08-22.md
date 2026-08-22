# Plan de test fonctionnel — Cogenta (admin + site public)

Date : 2026-08-22. Environnement : `examples/local-playground`, `cogenta serve`
sur `http://127.0.0.1:4000`.

## 1. Les types de test, en bref (pour situer celui qu'on fait ici)

En entreprise, on distingue généralement :

| Type de test | Répond à | Qui l'écrit | Outils typiques |
|---|---|---|---|
| **Unitaire** | Cette fonction fait-elle ce qu'elle promet, isolée ? | Le développeur | Vitest, Jest, JUnit |
| **Intégration** | Ces deux composants marchent-ils ensemble (ex : store + vraie base) ? | Le développeur | Vitest + base réelle, Testcontainers |
| **Fonctionnel** | **L'utilisateur peut-il accomplir sa tâche, de bout en bout, comme prévu ?** | QA / développeur | Navigateur réel ou piloté (Playwright, Cypress, Selenium), Postman/curl pour l'API |
| **Non-régression** | Ce qui marchait hier marche-t-il encore aujourd'hui ? | QA / CI | Suite automatisée rejouée à chaque changement |
| **Exploratoire** | Qu'est-ce qui casse si je sors du chemin prévu ? | Testeur humain | Aucun outil fixe — jugement et curiosité |
| **Acceptation (UAT)** | Le client valide-t-il que c'est ce qu'il a demandé ? | Le client / product owner | Recette manuelle sur un environnement de démo |

**Ce document couvre le test fonctionnel** : on se comporte comme un
administrateur réel qui découvre l'outil, on exécute les parcours qu'un vrai
utilisateur ferait, et on note tout écart entre le comportement attendu (la
référence : WordPress / Drupal / Strapi pour les automatismes attendus d'un
CMS) et le comportement observé.

**Outils utilisés ici** :
- **Navigateur piloté** (extension Claude in Chrome) pour l'admin et le site
  public — équivalent fonctionnel de Playwright/Cypress, mais piloté par
  l'agent plutôt que scripté à l'avance ; adapté à une première passe
  exploratoire là où on ne connaît pas encore tous les défauts à chercher.
- **curl / API directe** pour vérifier rapidement qu'un enregistrement a bien
  persisté en base, sans repasser par l'interface (plus rapide qu'un
  re-chargement d'écran).
- **Console navigateur** (`read_console_messages`) pour capter les erreurs
  JavaScript silencieuses qu'un simple coup d'œil ne révèle pas.

Un vrai projet ajouterait ensuite ces parcours à une suite **Playwright**
automatisée et rejouée en CI (non-régression) — hors périmètre de cette
passe, mais recommandé une fois les défauts actuels corrigés.

## 2. Référence de comparaison

Pour chaque écran, la question posée est : *« Un administrateur qui a déjà
utilisé WordPress, Drupal ou Strapi retrouve-t-il les automatismes et la
disposition qu'il attend ? »* — notamment :
- Un champ dérivé (slug depuis le titre) se remplit-il seul, tout en restant
  modifiable ?
- Les actions destructives (supprimer) sont-elles séparées visuellement des
  actions courantes, jamais la première chose vue en arrivant sur l'écran ?
- Un enregistrement donne-t-il un retour visible (succès/erreur), sans erreur
  console silencieuse ?
- La disposition reste-t-elle cohérente et lisible (pas d'élément qui
  chevauche, qui déborde, mal aligné) ?

## 3. Périmètre et découpage

Le périmètre couvre l'admin (`/admin/*`) et le site public rendu par
`cogenta serve`, sur l'environnement `local-playground` (SQLite, driver
`sharp`, aucun fournisseur IA configuré — conforme à R2). Les écrans qui
exigent un fournisseur externe non configuré (Agents/Fournisseurs IA,
Assistant, Canaux, certains outils de Commerce) sont vérifiés uniquement
pour l'état "sans fournisseur" (ne doit pas planter, doit rester utilisable
ou clairement expliquer pourquoi il ne l'est pas) plutôt que testés en
profondeur — un test réel de leurs fonctions demanderait une clé API que je
n'ai pas.

Trois lots, testés en parallèle par trois passes indépendantes :

### Lot A — Contenu & apparence
Tableau de bord · Liste de contenu (créer/éditer/publier/dupliquer/corbeille)
· comportement du slug · Médias · Taxonomies · Builder visuel (glisser-déposer)
· Historique de versions · Apparence (palettes + sélecteur de thème) · Menus.

### Lot B — Utilisateurs, sécurité & outils
Utilisateurs & rôles · Clés API · Connexion/déconnexion · Santé (journal
d'erreurs, migrations, maintenance) · Mises à jour · Audit · Réglages du site
· Export/import/sauvegarde/RGPD.

### Lot C — Site public & fonctions transverses
Pages publiques (accueil, article, page simple) · recherche `/search` ·
formulaires · commentaires · SEO (balises, sitemap, robots.txt) ·
redirections · Statistiques · vérification rapide (fumée) des écrans
Agents/Fournisseurs/Canaux/Commerce en l'absence de fournisseur.

## 4. Déroulé type d'un scénario

Chaque scénario du rapport suit ce format :

| Champ | Contenu |
|---|---|
| **Écran / fonctionnalité** | ex. « Créer un article » |
| **Préconditions** | ex. « connecté en tant qu'admin » |
| **Étapes** | ce qui a été fait, dans l'ordre |
| **Attendu** | ce qu'un CMS comparable ferait |
| **Observé** | ce qui s'est réellement passé |
| **Statut** | OK / Défaut mineur / Défaut majeur |
| **Preuve** | capture d'écran si défaut, extrait console si erreur JS |

Le rapport d'exécution (`rapport-test-2026-08-22.html`) et le plan de
correction (`plan-correction-2026-08-22.md`) sont générés après l'exécution
des trois lots.
