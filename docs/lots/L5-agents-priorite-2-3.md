# L5 tâche 10 — Les sept agents de priorité 2 et 3

> Écrit le 2026-09-17. `docs/lots/L5-agents.md` nomme ces sept agents (« Priorité 2 :
> Média, Traduction, Modération. Priorité 3 : Analytics, Migration, Accessibilité,
> Conformité ») et **ne les spécifie pas** — contrairement aux quatre de priorité 1.
> C'est cette absence, et elle seule, qui tenait la tâche 10 ouverte depuis L5. Ce
> document la comble ; l'implémentation suit dans la foulée.

## La règle qui décide de tout : le constat est déterministe, le modèle explique

Les quatre agents de priorité 1 ont établi la forme, et le piège que L5 nomme lui-même
(« le faux positif tue l'agent ») a une seule parade qui marche : **ce qu'un agent
signale est calculé par du code, pas produit par un modèle.** L'agent SEO ne relève que
ce que l'audit déterministe a trouvé ; l'agent Performance compare des mesures à un
budget ; l'agent Sécurité croise des versions installées avec des avis publiés.

Les sept agents ci-dessous suivent la même règle sans exception :

1. **Une fonction pure** produit des constats à partir de données réelles du site. Elle
   est testable sans modèle, sans réseau et sans base.
2. **Le modèle ne sert qu'à deux choses** : ordonner ces constats par importance pour ce
   site-là, et les écrire dans une langue qu'un humain non spécialiste comprend.
3. **Aucun agent ne publie.** Aucun ne reçoit `content.publish` ni `content.delete` —
   le runtime ne peut pas accorder ce qui n'est pas déclaré (R4), donc c'est structurel.
4. **Chacun est désactivé à l'installation** (R2 : un site sans fournisseur IA ne perd
   rien) et porte son propre budget.

## Ce que le contrat C gagne, et pourquoi c'est mineur

Trois agents ont besoin de données qu'aucun outil n'expose aujourd'hui. Les ajouts
suivent la règle déjà appliquée à `logs.read`/`redirects.write` (`tools@1.2`) et à
`theme.customize` (`tools@1.5`) : **un ajout par le bas à une taxonomie ouverte**, sans
toucher à une seule signature existante.

| Outil | Permission | Pourquoi il n'existait pas |
|---|---|---|
| `media.list` | `media.read` (existante) | `media.read` lit **un** média par identifiant ; rien ne permettait de parcourir la médiathèque. Même relation que `content.list` à `content.read`. |
| `comments.list` | `comments.moderate` (**nouvelle**) | Le paquet `@cogenta/comments` existe depuis la fiche 15, sans aucune porte côté agents. |
| `comments.decide` | `comments.moderate` (**nouvelle**) | Approuver ou refuser un commentaire déjà soumis. Ne supprime jamais : le refus est réversible. |
| `analytics.summary` | `analytics.read` (**nouvelle**) | `@cogenta/analytics` (fiche 27) n'a jamais été lisible par un agent. |

Contrat C monté en **`tools@1.8`** (la version courante était `1.7`, L31 étape 4), mineur et additif. Aucune ADR : c'est exactement le
traitement acté pour `tools@1.1` (`document.extract`) et répété depuis.

---

## Priorité 2

### 1. Agent Média

**Le problème réel.** Une médiathèque vit plus longtemps que la mémoire de qui l'a
remplie : des images sans texte alternatif (donc invisibles pour un lecteur d'écran et
pour un moteur), des fichiers que plus aucune page ne référence, des photos de 6 Mo
servies dans un encart de 400 px.

**Outils** : `media.list`, `media.read`, `media.write`, `content.collections`,
`content.list`, `content.read`.

