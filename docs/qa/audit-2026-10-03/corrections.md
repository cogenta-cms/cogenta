# Corrections Cogenta — audit du 3 octobre 2026

## SEC-01 — P0 — Une URL javascript de menu exécute du code dans le navigateur public

Défaut reproduit. POST d’un item URL avec javascript:alert(1) accepté (201). Le lien public conserve cette destination. Un clic déclenche effectivement une boîte de dialogue « 1 ». La charge de test a ensuite été retirée.

**Conséquence :** XSS persistante, déclenchée au clic. Une personne autorisée à modifier un menu peut injecter une action dans l’origine du site. Un échappement HTML des attributs ne neutralise pas un protocole exécutable.

**Correction :** Valider les destinations avec une liste de protocoles autorisés (et des chemins internes), appliquer la même politique aux mutations et au rendu ; examiner data:, vbscript:, casse, caractères de contrôle et liens importés.

**Recette :** Les charges dangereuses sont refusées ou rendues sans lien ; aucune exécution dans Chromium, Firefox et WebKit. Des URL HTTPS, mailto, tel et relatives restent utilisables suivant la politique retenue.

**Emplacements :** packages/schema/src/store/menu-store.ts:344, packages/api/src/rest/menu-router.ts:434, packages/cli/src/commands/theme-render.ts:1044

**Preuves :** menu-url-proof.json, followup.json

## SEC-02 — P1 — Des dépendances du traitement d’images ont des avis de vulnérabilité ouverts

Audit de dépendances. pnpm audit remonte 33 avis : 1 critique, 15 élevés, 13 modérés, 4 faibles. Sharp est présent dans le chemin packages__render ; l’avis Astro concerne examples__theme-starter. Les chaînes commitlint/Vitest concernent les outils de développement.

**Conséquence :** L’avis Sharp/libheif concerne le traitement de fichiers AVIF non fiables. Le serveur local sélectionne le driver natif et l’API accepte AVIF. L’avis Astro critique ne prouve pas une RCE sur le serveur Cogenta testé : c’est un autre chemin du graphe.

**Correction :** Mettre à jour le catalogue et le lockfile vers les versions corrigées compatibles, notamment sharp ≥0.35.4 et Astro ≥7.2.8 selon les avis consultés ; vérifier également la chaîne WASM et les dépendances de développement.

**Recette :** Audit renouvelé après mise à jour, tests de transformation/édition réels sur sharp et WASM, comparaison visuelle des rendus et compilation des exemples.

**Emplacements :** pnpm-workspace.yaml, packages/render/package.json, examples/theme-starter/package.json

**Preuves :** dependency-audit.json

## SEC-03 — P1 — Un compte viewer peut modifier les médias via REST et MCP

Défaut reproduit. PATCH /api/media/{id} avec une session viewer répond 200. media.write avec le véritable compte qa-viewer@example.test via MCP réussit également. Des valeurs distinctes ont été écrites puis relues : elles persistent sur les deux transports. La valeur d’origine a été restaurée. Le routeur REST vérifie la connexion ; le manifeste MCP ajoute les outils média à tout acteur authentifié.

**Conséquence :** Le rôle de consultation peut altérer les descriptions accessibles et le cadrage des médias partagés. Le contrôle de contenu, qui refuse les écritures du viewer, ne protège pas cette surface.

**Correction :** Définir et appliquer les grants média par rôle dans le runtime et le serveur HTTP ; construire le manifeste MCP à partir des permissions effectives. Ne pas ajouter des ACL ad hoc dans les outils.

**Recette :** Matrice public/viewer/editor/admin pour lecture, upload, remplacement, métadonnées, suppression et dossiers, sur tous les transports. Viewer reçoit un refus sans aucune mutation.

**Emplacements :** packages/api/src/rest/media-router.ts:62, packages/api/src/rest/media-router.ts:249, packages/cli/src/commands/mcp.ts:248

**Preuves :** media-permissions.json, media-viewer-proof.json, mcp-viewer-proof.json

## MCP-01 — P1 — Les mutations MCP ne passent pas par la chaîne d’audit et de validation humaine

Défaut reproduit et revue de code. Un appel réel content.write_draft suivi de content.publish réussit directement. Aucun événement correspondant à l’identifiant créé n’est présent dans les 100 dernières entrées d’audit (page.hasMore=false). Les outils déclarent sideEffects=true et reversible=false, mais le serveur appelle directement execute.

**Conséquence :** R6 n’est pas assuré pour cette entrée agentique : pas de trace commune de l’action, pas de reçu/diff ni d’approbation malgré la déclaration de non-réversibilité. L’historique du contenu reste distinct du journal d’audit.

**Correction :** Assembler le MCP avec les mêmes décorateurs d’exécution que les agents et les écritures du serveur, plutôt que contourner les déclarations d’effets de bord.

**Recette :** Chaque mutation MCP produit une trace, un diff et une attribution vérifiables ; un outil non réversible attend réellement la validation humaine attendue par R6.

**Emplacements :** packages/cli/src/commands/mcp.ts:115, packages/cli/src/commands/mcp.ts:265, packages/mcp/src/server.ts:87, packages/agents/src/tools/core/content.ts:128

**Preuves :** mcp-e2e.json, mcp-index-proof.json

## MCP-02 — P1 — Un contenu publié par MCP reste absent des index dérivés

Limite connue, reproduite. La page QA MCP est rendue avec HTTP 200, mais son titre unique n’apparaît pas dans /api/search. Le code construit un ContentStore sans les décorateurs de recherche, redirections et planification ; BLOCKERS.md §3.3 et le README MCP le signalent déjà.

