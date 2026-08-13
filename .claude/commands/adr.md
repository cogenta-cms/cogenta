---
description: Rédige une nouvelle ADR au format du projet, prête à insérer dans docs/03-decisions.md
argument-hint: <sujet de la décision>
---

Utilise la skill `write-adr` pour rédiger une ADR sur : **$ARGUMENTS**

Avant d'écrire :

1. Lis `docs/03-decisions.md` en entier — pour le numéro suivant, pour le ton, et pour
   vérifier qu'aucune ADR existante ne couvre déjà le sujet ou ne le contredit.
2. Si une ADR existante est contredite, dis-le et propose la mention
   `Remplacée par ADR-XXXX` sur l'ancienne.

Le fichier est **protégé en écriture**. Rends-moi le texte exact, dans un bloc, prêt à
coller — ne tente pas de l'éditer toi-même.

Si la décision change une contrainte de développement, indique aussi les modifications à
apporter à `AGENTS.md` et `CLAUDE.md`.
