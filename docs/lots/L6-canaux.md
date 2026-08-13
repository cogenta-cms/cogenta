# L6 — Canaux

## Objectif

Connecter le CMS aux endroits où les gens sont déjà : Telegram, Slack, Discord, email,
webhooks. Notifications sortantes et commandes entrantes, avec approbation depuis le
canal.

## Dépendances

L4 (runtime), L5 (les agents produisent les messages à envoyer).

## Périmètre

- Interface d'adaptateur de canal
- Telegram en premier, complet
- Puis Slack, Discord, email, webhook générique
- Liaison compte utilisateur ↔ identité de canal
- Approbations actionnables depuis le canal
- Formats de message par type d'événement
- Préférences de notification par utilisateur et par canal

## Arborescence

```
packages/channels/
├── src/
│   ├── adapter.ts        # interface
│   ├── registry.ts
│   ├── linking/          # liaison et vérification d'identité
│   ├── formats/          # rendu des rapports par canal
│   ├── inbound/          # commandes entrantes, routage, permissions
│   └── providers/{telegram,slack,discord,email,webhook}/
```

## Interface

```ts
interface ChannelAdapter {
  readonly name: string
  readonly capabilities: {
    richText: boolean
    buttons: boolean          // approbations en un clic
    threads: boolean
    attachments: boolean
    inbound: boolean          // commandes entrantes supportées
  }
  send(target: ChannelTarget, message: ChannelMessage): Promise<MessageId>
  update?(id: MessageId, message: ChannelMessage): Promise<void>
  onInbound?(handler: InboundHandler): void
  verifyIdentity(proof: unknown): Promise<ChannelIdentity>
}
```

Un message est décrit de façon **abstraite** — titre, sections, niveau de sévérité,
actions — et chaque adaptateur le rend selon ses capacités. On n'écrit pas de Markdown
Telegram dans le code métier.

## La règle de sécurité centrale

> **Une commande entrante s'exécute avec les permissions de l'humain identifié, jamais
> avec celles de l'agent.**

Sans cette règle, un canal Telegram devient une porte dérobée avec droits admin. C'est
le point de sécurité le plus important de tout le lot, et il est testé explicitement.

Conséquences concrètes :

- Une identité de canal non liée à un compte est **ignorée**, sans réponse — répondre
  confirmerait l'existence du bot à un inconnu.
- La liaison exige une preuve : code à usage unique généré dans l'admin, saisi dans le
  canal, valable quelques minutes.
- La liaison est révocable, et listée dans les sessions actives de l'utilisateur.
- Un utilisateur sans `content.publish` ne peut pas approuver une publication depuis
  Telegram, même s'il voit le message.
- Les messages sortants ne contiennent jamais de secret, de jeton, ni de donnée
  personnelle non nécessaire.

## Approbations depuis le canal

Un agent en niveau `execute_with_approval` produit une entrée dans la file
d'approbation. Le canal reçoit un message avec le diff résumé et deux actions :
approuver, refuser.

- L'action porte un jeton à usage unique, lié à l'entrée de file et à l'identité.
- Le jeton expire.
- Une entrée déjà traitée rend le bouton inopérant, avec message clair — pas d'erreur brute.
- L'approbation est journalisée avec le canal d'origine.

Sur un canal sans boutons (email, webhook), l'action est un lien signé à usage unique.

## Formats de message

Trois niveaux, imposés :

**Alerte** — quelque chose demande une action. Titre, gravité, une phrase de contexte,
l'action attendue, un lien vers l'admin.

**Rapport** — synthèse périodique. Structure fixe, chiffres clés en tête, détail
ensuite, jamais plus d'un écran sans repli.

**Notification** — information sans action. Une ligne.

Un message qui ne rentre pas dans un écran de téléphone est un message qui ne sera pas
lu. Le détail vit dans l'admin, le canal porte l'essentiel et le lien.

## Préférences

Par utilisateur et par canal : quels types d'événements, quelle gravité minimale, quelle
plage horaire, quel regroupement (immédiat, horaire, quotidien).

Le regroupement n'est pas un confort : sans lui, un scan de dépendances produit quinze
messages et l'utilisateur coupe tout.

## Tâches, dans l'ordre

1. Interface d'adaptateur, registre, format de message abstrait
2. Liaison d'identité : code à usage unique, vérification, révocation
3. Routage des commandes entrantes avec permissions de l'humain
4. Adaptateur Telegram : envoi, boutons, commandes entrantes
5. File d'approbation actionnable depuis le canal, jetons à usage unique
6. Formats de message : alerte, rapport, notification
7. Préférences de notification et regroupement
8. Adaptateur email
9. Adaptateur Slack
10. Adaptateur Discord
11. Webhook générique signé

## Critères d'acceptation

- Une commande entrante d'un utilisateur sans permission est refusée, prouvé par test
- Une identité de canal non liée est ignorée sans réponse
- Un jeton d'approbation réutilisé est refusé
- Un jeton d'approbation expiré est refusé avec un message clair
- Un scan produisant quinze constats génère **un** message groupé, pas quinze
- Aucun secret ni donnée personnelle dans un message sortant, vérifié par test
- Le même événement rendu sur Telegram, Slack et email reste lisible et cohérent
- L'indisponibilité d'un canal ne bloque ni l'agent ni le CMS

## Tests exigés

| Type | Portée |
|---|---|
| Sécurité | Commande entrante d'identité non liée |
| Sécurité | Escalade de permission via le canal |
| Sécurité | Rejeu de jeton d'approbation |
| Unitaire | Rendu du format abstrait par adaptateur |
| Intégration | Cycle approbation : agent → file → canal → action → audit |
| Résilience | Canal injoignable, file d'attente, reprise |

## Pièges connus

**Les webhooks entrants sont une surface d'attaque.** Vérification de signature
obligatoire, fenêtre temporelle, protection contre le rejeu. Un webhook non signé est
un endpoint public arbitraire.

**Les limites de débit des plateformes.** Telegram et Slack limitent. Prévoir la file,
le backoff et le regroupement dès le premier adaptateur, pas après le premier blocage.

**Le canal comme source de vérité.** Il ne l'est jamais. L'état vit dans le CMS ; le
canal est une vue et une télécommande.

**Le format Markdown diffère partout.** D'où le format abstrait. Ne jamais laisser une
chaîne formatée pour Telegram remonter dans le code métier.

## Hors périmètre

WhatsApp (contraintes d'API et de conformité disproportionnées à ce stade), SMS,
conversation libre avec un agent depuis le canal — les commandes sont structurées.