**Conséquence :** L’exploitation du site par un agent laisse un état différent de l’administration HTTP. Réindexer peut réparer la recherche ; cela ne remplace pas le branchement automatique des autres effets dérivés.

**Correction :** Factoriser l’assemblage des magasins décorés et le consommer depuis serve et mcp, en conservant les permissions du compte appelant.

**Recette :** Création, édition, changement de slug, publication et programmation via MCP maintiennent les mêmes dérivés que REST ; test après redémarrage et réindexation.

**Emplacements :** packages/cli/src/commands/mcp.ts:115, packages/mcp/README.md:111, BLOCKERS.md:187

**Preuves :** mcp-e2e.json, mcp-index-proof.json

## UI-01 — P1 — L’en-tête de l’administration impose 693 px à un écran de 390 px

Défaut reproduit. 64 des 66 visites mobiles administratives débordent horizontalement. La plupart ont scrollWidth=693 pour innerWidth=390. Le bouton de déconnexion et l’identité du compte repoussent la largeur ; les écrans de connexion/réinitialisation non protégés ne partagent pas tous ce défaut.

**Conséquence :** Actions hors champ, zoom visuel involontaire dans une capture plein écran, navigation mobile dégradée sur presque tout l’admin. Des sous-écrans ajoutent leurs propres débordements.

**Correction :** Adapter les éléments de l’en-tête aux petits écrans : libellés et identité compactés, flex children capables de rétrécir, actions regroupées et noms accessibles conservés.

**Recette :** Rejouer les 66 routes à 320/390/768 px, avec nom de compte long et 200 % de zoom. Tous les boutons restent visibles, activables et accessibles au clavier.

**Emplacements :** packages/admin/src/styles/shell.css:93, packages/admin/src/shell/app-shell.tsx:927

**Preuves :** admin-sweep.json, admin-mobile-recheck.log

## FORM-01 — P1 — Un champ conditionnel masqué par la règle reste visible et required dans le formulaire public

Défaut reproduit. Précisions est requis seulement si name=detail. Avec name=QA simple, le champ reste visible, required et invalide ; la validation native du navigateur bloque l’envoi. L’API ignore correctement le champ quand la condition est fausse.

**Conséquence :** Une soumission légitime ne passe pas depuis le formulaire public, malgré un serveur qui l’accepterait. Le défaut existe avec et sans JavaScript, car le rendu ne consomme pas showIf.

**Correction :** Consommer les conditions dans le rendu/parcours public et réévaluer required/visibilité aux transitions pertinentes. Concevoir explicitement la solution sans JavaScript avant de modifier le contrat.

**Recette :** Conditions vraies/fausses, changement de réponse, champs dépendants, multistep et reprise sur erreur, avec/sans JS ; aucune saisie cachée ne bloque ou ne fuit.

**Emplacements :** packages/cli/src/commands/forms-page.ts:206, packages/cli/src/commands/forms-page.ts:377, packages/forms/src/validate.ts:203

**Preuves :** form-conditional-proof.json, verified-tests.json, followup.json

## PAY-01 — P1 — L’URL de webhook de paiement annoncée ne possède pas de traitement entrant

Limite connue, contrôlée. POST /api/commerce/payments/webhook répond 405 avec INTERNAL / No such route, même en admin. L’URL est construite dans serve.ts ; PaymentStore.handleWebhook existe mais n’est pas branché HTTP. BLOCKERS.md §3.2 le confirme.

**Conséquence :** Le back office manuel fonctionne ; une boutique dépendant de notifications Stripe/PayPal ne peut pas considérer le rapprochement des paiements comme validé.

**Correction :** Brancher le gestionnaire existant avec lecture du corps brut et les contrôles appropriés ; garder l’avertissement de non-disponibilité jusqu’à validation complète.

**Recette :** Événements signés du sandbox fournisseur, rejets des signatures invalides, doublons, ordre inversé et redémarrage ; aucune commande marquée payée sur payload non authentifié.

**Emplacements :** packages/cli/src/commands/serve.ts:2962, packages/commerce/src/admin/router.ts:1480, BLOCKERS.md:181

**Preuves :** webhook-route-proof.json

## QA-01 — P1 — La commande E2E officielle ne collecte aucune suite navigateur utilisable

Défaut connu, revérifié. test:e2e lance playwright test sans configuration ni fichiers *.spec.* dédiés. Le mode --list a dû être arrêté après environ neuf minutes de balayage. La CI comporte des suites HTTP/unitaires, sans job Playwright. BLOCKERS.md §3.10 documente déjà le problème.

**Conséquence :** Les régressions visuelles, responsive et de navigateur trouvées ici ne sont pas couvertes par le gate annoncé. Les tests HTTP réels du CLI ont une valeur réelle, mais ne valident pas le comportement d’un navigateur.

**Correction :** Ajouter la configuration et des parcours critiques persistants (éditeur, rôles, formulaires, mobile, commerce) ; inclure screenshots/traces sur échec et une durée limitée.

**Recette :** La commande documentée collecte et termine ; un défaut volontaire de formulaire/mobile échoue effectivement en CI. Aucun parcours ne passe en restant sur le login.

**Emplacements :** package.json:21, .github/workflows/ci.yml, BLOCKERS.md:262

**Preuves :** e2e-entrypoint.log, editorial-e2e.json, admin-sweep.json

## MCP-03 — P2 — La création MCP sans locale utilise en sur un site dont la langue par défaut est fr

Défaut reproduit. La page QA MCP créée sans locale porte locale=en, createdBy=null et updatedBy=null, alors que la création REST equivalente utilise fr et que le serveur MCP a résolu un véritable compte admin.

**Conséquence :** Contenu créé dans une famille linguistique inattendue et attribution incomplète. C’est un défaut d’assemblage, pas un problème de traduction du texte écrit par le modèle.

