# 50 — SEO éditoriale avancée

> **État** : très en avance sur `docs/plans/13-seo.md` (qui le décrit « absent côté
> admin », obsolète). Cinq onglets déjà livrés, JSON-LD/hreflang/OG/Twitter Card
> déjà là. Deux modules **déjà écrits et testés, jamais branchés** : IndexNow et
> llms.txt.
> **Fichiers** : `packages/seo/src/*`, `packages/admin/src/routes/seo.tsx`,
> `packages/admin/src/seo/seo-panel.tsx`, `packages/cli/src/commands/seo.ts`
> **Effort** : 3–4 jours
> **ADR requise** : non — le SEO n'est adossé à aucun contrat figé (A/B/C/D)

---

## 1. Ce qui existe réellement

`packages/seo/src/` (13 fichiers, ~2870 lignes) : `metadata.ts` (titre/description/
OG/Twitter, gabarits globaux et par collection, troncature 160c, image de partage
avec repli site-wide, canonique manuelle), `json-ld.ts`, `hreflang.ts`,
`sitemap.ts` (override par collection), `robots.ts`, `indexable.ts`. **Deux modules
écrits, jamais branchés nulle part** (aucune référence dans `cli`/`api`/`admin`) :
`indexnow.ts` (ping Bing/Yandex/Seznam) et `llms-txt.ts`. `feeds.ts` (RSS/Atom)
également non servi.

`seo.tsx` (758 lignes, 5 onglets — Général, Sitemap, Réseaux sociaux, Redirections,
Diagnostic) : gabarits de titre global + par collection, inclusion/fréquence/
priorité par collection, handle Twitter + image sociale par défaut, redirections
fusionnées, diagnostic (nombre d'URL sitemap, robots.txt affiché **en lecture
seule**, entrées sans description, titres trop longs/dupliqués, cliquables vers
l'entrée). `seo-panel.tsx` : compteurs colorés, `noindex` avec avertissement,
canonique manuelle repliée, aperçu Google réel (`POST /api/seo/preview`), boutons
« proposer titre/description » via `assist.titles`/`assist.meta_description`
(absents sans fournisseur IA — R2 respecté).

`packages/cli/src/commands/seo.ts` : `/sitemap.xml`, `/sitemap-N.xml`, `/robots.txt`
servis publiquement. **Aucun lien cliquable depuis l'admin** vers ces URLs.

## 2. Ce que font Yoast/Rank Math

Analyse de contenu en temps réel avec score sémaphore, aperçu SERP et réseaux
sociaux, intégration Google Search Console/Bing Webmaster (vérification, soumission
de sitemap, remontée d'erreurs), éditeur `robots.txt` en ligne, fils d'Ariane
configurables, redirections 404→301 suggérées.

## 3. Écarts, classés

**Aucun bloquant** — les critères d'acceptation de la fiche 13 d'origine sont
satisfaits.

**Importants** :
1. Pas d'intégration Search Console/Bing Webmaster (vérification, sitemap).
2. Aucun lien cliquable dans l'admin vers `/sitemap.xml`/`/robots.txt`.
3. `robots.txt` entièrement dérivé, pas de règle personnalisée.
4. `indexnow.ts`/`llms-txt.ts` : code mort.
5. `feeds.ts` non servi.

**Confort** : pas d'analyse de lisibilité/densité mot-clé, pas de fils d'Ariane
configurables, pas de bascule mobile/desktop dans l'aperçu SERP.

## 4. Plan de développement

**Tâche 1 — Liens directs sitemap/robots** : `seo.tsx` onglet Diagnostic, bouton
« Ouvrir » vers `{baseUrl}/sitemap.xml` et `/robots.txt`.

**Tâche 2 — Vérification Search Console/Bing** : nouveaux réglages
`seo.googleSiteVerification`/`seo.bingSiteVerification`, injectés comme balise
`<meta name="google-site-verification">` — vérification par balise meta uniquement
(pas d'appel OAuth, hors périmètre R1/R7).

**Tâche 3 — Brancher IndexNow** : `seo.ts` + route de clé, appel `pingIndexNow`
déclenché à la publication/dépublication, réglage on/off + clé. Dégradé par défaut
(off), zéro dépendance nouvelle (module déjà écrit).

**Tâche 4 — Éditeur `robots.txt`** : champ de règles personnalisées fusionné avec
le bloc dérivé, confirmation explicite si `Disallow: /` est saisi.

**Tâche 5 — Servir `llms.txt`** : route `GET /llms.txt`, réutilisant
`llmsTxtSectionsFor`/`renderLlmsTxt` déjà écrits, réglage on/off.

**Tâche 6** *(à confirmer)* — Servir un flux RSS/Atom (`feeds.ts` déjà écrit).

## 5. Critères d'acceptation

- Un clic ouvre sitemap et robots.txt réels depuis le Diagnostic.
- Une balise de vérification apparaît dans le HTML une fois le code renseigné.
- IndexNow et llms.txt, une fois activés, répondent aux critères déjà testés dans
  leurs modules respectifs.

## 6. Tests exigés

- Bout en bout : lien sitemap/robots ouvre l'URL réelle servie.
- Unitaire : balise de vérification présente/absente selon le réglage.
- Non-régression : les tests déjà écrits pour `indexnow.ts`/`llms-txt.ts` restent
  verts une fois branchés en conditions réelles (route + réglage).

## 7. Pièges connus

- Ne pas ajouter d'appel OAuth Google/Bing — R1/R7 : rester sur la vérification par
  balise meta, sans nouveau secret tiers.
- `Disallow: /` bloque l'indexation totale — confirmation explicite obligatoire,
  déjà signalé comme piège connu par la fiche 13 d'origine.

## 8. Décisions à prendre

Tâche 6 (RSS/Atom) : confirmer le périmètre avant de l'inclure — gain SEO générique
plutôt que « premium », à trancher séparément.
