# L41 — Publier par MCP seul

Demandé par l'utilisateur le 2026-11-18, après une journée de publication oubliée sur
scaleruptech.com. Le site publie ses articles bilingues par son MCP (`/api/mcp`), mais le
script de publication devait encore appeler REST pour trois étapes : les tags,
l'image de couverture et le lien entre la version française et l'anglaise. Une tâche
planifiée qui n'a que le MCP ne pouvait donc pas publier un article complet.

## Livré (`tools@1.9`)

Quatre outils, tous additifs : aucune signature d'outil existante ne change (le contrat C
fige celle d'un outil déjà publié).

- `content.write_translation` — le brouillon d'une entrée dans une autre langue du site,
  rattaché à l'entrée source (`translationOf`). Refusé avant toute approbation si la
  langue n'est pas celle du site, si c'est celle de la source, ou si la famille l'a déjà.
- `taxonomy.list_terms` / `taxonomy.create_term` — lire et créer des termes ; créer un slug
  existant rend le terme existant (`created: false`).
- `media.import_url` — une image depuis une adresse `https:` publique, par la garde
  sortante (`fetchPublicOnce` : chaque saut résolu, jugé et épinglé ; redirection vers
  `http:` refusée ; 15 Mio ; 20 s) puis par `ingestMediaUpload` (type réel lu dans les
  octets). Avant l'approbation, l'adresse n'est jugée que sur son texte (aucune
  résolution DNS, qu'un appelant pourrait viser pour bloquer le serveur ou sonder le DNS
  interne). Provenance `assisted` ; auteur, licence et adresse source (sans requête ni
  identifiants) gardés dans `provenanceDetail`. Offert sur `cogenta serve` seulement (`cogenta mcp` n'a pas de
  pilote de stockage sous la main).

Toute écriture attend toujours une approbation humaine (R6 inchangé).

## Reporté, décidé avec l'utilisateur

- **Connexion OAuth** (connecteur claude.ai) : une tâche planifiée dans le cloud peut
  charger le MCP par un `.mcp.json` du dépôt du site, avec la clé dans une variable
  d'environnement ; OAuth n'est utile que pour le connecteur claude.ai lui-même.
- **Publication sans approbation** (politique par clé, outils rendus réversibles) : à
  reprendre si la validation humaine devient le goulot.