**Correction :** Transmettre la locale du site et l’acteur aux opérations du service commun ; conserver la possibilité d’une locale explicite.

**Recette :** Création fr par défaut, en explicite, attribution au compte et aucune régression sur les familles de traduction.

**Emplacements :** packages/cli/src/commands/mcp.ts:349, packages/agents/src/tools/core/content.ts:154

**Preuves :** mcp-e2e.json, api-audit.json

## SEC-04 — P2 — L’absence de timestamp contourne le délai anti-robot des commentaires

Défaut reproduit. Une soumission publique sans _ts est acceptée (201). tooFast n’est vrai que si Number.isFinite(renderedAt), donc une valeur absente ou illisible ne déclenche pas le refus.

**Conséquence :** Le délai minimum est contournable. Le honeypot et le rate limiting restent présents ; ce constat ne signifie pas que toute la défense anti-spam est absente.

**Correction :** Refuser une preuve de chargement absente/invalide et borner les timestamps trop anciens ou futurs. Garder un message public qui ne révèle pas le détail de détection.

**Recette :** Absent, NaN, futur, ancien et trop rapide refusés ; soumission humaine et limitation de débit restent testées sur base réelle.

**Emplacements :** packages/comments/src/router.ts:233, packages/forms/src/anti-abuse.ts:32

**Preuves :** comment-timestamp-proof.json, content-extras.json

## I18N-01 — P2 — Une notification de sécurité affiche ses clés internes à l’utilisateur

Défaut reproduit. Après utilisation d’un code de secours, l’admin affiche security.recovery-code-used comme titre et texte, puis security.recovery-code-used.action comme bouton/lien.

**Conséquence :** Une alerte importante n’explique ni ce qui s’est produit ni l’action à entreprendre. Le problème apparaît après un parcours réel qui ne se voit pas sur une installation vide.

**Correction :** Ajouter les clés et variables aux catalogues fr/en et contrôler automatiquement la couverture de tous les codes émis par NoticeSource.

**Recette :** Une nouvelle consommation affiche une alerte compréhensible dans chaque langue ; le lien ouvre le bon écran ; aucune clé brute ni secret affiché.

**Emplacements :** packages/api/src/notices/recovery-code-used.ts:53, packages/admin/src/i18n/locales/fr.json, packages/admin/src/i18n/locales/en.json

**Preuves :** content-extras.json, ui-final.json

## I18N-02 — P2 — Les nouveaux formulaires français proposent une confirmation en anglais

Défaut reproduit. Le formulaire de création préremplit « Thank you — your message has been received. ». La même valeur est le défaut du store ; l’accusé de réception a lui aussi un texte anglais par défaut.

**Conséquence :** Une personne qui accepte les valeurs proposées publie un parcours linguistiquement incohérent. Les labels de l’écran sont pourtant en français.

**Correction :** Localiser les valeurs proposées par l’UI et choisir explicitement les défauts côté création, sans réécrire le contenu déjà saisi par un auteur.

**Recette :** Création fr/en, confirmation publique et autoresponder cohérents ; un texte personnalisé reste intact.

**Emplacements :** packages/admin/src/routes/forms.tsx:277, packages/forms/src/store.ts:46, packages/forms/src/notify.ts:164

**Preuves :** tabs-e2e.json

## A11Y-01 — P2 — Contrastes insuffisants récurrents dans l’administration

Mesure axe. 128 visites administratives présentent color-contrast. Le footer utilise notamment #7c8393 sur blanc, ratio mesuré 3,8 pour du texte 12 px (minimum attendu 4,5). Des badges/widgets et placeholders ajoutent des cas propres.

**Conséquence :** Texte difficile à lire pour certaines personnes ; l’admin ne peut pas être déclaré conforme AA sur cette base.

**Correction :** Corriger les tokens et variantes concernés avec mesure des couleurs rendues, puis vérifier badges, focus, champs et états disabled séparément.

**Recette :** Aucun échec contrast sur les parcours de référence en clair/sombre ; vérification manuelle des états non visibles par axe.

**Emplacements :** packages/admin/src/styles/shell.css:47, packages/admin/src/styles/theme.css

**Preuves :** admin-sweep.json, tabs-e2e.json

## A11Y-02 — P2 — L’éditeur de texte riche n’a pas de nom accessible

Mesure axe. Le contenteditable du champ de bloc prose produit aria-input-field-name, impact serious, dans la création de page ordinateur et mobile.

**Conséquence :** Le lecteur d’écran ne peut pas identifier correctement la zone de saisie principale du contenu.

**Correction :** Lier le nom via aria-labelledby ou le mécanisme approprié au composant, et conserver l’association pour chaque bloc répété.

**Recette :** Noms uniques sur plusieurs blocs, navigation clavier, annonce des erreurs et lecture NVDA/VoiceOver validées.

**Emplacements :** packages/admin/src/fields/rich-text-field.tsx, packages/admin/src/rich-text/rich-text-editor.tsx

**Preuves :** admin-sweep.json

## A11Y-03 — P2 — Les onglets Corbeille et Marketplace ont une structure ARIA invalide

Mesure axe. aria-required-children détecté sur les tablist. Les enfants sont des boutons ordinaires ; la structure de rôle tab et de panneaux associée n’est pas complète.

**Conséquence :** Les technologies d’assistance n’obtiennent pas une navigation par onglets cohérente. Le clic souris fonctionne.

**Correction :** Choisir la sémantique réelle ; réutiliser un composant accessible cohérent et tester l’état sélectionné.

**Recette :** Pas de violation ARIA, navigation clavier et annonces de sélection cohérentes.

**Emplacements :** packages/admin/src/routes/trash.tsx, packages/admin/src/routes/marketplace.tsx

