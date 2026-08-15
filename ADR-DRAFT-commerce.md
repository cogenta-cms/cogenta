# ADR proposée — à relire et à insérer dans `docs/03-decisions.md` par un humain

> Ce fichier n'est **pas** une décision actée. Il contient le texte exact, au format du
> projet, prêt à être ajouté à la fin de `docs/03-decisions.md` si la décision est
> retenue. Le numéro `ADR-0023` est le premier libre au moment de la rédaction
> (2026-08-16, après ADR-0022) — à renuméroter si un autre lot en a acté une entre-temps.
>
> Le lot L15 (`docs/lots/L10-cms-complet.md`) exige cette ADR **en tâche 1**, avant
> toute ligne de code commerce. L'implémentation de L15 livrée avec ce texte suppose la
> décision recommandée ci-dessous (contrat E séparé) ; si l'arbitrage humain la
> renverse, c'est le placement des tables et du paquet qui change, pas la logique
> métier.

---

## ADR-0023 — Le commerce vit dans un contrat E séparé, jamais dans le contrat A

**Statut** : Proposé

**Contexte** — Le lot L15 ajoute un domaine de données entier : `Product` et ses
variantes, `Cart`, `Order` et ses lignes, `Customer`, `Coupon`, facture, abonnement. La
tentation est forte de le déclarer avec ce qui existe déjà : `defineCollection()` sait
décrire un type, `ContentStore` sait le lire, l'écrire, le versionner, le traduire,
l'exposer en REST et en GraphQL, et l'admin sait déjà en générer les formulaires. Un
`product` déclaré comme une collection ordinaire donnerait, gratuitement, un CRUD
complet et une page publique routée. C'est exactement ce que fait WooCommerce sur
WordPress, où un produit est un `post` d'un type particulier, et c'est ce qui rend cette
décision difficile : le raccourci marche, longtemps, et le prix se paie plus tard.

La tension réelle n'est pas « faut-il réutiliser ». C'est que **deux moitiés d'un
produit obéissent à des lois opposées**. Sa fiche — titre, description, photos, blocs,
SEO, traductions — est du contenu éditorial au sens strict : elle se rédige, se relit,
se publie, se traduit, se programme, et une erreur s'y corrige en éditant. Son prix, son
stock et ses commandes n'ont aucune de ces propriétés : ils ne se relisent pas, ils se
constatent ; ils n'ont pas de brouillon ; et une erreur ne se corrige pas en éditant,
elle se corrige en écrivant une ligne de plus (un avoir, un réapprovisionnement), parce
que la ligne précédente a déjà été opposée à un client.

Trois invariants du commerce n'existent nulle part dans le contrat A, et le contrat A
n'a aucune raison d'apprendre à les porter :

1. **Un stock ne devient jamais négatif sous écriture concurrente.** Aucune opération de
   `ContentStore` n'a besoin de cette garantie : deux éditeurs qui sauvegardent le même
   article en même temps produisent deux versions, et c'est le comportement voulu.
2. **Un total de commande reste cohérent avec ses lignes.** Un contenu n'a pas d'égalité
   arithmétique à maintenir entre deux de ses champs.
3. **Un numéro de facture est séquentiel, sans trou volontaire et non modifiable.**
   C'est une contrainte comptable opposable, pas une préférence : rien dans le modèle de
   contenu, où tout identifiant est un UUIDv7 explicitement « stable et transportable »
   (ADR-0015), ne sait produire une séquence dense.

**Décision** — Le vocabulaire commerce est un **contrat E (`commerce@1.0`)**, distinct
du contrat A, servi par un nouveau paquet `@cogenta/commerce` qui possède ses propres
tables et ses propres magasins. Le contrat A n'est **pas** monté en version pour L15 :
il reste `schema@2.0` (ADR-0022).

Concrètement :

