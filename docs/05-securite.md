# 05 — Sécurité

> C'est le wedge du produit. Un projet qui vend la sécurité et se fait compromettre ne
> s'en relève pas.

## 1. Modèle de menace

| Acteur | Objectif | Vecteur principal | Défense structurelle |
|---|---|---|---|
| Scanner automatisé | Exploiter une CVE connue | Dépendance non patchée | SBOM + scan continu + PR de correctif |
| Attaquant opportuniste | Défacement, spam SEO | Compte faible, injection | Passkeys, MFA obligatoire admin, sanitization |
| Plugin malveillant | Exfiltration de base et de clés | Code tiers en processus | Isolation worker + permissions déclarées |
| Contenu hostile | Détourner un agent | Injection de prompt via commentaire ou import | Hiérarchie d'autorité + permissions d'outils |
| Chaîne d'approvisionnement | Paquet compromis en amont | Dépendance transitive | Lockfile, provenance, allowlist, audit CI |
| Insider ou compte volé | Modification silencieuse | Accès légitime | Journal append-only, diff, alertes |
| Attaquant réseau | Interception | TLS mal configuré | HSTS, CSP stricte, headers |

## 2. Agent Sécurité — cycle de vie d'une CVE

```
Publication (OSV, GHSA, NVD)
   ↓  webhook ou poll horaire
Corrélation avec le SBOM du site (CycloneDX)
   ↓
Le site est-il concerné ?  ── non ──▶ journal, silence
   ↓ oui
Évaluation d'exploitabilité :
   • version affectée réellement installée
   • chemin de code atteignable
   • exposition (surface publique ou interne)
   • CVSS + EPSS
   ↓
Rapport clair, en langage humain, envoyé sur les canaux
   ↓
Correctif proposé : bump de version, PR ouverte, tests joués
   ↓
Validation humaine  ── selon niveau d'autonomie ──▶ application
   ↓
Vérification post-correctif, mise à jour du SBOM
```

**Le rapport ne contient jamais de jargon brut.** Format imposé : ce qui est touché,
ce qu'un attaquant pourrait faire, si le site est réellement exposé, ce qui est
proposé, ce qui se passe si on ne fait rien.

**Le correctif n'est jamais appliqué en silence par défaut.** Le niveau `autonomous`
sur `deps.patch` existe, mais il est désactivé à l'installation et exige une
confirmation explicite avec avertissement.

## 3. Pentest — limite juridique stricte

Un scanner actif est une arme. Le produit doit rendre son détournement difficile par
construction.

**Règles non contournables :**

- Le scan actif ne s'exécute que sur des domaines dont la **propriété est prouvée** —
  enregistrement DNS TXT, fichier à la racine, ou domaine servi par cette instance.
- La preuve est revérifiée avant chaque exécution, jamais mise en cache durablement.
- Aucun scan de cible arbitraire, quelle que soit la formulation de la demande. Il n'y a
  pas de champ « URL à scanner ».
- Les scans sont journalisés de façon inaltérable, avec l'identité du demandeur.
- Le scan par défaut est **passif** : analyse de configuration, en-têtes, dépendances,
  surface exposée. L'actif est opt-in, borné, et rate-limité.

## 4. Authentification et accès

- **Passkeys/WebAuthn** en méthode principale ; mot de passe + TOTP en secours
- **MFA obligatoire** pour tout rôle disposant de `content.publish` ou `site.config_write`
- Sessions révocables individuellement, liste des sessions actives visible
- Limitation de débit et backoff progressif sur l'authentification
- Allowlist IP optionnelle sur l'admin
- SSO OIDC/SAML — module ultérieur
- Détection et signalement de MySQL 8.0, en fin de vie depuis avril 2026 et sans
  correctifs de sécurité

## 5. Application

- **CSP stricte avec nonce**, pas de `unsafe-inline`. Le thème canonique est conçu pour
  s'en passer ; un thème qui l'exige est signalé à l'installation.
- Sanitization du texte riche sur une allowlist, à l'écriture **et** au rendu
- Protection CSRF sur toutes les mutations
- `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`
- SRI sur toute ressource externe
- Uploads : vérification du type réel, pas de l'extension ; réencodage systématique des
  images ; SVG assainis ou refusés

## 6. Chaîne d'approvisionnement

- SBOM CycloneDX généré à chaque build et publié avec la release
- Lockfile strict, pas de plage de versions flottantes en production
- Publication npm via OIDC avec attestation de provenance
- Signature des releases, des thèmes et des plugins
- Audit des dépendances bloquant en CI au-dessus d'un seuil de sévérité
- Politique de dépendances : préférer zéro dépendance à une petite dépendance ; toute
  nouvelle dépendance directe passe en revue

## 7. Journal d'audit

Append-only, à **chaînage de hash** — chaque entrée contient le hash de la précédente,
ce qui rend toute suppression détectable.

Consigné : authentifications réussies et échouées, changements de permissions, toute
action d'agent avec son diff, publications et suppressions, installations de
plugins/thèmes, changements de configuration, accès aux secrets.

Jamais consigné : mots de passe, jetons, contenu des clés API, données personnelles
non nécessaires.

## 8. Sécurité des agents

**Injection de prompt** — Elle est traitée structurellement, pas par le prompt. Tout
contenu externe lu par un agent est balisé comme donnée. Les permissions vivent dans le
registre d'outils, pas dans le contexte du modèle. Un agent sans `content.publish` ne
peut pas publier, quoi qu'on lui écrive.

**Fuite de données** — Redaction des données personnelles avant envoi au fournisseur.
Mode « aucune donnée ne sort » avec modèle local. Liste explicite des champs jamais
transmis.

**Escalade par délégation** — Un sous-agent ne reçoit qu'un sous-ensemble strict des
outils du parent. Vérifié au démarrage, pas à l'exécution.

**Épuisement de budget** — Budgets par agent en tokens, euros et appels. Dépassement =
arrêt, pas dégradation silencieuse. Alerte sur le canal.

**Canaux** — Une commande entrante hérite des permissions de **l'humain identifié**,
jamais de celles de l'agent. Sans cette règle, un canal Telegram devient une porte
dérobée avec droits admin. Liaison compte ↔ identité de canal vérifiée, révocable.

## 9. Sauvegardes

- Chiffrées au repos, clé distincte de celle de la base
- **Restauration testée automatiquement** selon un calendrier, sur une instance jetable.
  Une sauvegarde non testée n'est pas une sauvegarde.
- Rétention configurable, purge vérifiée
- Restauration ponctuelle documentée et scriptée

## 10. Conformité

**RGPD** — Registre des traitements généré, export et suppression des données d'une
personne, consentement cookies natif, minimisation par défaut, DPA type fourni pour les
sous-traitants (fournisseurs LLM inclus).

**Accessibilité** — WCAG 2.2 AA sur l'admin et le thème canonique. L'European
Accessibility Act est en application depuis juin 2025 : c'est une obligation légale pour
une large part des sites commerciaux européens, pas un bonus.

**Cadre européen sur l'IA** — Transparence sur le contenu généré. Le champ `provenance`
est obligatoire dans le schéma et exposable publiquement. Métadonnées C2PA sur les
images générées.

## 11. Divulgation

`SECURITY.md` et `security.txt` dès le premier commit public. Politique de divulgation
responsable, délai d'accusé de réception annoncé, canal chiffré. Avis de sécurité
publiés sur GitHub Advisory. Programme de bounty quand le projet aura les moyens — mais
la politique de divulgation, elle, existe dès le jour un.