**Preuves :** admin-sweep.json, tabs-e2e.json

## A11Y-04 — P2 — Petites cibles tactiles dans les dossiers média et certains liens portfolio

Mesure axe. Les commandes +, ✎ et × de dossier média échouent target-size. Quatre rendus portfolio de deux projets présentent la même règle.

**Conséquence :** Précision excessive au toucher, risque d’activer une autre action, surtout pour supprimer/renommer.

**Correction :** Augmenter les zones cliquables et leur espacement sans agrandir nécessairement l’icône ; conserver confirmation pour les destructions.

**Recette :** Mesure axe et activation tactile à 390 px sans collision de cibles.

**Emplacements :** packages/admin/src/routes/media.tsx, packages/theme-portfolio/src/styles

**Preuves :** admin-sweep.json, public-render.json

## A11Y-05 — P2 — Le calendrier mobile possède une zone scrollable non accessible au clavier

Mesure axe. scrollable-region-focusable, impact serious, sur /admin/calendar en viewport mobile.

**Conséquence :** Une personne au clavier ne peut pas atteindre toute la région de contenu.

**Correction :** Traiter le focus, le nom de la région et les contrôles de navigation tout en gardant un ordre de tabulation raisonnable.

**Recette :** Région entière parcourable avec clavier et lecteur d’écran ; pas de piège de focus.

**Emplacements :** packages/admin/src/routes/calendar.tsx

**Preuves :** admin-sweep.json

## A11Y-06 — P3 — Repères dupliqués, titre h1 manquant et niveaux de titre sautés

Mesure axe / bonnes pratiques. 24 visites admin ont landmark-unique ; l’écran de réinitialisation sans jeton manque de h1. Les pages publiques ont 8 violations landmark-unique et 6 heading-order (trois articles blog, deux formats). L’en-tête de sélection d’une table est vide.

**Conséquence :** Orientation moins claire au lecteur d’écran. Ces règles de bonnes pratiques ne sont pas toutes équivalentes à un échec WCAG AA.

**Correction :** Nommer les régions nécessaires, éviter les landmarks superflus, donner un h1 aux états d’erreur et corriger les niveaux des titres de contenu.

**Recette :** Arbre de repères et de titres compréhensible à la lecture manuelle ; aucune régression de structure.

**Emplacements :** packages/admin/src/routes, packages/theme-blog/src/render, packages/theme-docs/src/render

**Preuves :** admin-sweep.json, public-render.json

## UI-02 — P2 — Le thème Documentation déborde de 36 px sur toutes ses pages mobiles testées

Défaut reproduit. 17/17 pages Documentation à 390 px ont scrollWidth=426 ; aucun autre modèle public n’a ce débordement dans la campagne à 390 px.

**Conséquence :** Défilement horizontal global et contenu moins confortable à lire. Le nom long du site dans l’en-tête est une piste à confirmer par mesure des éléments, pas une cause arbitrairement attribuée.

**Correction :** Mesurer les éléments qui dépassent, corriger flex/grid/min-width et le comportement du wordmark long ; tester des titres de site réalistes.

**Recette :** 390/320 px, nom long/court, pages avec tableau/code et navigation ouverte : aucune scrollbar globale.

**Emplacements :** packages/theme-docs/src/styles/chrome.css:17, packages/theme-docs/src/styles/docs.css

**Preuves :** public-render.json

## UI-03 — P2 — Widgets et tâches planifiées ajoutent des largeurs fixes excessives

Défaut reproduit. L’écran Widgets atteint 1 500 px de largeur de document à 390 px ; Tâches planifiées 840 px et Médias 721 px. Ces valeurs dépassent même les 693 px imposés par l’en-tête.

**Conséquence :** Corriger seulement l’en-tête ne suffira pas. Le contenu, l’aperçu et les actions ne tiennent pas dans un parcours mobile.

**Correction :** Adapter les grilles et éviter les tailles minimales globales ; conserver des contrôles de réorganisation alternatifs au drag and drop.

**Recette :** Parcours de modification utilisable au clavier et au toucher sans scroll de toute la page.

**Emplacements :** packages/admin/src/routes/widgets.tsx, packages/admin/src/routes/scheduled.tsx, packages/admin/src/styles/media.css

**Preuves :** admin-sweep.json

## TEXT-01 — P2 — Statuts anglais, UUID et dates techniques occupent les listes métier

Observation UX. La liste de pages affiche published, des UUID complets et des dates localisées ; le tableau de bord/profil conserve des dates ISO et des noms d’action techniques. Des descriptions d’agents/tâches et des libellés publics restent anglais dans un site français.

**Conséquence :** Les informations utiles à une personne qui gère du contenu sont diluées par des identifiants techniques. Les données de démonstration anglaises ne sont pas un défaut du moteur de traduction.

**Correction :** Unifier les formateurs de statut/date déjà utilisés, donner une hiérarchie claire aux colonnes et localiser les textes de l’interface. Traduire ou identifier la langue des packs de démonstration.

**Recette :** Revue fr/en, dates de programmation sans ambiguïté et pas de clé technique affichée comme label métier.

**Emplacements :** packages/admin/src/routes/collection-list.tsx, packages/admin/src/routes/profile.tsx, packages/admin/src/i18n/locales/fr.json

**Preuves :** admin-sweep.json, tabs-e2e.json

## TEXT-02 — P2 — Le widget de sauvegarde expose une explication d’implémentation sans action utile

Observation UX. Le tableau de bord indique que le widget « ne verra jamais de données tant qu’aucune API d’administration ne les expose ». Il ne reflète pas les sauvegardes CLI, alors qu’une sauvegarde/restauration fonctionne réellement.