1. **Aucun objet commerce ne passe par `ContentStore`.** Ni `Product`, ni `Order`, ni
   `Cart`, ni `Customer`, ni `Coupon`, ni facture, ni abonnement. Ils ne portent ni
   `status` de contenu, ni `version`, ni `translationOf`, ni `deletedAt`.
2. **Un produit commerce porte un lien optionnel vers une entrée de contenu**,
   `contentRef: { collection, entryId } | null`. C'est ce lien, et lui seul, qui donne à
   un produit sa fiche publique : titre rédigé, photos, blocs, SEO, traductions, route
   — tout cela reste du contrat A, écrit et traduit avec les outils déjà là. Le lien est
   **facultatif** dans les deux sens : un produit sans fiche se vend (un article de
   catalogue B2B, une option d'abonnement), et une page de contenu sans produit s'affiche
   (elle ne montre simplement pas de bouton d'achat).
3. **L'argent est stocké en entier, dans la plus petite unité de sa devise**
   (`amountMinor: number`, `currency: string`), jamais en flottant, jamais en décimal
   dépendant du dialecte. Tout calcul de total est entier de bout en bout ; l'arrondi
   n'a lieu qu'au moment d'une répartition (une remise en pourcentage), une seule fois,
   à un endroit nommé.
4. **Toute écriture qui touche un stock ou un total est une transaction unique**, prise
   en `immediate` (`DatabaseHandle.transaction(run, { immediate: true })`), et la
   décrémentation de stock se fait par un `UPDATE ... WHERE on_hand >= :n` dont on lit
   le `rowsAffected` — jamais par une lecture suivie d'une écriture.
5. **Le paiement est un driver**, interface plus au moins deux implémentations, dont une
   sans aucun service externe (virement/paiement manuel), exactement comme cache, queue
   et storage (R1, ADR-0005). Le transporteur suit la même forme et reste optionnel.
6. **Le vocabulaire de permissions du contrat A n'est pas étendu.** `read`, `create`,
   `update`, `delete`, `publish` restent les cinq actions du contenu. Le contrat E
   déclare les siennes (`commerce.catalog.read`, `commerce.order.refund`…), dans son
   propre espace de noms, parce que « rembourser » n'est ni un `update` ni un `publish`.

**Justification** —

*Pourquoi une commande n'est pas un contenu, en trois faits vérifiables dans ce dépôt.*

- **ADR-0014 impose une entrée par langue.** Appliquée à une commande, elle produirait
  une commande française et une commande anglaise, liées par `translationOf`, chacune
  avec son cycle de publication. C'est absurde, et ce n'est pas un détail qu'on
  contourne en mettant `localized: false` partout : le contrat A fait de la famille de
  traduction une propriété du modèle, pas une option d'un champ.
- **ADR-0022 vient de rendre `delete()` réversible pour tout contenu.** Une commande
  n'est pas réversible : elle s'annule ou se rembourse, et les deux laissent une trace
  qui reste. Un `untrash()` sur une commande n'a aucun sens comptable — pire, il en a un
  informatique, ce qui en fait un piège.
- **`versioning: { drafts: true, history: true }` est le cœur du contrat A.** Une
  commande brouillon n'existe pas ; un panier est un brouillon, mais un brouillon qui ne
  produit jamais d'historique de versions et qui expire tout seul, ce que le magasin de
  versions ne sait pas faire.

*Pourquoi la fiche produit, elle, reste bien du contrat A.* Parce que tout ce qui la
rend bonne existe déjà et a été payé : le texte riche JSON (ADR-0013), les blocs
sémantiques (contrat B), le SEO branché en L10, le routage multilingue, la publication
programmée, l'historique et la corbeille. Réimplémenter cela dans `@cogenta/commerce`
serait la faute exacte que l'ADR-0009 décrit — deux modèles de contenu parallèles dans
le même produit. Le lien `contentRef` coûte une colonne et rend l'intégralité de cette
capacité au catalogue.

*Pourquoi pas « produit dans le contrat A, commande dans le contrat E ».* C'est la
proposition intermédiaire qui semble la plus raisonnable, et c'est celle qui coûte le
plus cher. Un produit vendable porte un prix, une variante et un stock ; ces trois
choses sont précisément celles qui exigent la transaction. Les mettre dans un
`ContentStore` obligerait à ajouter au contrat A une notion de transaction, de garde
conditionnelle et de non-négativité **pour un seul type de collection** — c'est-à-dire à
faire porter au modèle éditorial une contrainte qu'aucun contenu éditorial n'a. La
frontière que cette ADR trace passe au bon endroit : ce qui se rédige d'un côté, ce qui
se compte de l'autre, et un lien nommé entre les deux.

*Pourquoi un contrat séparé plutôt qu'un `schema@3.0`.* Une montée majeure du contrat A
impose une migration à **tout** site, y compris aux neuf blueprints sur dix qui ne
vendent rien. ADR-0022 vient d'expliquer que le coût d'une montée majeure est presque
entièrement fixe et porté par l'utilisateur ; le corollaire est qu'on ne la déclenche
pas pour un domaine que la majorité des sites n'installera jamais. `@cogenta/commerce`
crée ses tables quand il est présent (`ensureCommerceTables`, la forme déjà retenue par
`@cogenta/auth`) et n'existe pas quand il ne l'est pas.

*Pourquoi l'entier en unité mineure.* Les trois dialectes obligatoires (ADR-0006) ne
s'accordent pas sur le décimal : Postgres a `numeric` exact, MySQL a `decimal`, SQLite
n'a que `REAL` — un flottant binaire, où `0,1 + 0,2` ne fait pas `0,3`. Une seule
représentation qui veut dire la même chose partout, c'est le raisonnement déjà appliqué
aux horodatages stockés en texte par le moteur de migrations. Un entier de centimes tient
sans perte jusqu'à 90 000 milliards en `Number.MAX_SAFE_INTEGER` ; aucune boutique
servie par ce CMS n'en approche.

*Pourquoi la numérotation de facture est une table à part, et pas un `count(*)`.* Un
`count(*) + 1` produit un doublon dès que deux factures sont émises dans la même
seconde, et rend un numéro déjà attribué après une suppression. La séquence est donc une
ligne par série (`invoice_sequences`), incrémentée **dans la transaction qui insère la
facture**, par un `UPDATE ... SET next = next + 1 WHERE series = ? AND next = ?` dont le
`rowsAffected` arbitre la course — le même idiome que le `used_at is null` qui rend un
jeton de réinitialisation de mot de passe à usage unique (`packages/auth/src/resets.ts`).
Une commande annulée ne rend jamais son numéro : la séquence est dense en émission, pas
en commandes vivantes, ce qui est précisément ce qu'une administration fiscale exige.

**Conséquences** —

- Un nouveau contrat **E (`commerce@1.0`)** entre dans `docs/04-contrats.md`, versionné
  en semver comme les quatre autres. Il n'est pas figé le jour de son écriture : L15 est
  son premier et seul consommateur, et le figer avant qu'une vraie boutique ait tourné
  reproduirait l'erreur que le projet a évitée pour C et D.
- `@cogenta/commerce` dépend de `@cogenta/core` (base, erreurs, drivers, journal) et de
  `@cogenta/schema` **uniquement pour lire une entrée référencée** par `contentRef`. Il
  n'écrit jamais dans `ContentStore`.
- Le lien `contentRef` n'est **pas** une clé étrangère SQL : la table d'entrées d'une
  collection est créée par le moteur de migrations du contrat A, dont le nom dépend du
  schéma déclaré par le site. Le lien est donc vérifié en code applicatif, et un produit
  dont la fiche a été mise à la corbeille reste vendable en back-office tout en
  disparaissant de la vitrine — c'est le comportement voulu, et il doit être testé.
- L'admin gagne une section « Boutique » qui n'est **pas** générée par le formulaire
  schema-driven du contrat A. C'est un vrai coût : des écrans à écrire à la main là où le
  contenu les obtient gratuitement.
- Le lot L17 (marketplace, volet commercial) réutilise le driver de paiement de ce lot,
  jamais un second système — c'est déjà écrit dans le lot, cette ADR le rend structurel.
- R2 s'applique intégralement : sans clé Stripe, la boutique fonctionne de bout en bout
  avec le driver de paiement manuel. Le driver dégradé n'est pas un bouchon, c'est un
  mode d'exploitation réel — beaucoup de commerces vendent réellement par virement.

**Renoncement assumé** —

- **Le CRUD produit est à écrire à la main.** Un `defineCollection({ name: 'product' })`
  aurait donné formulaires, listes, filtres, REST, GraphQL et permissions sans une ligne
  d'écran. On y renonce sciemment, et cela représente la plus grosse part du coût de
  cette décision.
- **Deux modèles de permissions coexistent** : celui du contenu et celui du commerce. Un
  administrateur devra comprendre pourquoi « peut publier un article » et « peut
  rembourser une commande » ne se règlent pas au même endroit. Le prix de l'alternative
  était pire : cinq actions figées à qui l'on ferait dire ce qu'elles ne disent pas.
- **Un produit vit dans deux endroits.** Sa fiche est une entrée de contenu, ses prix
  sont une ligne commerce, et rien au niveau de la base ne garantit qu'ils existent
  ensemble. Un produit orphelin de fiche, ou une fiche orpheline de produit, sont deux
  états possibles qu'il faut rendre visibles dans l'admin plutôt que d'interdire.
- **`commerce@1.0` n'est pas figé** au moment de sa création. Il bougera, et les sites
  très précoces paieront une migration. C'est le choix inverse de celui fait pour A et
  B, et il est assumé : figer un modèle de commerce jamais confronté à une vraie
  boutique serait figer des devinettes.

**Écarté** —

- **Le commerce comme collections prédéfinies du contrat A (`schema@3.0`).** L'option
  que le lot nommait en premier. Écartée sur trois points non négociables : ADR-0014
  forkerait une commande par langue, ADR-0022 rendrait une commande restaurable, et le
  contrat A devrait apprendre la transaction et la garde conditionnelle pour un seul type
  de collection. À quoi s'ajoute une migration imposée à tous les sites qui ne vendent
  rien.
- **Le commerce comme plugin tiers**, sur le bac à sable de `@cogenta/plugins` (L7).
  Séduisant sur le papier — WooCommerce est une extension. Écarté parce que le SDK de
  plugin est volontairement construit capacité par capacité et n'a **aucune** capacité
  de transaction de base de données ; lui en donner une reviendrait à percer l'isolation
  à deux couches que L7 a prouvée contre quatre vecteurs d'évasion, pour la commodité
  d'un domaine que le projet livre lui-même.
- **Un montant en `decimal` SQL.** Écarté sur ADR-0006 : SQLite n'a pas de décimal exact,
  et un montant qui ne veut pas dire exactement la même chose sur les trois bases
  obligatoires est un bug qui attend son premier centime perdu.
- **Un seul modèle « produit = contenu + champs commerce sur la même table ».** Il
  supprime le problème du produit orphelin, et crée pire : la table d'entrées d'une
  collection est produite par le moteur de migrations à partir du schéma **déclaré par le
  site**, donc les colonnes de stock seraient sous le contrôle du fichier de schéma d'un
  utilisateur, qui peut les renommer ou les retirer. On ne met pas un invariant
  d'argent dans une table dont le site possède la définition.
- **Stripe comme seule passerelle, sans interface de driver.** Écarté par R1, sans
  discussion possible : c'est la règle que ce projet n'a jamais pliée en quinze lots.
