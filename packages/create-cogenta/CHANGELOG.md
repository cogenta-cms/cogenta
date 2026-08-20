# create-cogenta

## 0.2.2

### Patch Changes

- [`2fb2101`](https://github.com/cogenta-cms/cogenta/commit/2fb210109824f000788d512fef748f1066f65551) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add the editorial site settings screen (fiche 23, ADR-0025's third settings
  category between `cogenta.config.mjs` — infrastructure, read-only — and
  `localStorage` — personal preference).
  
  - `@cogenta/schema` gains a typed key/value site-settings store
    (`createSiteSettingsStore`) backed by a closed registry: general (title,
    tagline, admin email, time zone, date/time style), reading (home path,
    posts per page), media (max upload size), and privacy (policy path, cookie
    banner). Every setting has a declared scope (site or per-locale), a default,
    and a required permission; writing an undeclared key is refused.
  - `@cogenta/api` gains `createSitePlanRouter`'s sibling `GET|PATCH
    /api/settings` and extends `GET /api/config-status` with `storage`,
    `llm`/`embeddings`/`imageGeneration`/`vector`, and `billingConfigured` —
    never a secret, never a credential.
  - `@cogenta/cli` wires the new store into `cogenta serve`/`dev`, and
    `theme-render.ts` now serves the configured home path instead of always
    falling back to the hardcoded `/home`.
  - `@cogenta/core` adds `SITE_SETTING_UNKNOWN`/`SITE_SETTING_INVALID` and a
    `secret-hygiene` module the settings screen uses to detect a
    `database.url` with embedded credentials, or a `.env` file readable by
    other users on shared hosting.
  - `create-cogenta` now writes the generated `.env` (which holds
    `COGENTA_AUTH_SIGNING_KEY`) with mode `0o600` instead of the default —
    closing the shared-hosting exposure `docs/hebergement-mutualise.md`
    already named as a known gap.
  
  The admin's old single-control "Paramètres" screen (the signed-in account's
  own interface language) moves to "My profile"; `/settings` is now the
  site-wide editorial screen.
- Updated dependencies [[`54ca689`](https://github.com/cogenta-cms/cogenta/commit/54ca6894449fcdd29ff76eef4514cda7c081f483), [`0692713`](https://github.com/cogenta-cms/cogenta/commit/06927130c15f7bc95ea97839cb50f67de87bd668), [`36744d3`](https://github.com/cogenta-cms/cogenta/commit/36744d3bc8e74a39fa6c68bdd78804fad1d8f069), [`7b7ec0b`](https://github.com/cogenta-cms/cogenta/commit/7b7ec0b897735c1323bb733ae6ba76a522f72669), [`0ca8a79`](https://github.com/cogenta-cms/cogenta/commit/0ca8a797288624a3c4d53ca0942687d9e570b186), [`c392e24`](https://github.com/cogenta-cms/cogenta/commit/c392e24880a29388fc63a08388042bf163817619), [`967ec5a`](https://github.com/cogenta-cms/cogenta/commit/967ec5a64a85ef0030a764e72a151a8bc8edfca6), [`562c9c1`](https://github.com/cogenta-cms/cogenta/commit/562c9c1ee4d52b3e7f624e3b54ae033c2bd01e1c), [`edf5623`](https://github.com/cogenta-cms/cogenta/commit/edf562389652c4f6afb58d6e3f166de233d063e2), [`db307e0`](https://github.com/cogenta-cms/cogenta/commit/db307e068f4d029d98526c74d0ab9d56e531b73b), [`49815b9`](https://github.com/cogenta-cms/cogenta/commit/49815b95ad87cd37e7781cbb5a726327226259dd), [`122da7a`](https://github.com/cogenta-cms/cogenta/commit/122da7ad20396966b4d44538b0842f8efb9b7621), [`2fb2101`](https://github.com/cogenta-cms/cogenta/commit/2fb210109824f000788d512fef748f1066f65551), [`0e90b32`](https://github.com/cogenta-cms/cogenta/commit/0e90b32c19247430987e84cc1fd0be57e1ad4f3e), [`d0bfa1d`](https://github.com/cogenta-cms/cogenta/commit/d0bfa1d71166adfb0c66a296c4cf490ddd58a218), [`95acedf`](https://github.com/cogenta-cms/cogenta/commit/95acedf48920dba08e443e56ca4464bcfd394d34), [`6e5df34`](https://github.com/cogenta-cms/cogenta/commit/6e5df34e6f428c36712bc80e76c37d0cd7e33b1c), [`bebbab8`](https://github.com/cogenta-cms/cogenta/commit/bebbab881761fb86a28cdbbcb95b5960429f2a29), [`e75b23e`](https://github.com/cogenta-cms/cogenta/commit/e75b23ec985099f2eabe6eabb7b4c86115006996), [`4513a71`](https://github.com/cogenta-cms/cogenta/commit/4513a71a15dfa7a716bf9c8fcd02f93df927f230), [`e8061e2`](https://github.com/cogenta-cms/cogenta/commit/e8061e24ec41e9a99f5c852c28649f62656b0cc9), [`54409f3`](https://github.com/cogenta-cms/cogenta/commit/54409f3ff4640518d5d4149bef73a29142ba0d0a), [`f47e893`](https://github.com/cogenta-cms/cogenta/commit/f47e893b3e2b674b028af54d2146c7e83c32617c), [`2285720`](https://github.com/cogenta-cms/cogenta/commit/2285720ae29de05e96a8d776fd5ae14f2fe4fd0d), [`46572ba`](https://github.com/cogenta-cms/cogenta/commit/46572bae836b8182c2a3563e8f0e2da74d7e82ee), [`8c98093`](https://github.com/cogenta-cms/cogenta/commit/8c9809397c271c0f091ee8aaae140ac2a7c8e8f7), [`2c1af5d`](https://github.com/cogenta-cms/cogenta/commit/2c1af5d8ec08b460ba80a2228ceca6f4ff89eef2), [`745ebd8`](https://github.com/cogenta-cms/cogenta/commit/745ebd8f80ea94d916a370af0f9615e6565c0d00), [`b50f7bb`](https://github.com/cogenta-cms/cogenta/commit/b50f7bba14a3d749ffb330eed300bd69e9f8d837), [`9e67928`](https://github.com/cogenta-cms/cogenta/commit/9e67928b4b2fd58cc4e72f42f7a265aac8460567), [`954460e`](https://github.com/cogenta-cms/cogenta/commit/954460e63748a58c47d28292b1691425775b7e36), [`421cf33`](https://github.com/cogenta-cms/cogenta/commit/421cf33e57f8922e94506275cd724d5ce1639ff6), [`3824e8e`](https://github.com/cogenta-cms/cogenta/commit/3824e8e043e5d4036a47bd1e0b9d86c44c45a5a7)]:
  - @cogenta/core@0.5.0
  - @cogenta/auth@0.4.0
  - @cogenta/cli@0.5.0
  - @cogenta/agents@0.3.0
  - @cogenta/schema@0.4.0
  - @cogenta/render@0.2.0
  - @cogenta/theme-canonical@0.3.0
  - @cogenta/blocks@0.1.5

## 0.2.1

### Patch Changes

- Updated dependencies [[`d72b40f`](https://github.com/cogenta-cms/cogenta/commit/d72b40f64ab5b98985a22d9daae34796a4638f45), [`4eda357`](https://github.com/cogenta-cms/cogenta/commit/4eda35754f55484e12028707e4f54aaaccc188d2), [`4eda357`](https://github.com/cogenta-cms/cogenta/commit/4eda35754f55484e12028707e4f54aaaccc188d2), [`206b4cd`](https://github.com/cogenta-cms/cogenta/commit/206b4cd12df7d3a2a5831029b5f0ef726e7fd84d), [`8e33d60`](https://github.com/cogenta-cms/cogenta/commit/8e33d60882a7194c1f329e8974d39575c1f45d3d), [`03d1327`](https://github.com/cogenta-cms/cogenta/commit/03d13277224c5abd011d15e19c8f9ec67ef40c27), [`174b521`](https://github.com/cogenta-cms/cogenta/commit/174b521e9bca3b783e06ac8aa3dff6e0ded58aa5), [`b61ff68`](https://github.com/cogenta-cms/cogenta/commit/b61ff68620644fbff48fb244178d1ad733035729), [`3c73e58`](https://github.com/cogenta-cms/cogenta/commit/3c73e58ff0a54782a58ef1bf2d70e84819ff8944), [`029da6b`](https://github.com/cogenta-cms/cogenta/commit/029da6b238ad438b77375e389de57d83fb7f3a4e), [`b37e51c`](https://github.com/cogenta-cms/cogenta/commit/b37e51cea79fc8d3070d5c741a8415192985d9ff), [`3c73e58`](https://github.com/cogenta-cms/cogenta/commit/3c73e58ff0a54782a58ef1bf2d70e84819ff8944), [`71e1dcd`](https://github.com/cogenta-cms/cogenta/commit/71e1dcd3f8204dca3b05cfd8558e7cf39aedc9e8)]:
  - @cogenta/core@0.4.0
  - @cogenta/cli@0.4.0
  - @cogenta/auth@0.3.0
  - @cogenta/schema@0.3.0
  - @cogenta/agents@0.2.1
  - @cogenta/blocks@0.1.4
  - @cogenta/render@0.1.4
  - @cogenta/theme-canonical@0.2.1

## 0.2.0

### Minor Changes

- [`fdd7f3c`](https://github.com/cogenta-cms/cogenta/commit/fdd7f3c59f2aa15a1153f022ace5da574d3ae73f) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Give every blueprint's demo content something for the new theme to show.
  
  The eight content-pack blueprints seeded a hero, a `collectionList` and sometimes a
  `cta` — three block types out of twelve, none of which exercises a card, a panel or an
  accordion. Each home page now also carries a `featureGrid` written for that blueprint's
  own subject (how a project runs, what we do, how the docs are organised, how we cook),
  and `association`, `documentation`, `restaurant` and `saas` gain a real `faq`; `magazine`
  gains a pull `quote` and `vitrine` a `stats` row. All of it is plain text: no demo block
  references a media asset, because `cogenta serve` has no image pipeline wired to it yet
  and a seeded site must render on the first run.
  
  Two things came out of writing it:
  
  - a shared `richTextParagraph` helper, because a `faq` answer is a rich-text document
    too and five blueprints now build one — writing the four nested literals by hand in
    each is how a missing `markDefs` gets in;
  - a new test that runs every blueprint's demo blocks through `parseBlocks`, the same
    contract-B validator the admin and the content store use. Nothing validated them
    before: they were only typed, so a constraint violation or a duplicate `_key`
    compiled and then failed at install time on a real user's machine, with the site
    half-seeded.

- [`5abe64e`](https://github.com/cogenta-cms/cogenta/commit/5abe64edb350cc01ec33cefa29f710c84e750732) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `npm create cogenta` can read your specification document (L19 tasks 3, 6, 8).
  
  An optional step now runs before the usual questions: point the installer at a
  brief — PDF, DOCX, Markdown or plain text — and it proposes a content model,
  a page list, two to five designs and demonstration content written for your
  activity rather than for nobody's. You then walk it item by item: every
  collection, every page, every demonstration entry and every constraint read
  out of your document is its own yes or no. There is no "accept all", and there
  cannot be: `resolveApprovedPlan` refuses a plan with an undecided item.
  
  Only what you accepted is applied. Approved collections are written into
  `cogenta.schema.mjs` and their tables created; approved demonstration entries
  are seeded as **drafts**, never published, because a model wrote them about
  your business and you have not read them yet. What the document rules out is
  removed before you ever see it, with the sentence it came from quoted — a
  brief that says "pas de blog" cannot produce a site with a blog, whatever the
  model proposed.
  
  The answers that follow are pre-filled from the brief — language, site type,
  design description — and every one of them is a *default in a question*, shown
  under a heading that says so.
  
  `chooseSkin` now proposes several designs instead of one, each previewed on
  three real pages in its own directory under `.cogenta/skin-preview/`, each
  validated against contract D by the loop that was already there. A round that
  cannot produce two distinct valid designs falls back rather than presenting a
  choice of one.
  
  Site types gained real defaults (task 8): a per-type page cache written into
  `security.pageMaxAge`, whether to seed the type's demo content, and an HSTS
  question that is recommended *off* everywhere because a wrong answer takes a
  site offline for a year. Each is confirmed one at a time, with why it is
  recommended printed above it. Nothing here is a placeholder — a setting that
  wrote no config and created nothing would be a lie told in a friendly voice.
  
  **Nothing changes for an install that declines all of this.** With no LLM
  provider configured the document question is never even asked, `--yes` never
  enters the step, and the site produced is byte-for-byte the one this installer
  produced before (R2 — tested explicitly). A `--config` file may list
  `documents`, but a config file cannot consent on your behalf: the plan is
  analysed and saved as a draft under `.cogenta/site-plans/`, never applied.

### Patch Changes

- [`d2214d7`](https://github.com/cogenta-cms/cogenta/commit/d2214d7dcc65877dabede41672538a3ffc6c2ba2) Thanks [@georgesmomo](https://github.com/georgesmomo)! - The installer wizard now always offers Postgres and MySQL as database
  choices, not only when a local server is auto-detected. Local detection
  only changes the label ("detected locally") and skips asking for a
  connection URL when a local server was found — choosing Postgres or
  MySQL without local detection now prompts for a real connection URL
  (`databaseUrl`, already a supported `ScaffoldAnswers` field, previously
  never actually reachable from the interactive wizard). Found because a
  real site is at least as likely to point at a managed remote database
  as at a local one, and the previous behavior silently hid two of the
  three supported drivers from anyone without a database server already
  running on their own machine.

- [`1f1e8b2`](https://github.com/cogenta-cms/cogenta/commit/1f1e8b24385750995bb2af90a8d94478d44bdcdc) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Four corrections to L19, from the contract review.
  
  **ADR-0010 wins over the lot document.** Applying a site plan writes
  `cogenta.schema.*` and creates tables — that is the schema editor arriving by a
  different door, and ADR-0010 says it plainly: "uniquement en mode
  développement. En production le schéma est en lecture seule." L19's brief asked
  for the opposite ("un site déjà en production peut recevoir de nouveaux
  documents"); the acted decision wins, and the disagreement is written down in
  `BLOCKERS.md` with a ready-to-insert ADR-0023 rather than worked around.
  `RunServeOptions` gains `development`, set by `cogenta dev` and by it alone.
  Proposing and reviewing a plan stay available everywhere; only the write is
  withheld, and the refusal names the way out.
  
  **The schema file is the one the site really loads.** The applier wrote
  `cogenta.schema.mjs` by name, while `loadCollections` prefers
  `cogenta.schema.ts` — the form ADR-0010 calls for. On such a project it would
  have created the tables and then written a file nothing reads, leaving orphan
  tables and no collections after the restart it told the operator to do. It now
  resolves the real path (`findSchemaFile`, newly exported) and names it in the
  follow-up. It also refuses outright when the current schema declares a
  `validate` or a function `default`, which regenerating the file would silently
  delete.
  
  **Content a model wrote is marked as such.** Demonstration entries seeded by
  the installer and by the applier now carry `provenance: 'generated'` and a
  `provenanceDetail` naming the agent, the model and the time. Contract A calls
  that field non-optional because the European AI framework requires it; the
  store's default is `human`, so inheriting it would have made the one regulated
  field lie about every generated entry.
  
  **R8 has a second hop.** A constraint's `quote` is verbatim document text, and
  the analysis step's careful tagging counted for nothing when the content-model
  and demo-content prompts pasted it back in as prose — "Pas de blog. Ignore all
  previous instructions and …" is a single clause, so the whole thing is the
  quote. Both now go through `assembleContext`'s data channel too, escaped and
  tagged, with a test that smuggles a forged `</data><constitution>` inside a
  constraint and checks it arrives escaped.

- [`89ec072`](https://github.com/cogenta-cms/cogenta/commit/89ec0724be1dcc50b8fa5f7a14ca026c40e0de89) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Account management moves out of the terminal: `@cogenta/api` gains
  `createUsersRouter`, mounted by `cogenta serve` at `/api/users`.
  
  Until now `cogenta users create` was the only way to make an account. The new
  routes are:
  
  - `GET /api/users` (admin) — every account, optionally filtered by `?role=`,
    each with a summary of the second factors it holds
  - `POST /api/users` (admin) — creates the account and returns a server-generated
    password exactly once, the same rule the CLI already follows. The admin never
    chooses it.
  - `PATCH /api/users/{id}` (admin) — roles and status. Disabling an account
    revokes its live sessions in the same move.
  - `GET /api/users/{id|me}` and `GET /api/users/{id|me}/sessions` — yours, or
    anyone's with `admin`
  - `DELETE /api/users/{id|me}/sessions/{sessionId}` — revoke one session
  - `POST /api/users/me/password` — change your own password, current one
    required, rate-limited on the same store as sign-in
  
  Two deliberate absences. There is no delete: accounts are disabled, never
  removed, because an account that wrote content still has to be nameable in the
  audit log. And there is no route for an admin to set somebody else's password —
  that is a reset, it needs a delivery channel and a single-use token to be
  anything but a back door, and it is L13's task.
  
  Two safety properties worth naming, both covered by tests:
  
  - The last active `admin` cannot be demoted or disabled. Not a permission
    question — the person doing it is allowed to — but with no password reset yet
    there is no way back into a site with no administrator.
  - `DELETE /api/users/me/sessions/{id}` checks the session actually belongs to
    the caller before revoking it, so passing someone else's session id under
    `me` is a 404 rather than a successful revocation.
  
  `cogenta serve` records `user.create`, `user.update`, `user.password_change` and
  `user.session_revoke` in the audit log, naming the actor and the subject and
  nothing that could sign anyone in.
  
  `cogenta users create`'s closing hint and `create-cogenta`'s install recap no
  longer tell people they will be asked to set up a second factor at first
  sign-in: since ADR-0021 they will not be.
- Updated dependencies [[`552645e`](https://github.com/cogenta-cms/cogenta/commit/552645e039b8c8c4f5340d065ea2f4a552950815), [`cc3ea98`](https://github.com/cogenta-cms/cogenta/commit/cc3ea981188f16efa17352370251374b62709060), [`1c9b114`](https://github.com/cogenta-cms/cogenta/commit/1c9b114d7bde96ea00e8f75b75129f109e5c34ae), [`45d2815`](https://github.com/cogenta-cms/cogenta/commit/45d281560017abde1a069b01458a709293c1613b), [`8b561d1`](https://github.com/cogenta-cms/cogenta/commit/8b561d1ba735eb2b42c27725f67faf64e53866e5), [`182ef48`](https://github.com/cogenta-cms/cogenta/commit/182ef48d97e2757e7b1404dc407327f53ed377dd), [`6ad0f3a`](https://github.com/cogenta-cms/cogenta/commit/6ad0f3a495176169fe95f4955dfef30a6af376fd), [`ad18e0e`](https://github.com/cogenta-cms/cogenta/commit/ad18e0ed335d06ad861958e74bbfd2318e2509b8), [`17aa538`](https://github.com/cogenta-cms/cogenta/commit/17aa538e94da132ce1ca48d2213d2b84df231c78), [`755201d`](https://github.com/cogenta-cms/cogenta/commit/755201d55fd8c04ba2794a03797696769b59f6cc), [`551a06c`](https://github.com/cogenta-cms/cogenta/commit/551a06c2e58bb4119618e5502dfcae4bb024b7d4), [`8ebd276`](https://github.com/cogenta-cms/cogenta/commit/8ebd2768190f34d9ba1d67878e9024f19edb6f0f), [`b8ed3cf`](https://github.com/cogenta-cms/cogenta/commit/b8ed3cfca3f7b84e5454ffeb357edbe970afa065), [`7ed521e`](https://github.com/cogenta-cms/cogenta/commit/7ed521edc6f8affb11020a7012e858411d40699d), [`809baee`](https://github.com/cogenta-cms/cogenta/commit/809baee0b47e48aea06235a97c0da29c7ba4b06c), [`87bae8d`](https://github.com/cogenta-cms/cogenta/commit/87bae8dd4cc08261f3d5ba83947fa2ad77b0b826), [`b4e7deb`](https://github.com/cogenta-cms/cogenta/commit/b4e7deb11cb56f514da8533ffd9296a809bd45f0), [`62c2898`](https://github.com/cogenta-cms/cogenta/commit/62c28982ab130aafdb8b3aed04821b039e9e03ff), [`ca71b3b`](https://github.com/cogenta-cms/cogenta/commit/ca71b3bbd5d5d7371923d0521444fc94a525de06), [`a332e41`](https://github.com/cogenta-cms/cogenta/commit/a332e416bfe08a226756451624b6344e7c6b7516), [`1f1e8b2`](https://github.com/cogenta-cms/cogenta/commit/1f1e8b24385750995bb2af90a8d94478d44bdcdc), [`ade7b38`](https://github.com/cogenta-cms/cogenta/commit/ade7b3807fd273e56bcbe7499eb83374a592d35f), [`07e49bf`](https://github.com/cogenta-cms/cogenta/commit/07e49bf0d45260fc14c74efe8a67b2671fd8e022), [`32f5db9`](https://github.com/cogenta-cms/cogenta/commit/32f5db932454aa35e586a4ffe144f909b0b773af), [`e321f08`](https://github.com/cogenta-cms/cogenta/commit/e321f089b14f5f116f28ab6eb2d2ffc0a43bc27d), [`87bae8d`](https://github.com/cogenta-cms/cogenta/commit/87bae8dd4cc08261f3d5ba83947fa2ad77b0b826), [`89ec072`](https://github.com/cogenta-cms/cogenta/commit/89ec0724be1dcc50b8fa5f7a14ca026c40e0de89)]:
  - @cogenta/core@0.3.0
  - @cogenta/agents@0.2.0
  - @cogenta/cli@0.3.0
  - @cogenta/auth@0.2.0
  - @cogenta/schema@0.2.0
  - @cogenta/theme-canonical@0.2.0
  - @cogenta/blocks@0.1.3
  - @cogenta/render@0.1.3

## 0.1.6

### Patch Changes

- Updated dependencies [[`82d7b1d`](https://github.com/cogenta-cms/cogenta/commit/82d7b1de151888df1623262ff6fe104232b4c46e)]:
  - @cogenta/cli@0.2.2

## 0.1.5

### Patch Changes

- [`89bfa96`](https://github.com/cogenta-cms/cogenta/commit/89bfa960c4f6aa63e8607e8dfeaa25be4ab89576) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Fix the blog blueprint's home page failing every real query with
  `QUERY_INVALID`.
  
  Its `collectionList` block sorted recent posts by `publishedAt` — a real
  system field, but nullable (a draft has none) and never part of the real,
  frozen `SortField` union (`id`/`createdAt`/`updatedAt` only; cursor
  pagination needs a column that is never null). Every other blueprint
  already sorted by `createdAt`; blog was the one exception, and nothing
  exercised its `collectionList` block through the real gateway until
  `cogenta serve`'s new theme-render fallback did (see the `@cogenta/cli`
  changeset) — the existing render test built its own query by hand instead
  of going through the block's real `query()` function, so it never caught
  this. Now sorts by `createdAt`, same as every other blueprint.

- [`e903fac`](https://github.com/cogenta-cms/cogenta/commit/e903fac9491fadd3ac37399bec7c4f199b244f96) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Fix `npx create-cogenta`'s own "Next step" instructions being incomplete.
  Scaffolding writes a real `package.json` with real `@cogenta/*` dependencies
  but never installs them — a deliberate scope boundary (no network call
  during scaffold), but the printed next step went straight to
  `npx cogenta serve` without `npm install` first, so the very first thing a
  new user typed failed with a confusing `npm error 404 ... 'cogenta@*'`
  (npx, finding no local `cogenta` binary and no scoped package name, tried to
  fetch a package literally named `cogenta` from the registry — which has
  never existed; the real package is `@cogenta/cli`, whose `bin` happens to be
  named `cogenta`). Found via a real `npx create-cogenta@latest` from the
  actual npm registry, on a machine with no local install of this repo.

- [`7ff79a2`](https://github.com/cogenta-cms/cogenta/commit/7ff79a260f97c79192553e88e2e7e4d22e0d8965) Thanks [@georgesmomo](https://github.com/georgesmomo)! - The installer's recap now tells you where to actually sign in: "Then open
  <site-url>/admin and sign in with the admin account above." Previously it
  only mentioned enrolling a passkey, with no mention of a URL — a real
  onboarding blocker once `cogenta serve` gained the ability to serve the
  admin SPA (see `@cogenta/cli`'s own changeset).

- [`fd0a52e`](https://github.com/cogenta-cms/cogenta/commit/fd0a52e155d802b102ac9012b3ed2d650b271c3f) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Scaffolding now writes a real, randomly generated `COGENTA_AUTH_SIGNING_KEY`
  into a `.env` file next to `cogenta.config.mjs` (`randomBytes(32)`, base64),
  plus a `.gitignore` covering `node_modules/`, `.env` and `.cogenta/`. Paired
  with `@cogenta/core`'s new `.env` auto-loading (its own changeset), this
  removes a real onboarding blocker: a brand-new user previously had to find,
  run and correctly `export` a key-generation command themselves — with no
  guidance on the Mac/Windows/Linux differences — before `cogenta serve` would
  even start. `npm create cogenta` now produces a site that runs with zero
  manual secret-handling steps.
- Updated dependencies [[`fd0a52e`](https://github.com/cogenta-cms/cogenta/commit/fd0a52e155d802b102ac9012b3ed2d650b271c3f), [`7ff79a2`](https://github.com/cogenta-cms/cogenta/commit/7ff79a260f97c79192553e88e2e7e4d22e0d8965), [`cb69cab`](https://github.com/cogenta-cms/cogenta/commit/cb69cab09b89d3cc5b8d15f5887ec93f82e32599), [`fd0a52e`](https://github.com/cogenta-cms/cogenta/commit/fd0a52e155d802b102ac9012b3ed2d650b271c3f), [`4c95475`](https://github.com/cogenta-cms/cogenta/commit/4c9547543ec9a4464d8c9a05d1967dd15b7953aa)]:
  - @cogenta/cli@0.2.0
  - @cogenta/core@0.2.0
  - @cogenta/agents@0.1.2
  - @cogenta/auth@0.1.2
  - @cogenta/blocks@0.1.2
  - @cogenta/render@0.1.2
  - @cogenta/schema@0.1.2
  - @cogenta/theme-canonical@0.1.2

## 0.1.0

### Minor Changes

- [`1430cdd`](https://github.com/cogenta-cms/cogenta/commit/1430cdd17bfecf0b2764226814afe0fca287fc71) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `create-cogenta` — the `blog` blueprint's page types (L9 task 4): a `page`
  collection (`title` + a real block zone, routed at `/:slug`), formalising the
  title-plus-blocks shape `theme-canonical`'s own test fixtures already used for
  internal-link targets. Two demo pages are seeded through the real
  `ContentStore` alongside the existing posts/categories/tags: `home` (a `hero`
  block plus a `collectionList` of recent posts) and `about` (a `prose` bio) —
  both rendered generically by `@cogenta/theme-canonical`'s existing
  `renderPage`/`renderBlock`, with no new rendering code required.
  
  Investigation found the block-composition and single-entry URL routing
  (`@cogenta/schema`'s `matchPath`/`buildPath`) already generic across any
  collection with a `routing.pattern`; what did not exist anywhere yet was an
  actual runnable site (no `src/pages/`, no Astro scaffold) to invoke either —
  building that is out of this task's scope and is called out honestly rather
  than invented.

- [`0877503`](https://github.com/cogenta-cms/cogenta/commit/0877503bf4a999543d51ce6dda2126471a4852c0) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `create-cogenta` — the `blog` blueprint (L9 task 3): `post`/`category`/`tag`
  collections, real demo content seeded through `ContentStore`, the canonical
  theme's default skin (`theme.tokens.json`), and a recommended-agents hint
  (`.cogenta/recommended-agents.json`) — no live agent scheduler is wired,
  since none exists anywhere in this codebase yet (R2). `resolveBlueprint`
  now genuinely resolves `blog` as available; `blank`'s output is unchanged.
  
  Also fixes a bare `throw new Error(...)` in `resolveBlueprint`'s internal
  consistency check, replaced with a `CogentaError`.
  
  One new `@cogenta/core` error code: `BLUEPRINT_REGISTRY_CORRUPT`.

- [`d321a40`](https://github.com/cogenta-cms/cogenta/commit/d321a4006037a3fc1e1ec273621c97422331ad7b) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `create-cogenta`, the `npm create cogenta` installer wizard (L9 task 1):
  environment check, site/blueprint/database/LLM prompts (or `--yes` /
  `--config <file>` for a non-interactive install), a real API-key validation
  round trip when an LLM provider is configured, and scaffolding that writes a
  loadable `cogenta.config.mjs` and genuinely runs migrations plus the first
  admin-user creation against a real SQLite database by reusing
  `@cogenta/cli`'s own `runMigrate`/`runUsers`.
  
  The blueprint menu lists one working entry (`blank`) plus eight named,
  visibly-disabled "coming soon" entries; picking one of those falls back to
  `blank` and always says so, never silently. AI skin generation and passkey
  enrollment are out of scope for this task and are deferred to later work —
  the recap says so explicitly rather than fabricating either.

- [`9463f49`](https://github.com/cogenta-cms/cogenta/commit/9463f49960100468e8c50610fc5aae0428651d49) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `create-cogenta` — the final four blueprints (L9 task 8, batch B of two —
  task 8 is now fully complete):
  
  - **`magazine`**: `article` (title/excerpt/section/body, routed at
    `/articles/:slug`) grouped by a `section` select field rather than a
    second category collection; `home` (hero + a live list of recent
    articles) and `about` (prose).
  - **`association`** (nonprofit): `event` (title/date/location/description,
    routed at `/events/:slug`); `home` (hero + mission prose + a live
    upcoming-events list + a donate `cta`) and `mission` (prose + a static
    `stats` impact summary).
  - **`restaurant`**: `menu_item` (name/description/price/category, routed at
    `/menu/:slug` so the home page's live menu list can link to each item,
    even though nothing else deep-links to one yet); `home` (hero + a live
    menu highlights list) and `contact` (prose with hours and location as
    plain text — no dedicated field kind exists or is warranted for two
    lines).
  - **`saas`**: `feature` (name/description, routed at `/features/:slug`);
    `home` (hero + a live features grid + a signup `cta`) and `pricing`
    (prose + a static `stats` row). Deliberately no `pricingPlan` collection:
    page-authored pricing numbers have no independent lifecycle worth a
    second collection.
  
  All four reuse the `BlueprintContentPack` extension point and the shared
  `definePageCollection` helper, exactly like batch A. `resolveBlueprint` now
  resolves every blueprint named in the lot doc as available — `blank` is the
  only one left without a content pack, by design.

- [`24b1745`](https://github.com/cogenta-cms/cogenta/commit/24b174536c79a7b0f505e1ba4e70d5070fb14f6d) Thanks [@georgesmomo](https://github.com/georgesmomo)! - L9 task 12 ("Site du projet et playground"), the buildable slice the lot itself calls out: "commencer par une démo en lecture seule réinitialisée périodiquement."
  
  - `@cogenta/schema`: new `withReadOnlyStore(store)` — wraps any `ContentStore` so `create`/`update`/`delete`/`publish`/`unpublish`/`restore` refuse with a real `CONTENT_READ_ONLY` error while every read passes through unchanged.
  - `@cogenta/cli`: `runServe`'s `ServeOptions` gained a `readOnly` flag. Wrapped once, at the single point `serve.ts` constructs every `ContentStore` — both REST's `ContentService` and GraphQL's gateway share it, so neither transport can bypass the guard.
  - `@cogenta/api`: `CONTENT_READ_ONLY` maps to HTTP 403.
  - `@cogenta/core`: two new error codes — `CONTENT_READ_ONLY`, `PLAYGROUND_BLUEPRINT_UNKNOWN`.
  - `create-cogenta`: new `resetPlaygroundData()` — wipes and reseeds a blueprint's tables back to its own real demo content (`BLUEPRINT_CONTENT_PACKS`, unchanged, not a second parallel demo dataset). A real, tested, callable unit; scheduling it periodically is an operational decision for whoever deploys a read-only instance, not made here. `BLUEPRINT_CONTENT_PACKS`/`BlueprintContentPack` are now part of the package's public exports.
  
  Actual public deployment of a playground or the project site is explicitly out of scope: it is an irreversible action toward the outside world requiring resources only a human holds, per this project's standing autonomy rule.
  
  Also new: `@cogenta/project-site` (private, unpublished) — a small, real presentation site for the Cogenta project itself, built through the same content model and `renderPage`/`renderBlock` pipeline any installed site uses, with real content drawn from `docs/00-vision.md` and this session's own documentation.

- [`6a84427`](https://github.com/cogenta-cms/cogenta/commit/6a84427da789abdce1f61feeef7c1ff5bc7fb9f5) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `create-cogenta` — AI skin generation with hard-refusal validation (L9 task
  7). When an LLM provider is configured with a valid key and a free-text site
  description is given, the `blog` blueprint's `theme.tokens.json` is generated
  from that description instead of copying the theme's default: the model is
  asked for contract D's token JSON only (never CSS), and every candidate is
  checked by `@cogenta/render`'s existing `validateSkin` — reused wholesale,
  not reimplemented — in hard-refusal mode (AA contrast on every pair, a
  strictly monotone type scale, the full closed token set, `motion.reduced`).
  On a rejection, the thrown `CogentaError`'s `message`/`hint` become the next
  attempt's correction prompt, for three attempts. A successful candidate is
  rendered on three real preview pages (through the same generic
  `renderPage`/`renderBlock` pipeline a live site uses) written to
  `.cogenta/skin-preview/`, and the installer offers accept, regenerate, or
  fall back to the default — bounded so a non-interactive `--yes`/`--config`
  run never loops. Every outcome — generated and accepted, regenerated,
  fallen back after failed validation, or never offered — is reported by name
  in the install recap; nothing is silent.
  
  Scoped to the `blog` blueprint only, the one blueprint that writes a
  `theme.tokens.json` today. Regenerating a skin after install (`cogenta skin
  generate`) is explicit CLI surface the lot doc lists under a later task (L9
  task 9) and is not built here.
  
  One new `@cogenta/core` error code: `SKIN_GENERATION_RESPONSE_NOT_JSON`, for
  a model response that is not a single JSON object.

- [`68ba583`](https://github.com/cogenta-cms/cogenta/commit/68ba5833a11911a5b7690886792531c2092a77d9) Thanks [@georgesmomo](https://github.com/georgesmomo)! - `create-cogenta` — three more blueprints (L9 task 8, batch A of two):
  
  - **`vitrine`**: a one-pager business showcase. `service` (routed at
    `/services/:slug`, so a `collectionList` block can safely link to each
    one) and `testimonial` collections; `home` (hero + live services grid +
    cta) and `about` (prose + two `quote` blocks mirroring the seeded
    testimonials — a testimonial has no page of its own worth linking to, so
    it is not queried live like `service`).
  - **`portfolio`**: `project`, routed at `/work/:slug`; `home` (hero + a live
    project grid) and `about` (prose + a static `stats` block).
  - **`documentation`**: `doc_page` (title/section/order/body, routed at
    `/docs/:slug`) is the "pages types" for this blueprint directly, plus one
    `page` entry (`home`) linking into a live list of doc pages — the most
    different of the three in spirit: reference material, not marketing.
  
  All three reuse the `BlueprintContentPack` extension point introduced
  alongside them (previous commit) and a new shared `definePageCollection`
  helper (`content-pack.ts`) for the `title`/`slug`/`blocks` shape `blog`'s
  own `page` collection already had — the third and later real usages of
  that exact shape, per AGENTS.md's "not before three real usages"; `blog.ts`
  itself is left untouched.
  
  `resolveBlueprint` now resolves `vitrine`, `portfolio` and `documentation`
  as available. Four blueprints remain for a second batch: magazine,
  association, restaurant, SaaS.

### Patch Changes

- [`44e4ec6`](https://github.com/cogenta-cms/cogenta/commit/44e4ec60171a4d9ca4fb9bd13172294cb4260994) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Internal refactor: generalizes the `blog` blueprint's hardcoded
  `blueprint.id === 'blog'` scaffolding branch into a `BlueprintContentPack`
  extension point (`packages/create-cogenta/src/blueprints/content-pack.ts`,
  `content-packs.ts`) — a blueprint's collections, recommended agents and
  demo-content seeding are now looked up generically by id. No behavior
  change for `blog` or `blank`; this is preparation for L9 task 8 (the seven
  remaining blueprints), each of which now only needs to add its own content
  pack and a registry entry rather than another branch in `scaffold.ts`.

- [`67d188f`](https://github.com/cogenta-cms/cogenta/commit/67d188fb8d3cc7525299f462b2308e9e24e3c12f) Thanks [@georgesmomo](https://github.com/georgesmomo)! - L9 task 9: real CLI surface for `generate types` and `skin list/validate/apply/generate`, plus `cogenta dev` as an alias for `cogenta serve`.
  
  `generate types` is a thin wrapper around `@cogenta/schema`'s existing `renderTypeDeclarations`, writing to `.cogenta/types/schema.d.ts` by default. `skin list/validate/apply` are thin wrappers around `@cogenta/render`'s existing `validateSkin`/contract-D token groups — `apply` never writes a skin that fails validation.
  
  `skin generate`'s underlying logic (`generateSkin`, the LLM→JSON→validate→retry-on-hint loop built for `create-cogenta`'s L9 task 7) is relocated from `create-cogenta` to `@cogenta/agents` (`@cogenta/agents`'s `generateSkin`/`GenerateSkinOptions`/`GenerateSkinResult`) so both the installer and `@cogenta/cli` can call the same implementation without either depending on the other — `@cogenta/agents` gains a dependency on `@cogenta/render` (the schema/validation it generates against), not the other way around. `create-cogenta`'s `skin-flow.ts` now imports `generateSkin` from `@cogenta/agents`; no behavior change.
  
  `build`, `backup`, `upgrade`, `deploy`, `theme`, `agent`, and `generate schema`/`generate migrations` remain unbuilt — none has a real underlying capability to wrap yet (no Astro build wiring, no backup/restore mechanism, no deploy-target concept, no theme registry, no live `AgentRegistry` anywhere in the codebase, no schema-diff-to-migration generator). `cogenta <command>` for any of these falls through to the existing unknown-command usage message rather than a stub — see CLAUDE.md for the per-command reasoning.

- [`88b7a6b`](https://github.com/cogenta-cms/cogenta/commit/88b7a6b3bbd9bf477ffbc45a53b3fac1b1cec00b) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Fix `npm create cogenta` with every default answer producing a site that
  `cogenta serve` cannot start.
  
  `scaffoldSite` only wrote `cogenta.schema.mjs` when the chosen blueprint had
  a real `BlueprintContentPack` — `blank`, the default blueprint
  (`DEFAULT_BLUEPRINT_ID`), has none, so no schema file was ever written for
  it. `cogenta serve` (`@cogenta/cli`) hard-requires one of
  `cogenta.schema.{ts,mts,mjs,js}` to exist next to the config, so the single
  most common path — accept every default, then run `cogenta serve` — failed
  immediately with `SCHEMA_INVALID`.
  
  The schema file is now written unconditionally: an empty collections array
  (`export default []`) for `blank`, a real content pack's collections
  otherwise — matching the "Blank — empty schema, nothing pre-configured"
  label the installer already shows. `ScaffoldResult.schemaPath` is no longer
  optional.
  
  Found and verified end-to-end against a real local npm registry (Verdaccio):
  publish every workspace package, install `create-cogenta` purely from that
  registry with no access to the monorepo, scaffold a site, and start
  `cogenta serve` against it — reproduced the crash on the unfixed code, then
  confirmed a real HTTP response (`/api/schema`, `/api/auth/session`) on the
  fixed code.
- Updated dependencies [[`f323580`](https://github.com/cogenta-cms/cogenta/commit/f3235809422e16a4e9d34f16e1171d2ebcfaf01a), [`ea82de1`](https://github.com/cogenta-cms/cogenta/commit/ea82de10eba12d520e586b69e1bce733339da26d), [`bcf646e`](https://github.com/cogenta-cms/cogenta/commit/bcf646edfd9810a977161075e639bce760b91864), [`8ae3456`](https://github.com/cogenta-cms/cogenta/commit/8ae3456d346ee2e169fceaa45c3cbaef1df01982), [`0877503`](https://github.com/cogenta-cms/cogenta/commit/0877503bf4a999543d51ce6dda2126471a4852c0), [`5d64afd`](https://github.com/cogenta-cms/cogenta/commit/5d64afdb47dd5bfdbe06cb7895391b726fb22277), [`a9a7553`](https://github.com/cogenta-cms/cogenta/commit/a9a75531fe0b52fd9b55a3940c4abc337446cdc1), [`dc674b2`](https://github.com/cogenta-cms/cogenta/commit/dc674b2dc8a375b8ace5881a3fb8601855888500), [`b18a02c`](https://github.com/cogenta-cms/cogenta/commit/b18a02c3f5638520794db83bd1adfdb246a4f839), [`6f0b7bd`](https://github.com/cogenta-cms/cogenta/commit/6f0b7bdd457ba8d81e0aa18d0bde9b583bf810af), [`f870177`](https://github.com/cogenta-cms/cogenta/commit/f8701772440a4b3a7d0726b0836b94b7c1b57344), [`fd5ada9`](https://github.com/cogenta-cms/cogenta/commit/fd5ada927327946603a05349c2f87686ef8f003c), [`22bb5b2`](https://github.com/cogenta-cms/cogenta/commit/22bb5b2903b35c79d80a7df0bb99bead1533ba55), [`50d3b40`](https://github.com/cogenta-cms/cogenta/commit/50d3b4041fb5392502711c2bf20f4ec92d2ce76d), [`27e32b5`](https://github.com/cogenta-cms/cogenta/commit/27e32b52ed11e97969e2b319b2e74345bbc1f213), [`962073f`](https://github.com/cogenta-cms/cogenta/commit/962073f3aa5e56e68869c7d14a4b2937e506cfbd), [`59aced9`](https://github.com/cogenta-cms/cogenta/commit/59aced90e97d3aa2a98ab5e7aa067f50e2ceb611), [`b26dd9f`](https://github.com/cogenta-cms/cogenta/commit/b26dd9f636095b126ceb78e69bda50f7f5f8cb52), [`f52f97f`](https://github.com/cogenta-cms/cogenta/commit/f52f97ff8c553ab44f715b55f37ac726ea335160), [`39b6d33`](https://github.com/cogenta-cms/cogenta/commit/39b6d339a52ba97a1437167c15910971eee02383), [`67d188f`](https://github.com/cogenta-cms/cogenta/commit/67d188fb8d3cc7525299f462b2308e9e24e3c12f), [`ec2529b`](https://github.com/cogenta-cms/cogenta/commit/ec2529b7c7cb70c0c91d8275fdac4811b2d1073a), [`6322731`](https://github.com/cogenta-cms/cogenta/commit/632273109648e850e415bb179bea6e5ea027c500), [`4921407`](https://github.com/cogenta-cms/cogenta/commit/4921407b4dbd283bdd76cf74d288a79c2ebcab64), [`1b54335`](https://github.com/cogenta-cms/cogenta/commit/1b5433577617c1c3a50d123ba1a4e81c7c5c9d97), [`7d9ed38`](https://github.com/cogenta-cms/cogenta/commit/7d9ed3878de61d54e58a4aa027c72447c118761c), [`046ffa8`](https://github.com/cogenta-cms/cogenta/commit/046ffa85769066150a0d0e8443d0d257ef72239c), [`d10724c`](https://github.com/cogenta-cms/cogenta/commit/d10724cb238399bf7203fff0bc151a832c555ad4), [`a958ee1`](https://github.com/cogenta-cms/cogenta/commit/a958ee12cee1130effb97e95d58fda219e153a4c), [`39fc7a4`](https://github.com/cogenta-cms/cogenta/commit/39fc7a4d490f0a1683ef69dd5495e0ff6494ca72), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`c522dda`](https://github.com/cogenta-cms/cogenta/commit/c522dda594169b5148643726fbd41dbbf1c9a308), [`2a044a1`](https://github.com/cogenta-cms/cogenta/commit/2a044a1689f98a25258b6f45d9baf0b325194c95), [`5ae4e24`](https://github.com/cogenta-cms/cogenta/commit/5ae4e24e59cf807ef7aca5839623fd8a24798435), [`77ff957`](https://github.com/cogenta-cms/cogenta/commit/77ff95771e3fc415d9581e8d51ccae200167703d), [`22ec8de`](https://github.com/cogenta-cms/cogenta/commit/22ec8deec494a2925a943550fcf3c5e1689eb40e), [`7a16841`](https://github.com/cogenta-cms/cogenta/commit/7a168415e2fce628d4a835eb778be396104a2590), [`3021aa1`](https://github.com/cogenta-cms/cogenta/commit/3021aa1c65d708b1267c662ce925d560f735d7d0), [`b2ecf93`](https://github.com/cogenta-cms/cogenta/commit/b2ecf9310366fcbaf18fbbf2c71bc45fccc577da), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`40539fc`](https://github.com/cogenta-cms/cogenta/commit/40539fcd48da958dba69f9a32f0b440f868d539f), [`24b1745`](https://github.com/cogenta-cms/cogenta/commit/24b174536c79a7b0f505e1ba4e70d5070fb14f6d), [`e8692eb`](https://github.com/cogenta-cms/cogenta/commit/e8692eba9f47a7a7eee176058f4638abec71dce0), [`3184163`](https://github.com/cogenta-cms/cogenta/commit/318416355a83d88828786344e1ff80e1b113c564), [`1f2eecc`](https://github.com/cogenta-cms/cogenta/commit/1f2eecc754286c9e140511634b465a6536f99f25), [`6ce944f`](https://github.com/cogenta-cms/cogenta/commit/6ce944ffac8e947a979b8dc46a64ee3699b0b402), [`fc13c44`](https://github.com/cogenta-cms/cogenta/commit/fc13c4484c1c01a64b23941622e8308731fd937e), [`f5b0d4c`](https://github.com/cogenta-cms/cogenta/commit/f5b0d4cd8b7a81b36f8c539b38a412b893cb125c), [`1041c9f`](https://github.com/cogenta-cms/cogenta/commit/1041c9fb8c39872350786e5dc5b8a4f84e2b3ff7), [`ed7e7d1`](https://github.com/cogenta-cms/cogenta/commit/ed7e7d1cd73eedff8877c974938b7134bd24ac3b), [`fe1e7b6`](https://github.com/cogenta-cms/cogenta/commit/fe1e7b693d3a5eb8635e783a75863f5613712fb4), [`a609efa`](https://github.com/cogenta-cms/cogenta/commit/a609efa46060a35b048a24e7d03b7bbde414b7a4), [`32dc81a`](https://github.com/cogenta-cms/cogenta/commit/32dc81adac441ecc0b105c4da02e9064ead09b99), [`ff45fb3`](https://github.com/cogenta-cms/cogenta/commit/ff45fb3fef9b076e0550e09601912ad759831476), [`f0915d5`](https://github.com/cogenta-cms/cogenta/commit/f0915d5b3040512560477cfbb95729a6e69a3f3c), [`269c38b`](https://github.com/cogenta-cms/cogenta/commit/269c38b4df5bae381cadbfa85d5c6fe12353e177), [`3bc0872`](https://github.com/cogenta-cms/cogenta/commit/3bc0872800001aace498f331abbd903c66f750e5), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`2aa38b4`](https://github.com/cogenta-cms/cogenta/commit/2aa38b4d466126c16afd0ac55febd35c7d163b00), [`11d592b`](https://github.com/cogenta-cms/cogenta/commit/11d592bbca9cea415c95aa0edb4a85aef8b05174), [`6a84427`](https://github.com/cogenta-cms/cogenta/commit/6a84427da789abdce1f61feeef7c1ff5bc7fb9f5), [`64b43fb`](https://github.com/cogenta-cms/cogenta/commit/64b43fb661784c855c1375dfcf995999198e93d3), [`ccfb4e1`](https://github.com/cogenta-cms/cogenta/commit/ccfb4e1c2ff2ccf528ebf4a8656c8f34f2da45ff), [`c93a5f7`](https://github.com/cogenta-cms/cogenta/commit/c93a5f709bce8b380c270a1b4ef31dac86293535), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`163d88b`](https://github.com/cogenta-cms/cogenta/commit/163d88bc594b457a06e19ce39e4fbe9e4693e4d8), [`73acd6f`](https://github.com/cogenta-cms/cogenta/commit/73acd6f40a6c1904fde717891f04079d930a0e43), [`b939bf4`](https://github.com/cogenta-cms/cogenta/commit/b939bf4957bceccf01c86775a32acbf32d0925f8), [`99aa9b2`](https://github.com/cogenta-cms/cogenta/commit/99aa9b2fb2bbedeacf658b57008a863f6af81d45), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`764344a`](https://github.com/cogenta-cms/cogenta/commit/764344abe6869f855b87ff80a2cb6b1b4711c01d), [`696c163`](https://github.com/cogenta-cms/cogenta/commit/696c163c05bb981413e52af74d63dcbcbe72c99e), [`aa878ea`](https://github.com/cogenta-cms/cogenta/commit/aa878ea6766361219fe218e17741ce1d9d9ffd2f), [`d5896bb`](https://github.com/cogenta-cms/cogenta/commit/d5896bb8bbabb43873e82deb1acfdb818def201b), [`693697e`](https://github.com/cogenta-cms/cogenta/commit/693697ed41174c027c5acaa43abb3a9c0e41bbab), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a)]:
  - @cogenta/cli@0.1.0
  - @cogenta/core@0.1.0
  - @cogenta/agents@0.1.0
  - @cogenta/auth@0.1.0
  - @cogenta/schema@0.1.0
  - @cogenta/render@0.1.0
  - @cogenta/theme-canonical@0.1.0
  - @cogenta/blocks@0.1.0
