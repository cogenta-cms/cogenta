# 71 — Navigation : chaque sous-écran a sa propre URL

> **État** : bug transversal réel, signalé par l'utilisateur en testant Apparence
> (capture d'écran à l'appui) puis confirmé identique sur au moins six autres
> écrans après audit du code. **Le correctif existe déjà dans le dépôt** —
> `packages/admin/src/routes/seo.tsx` fait ça correctement depuis la fiche 21 — il
> n'a simplement jamais été appliqué ailleurs.
> **Paquet** : `packages/admin/src/routes/*.tsx`
> **Effort** : 3–4 jours
> **ADR requise** : non — aucun contrat touché, pur admin

---

## 1. Le bug, précisément

Plusieurs écrans font commuter tout leur contenu entre deux vues (une liste/galerie
et un détail/formulaire) via un `useState` local :

```tsx
const [view, setView] = useState<'gallery' | 'customize'>('gallery')
```

Conséquence concrète, observée par l'utilisateur sur Apparence : cliquer sur
« Personnaliser » change ce qui s'affiche, mais **l'URL dans la barre d'adresse ne
bouge pas**. Un F5 (actualisation) ramène à la vue de départ. Un lien copié-collé et
envoyé à quelqu'un d'autre ouvre la vue de départ, jamais celle qu'on regardait.

**Le patron correct existe déjà** dans `seo.tsx` (fiche 21) : `useSearchParams` de
`react-router`, l'onglet actif lu depuis `?tab=`, écrit dedans à chaque changement.
Cette fiche généralise ce patron déjà prouvé, elle n'en invente pas un nouveau.

## 2. Inventaire réel des écrans touchés (audité par lecture de code, pas deviné)

| Écran | Fichier | État local à corriger |
|---|---|---|
| Apparence (site) | `appearance.tsx` | `view: 'gallery' \| 'customize'` (fiche 48) |
| Apparence (admin) | `admin-appearance.tsx` | `view: 'gallery' \| 'customize'` (fiche 49) |
| Agents | `agents.tsx` | `selected: string \| null` → panneau de détail plein écran (fiche 55) |
| Rôles | `roles.tsx` | `tab: 'byCollection' \| 'byRole'` |
| Abonnements (commerce) | `commerce-subscriptions.tsx` | `detailId: string \| null` → panneau de détail |
| Marketplace | `marketplace.tsx` | `activeTab: MarketplaceTab` |

Deux écrans de moins bonne priorité, édition en ligne dans une liste plutôt qu'un
vrai changement d'écran (` editingId` ouvre une ligne, ne remplace pas la page) —
inclus par cohérence, coût faible :

| Compétences | `agent-skills.tsx` | `editingId: string \| null` |
| Prompts | `prompt-settings.tsx` | `editingId: string \| null` |

**Ce qui n'a pas besoin de correctif** : les écrans qui ont déjà une vraie route par
identifiant (`commerce/orders/:id`, `commerce/customers/:id`,
`collections/:name/:id`) sont déjà corrects — ne pas y toucher. `scheduled.tsx`'s
`mode` est l'état du planificateur (interne/externe), pas une vue — faux positif
écarté après vérification.

## 3. Le patron à appliquer partout

Deux formes selon le cas, toutes deux déjà éprouvées dans ce dépôt :

**Vue à deux états sur un écran sans détail (Apparence, Marketplace, Rôles)** —
`?view=` ou `?tab=` en query string, exactement le patron de `seo.tsx` :

```tsx
const [searchParams, setSearchParams] = useSearchParams()
const view = searchParams.get('view') === 'customize' ? 'customize' : 'gallery'
const setView = (next: 'gallery' | 'customize') => {
  const params = new URLSearchParams(searchParams)
  params.set('view', next)
  setSearchParams(params)
}
```

**Détail d'un élément d'une liste (Agents, Abonnements)** — un vrai segment de route
plutôt qu'une query string, cohérent avec `commerce/orders/:id` déjà en place :
`agents/:name`, `commerce/subscriptions/:id`. Ajout dans `app.tsx`, la route liste
garde son chemin actuel et rend le tableau ; la route détail rend le même composant
avec l'identifiant lu via `useParams`.

**Édition en ligne dans une liste** (Compétences, Prompts) — query string `?editing=`
suffit, pas besoin d'un segment de route dédié pour un panneau qui reste dans le
contexte visuel de la liste.

## 4. Plan de développement

Une tâche par écran du tableau, chacune indépendante (aucun partage d'état entre
elles) :

1. `appearance.tsx` — `?view=customize`.
2. `admin-appearance.tsx` — `?view=customize`.
3. `agents.tsx` — route `agents/:name`, la liste redirige vers elle au clic, le
   panneau de détail lit `useParams().name` au lieu de `selected`.
4. `roles.tsx` — `?tab=byRole`.
5. `commerce-subscriptions.tsx` — route `commerce/subscriptions/:id`.
6. `marketplace.tsx` — `?tab=`.
7. `agent-skills.tsx` — `?editing=<id>`.
8. `prompt-settings.tsx` — `?editing=<id>`.

Pour chaque écran : le bouton « retour » doit rester un vrai lien (`<Link>`), jamais
un `history.back()` qui casse si l'écran a été ouvert directement depuis un
signet.

## 5. Critères d'acceptation

- Sur les huit écrans listés : ouvrir la sous-vue, actualiser la page (F5) — on
  reste exactement sur la même sous-vue.
- Copier l'URL affichée, l'ouvrir dans un nouvel onglet déjà connecté — on arrive
  directement sur la même sous-vue, pas sur la vue de départ.
- Le bouton retour du navigateur fonctionne (revient à la vue précédente, pas hors
  de l'admin).
- Aucune route existante déjà correcte (contenu, commerce) n'est modifiée.

## 6. Tests exigés

- Un test par écran : naviguer vers la sous-vue, lire `window.location`/le routeur
  de test, vérifier que l'URL contient le marqueur attendu.
- Un test par écran : monter le composant directement sur l'URL de la sous-vue (sans
  passer par un clic) — la bonne vue s'affiche dès le premier rendu.

## 7. Pièges connus

- **Ne pas réinventer le patron** — `seo.tsx` l'a déjà résolu, le copier plutôt que
  le redériver à chaque écran évite huit variantes légèrement différentes.
- **`agents.tsx`/`commerce-subscriptions.tsx` passent d'une query string à un vrai
  segment de route** : vérifier qu'aucun lien existant ailleurs dans l'admin ne
  pointait vers l'ancienne forme (`/agents?selected=`) — grep avant de renommer.
- **Le panneau de détail doit gérer un identifiant absent de la liste** (URL copiée
  vers un agent supprimé entre-temps) — un message clair, jamais un écran blanc.
