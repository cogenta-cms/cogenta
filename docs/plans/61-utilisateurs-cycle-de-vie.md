# 61 — Utilisateurs : cycle de vie complet

> **État** : les tâches 1-4 de la fiche 17 sont déjà livrées (invitation, recherche/
> pagination/tri, actions groupées, profil, signal dormant, badge MFA). La
> « suppression » demandée existe sous forme d'**anonymisation**, jamais une
> destruction — décision documentée deux fois, à confirmer plutôt qu'à contourner.
> Le vrai trou : aucune mutation de compte n'est journalisée dans l'audit.
> **Fichiers** : `packages/admin/src/routes/users.tsx`,
> `packages/api/src/rest/users-router.ts`, `packages/auth/src/users.ts`
> **Effort** : 1 jour (journalisation) + 0,5 jour (décision/texte d'écran)
> **ADR requise** : non

---

## 1. Ce qui existe réellement

Invitation par e-mail avec repli mot de passe, recherche + pagination par curseur +
tri + actions groupées, profil (nom/avatar/bio/locale), signal « dormant » (90j),
badge MFA recommandée (ADR-0021, jamais bloquant). Suppression = anonymisation
(`POST /api/users/{id}/anonymize`, confirmation par saisie de l'e-mail, état
terminal `anonymized`). `assertAdminRemains` empêche de désactiver/rétrograder/
anonymiser le dernier admin actif — verrou serveur réel.

Par rapport au retour utilisateur : modifier les rôles ✅, désactiver ✅, supprimer
❌ **par construction, deux fois documentée** (fiche 17 §1 et l'en-tête du
routeur) — un compte actif/désactivé ne peut jamais être détruit, seulement
anonymisé (le contenu et le journal d'audit doivent rester nommables). Seule une
invitation jamais connectée est vraiment `DELETE`.

**Le vrai trou, non prévu par la fiche 17** : `applyUserChange` ne journalise
**rien** — ni un changement de rôle, ni une désactivation/réactivation, ni une
action groupée, ni une invitation renvoyée/annulée. Seule `anonymizeRoute` appelle
`auth.audit.record`.

## 2. Plan de développement

**Tâche 1** — Journaliser chaque mutation de compte (`applyUserChange`,
`bulkRoute`, `inviteRoute`) via `auth.audit.record` — même mécanisme que
`anonymizeRoute`. **Critère** : chaque mutation de la matrice de la fiche 17
apparaît dans le journal d'audit.

**Tâche 2** *(décision, pas un simple développement)* — Le retour utilisateur
demande explicitement « supprimer ». Deux réponses : (a) confirmer que
l'anonymisation *est* la réponse produit, et le dire clairement à l'écran (renommer
le bouton/la notice pour ne pas laisser croire qu'une suppression dure existe
ailleurs) ; (b) ajouter une suppression dure optionnelle réservée aux comptes
n'ayant jamais rien créé/publié. **Recommandation : (a)**, sans ADR — ne pas
rouvrir un choix déjà motivé sans raison nouvelle.

**Tâche 3** *(optionnelle)* — Réattribution de contenu avant anonymisation (seconde
forme jamais construite) — seulement si un vrai besoin apparaît.

## 3. Critères d'acceptation

- Toute mutation de compte (rôle, statut, action groupée, invitation) apparaît
  dans le journal d'audit.
- L'écran ne suggère jamais qu'une suppression dure existe si (a) est retenu.

## 4. Tests exigés

- Bout en bout : chaque type de mutation produit une entrée d'audit vérifiable.
- Permissions : chaque route déjà testée par rôle continue de l'être, plus la
  vérification de la nouvelle entrée d'audit.

## 5. Pièges connus

- Ne pas coder la tâche 2(b) sans décision explicite — elle romprait un argument
  documenté (le contenu et l'audit doivent rester nommables).

## 6. Décisions à prendre

Tâche 2 : (a) confirmer l'anonymisation comme réponse à « supprimer » (recommandé)
vs (b) suppression dure conditionnelle.