**Cœur déterministe** (`auditMediaLibrary`) : à partir de la liste des médias et des
entrées qui les référencent, il rend trois familles de constats — `missing-alt`
(image non décorative sans alt), `unused` (aucune entrée publiée ne la référence, au
moins N jours après le téléversement), `oversized` (octets par pixel affiché au-dessus
d'un seuil). Chaque constat porte l'identifiant, le nom de fichier et la raison.

**Ce que le modèle fait** : écrire un alt utile pour les images que le code a nommées,
et seulement pour celles-là. `media.write` n'écrit que `alt`/`decorative`/`focal` :
l'agent ne peut pas remplacer un fichier ni en supprimer un.

**Autonomie** : `propose` par défaut. Un alt écrit sans relecture reste réversible, mais
c'est du texte visible par un lecteur d'écran : il se valide.

**Déclencheurs** : hebdomadaire ; après un téléversement (événement média).

**Refus assumé** : il ne supprime **jamais** un média inutilisé. « Plus référencé » n'est
pas « inutile » (une campagne, une archive), et une suppression de fichier n'est pas
réversible par la corbeille du contenu.

**Évaluations** : une médiathèque de vingt fichiers dont trois sans alt, deux orphelins
et un surdimensionné → exactement six constats, dans ces trois familles, zéro sur les
quatorze sains.

### 2. Agent Traduction

**Le problème réel.** ADR-0014 fait d'une traduction une **entrée à part entière** liée
par `translationOf`. Rien ne dit à un rédacteur qu'une page existe en français et pas en
anglais, ni qu'une traduction date d'avant la dernière révision de sa source.

**Outils** : `content.collections`, `content.schema`, `content.list`, `content.read`,
`content.write_draft`.

**Cœur déterministe** (`findTranslationGaps`) : pour chaque entrée publiée d'une
collection routée, compare la famille de traduction aux locales déclarées du site et
rend `missing` (locale déclarée sans membre) ou `stale` (membre dont `updatedAt` est
antérieur à celui de la source). Pas de modèle, pas d'appel réseau.

**Ce que le modèle fait** : traduire, en brouillon, les entrées que le code a nommées.
Le brouillon porte `provenance: 'generated'` et le nom du modèle — le champ n'est pas
optionnel et l'agent ne le choisit pas.

**Autonomie** : `propose`. Publier une traduction est une décision éditoriale.

**Déclencheurs** : hebdomadaire ; après publication d'une entrée dans la locale par
défaut.

**Refus assumé** : il ne traduit pas un slug déjà publié (une URL qui change casse des
liens ; c'est une redirection à décider, pas un effet de bord d'une traduction).

**Évaluations** : un site bilingue avec dix entrées, dont trois sans version anglaise et
une périmée → quatre constats, zéro faux positif sur les six alignées.

### 3. Agent Modération

**Le problème réel.** La fiche 15 a livré les commentaires avec une file d'attente et
`assist.moderate`, mais un humain doit ouvrir l'écran pour que quoi que ce soit avance.
Sur un site à trafic réel, la file grossit et la modération devient un arriéré.

**Outils** : `comments.list`, `comments.decide`, `content.read`.

**Cœur déterministe** : la file elle-même (statut `pending`), plus les signaux
anti-spam déjà calculés à la soumission par `@cogenta/comments` (liens, répétitions,
délai de saisie, honeypot). L'agent ne recalcule rien.

**Ce que le modèle fait** : classer un commentaire douteux, avec sa raison, dans le
vocabulaire fermé déjà livré (`none` / `review`) — jamais une action inventée.

**Autonomie** : `observe` par défaut (il annote, un humain décide). En `autopilot`,
`comments.decide` n'approuve **que** ce que le code a déjà jugé sain, et ne refuse que
ce que le code a déjà marqué comme spam : le modèle ne peut pas retourner un verdict
déterministe.

**Déclencheurs** : à chaque soumission de commentaire ; horaire.

**Refus assumé** : il ne supprime jamais un commentaire. Refuser est un statut, donc
réversible ; supprimer ne l'est pas.

**Évaluations** : cinq commentaires (deux spam manifestes, deux sains, un ambigu) →
l'agent ne décide que sur les quatre tranchés et laisse l'ambigu à un humain.

---

## Priorité 3

### 4. Agent Analytics

**Le problème réel.** `@cogenta/analytics` compte les pages vues sans cookie depuis la
fiche 27, et personne ne lit ces chiffres. Un tableau de bord n'est pas une lecture.

**Outils** : `analytics.summary`, `content.list`, `content.read`, `logs.read_not_found`.

**Cœur déterministe** (`readAnalyticsSignals`) : compare deux fenêtres (par exemple les
sept derniers jours aux sept précédents) et rend des variations **significatives**
seulement — un seuil relatif *et* un plancher absolu, pour qu'une page passée de 2 à 5
vues ne soit jamais un « +150 % ». Rend aussi les pages à forte audience sans entrée
correspondante (404 fréquentes) et les pages publiées qui ne reçoivent rien.

**Ce que le modèle fait** : dire, en trois phrases, ce que ces variations suggèrent pour
ce site précis — jamais inventer un chiffre. Tout nombre du rapport vient du calcul.

**Autonomie** : `observe`. Il n'écrit rien, nulle part.

**Déclencheurs** : hebdomadaire.

**Refus assumé** : aucune donnée personnelle ne remonte — la mesure de la fiche 27 est
sans cookie et sans identifiant, et l'agent n'a pas d'outil pour en obtenir d'autres.

**Évaluations** : deux fenêtres où une page double avec un volume réel, une autre double
avec trois vues → un seul constat.

### 5. Agent Migration

**Le problème réel.** L'import WordPress (L9) laisse un site cohérent mais brut : des
entrées sans extrait, des catégories importées sans hiérarchie, des liens internes encore
absolus vers l'ancien domaine, des médias référencés par URL plutôt que par identifiant.

**Outils** : `content.collections`, `content.schema`, `content.list`, `content.read`,
`content.write_draft`, `redirects.create`.

**Cœur déterministe** (`findMigrationResidue`) : parcourt les entrées importées
(`provenance: 'imported'`) et rend `absolute-internal-link` (une URL absolue vers un
domaine que la configuration du site liste comme ancien), `orphan-media-url` (une image
référencée par URL au lieu d'un média), `missing-excerpt`, `empty-required-ish` (champ
que toutes les autres entrées remplissent).

**Ce que le modèle fait** : rien sur les URL — leur réécriture est mécanique. Il rédige
les extraits manquants, en brouillon.

**Autonomie** : `propose`. Une redirection créée par l'agent porte `reason: 'agent'` et
reste réversible, comme celle de l'agent Site Monitor (L22 tâche 3).

**Déclencheurs** : manuel, et une fois après un import.

**Refus assumé** : il ne touche pas à un slug importé. Changer une URL importée casse
exactement les liens que la migration cherchait à préserver.

**Évaluations** : un jeu de dix entrées importées dont quatre portent un lien absolu →
quatre constats et quatre redirections proposées, aucune sur les six propres.

### 6. Agent Accessibilité

**Le problème réel.** L'accessibilité se perd à l'usage, pas à la conception : un thème
conforme reçoit une image sans alt, un titre `h4` sous un `h2`, un lien « cliquez ici »,
un contraste écrasé par une couleur de marque.

**Outils** : `http.fetch` (le site lui-même, jamais un tiers), `content.list`,
`content.read`, `media.list`.

**Cœur déterministe** (`auditAccessibility`) : sur le HTML réellement servi — donc ce
qu'un visiteur reçoit, pas ce que le CMS croit produire — il vérifie sans dépendance
nouvelle : `lang` sur `<html>`, ordre des niveaux de titre, `alt` présent (et
`alt=""` seulement sur une image décorative), intitulé de lien non générique, `<label>`
associé à chaque champ, contraste des couleurs **calculé** depuis les jetons du contrat
D (ratio WCAG, pas une impression).

**Ce que le modèle fait** : proposer un intitulé de lien ou un alt meilleur. Jamais
décider qu'un contraste passe.

**Autonomie** : `propose`.

**Déclencheurs** : après un changement de thème ; mensuel ; avant publication d'une page.

**Refus assumé** : il ne prétend pas remplacer un audit humain — un rapport le dit en
toutes lettres. Ce qu'une machine vérifie est une partie des critères WCAG, pas leur
totalité.

**Évaluations** : une page portant exactement quatre défauts connus → quatre constats,
et aucun sur la page témoin conforme.

### 7. Agent Conformité

**Le problème réel.** Deux obligations concrètes pèsent déjà sur un site européen : dire
ce qui a été écrit par une machine (le champ `provenance` du contrat A existe pour ça) et
tenir ses pages légales et ses durées de conservation. Personne ne le vérifie.

**Outils** : `site.config_read`, `content.collections`, `content.list`, `content.read`.

**Cœur déterministe** (`auditCompliance`) : rend `missing-legal-page` (mentions légales,
politique de confidentialité, absentes ou vides), `retention-unset` (journal d'audit ou
soumissions de formulaire sans durée de conservation configurée),
`provenance-undeclared` (entrée écrite par un agent dont le `provenanceDetail` ne nomme
ni l'agent ni le modèle), `consent-mismatch` (un embed tiers sans consentement requis
alors que le réglage du site l'exige).

**Ce que le modèle fait** : expliquer chaque manquement en une phrase compréhensible, et
proposer le texte d'une page légale — en brouillon, sans jamais prétendre que c'est un
conseil juridique. Le rapport le dit.

**Autonomie** : `observe` par défaut.

**Déclencheurs** : mensuel ; après un changement de configuration.

**Refus assumé** : il ne coche aucune case à la place de l'humain, et ne modifie aucun
réglage — il n'a aucun outil d'écriture.

---

## Ce qui est livré, et ce qui ne l'est pas

**Livré** : les sept déclarations d'agent (identité détaillée, outils, budget,
déclencheurs, autonomie), leurs cœurs déterministes avec leurs tests, les quatre outils
contrat C nommés plus haut, et le semis dans le magasin d'agents du site — donc sept
agents réellement activables depuis `/admin/agents`, tous **désactivés par défaut**.

**Non livré, et dit ici plutôt que découvert plus tard** : le harnais d'évaluation en CI
(tâche 2 du même lot) ne fait pas tourner ces sept jeux de cas — les fonctions
déterministes sont testées unitairement, ce qui couvre les faux positifs, mais le score
comparatif entre versions de prompt n'existe pas encore pour eux.
