# 47 — Formulaires et soumissions : parité avec les plugins premium

> **État** : contrat G (`forms@1.0`, ADR-0026) livré et solide sur le socle (9 types
> de champs, validation serveur, anti-abus, notifications e-mail, rétention,
> export CSV protégé contre l'injection de formule). Écart réel avec Gravity
> Forms/WPForms : logique conditionnelle, multi-étapes, notifications multi-canaux,
> soumissions enrichies.
> **Fichiers** : `packages/forms/src/*`, `packages/admin/src/routes/{forms,form-submissions}.tsx`
> **Effort** : 12–16 jours
> **ADR requise** : non pour la plupart (ADR-0026 acté, non figé) ; RFC contrat B
> pour un bloc `form` insérable dans une page

---

## 1. Ce qui existe réellement

**Types de champs (9, fermés)** : `text`, `longText`, `email`, `phone`, `number`,
`date`, `choiceSingle`, `choiceMulti`, `consent`. **Aucun champ `file`** (renoncement
assumé ADR-0026). `consent` porte son texte figé, horodaté à la soumission (valeur
probante RGPD).

**Ce qui marche** : validation serveur complète indépendante du client, rejet de
toute clé non déclarée ; anti-spam (honeypot, délai 3s-24h, rate-limit 5/10min par
IP hachée), **pas de CAPTCHA** ; fonctionne sans JS ; rendu public uniquement sur
route dédiée `GET /forms/{name}` (**aucun bloc contrat B**, aucune RFC ouverte à ce
jour) ; notifications e-mail uniquement (`@cogenta/channels` a déjà Slack/Discord/
Telegram/webhook signé, **jamais câblés ici** malgré ADR-0026 les citant comme
disponibles) ; rétention `retainDays` réellement tickée quotidiennement ; recherche/
effacement RGPD par e-mail ; admin `forms.tsx` (CRUD, éditeur de champs via
`RepeaterField`, pas de constructeur visuel) ; `form-submissions.tsx` (liste
filtrable, actions groupées, export CSV **déjà protégé** contre l'injection de
formule CWE-1236, badge non-lues, vue détail).

Aucune logique conditionnelle par champ, aucun multi-étapes, aucun calcul, aucun
paiement, aucune pièce jointe.

## 2. Ce que font Gravity Forms / WPForms

Constructeur drag-and-drop avec logique conditionnelle par champ/page ; multi-
étapes avec progression ; calculs et champs dérivés ; paiement intégré ; sauvegarde
partielle/reprise ; notifications multiples conditionnelles avec routage par
valeur ; entrées avec statut lu/non lu, étoilage, notes internes, recherche plein
texte ; styles personnalisables sans toucher au thème global ; champ fichier avec
scan.

## 3. Écarts, classés

**Bloquants** (brique déjà existante ailleurs, jamais branchée) :
1. Notifications Slack/Discord/Telegram/webhook absentes malgré `@cogenta/channels`
   déjà prêt.
2. Aucun moyen d'insérer un formulaire dans une page de contenu (route dédiée
   seulement).

**Importants** :
3. Logique conditionnelle par champ absente.
4. Soumissions : pas de recherche plein texte, pas de filtre par date, pas de notes
   internes, référent stocké mais jamais affiché.
5. Pas de CAPTCHA optionnel.
6. Export CSV limité au chargement client (max 200), pas d'export serveur streamé.
7. Pas de champ fichier.
8. Pas de multi-étapes.

**Confort** : calculs, style personnalisable (via classes/tokens du thème, jamais
CSS stocké — R3), intégration paiement, brouillon visiteur, duplication de
formulaire.

## 4. Plan de développement

### Formulaires (définition/rendu)

**Tâche 1 — Logique conditionnelle** : `FormFieldDefinition.showIf` (champ +
opérateur + valeur), évaluée côté serveur (rendu) et dupliquée côté client minimal
(le formulaire reste fonctionnel sans JS, tous les champs visibles). Fichiers :
`types.ts`, `validate.ts` (ignorer/valider les champs masqués), `forms-page.ts`,
`forms.tsx`. **Critère** : un champ masqué par sa condition n'est ni requis ni
validé côté serveur.

**Tâche 2 — Multi-étapes** : `FormDefinition.steps` optionnel, rendu en plusieurs
`<form>` chaînés côté no-JS. **Critère** : fonctionne sans JS.

**Tâche 3 — Champ `file`** : réintroduire en réutilisant la détection de type par
octets du pipeline média (L10), taille max, liste blanche. Réactive une surface
explicitement écartée par ADR-0026 — à documenter comme changement de position, pas
une ADR au sens strict (contrat non figé).

**Tâche 4 — Notifications multi-canaux** : brancher `notify.ts` sur les adaptateurs
déjà présents dans `@cogenta/channels`, sélection des canaux par formulaire.
**Critère** : une soumission déclenche le canal configuré, testé de bout en bout.

**Tâche 5 — Bloc `form` contrat B** *(RFC requise)* : ouvrir la RFC laissée en
attente par ADR-0026 pour l'insertion dans une page de contenu.

**Tâche 6 — Style personnalisable** : jeu de classes/variantes de layout, jamais
de CSS libre stocké (R3).

### Soumissions

**Tâche 7** — Recherche plein texte + filtre par date. Fichiers : `store.ts`
(`list` gagne `query`/`from`/`to`), `forms-router.ts`, `form-submissions.tsx`.

**Tâche 8** — Notes internes + affichage du référent.

**Tâche 9** — Export CSV serveur streamé, réutilisant `csvField`.

**Tâche 10** — CAPTCHA optionnel par formulaire (Turnstile en priorité, zéro
dépendance lourde — un appel HTTP de vérification).

**Tâche 11** — Duplication de formulaire.

## 5. Critères d'acceptation

- Un champ conditionnel n'apparaît, n'est requis et n'est validé que si sa
  condition est remplie, y compris sans JavaScript.
- Une soumission notifie le canal configuré (e-mail et/ou Slack/Discord/Telegram/
  webhook).
- Les soumissions sont cherchables par contenu et filtrables par date.
- Aucune tâche ne réintroduit de CSS/HTML stocké dans un champ ou une définition
  de formulaire.

## 6. Tests exigés

- Sans JS : logique conditionnelle et multi-étapes fonctionnent en dégradé complet.
- Sécurité : champ `file` refuse un fichier dont les octets contredisent
  l'extension.
- Permissions : notifications par canal testées par rôle de configuration.
- Non-régression : protection CSV existante (CWE-1236) toujours vérifiée après
  l'export serveur streamé.

## 7. Pièges connus

- Le formulaire doit rester fonctionnel sans JavaScript à chaque tâche — c'est une
  propriété déjà tenue par le socle, à ne jamais casser silencieusement.
- Un CAPTCHA ne doit jamais devenir obligatoire par défaut — option par formulaire.

## 8. Décisions à prendre

- Tâche 3 (champ `file`) : confirmer la réouverture de cette surface écartée par
  ADR-0026.
  **Tranchée le 2026-08-26, en direct avec l'utilisateur : oui, réintroduire.**
  Réutilise la détection de type par octets du pipeline média (L10), taille
  max, liste blanche — même discipline que le reste du CMS. Documentée comme
  changement de position sur un contrat non figé (contrat G, ADR-0026 acté mais
  pas figé), pas une nouvelle ADR au sens strict.
- Tâche 5 (bloc `form`) : RFC contrat B à ouvrir séparément, hors chiffrage de
  cette fiche.