**Conséquence :** Un écran d’état principal présente une limite du code à la place d’une information d’exploitation et d’un chemin d’action.

**Correction :** Remplacer la formulation par un état « consultation depuis la CLI » avec aide concrète, ou brancher une lecture d’état si ce lot est autorisé. Ne pas inventer un indicateur vert.

**Recette :** Une personne sait comment créer, vérifier et retrouver sa sauvegarde ; aucune fausse assurance sur les fichiers média/secrets/configuration.

**Emplacements :** packages/admin/src/routes/dashboard.tsx, packages/cli/src/commands/widget-resolve.ts

**Preuves :** admin-sweep.json, backup-create.log, backup-preview.log

## TEXT-03 — P2 — Le ratio budget/usage d’agents est ambigu et les états ne disent pas si un fournisseur est disponible

Observation UX. La colonne « Budget (jetons/jour utilisés) » montre 60000 / 0 : le code affiche limite puis usage. Des agents sont Activés avec modèle/provider anthropic alors qu’aucun fournisseur n’est configuré ; le générateur de thème explique mieux cette absence.

**Conséquence :** Lecture du budget difficile et confusion entre configuration activée et capacité d’exécuter l’agent.

**Correction :** Afficher « 0 consommés sur 60 000 » avec formatage, et une indication calculée de disponibilité du fournisseur, sans remettre en cause R2 ni les décisions d’autonomie.

**Recette :** Compréhension immédiate sur usage nul, élevé, dépassé et provider absent ; les fonctions CMS restent accessibles sans IA.

**Emplacements :** packages/admin/src/routes/agents.tsx:623

**Preuves :** admin-sweep.json

## SEO-01 — P2 — Les accueils Vitrine et Blog n’ont pas de meta description

Mesure Lighthouse. Lighthouse détecte meta-description absente sur ces deux accueils (SEO 92). La fiche produit Store contrôlée obtient SEO 100.

**Conséquence :** Les modèles prêts à démarrer laissent un champ SEO essentiel vide ; ce n’est pas la preuve d’un problème d’indexation de toutes les pages.

**Correction :** Compléter les métadonnées des modèles et rendre l’absence visible dans le diagnostic SEO.

**Recette :** Description unique et adaptée ; noindex des aperçus inchangé ; validation de sitemap/canonical/hreflang après édition.

**Emplacements :** packages/cli/src/commands/seo.ts, packages/starters/src

**Preuves :** lighthouse-vitrine-mobile.report.json, lighthouse-blog-mobile-verified.report.json

## SEO-02 — P3 — Le favicon par défaut provoque une requête 404

Mesure Lighthouse. Sur les pages Lighthouse valides, la console reçoit une 404 pour /favicon.ico. Aucun favicon n’a été configuré sur ces installations neuves.

**Conséquence :** Erreur de réseau inutile et marque absente dans l’onglet navigateur ; les pages restent fonctionnelles.

**Correction :** Servir le favicon par défaut et préserver la priorité de l’identité configurée par le site.

**Recette :** Plus de 404 favicon à l’installation ; variantes personnalisées et cache vérifiés.

**Emplacements :** packages/cli/src/commands/theme-render.ts:599, packages/cli/src/commands/serve.ts

**Preuves :** lighthouse-vitrine-desktop.report.json, lighthouse-store-mobile-verified.report.json

## PERF-01 — P2 — Le premier affichage mobile mérite une mesure dédiée avant recette

Mesure indicative, à requalifier. Mesures locales Lighthouse : Vitrine mobile 80/LCP 4,0 s ; Blog mobile 69/LCP 4,9 s ; produit Store mobile 82/LCP 3,6 s. Vitrine desktop 94/LCP 1,2 s. Le mobile signale un CPU plus lent qu’attendu et les suites de tests chargeaient la machine.

**Conséquence :** Ces valeurs ne constituent ni des Core Web Vitals terrain ni une régression prouvée. Elles justifient une campagne stable pour établir les budgets de livraison.

**Correction :** Mesurer avant optimisation. Étudier ensuite seulement les ressources bloquantes, variantes média, CSS inutilisé et cache selon les résultats.

**Recette :** Médianes documentées en environnement stable, aucune régression contre cette baseline et suivi réel après déploiement.

**Emplacements :** packages/cli/src/commands/theme-render.ts, packages/render/src/images

**Preuves :** lighthouse-vitrine-mobile.report.json, lighthouse-vitrine-desktop.report.json, lighthouse-blog-mobile-verified.report.json, lighthouse-store-mobile-verified.report.json

## UI-04 — P3 — Les vignettes de logos coupent leur texte

Observation visuelle. Les logos du modèle Vitrine sont recadrés comme des photographies : le nom est coupé dans la grille. Les originaux et variantes publics testés se chargent correctement.

**Conséquence :** Reconnaissance et sélection difficiles d’un média proche d’un autre, sans preuve de corruption du fichier.

**Correction :** Revoir le mode de présentation de la vignette sans modifier les originaux ; garder un aperçu complet au focus/ouverture.

**Recette :** Logo, photo portrait/paysage, transparence et nom long identifiables en grille, clavier et mobile.

**Emplacements :** packages/admin/src/styles/media.css

**Preuves :** admin-sweep.json

## CODE-01 — P2 — L’assemblage du serveur concentre de nombreuses responsabilités dans un très grand fichier

Revue de code, amélioration. serve.ts rassemble assemblage, routes, audit, rendu, cron, import, commerce, agents et notifications dans plus de 9 000 lignes. Les chemins MCP/HTTP divergents observés sont un exemple concret du coût de cette duplication.

**Conséquence :** Difficulté à partager les invariants et à revoir une modification. Ce volume ne prouve pas à lui seul un dysfonctionnement ou une mauvaise performance.

