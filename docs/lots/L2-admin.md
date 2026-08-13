# L2 — Admin

## Objectif

L'interface d'administration : authentification, rôles, édition de contenu générée
depuis le schéma, médiathèque, journal d'audit, tableau de bord.

Elle doit être utilisable par le client final (persona P2) sans formation.

## Dépendances

L1.

## Périmètre

- SPA React
- Auth : mot de passe, passkeys/WebAuthn, TOTP, sessions
- Rôles et permissions
- Interface d'édition générée depuis `schema.json`
- Éditeur de texte riche
- Éditeur de blocs
- Médiathèque
- Prévisualisation
- Journal d'audit consultable
- Tableau de bord

## Arborescence

```
packages/admin/
├── src/
│   ├── auth/
│   ├── fields/          # un composant par type de champ
│   ├── blocks/          # éditeurs des douze blocs
│   ├── collections/     # liste, édition, versions
│   ├── media/
│   ├── audit/
│   ├── dashboard/
│   └── app.tsx
```

## Points de conception

### L'interface est générée, pas écrite

Un nouveau type de contenu apparaît dans l'admin **sans qu'une ligne d'interface soit
écrite**. C'est ce qui rend le projet tenable à une personne, et c'est un critère
d'acceptation, pas une intention.

Un type de champ = un composant. Les métadonnées `admin` du champ (libellé, aide,
groupe, condition d'affichage, largeur) pilotent le rendu.

### Authentification

Passkeys en méthode principale, mot de passe plus TOTP en secours. MFA **obligatoire**
pour tout rôle disposant de `content.publish` ou `site.config_write` — non
contournable par configuration.

Sessions listées et révocables individuellement. Limitation de débit et backoff
progressif sur les tentatives.

### Éditeur de texte riche

Sortie **structurée**, jamais du HTML brut. Un arbre de nœuds typés, sérialisé en JSON,
rendu par le thème. C'est la seule façon de garder le contenu portable entre thèmes et
canaux, et d'éviter que du HTML arbitraire transite par la base.

Allowlist stricte de nœuds. Le collage depuis Word ou une page web est nettoyé, pas
importé tel quel.

### Éditeur de blocs

Liste ordonnable de blocs, ajout depuis le vocabulaire, chaque bloc éditant ses champs
typés. **Pas de glisser-déposer libre sur une grille** : la disposition appartient au
thème, pas au contenu.

Un bloc non implémenté par le thème actif est signalé dans l'éditeur, avec son bloc de
repli.

### Prévisualisation

Le bouton de prévisualisation ouvre l'URL du site avec un preview token, pas une
simulation dans l'admin. Une prévisualisation qui ment est pire que pas de
prévisualisation.

### Médiathèque

Upload avec vérification du type réel, réencodage systématique des images, génération
des variantes AVIF/WebP et du srcset, point focal, alt-text obligatoire (avec
justification si l'image est décorative).

SVG : assainis ou refusés selon la configuration, jamais servis bruts par défaut.

### Tableau de bord

Santé du site, CVE ouvertes, Core Web Vitals, activité récente, contenus programmés,
état des sauvegardes. Les blocs liés aux agents restent vides et explicites tant que L4
n'est pas livré.

## Tâches, dans l'ordre

1. Coquille de l'application, routage, état, thème visuel
2. Authentification par mot de passe, sessions
3. TOTP, puis passkeys/WebAuthn
4. Rôles et affichage conditionnel selon permissions
5. Composants de champ, un par type
6. Liste de collection : filtres, tri, pagination, actions groupées
7. Formulaire d'édition généré depuis `schema.json`
8. Éditeur de texte riche structuré
9. Éditeur de blocs
10. Versions : historique, diff visuel, restauration
11. Médiathèque et pipeline d'images
12. Prévisualisation par token
13. i18n de l'interface et édition multilingue du contenu
14. Journal d'audit consultable et filtrable
15. Tableau de bord
16. Passe d'accessibilité WCAG 2.2 AA

## Critères d'acceptation

- Ajouter un type de contenu au schéma le fait apparaître dans l'admin, éditable, sans code d'interface
- Un utilisateur sans permission ne voit pas l'action correspondante **et** ne peut pas l'appeler par l'API
- Le MFA ne peut pas être désactivé pour un rôle qui publie
- La prévisualisation affiche exactement ce que verra le visiteur
- Le collage depuis Word ne produit aucun nœud hors allowlist
- L'admin est navigable au clavier de bout en bout, et vérifié AA automatiquement
- L'admin fonctionne sur mobile pour les tâches d'édition courantes

## Tests exigés

| Type | Portée |
|---|---|
| e2e | Connexion, création, brouillon, publication, restauration de version |
| e2e | Parcours passkey et parcours TOTP |
| Permissions | Chaque action masquée dans l'interface est aussi refusée côté API |
| Accessibilité | axe-core sur toutes les vues principales, zéro violation sérieuse |
| Sécurité | Collage hostile, upload de fichier déguisé, SVG piégé |

## Pièges connus

**Le générateur de formulaire est un piège à complexité.** Résister aux cas
particuliers : si un champ exige un rendu spécial, c'est un nouveau type de champ, pas
une exception dans le générateur.

**L'éditeur de texte riche est le composant le plus coûteux de tout le projet.**
Utiliser une base éprouvée plutôt que d'écrire un moteur d'édition.

**Les conflits d'édition.** Deux personnes sur le même contenu : verrouillage optimiste
avec message clair au second, pas d'écrasement silencieux. L'édition collaborative
temps réel est hors périmètre, mais la détection de conflit ne l'est pas.

**L'alt-text obligatoire agace.** Prévoir la case « image décorative » qui écrit
`alt=""` — sinon les gens saisissent « image » et l'accessibilité est pire qu'avant.

## Hors périmètre

Édition collaborative temps réel, workflow d'approbation à plusieurs niveaux,
constructeur de page libre, personnalisation de l'admin par l'utilisateur final.
