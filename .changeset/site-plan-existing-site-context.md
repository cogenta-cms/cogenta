---
"@cogenta/agents": minor
"@cogenta/cli": minor
---

Fiche 60: site plan generation gains conscience of the site it would join. Before this, a plan proposed from the admin on a site with two hundred articles and a live shop looked exactly like a plan proposed on an empty database — the only contact with reality was `site-plan.ts`'s late, defensive "this collection name is already taken" refusal at *apply* time, never an entry of the agent's own reasoning.

`@cogenta/agents` gains `describeExistingSite`/`ExistingSiteSnapshot` (`site-plan/site-context.ts`): a plain-data snapshot of a site's declared collections (name, fields, entry/published counts), taxonomies, active theme and configured integrations — built by the caller (no database dependency inside this package), and rendered to text only for `assembleContext`'s tagged `data` channel (R8: the whole rendering goes through escaping uniformly, since a collection's own `labels` are free text an operator or an earlier agent chose).

`analyseBrief`, `proposeContentModel` and `generateSkinCandidates` gain an optional `existingSite` parameter, threaded through `proposeSitePlan`. Absent (the installer's own path, on a fresh site) or an empty snapshot, every request stays byte-for-byte what it always was — proven by tests comparing the two paths' requests directly. `generateSkin` (`skin/generate.ts`) gains an optional `context` (tagged data items) it did not have before, used only when `generateSkinCandidates` is given a populated `existingSite`; every existing caller keeps its exact single-message request.

Given a populated `existingSite`, `proposeContentModel` switches to "évolution plutôt que premier jet": the prompt asks for complements rather than a redefinition, and — never trusting the model alone, the same discipline `enforce.ts` already applies to explicit constraints — any collection proposed anyway under a name the site already declares is dropped structurally and reported in the new `skippedExisting` result field, surfaced as a plan warning.

New deterministic pass `detectStructuralGaps` (`site-plan/structural-gaps.ts`): compares the proposed pages and the existing site against a closed list of pages most sites need (contact, legal notice, privacy policy) and suggests only what neither already covers — never generated automatically (R6). `SitePlanDraft` gains `structuralGaps`, and `summarisePlan`/`resolveApprovedPlan` (`site-plan/approval.ts`) gain a new `structuralGaps` review section between `pages` and `skin`; an accepted suggestion joins the approved plan's `pages`, exactly as reviewable and exactly as unapplied-by-itself as every other item.

`@cogenta/cli`'s `site-plan.ts` gains `buildExistingSiteSnapshot`/`ExistingSiteContext`/`detectActiveIntegrations` (all exported for testing) and wires the snapshot into `createPlanner`, read fresh on every proposal — never cached across the process's lifetime, the same discipline `theme-wiring.ts` documents for its own token overlay. `SitePlanningOptions` gains an optional `taxonomies` field; `serve.ts` passes the taxonomies it already loads. The installer entry point (`create-cogenta`) is untouched — on a new site, `existingSite` is empty by construction, so its behaviour is unchanged.

Admin: "Créer un site" is renamed "Générer le site" (`nav.createSite`, `sitePlan.heading`, the onboarding guide's step 4) in both locales — the review screen itself needed no code change, since it already renders whatever sections the server returns.

No new dependency (R9). No contract touched: this is read access already covered by `PermissionLayer` (R2/R4), consistent with ADR-0023.