**Correction :** Extraire progressivement les responsabilités ayant déjà plusieurs consommateurs, en commençant par le chemin de mutation commun ; conserver des tests de contrats et de transport.

**Recette :** Même résultat observable par HTTP/MCP, tests existants inchangés et responsabilité de chaque décorateur documentée.

**Emplacements :** packages/cli/src/commands/serve.ts, packages/cli/src/commands/mcp.ts

**Preuves :** mcp-index-proof.json, build-direct.log, typecheck-direct.log

## DOC-01 — P3 — Le corpus contient des constats historiques qui ne décrivent plus le code actuel

Revue et contre-tests. L20 décrit notamment un crash de bascule éditeur, une langue de menu incorrecte, des outils bloqués et des agents/tâches 404. Les parcours actuels contrôlés ne reproduisent pas ces anciens défauts. BLOCKERS §2.3 annonce un test d’anonymisation rouge : le test actuel passe en excluant les événements auth.login_failed, dont l’adresse saisie reste volontairement en clair. La politique de conservation doit être clarifiée selon la gouvernance ; le vert ne tranche pas cette question. Des références de contrat/décision restent à compléter selon BLOCKERS.md.

**Conséquence :** Une personne peut diagnostiquer ou planifier une correction déjà livrée. Des limites déclarées ne doivent pas être confondues avec des décisions actées.

**Correction :** Ajouter un statut aux anciens constats et lier les nouveaux résultats ; faire traiter les décisions en attente par leur procédure, sans les contourner.

**Recette :** L’audit courant est la référence pour le commit étudié ; les anciens bugs restent consultables comme historique, pas comme tickets actifs.

**Emplacements :** docs/lots/L20-audit-admin-complet.md, BLOCKERS.md, docs/04-contrats.md, packages/cli/test/serve-users.test.ts:504

**Preuves :** editorial-e2e.json, followup.json, admin-sweep.json, docs-check.log, unit-cli-recheck.json

## SETTING-01 — P1 — 43 réglages administratifs absents : le client les charge sans authentification

Défaut reproduit et revue de code. GET /api/settings authentifié retourne 64 réglages ; le même appel anonyme en retourne 21. listSettings ne transmet pas le bearer de la session. Les contrôles administratifs manquent donc dans les onglets concernés ; leur absence a été capturée, et ne constitue pas une sauvegarde réussie.

**Conséquence :** Impossible de régler depuis l’admin plusieurs politiques de modération, limites, facturation, SEO et observabilité pourtant présentes dans le serveur.

**Correction :** Passer la session au chargement administratif, conserver le filtrage public et traiter explicitement les erreurs de chargement.

**Recette :** Rejouer le scénario documenté sur une base réelle, ordinateur et mobile ; ajouter un test de non-régression couvrant la cause et son contre-test valide.

**Emplacements :** packages/admin/src/api/settings-client.ts:45, packages/admin/src/routes/settings.tsx

**Preuves :** ../exhaustif/evidence/settings-auth-gap.json, ../exhaustif/evidence/settings-inventory.json, ../exhaustif/evidence/settings-lifecycle.json

## WORKFLOW-01 — P1 — Un workflow configuré disparaît du schéma et de l’interface

Défaut reproduit et revue de code. La collection page est configurée avec workflow.enabled=true. /api/schema ne contient pas cette propriété. Le menu File de relecture et les actions conditionnées par collection.workflow sont masqués. Le cycle submit/request-changes/resubmit/approve fonctionne via API.

**Conséquence :** Le rédacteur ne peut pas effectuer le parcours de relecture depuis l’interface standard.

**Correction :** Exposer le contrat workflow dans le schéma JSON et le consommer uniformément dans la navigation et les éditeurs.

**Recette :** Rejouer le scénario documenté sur une base réelle, ordinateur et mobile ; ajouter un test de non-régression couvrant la cause et son contre-test valide.

**Emplacements :** packages/schema/src/generate-schema-json.ts, packages/admin/src/shell/nav-items.ts, packages/admin/src/routes/entry-edit.tsx

**Preuves :** ../exhaustif/evidence/taxonomy-workflow.json, ../exhaustif/evidence/navigation-1440.json

## EDITOR-01 — P1 — Deux champs de texte riche vides font planter la création

Défaut reproduit et revue de code. Contre-tests : collection scalaire et un champ richText vide s’ouvrent. Deux champs richText vides, ou la collection qa_fields comportant plusieurs éditeurs vides, produisent une page principale vide et l’erreur Slate Unable to find a path for Slate node. convert.ts réutilise EMPTY_DOCUMENT et son nœud texte entre éditeurs.

**Conséquence :** Création impossible pour des schémas pourtant valides ; erreur JavaScript sans récupération utilisable.

**Correction :** Créer un document et des nœuds distincts pour chaque instance vide ; tester plusieurs éditeurs montés simultanément, ajout et retrait.

**Recette :** Rejouer le scénario documenté sur une base réelle, ordinateur et mobile ; ajouter un test de non-régression couvrant la cause et son contre-test valide.

**Emplacements :** packages/admin/src/rich-text/convert.ts:20, packages/admin/src/rich-text/rich-text-editor.tsx

**Preuves :** ../exhaustif/evidence/field-investigation.json, ../exhaustif/evidence/fields-lifecycle.json

## FORM-02 — P1 — Une soumission multipart perd les premiers choix multiples

Défaut reproduit et revue de code. Le formulaire réel à dix types de champs inclut une pièce jointe. Cocher Alpha et Bêta puis envoyer sans JS conserve uniquement Bêta dans choiceMulti. Le contre-test du même type sans pièce jointe (URL encodée) conserve les deux choix.

