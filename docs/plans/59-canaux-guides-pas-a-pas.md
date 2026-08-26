# 59 — Canaux : guides pas-à-pas par canal

> **État** : le protocole d'appairage (code collé tel quel en message privé, sans
> commande) est déjà identique et fonctionnel sur les 3 canaux — rien n'explique
> à l'écran qu'un process séparé doit tourner, ni quel bot contacter, ni le geste
> exact.
> **Fichiers** : `packages/admin/src/routes/channels.tsx`,
> `packages/cli/src/commands/channels.ts`, `packages/channels/src/linking/codes.ts`
> **Effort** : petit lot, faisable en une session
> **ADR requise** : non

---

## 1. Ce qui existe réellement

`packages/channels/src/linking/codes.ts` : code à 8 caractères (alphabet sans
ambiguïté), TTL court. Protocole d'appairage **identique sur les 3 canaux** :
l'utilisateur envoie **le code brut en message texte** au bot (DM), pas de
commande `/link CODE`. Une identité non liée est ignorée en silence.

`channels.tsx` : bouton « Générer un code » par canal, affiche code + expiration,
mais ne dit jamais : (a) qu'il faut d'abord que `cogenta channels` tourne en
process séparé (jamais démarré par `cogenta serve`), (b) le nom/handle du bot à
contacter (rien ne l'expose), (c) qu'il faut envoyer le code tel quel, sans
commande.

`channels.ts` : credentials bot uniquement par variables d'environnement (R7) —
jamais dans `cogenta.config.mjs`. Aucun endroit ne stocke le bot username.

`chatHint`/`notAdminHint` existent déjà en i18n pour la sécurité (seul un compte
`admin` peut faire tourner un agent via un canal) — donc la sécurité est déjà
expliquée, ce n'est pas ce qui manque.

## 2. Diagnostic

Le retour utilisateur est précis : rien n'indique le process séparé requis, ni le
bot à contacter, ni le geste exact.

## 3. Plan de développement

**Tâche 1** — `channels.tsx` : bouton « Comment faire ? » par carte de canal,
ouvrant une modale avec les étapes génériques communes aux 3 canaux :
0. (une fois, par l'opérateur) créer le bot sur la plateforme, renseigner les
   variables d'environnement, démarrer `cogenta channels` en process séparé ;
1. cliquer « Générer un code » ;
2. ouvrir une conversation privée avec le bot ;
3. coller le code tel quel, comme un message normal ;
4. attendre la confirmation « Compte lié ».

**Tâche 2** — Nouvelles clés i18n `channels.howTo.*` (fr/en).

**Tâche 3** — Champ optionnel « nom du bot » par canal, renseigné une fois par
l'opérateur dans les réglages Canaux (texte libre, pas un secret), pour que le
guide l'affiche nommément — préféré à une résolution dynamique via l'API de
chaque plateforme (R1 : pas de nouvel appel réseau pour afficher une aide).

**Tâche 4** — Documenter que `cogenta channels` doit tourner en continu.

**Tâche 5** — Tests admin : le bouton affiche les bonnes étapes par canal, aucun
secret ne fuit côté client.

## 4. Critères d'acceptation

- Chaque carte de canal a un bouton « Comment faire ? » affichant les étapes
  complètes, du côté opérateur (une fois) au côté utilisateur final (à chaque
  appairage).
- Le nom du bot, s'il est renseigné, apparaît dans le guide.

## 5. Tests exigés

- Composant : le contenu de la modale correspond au canal sélectionné.
- Sécurité : le token du bot n'apparaît jamais côté client, seul le nom optionnel.

## 6. Pièges connus

- Ne pas confondre le nom du bot (texte libre, non secret) avec le token — champs
  clairement distincts dans le formulaire de réglages.

## 7. Décisions à trancher

Nom du bot : champ renseigné manuellement (recommandé, R1) vs. résolution
dynamique via l'API de la plateforme (introduirait un appel réseau sortant depuis
l'admin, à revalider si retenu).
