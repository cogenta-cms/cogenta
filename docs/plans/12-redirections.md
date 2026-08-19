# 12 — Redirections

> **État** : minimal — créer et supprimer. Pas de modification, pas de diagnostic.
> **Écran** : `packages/admin/src/routes/redirects.tsx` (207 lignes)
> **API existante** : `packages/api/src/rest/redirect-router.ts`
> **Application** : `theme-render.ts` applique la table à **tout** GET public avant le
> routage, query string préservée (L10 tâche 2)
> **Effort** : 2–3 jours
> **ADR requise** : non

---

## 1. Ce qui existe réellement

- Table de redirections, appliquée à tout GET public avant le routage, avec
  préservation de la query string.
- L'écran : formulaire (depuis, vers, 301/302), table, bouton supprimer.
- Refus des boucles et des auto-redirections **côté serveur** — l'écran ne revalide
  pas et affiche le message du serveur, ce qui est le bon choix.
- Réservé à `admin`, comme la route.

## 2. Ce que font les CMS de référence

| Fonction | Redirection (WP) | Rank Math | Drupal 11 | Cogenta |
|---|---|---|---|---|
| Créer / supprimer | ✅ | ✅ | ✅ | ✅ |
| **Modifier** | ✅ | ✅ | ✅ | ❌ |
| **Journal des 404** | ✅ | ✅ | ✅ | ❌ |
| Créer une redirection depuis un 404 observé | ✅ | ✅ | ✅ | ❌ |
| Compteur de hits + dernier accès | ✅ | ✅ | ✅ | ❌ |
| Redirection automatique au changement de slug | ✅ | ✅ | ✅ | ❌ (vérifié absent) |
| Motifs / expressions régulières | ✅ | ✅ | ✅ | ❌ |
| Import / export CSV | ✅ | ✅ | ✅ | ❌ |
| Recherche et pagination | ✅ | ✅ | ✅ | ❌ |
| 410 Gone, 307, 308 | ✅ | ✅ | ✅ | ❌ (301/302) |
| Test « où mène cette URL ? » | ✅ | ❌ | ✅ | ❌ |

## 3. Écarts, classés

### Bloquants

1. **Pas de journal des 404.** C'est la moitié utile de la fonctionnalité : sans lui,
   on ne crée des redirections qu'après qu'un visiteur ou un client s'est plaint. Un
   CMS complet montre les URL demandées et introuvables, avec leur fréquence et leur
   référent, et propose de créer la redirection en un clic.
2. **Pas de modification.** Corriger une cible impose de supprimer puis recréer — et
   entre les deux, l'URL rend un 404 en production.

### Importants

3. **Un changement de slug ne crée aucune redirection** — vérifié : rien dans
   `packages/schema/src/store/` ne touche la table de redirections. C'est donc le
   premier générateur de liens morts d'un site vivant, et la fonctionnalité la plus
   rentable de cette fiche. `resolvePath` sait déjà répondre « redirection » : le
   mécanisme aval existe, seule l'écriture manque.
4. Pas de compteur d'utilisation : impossible de faire le ménage sans risque.
5. Pas de recherche ni de pagination : au-delà de cent entrées, l'écran est un mur.
6. Pas d'import/export : migrer depuis un autre CMS, c'est ressaisir des centaines de
   lignes.

### Confort