**Conséquence :** Perte silencieuse de réponses, confirmations pourtant affichées comme réussies.

**Correction :** Conserver les valeurs répétées pendant la lecture multipart, puis les normaliser selon le type du champ ; ne pas écraser une clé répétée.

**Recette :** Rejouer le scénario documenté sur une base réelle, ordinateur et mobile ; ajouter un test de non-régression couvrant la cause et son contre-test valide.

**Emplacements :** packages/cli/src/commands/serve.ts, packages/forms/src/validate.ts

**Preuves :** ../exhaustif/evidence/form-choice-multi-loss.json, ../exhaustif/evidence/forms-lifecycle.json, ../exhaustif/evidence/forms-counter.json

## BLOCK-01 — P2 — Un tri collectionList accepté rend la page publique en erreur 500

Défaut reproduit et revue de code. Une page comportant collectionList sur page avec sort.field=publishedAt est créée et publiée, mais son rendu public échoue CONTENT_INVALID : ce champ ne fait pas partie des champs triables de cette collection. Le contre-test createdAt rend correctement le bloc.

**Conséquence :** Un paramétrage invalide dans l’éditeur peut casser la page publique après publication.

**Correction :** Prévalider collection, filtre et champ de tri contre le schéma ; proposer uniquement les champs supportés et isoler les erreurs de rendu d’un bloc.

**Recette :** Rejouer le scénario documenté sur une base réelle, ordinateur et mobile ; ajouter un test de non-régression couvrant la cause et son contre-test valide.

**Emplacements :** packages/blocks/src/vocabulary.ts, packages/cli/src/commands/theme-render.ts

**Preuves :** ../exhaustif/evidence/collection-list-invalid-sort.json, ../exhaustif/evidence/block-valid-collectionList.json, ../exhaustif/evidence/blocks-lifecycle.json

## IMPORT-01 — P1 — L’import WordPress est proposé sur une collection post incompatible

Défaut reproduit et revue de code. Analyse et application du petit export WXR réel sur le site Vitrine : échec SQLite table cogenta_post has no column named excerpt. Le module WordPress documente la limite des collections préexistantes, mais le parcours UI ne prévient pas cette incompatibilité avant application. JSON, RSS et CSV passent sur ce site.

**Conséquence :** Une migration proposée échoue avec une erreur de stockage ; la compatibilité de la cible n’est pas précontrôlée. Ce test ne conclut pas à l’échec sur une cible WordPress neuve compatible.

**Correction :** Détecter le conflit de schéma à la prévisualisation, expliquer les options compatibles et ne pas démarrer une importation promise comme applicable. Respecter la décision de périmètre sur les collections existantes.

**Recette :** Rejouer le scénario documenté sur une base réelle, ordinateur et mobile ; ajouter un test de non-régression couvrant la cause et son contre-test valide.

**Emplacements :** packages/import/src/wordpress/collections.ts, packages/admin/src/routes/import.tsx

**Preuves :** ../exhaustif/evidence/import-wordpress-product-failure.json, ../exhaustif/evidence/import-formats.json, ../exhaustif/evidence/import-runs-counter.json

## AI-01 — P1 — L’agent intégré d’accessibilité demande un outil inexistant

Défaut reproduit et revue de code. Après crédit des comptes, douze agents intégrés terminent réellement une exécution en lecture seule (deux après attente de synchronisation). AccessibilityAuditor échoue TOOL_UNKNOWN pour http.fetch. Les réponses des fournisseurs sont opérationnelles.

**Conséquence :** Un agent intégré annoncé disponible ne peut pas effectuer son travail ; le blocage n’est plus imputable au crédit du fournisseur.

**Correction :** Aligner la déclaration de l’agent et son prompt avec le registre d’outils réellement monté ; ajouter un test de démarrage et d’appel d’outil pour chaque agent livré.

**Recette :** Rejouer le scénario documenté sur une base réelle, ordinateur et mobile ; ajouter un test de non-régression couvrant la cause et son contre-test valide.

**Emplacements :** packages/agents/src/agents/builtins.ts, packages/cli/src/commands/agent-runtime.ts

**Preuves :** ../exhaustif/evidence/agent-runs-real.json, ../exhaustif/evidence/provider-health-real.json, ../exhaustif/evidence/agent-counter-security-scanner.json, ../exhaustif/evidence/agent-counter-site-monitor.json

## AI-02 — P2 — Les documents indexés ne sont pas recherchés par le chat de l’admin

Défaut reproduit et revue de code. Un Markdown contenant MISTRAL-4827 est annoncé indexed avec un chunk. Le chat UI ne le trouve pas : il cherche les collections de contenu lisibles dans la locale fr. Un appel réel assist.chat avec collection _reference_documents et locale und retrouve exactement la réponse et cite le document. Le chat UI retrouve bien le même fait dans une page publiée.

**Conséquence :** L’index de documents semble alimenter l’assistant, mais ces documents sont hors du périmètre de recherche effectif de l’UI.

**Correction :** Inclure les documents autorisés dans la recherche, résoudre leur locale und explicitement et rendre le périmètre de recherche visible.

**Recette :** Rejouer le scénario documenté sur une base réelle, ordinateur et mobile ; ajouter un test de non-régression couvrant la cause et son contre-test valide.

**Emplacements :** packages/admin/src/routes/assistant-chat.tsx:121, packages/agents/src/rag/reference-documents/types.ts, packages/agents/src/rag/reference-documents/ingest.ts

**Preuves :** ../exhaustif/evidence/ai-ui-lifecycle.json, ../exhaustif/evidence/ai-chat-reference-counter.json, ../exhaustif/evidence/ai-rag-counter.json