7. Pas de motifs (préfixe, joker, regex).
8. Pas de 410 Gone (« cette page n'existe plus, ne réessayez pas ») ni de 308.
9. Pas d'outil de test.

## 4. Plan de développement

### Tâche 1 — Journal des 404

**Fichiers** : `packages/cli/src/commands/theme-render.ts` (là où le 404 est produit),
nouvelle table + route `/api/not-found`, `routes/redirects.tsx`.

Enregistrer chaque GET public sans correspondance : chemin, horodatage, nombre
d'occurrences, dernier référent, dernier `user-agent` **tronqué**.

Trois précautions, non négociables :

- **Aucune donnée personnelle** (`AGENTS.md` § Logs) : pas d'adresse IP, pas de
  `user-agent` complet. Le chemin et le référent suffisent au besoin réel.
- **Borner l'écriture** : un scanner automatisé peut produire des milliers d'URL
  uniques par minute. Agréger par chemin, plafonner le nombre de chemins distincts
  conservés, purger au-delà de N jours — sinon cette table devient un vecteur de
  saturation de disque offert à n'importe qui.
- **Désactivable**, et le dire dans les réglages.

Écran : liste triée par fréquence, avec un bouton « créer une redirection » qui
pré-remplit le champ « depuis ».

**Critère** : après une semaine, la liste des dix URL les plus demandées et
introuvables, et une redirection créée en deux clics depuis cette liste.

### Tâche 2 — Modifier, rechercher, paginer

**Fichiers** : `routes/redirects.tsx`, `redirect-router.ts` (vérifier `PATCH`).

Édition en ligne de la cible et du code de statut. Recherche sur `from` et `to`,
pagination, tri par date de création et par nombre de hits.

### Tâche 3 — Redirection automatique au renommage

**Fichiers** : `packages/schema/src/store/`, `redirect-router.ts`.

Cela n'existe pas (vérifié). À l'`update()` d'une entrée publiée dont le champ de slug
change, créer une redirection 301 de l'ancien chemin vers le nouveau.

Points à traiter honnêtement :

- Uniquement si l'entrée est **publiée** (une modification de brouillon n'a jamais eu
  d'URL publique).
- Le chemin dépend de la locale et du motif de la collection : passer par `buildPath`,
  jamais reconstruire.
- Chaîne de renommages A→B→C : écraser la cible de A→B en A→C plutôt qu'empiler deux
  sauts (le serveur refuse déjà les boucles, mais une chaîne à deux sauts coûte un
  aller-retour à chaque visiteur).
- **Réversible** : si l'éditeur remet l'ancien slug, la redirection doit disparaître,
  sinon elle boucle.
- Marquer ces redirections comme automatiques, pour pouvoir les distinguer et les
  purger sans toucher aux manuelles.

**Critère** : renommer le slug d'une page publiée, demander l'ancienne URL, obtenir un
301 vers la nouvelle.

### Tâche 4 — Import / export, motifs, codes

**Fichiers** : `routes/redirects.tsx`, `redirect-router.ts`.

- Import CSV avec **prévisualisation** : ce qui sera créé, ce qui entre en conflit, ce
  qui créerait une boucle — avant d'écrire quoi que ce soit.
- Export CSV.
- Ajouter 307, 308 et **410 Gone** (dire « cette page a disparu » vaut mieux qu'une
  redirection vers l'accueil, qui est un mensonge pour un moteur de recherche).
- Motifs par **préfixe** (`/blog/*` → `/actualites/*`) plutôt que regex : c'est 90 %
  du besoin, c'est vérifiable, et cela n'expose pas le routage public à une
  expression régulière catastrophique fournie par un utilisateur (déni de service par
  backtracking).

**Critère** : importer trois cents redirections depuis un export WordPress, en voyant
les conflits avant d'appliquer.

## 5. Critères d'acceptation

- Renommer une page publiée ne crée jamais de lien mort.
- Les URL introuvables les plus demandées sont visibles, sans qu'aucune donnée
  personnelle ne soit stockée.
- Une redirection se modifie sans passer par un 404.
- Un import montre ses conflits avant d'écrire.
- Aucune expression régulière fournie par l'utilisateur n'entre dans le chemin de
  routage public.

## 6. Tests exigés

- Bout en bout : renommer un slug publié, appeler l'ancienne URL, vérifier le 301 et
  la préservation de la query string.
- Bout en bout : chaîne A→B→C réduite à un seul saut.
- Unitaires : refus de boucle, refus d'auto-redirection (existant, à ne pas
  régresser).
- Unitaires : agrégation et plafonnement du journal des 404.
- Permissions : `admin` seulement, sur toutes les nouvelles routes.

## 7. Pièges connus

- **Le journal des 404 est une surface d'attaque.** Sans plafond ni agrégation, c'est
  une écriture en base déclenchable par un anonyme, en boucle. Le plafond n'est pas
  une optimisation, c'est la condition d'existence de la fonctionnalité.
- **Les regex fournies par l'utilisateur dans le chemin chaud** exposent au
  backtracking catastrophique. Le préfixe suffit.
- **La redirection automatique peut boucler** si l'éditeur revient en arrière. Le cas
  doit être traité au moment de la création, pas laissé au refus de boucle du serveur.
- **Ne pas rediriger un brouillon.** Un slug de brouillon n'a jamais eu d'URL
  publique ; créer une redirection depuis lui révèle son existence.
- **La table est appliquée à tout GET public avant le routage** : chaque entrée
  ajoutée est un coût sur chaque requête. Mesurer avant d'accepter dix mille lignes,
  et indexer `from`.

## 8. Décisions à prendre

- Journal des 404 : activé par défaut ou non. Recommandation : activé, borné, purgé à
  30 jours, désactivable dans les réglages.
- Redirection automatique au renommage : par défaut ou opt-in par collection.
  Recommandation : par défaut, avec un interrupteur.