## AI-03 — P2 — L’activation répond avant la synchronisation de l’agent

Défaut reproduit et revue de code. Activer SecurityScanner ou SiteMonitor répond 200 et la liste les indique enabled=true ; lancer immédiatement répond AGENT_DISABLED. Attendre environ 600 ms permet un run réel terminé. L’adaptateur lance la persistance puis refresh sans l’attendre.

**Conséquence :** Une action immédiatement disponible dans l’UI peut échouer après confirmation d’activation.

**Correction :** Attendre la persistance et la synchronisation du runtime avant de confirmer l’activation ; tester enable puis run sans délai arbitraire.

**Recette :** Rejouer le scénario documenté sur une base réelle, ordinateur et mobile ; ajouter un test de non-régression couvrant la cause et son contre-test valide.

**Emplacements :** packages/cli/src/commands/agent-runtime.ts:688

**Preuves :** ../exhaustif/evidence/agent-runs-real.json, ../exhaustif/evidence/agent-counter-security-scanner.json, ../exhaustif/evidence/agent-counter-site-monitor.json

## THEME-01 — P2 — L’atelier propose de cloner des thèmes npm que le serveur ne sait pas cloner

Défaut reproduit et revue de code. La liste de sources comprend les thèmes installés npm. Le contre-test de clonage npm échoue 500 THEME_SANDBOX_SOURCE_NOT_FOUND ; cloner le thème local QA, apercevoir, déployer et exporter passe. La restriction serveur ne correspond pas aux choix affichés.

**Conséquence :** Un choix proposé conduit à une impasse ; l’utilisateur ne sait pas quels thèmes sont clonables.

**Correction :** Filtrer les sources par capacité réellement prise en charge ou compléter le clonage suivant le contrat existant.

**Recette :** Rejouer le scénario documenté sur une base réelle, ordinateur et mobile ; ajouter un test de non-régression couvrant la cause et son contre-test valide.

**Emplacements :** packages/admin/src/routes/theme-sandbox.tsx, packages/cli/src/commands/theme-sandbox.ts

**Preuves :** ../exhaustif/evidence/theme-lifecycle.json, ../exhaustif/evidence/probe.json, ../exhaustif/evidence/theme-npm-clone-counter.json

## PLUGIN-01 — P2 — Installer une extension locale ne signale pas clairement le redémarrage nécessaire

Défaut reproduit et revue de code. Les modèles page et daily s’installent mais la route répond 404 et la tâche est absente dans le processus courant. Un second démarrage charge la route (200 Hello from a plugin) et exécute daily (ran daily). Le chargement au démarrage est documenté dans le runtime ; il faut rendre cette contrainte visible dans l’interface.

**Conséquence :** Le retour d’installation peut être interprété comme une extension déjà opérationnelle. Le test des grants on-publish ne prouve pas l’exécution de son gestionnaire d’événement.

**Correction :** Indiquer l’état installé/en attente de redémarrage, documenter la procédure et confirmer le chargement effectif ; ne pas contourner silencieusement l’architecture de chargement actée.

**Recette :** Rejouer le scénario documenté sur une base réelle, ordinateur et mobile ; ajouter un test de non-régression couvrant la cause et son contre-test valide.

**Emplacements :** packages/cli/src/commands/plugin-runtime.ts:49, packages/admin/src/routes/plugins.tsx

**Preuves :** ../exhaustif/evidence/plugins-templates.json, ../exhaustif/evidence/plugin-restart-counter.json, ../exhaustif/evidence/plugin-restart-lifecycle.json

## THEME-02 — P1 — Enregistrer une couleur sur le thème initial est refusé pour 21 tokens manquants

Défaut reproduit et revue de code. Thème actif @cogenta/theme-entreprise, aucune surcharge initiale. Personnaliser, modifier Accent et CSS puis Enregistrer envoie PUT /api/theme/overrides ; réponse 422 SKIN_TOKEN_MISSING, énumérant 21 tokens. Le serveur fusionne la surcharge avec un fichier de tokens absent au lieu des tokens effectifs que l’UI affiche. L’activation d’un thème local fonctionne.

**Conséquence :** La personnalisation manuelle de base ne s’enregistre pas sur la configuration initiale testée.

**Correction :** Fusionner et valider contre les tokens effectifs du thème actif ; conserver la validation complète du contrat D et les contrôles de contraste.

**Recette :** Rejouer le scénario documenté sur une base réelle, ordinateur et mobile ; ajouter un test de non-régression couvrant la cause et son contre-test valide.

**Emplacements :** packages/api/src/rest/theme-router.ts:799, packages/admin/src/routes/appearance.tsx:445, packages/cli/src/commands/serve.ts:8399

**Preuves :** ../exhaustif/evidence/appearance-save-response.json, ../exhaustif/evidence/appearance-lifecycle.json

## DOC-02 — P2 — Un lien interne de la documentation mène à un page introuvable

Défaut reproduit. Le parcours récursif des liens de documentation découvre /admin/documentation/docs/technical/paquets-et-drivers. Cette destination affiche Page introuvable ; le document disponible utilise technical/packages-and-drivers. Le simple contrôle du titre Documentation complète ne suffisait pas : le corps de page a été relu.

**Conséquence :** Une aide technique liée depuis la documentation est inaccessible en suivant son lien.

**Correction :** Corriger le lien ou fournir un alias de slug ; vérifier récursivement les liens sur le corpus livré.

**Recette :** Le parcours de tous les liens ne contient plus de page introuvable, aux deux largeurs testées.

**Emplacements :** packages/admin/src/routes/documentation.tsx, docs/

**Preuves :** ../exhaustif/evidence/documentation-bfs-1440.json, ../exhaustif/evidence/documentation-bfs-390.json
