# @cogenta/blocks

## 1.0.0

### Major Changes

- 4335296: Widen contract B (the block vocabulary) from twelve to seventeen blocks (`blocks@2.0`,
  RFC 0001 — `docs/rfc/0001-widen-block-vocabulary.md`), and add a shared, optional
  per-instance visual variant to every block's envelope (RFC 0002 —
  `docs/rfc/0002-per-block-visual-variant.md`). Both were decided in direct conversation
  with the user (fiche 43, Cogenta Page Builder), reopening ADR-0009 ("the vocabulary must
  stay small") with an explicit renouncement traced in the RFCs themselves.
  
  **New blocks**: `testimonial`, `pricingTable`, `accordion`, `statCounter`, `logoStrip`.
  Each names a `fallback` into the twelve of `blocks@1.0` (`prose`, `featureGrid`,
  `mediaFigure`), so a theme built before this version still renders them — degraded, never
  lost — via `BlockRegistry.resolveRenderable`, now actually wired into the render path
  (`@cogenta/theme-kit`'s new `resolveBlockForRender`). All five in-house themes implement
  all five directly with their own distinct markup and CSS (never a recolour of another
  theme's), so this degraded path is a safety net for a third-party theme, not something a
  site using a built-in theme ever sees in practice.
  
  **Why major, not the "adding a block is minor" default this contract stated at
  `blocks@1.0`**: every theme's `renderBlock` is an exhaustive `switch` over
  `VocabularyBlock`, `never`-checked at compile time by design — a block added to the
  vocabulary is therefore a real breaking change for every existing theme's build, even
  though no content anyone has ever saved is affected (nothing could create these block
  types before this version). `docs/04-contrats.md` is updated to record this as the
  precedent for this specific category of change, decided case by case per RFC rather than
  by a blanket rule.
  
  **`variant`** (RFC 0002): an optional `{ background?, spacing?, align?, width? }` on
  every placed block's envelope — semantic tokens, never CSS or a colour (rule R3 holds).
  Applied once per theme, in `renderBlock` itself via `@cogenta/theme-kit`'s
  `withBlockVariant`, rather than by each of the seventeen block renderers individually.
  Absent on all content written before this version, and rendered byte-for-byte identical:
  purely additive at the data level, even though it ships in the same major bump as the
  vocabulary widening above.
  
  Each theme resolves the four axes to its own existing design tokens
  (`[data-block][data-variant-*]` attribute selectors, `--cg-*`/`--ce-*` custom
  properties already defined by that theme) — no theme gained a background-image
  mechanism (RFC 0002 adds only the semantic token, not a media field), so
  `background: 'image'` resolves to each theme's closest tinted-surface approximation
  rather than doing nothing with a stated author intent.
  
  `@cogenta/admin`'s page builder gains a small "Appearance" control (four selects) in the
  selected block's detail panel, writing through the existing `updateBlockData` — no new
  mechanism, per the RFC's own decision.

### Minor Changes

- 1995d35: Fiche 42 task 2 — the rich text vocabulary (contract A, ADR-0013) gains a
  `strikethrough` decorator and an `hr` (thematic break) node, both additive:
  `RICH_TEXT_DECORATORS` now includes `'strikethrough'` alongside the existing
  `strong`/`em`/`code`, and `richTextNodeSchema` accepts a third node shape,
  `{ _key: string, _type: 'hr' }`, carrying nothing beyond its key. No existing
  document changes shape — a `richText` value stored before this change parses
  identically after it. A consumer still on the previous minor cannot validate
  a document that uses either addition, the same one-directional compatibility
  already accepted for `schema@2.1`'s `reviewState` and `tools@1.1`'s
  `document.extract`.
  
  `@cogenta/blocks`'s own temporary mirror of the richText shape (used to
  validate a `prose`/`quote`/`testimonial`/`faq`/`accordion` block's body)
  gains the same `hr` node — its `marks` field was already an open string
  array, so `strikethrough` needed no change there.
  
  `@cogenta/theme-kit`'s `renderRichText` — the single function every theme in
  this monorepo imports rather than reimplementing (`@cogenta/theme-canonical`
  and the four site themes' `blocks/prose.ts` all call it directly) — renders
  `strikethrough` as `<s>` (semantically "no longer accurate", not `<del>`,
  which would imply an edit-tracking deletion) and a thematic break as a bare
  `<hr class="cg-prose__rule">`. `@cogenta/theme-canonical` re-exports the
  same function unchanged; its own `prose` block snapshot fixture now
  exercises both additions end to end.
  
  `@cogenta/admin` (private, no changeset) gains the corresponding editor
  support: a strikethrough toolbar button, a horizontal-rule insert button and
  slash-menu entry, Markdown (`~~text~~`, a bare `---` line) and HTML (`<s>`,
  `<hr>`) source-view round-tripping, and clean-paste recognition of `<s>`/
  `<strike>`/`<del>` and a pasted `<hr>` (previously dropped outright).
  
  Same commit also fixes an unrelated, pre-existing CSS bug (fiche 42 task 1):
  `.rich-text-editor__surface` had no `min-height` outside fullscreen, so a
  freshly opened entry's editing area measured exactly one line. `@cogenta/admin`
  only; no published-package surface involved.

### Patch Changes

- Updated dependencies [154a751]
- Updated dependencies [5c5ffbd]
- Updated dependencies [a2516aa]
- Updated dependencies [0e88f30]
- Updated dependencies [c489fde]
- Updated dependencies [54ca689]
- Updated dependencies [23299e9]
- Updated dependencies [0692713]
- Updated dependencies [36744d3]
- Updated dependencies [916ef34]
- Updated dependencies [af57fa2]
- Updated dependencies [322d1a3]
- Updated dependencies [7b7ec0b]
- Updated dependencies [0ca8a79]
- Updated dependencies [c392e24]
- Updated dependencies [562c9c1]
- Updated dependencies [edf5623]
- Updated dependencies [db307e0]
- Updated dependencies [49815b9]
- Updated dependencies [122da7a]
- Updated dependencies [2fb2101]
- Updated dependencies [0e90b32]
- Updated dependencies [d0bfa1d]
- Updated dependencies [95acedf]
- Updated dependencies [6e5df34]
- Updated dependencies [bebbab8]
- Updated dependencies [e75b23e]
- Updated dependencies [a8199ea]
- Updated dependencies [16f63f6]
- Updated dependencies [1dd9e6f]
- Updated dependencies [656163e]
- Updated dependencies [4513a71]
- Updated dependencies [bdcb563]
- Updated dependencies [0dceff3]
- Updated dependencies [3cbd6d7]
- Updated dependencies [249eb6f]
- Updated dependencies [dda55d6]
- Updated dependencies [befad6d]
- Updated dependencies [4d3f3c7]
- Updated dependencies [e8061e2]
- Updated dependencies [fe789cf]
- Updated dependencies [cb62917]
- Updated dependencies [5e43b20]
- Updated dependencies [b8d307a]
- Updated dependencies [54409f3]
- Updated dependencies [f47e893]
- Updated dependencies [2285720]
- Updated dependencies [46572ba]
- Updated dependencies [9b1dae8]
- Updated dependencies [8a8d873]
- Updated dependencies [3075941]
- Updated dependencies [e01efae]
- Updated dependencies [1995d35]
- Updated dependencies [5de237f]
- Updated dependencies [2c1af5d]
- Updated dependencies [1cdf7d7]
- Updated dependencies [745ebd8]
- Updated dependencies [4bb6ba3]
- Updated dependencies [960757d]
- Updated dependencies [2d84729]
- Updated dependencies [835d736]
- Updated dependencies [07c0f0a]
- Updated dependencies [9e67928]
- Updated dependencies [954460e]
- Updated dependencies [3824e8e]
  - @cogenta/core@0.5.0
  - @cogenta/schema@0.4.0

## 0.1.4

### Patch Changes

- Updated dependencies [[`d72b40f`](https://github.com/cogenta-cms/cogenta/commit/d72b40f64ab5b98985a22d9daae34796a4638f45), [`4eda357`](https://github.com/cogenta-cms/cogenta/commit/4eda35754f55484e12028707e4f54aaaccc188d2), [`206b4cd`](https://github.com/cogenta-cms/cogenta/commit/206b4cd12df7d3a2a5831029b5f0ef726e7fd84d), [`03d1327`](https://github.com/cogenta-cms/cogenta/commit/03d13277224c5abd011d15e19c8f9ec67ef40c27), [`174b521`](https://github.com/cogenta-cms/cogenta/commit/174b521e9bca3b783e06ac8aa3dff6e0ded58aa5), [`029da6b`](https://github.com/cogenta-cms/cogenta/commit/029da6b238ad438b77375e389de57d83fb7f3a4e), [`b37e51c`](https://github.com/cogenta-cms/cogenta/commit/b37e51cea79fc8d3070d5c741a8415192985d9ff), [`3c73e58`](https://github.com/cogenta-cms/cogenta/commit/3c73e58ff0a54782a58ef1bf2d70e84819ff8944)]:
  - @cogenta/core@0.4.0
  - @cogenta/schema@0.3.0

## 0.1.3

### Patch Changes

- Updated dependencies [[`552645e`](https://github.com/cogenta-cms/cogenta/commit/552645e039b8c8c4f5340d065ea2f4a552950815), [`8b561d1`](https://github.com/cogenta-cms/cogenta/commit/8b561d1ba735eb2b42c27725f67faf64e53866e5), [`182ef48`](https://github.com/cogenta-cms/cogenta/commit/182ef48d97e2757e7b1404dc407327f53ed377dd), [`6ad0f3a`](https://github.com/cogenta-cms/cogenta/commit/6ad0f3a495176169fe95f4955dfef30a6af376fd), [`17aa538`](https://github.com/cogenta-cms/cogenta/commit/17aa538e94da132ce1ca48d2213d2b84df231c78), [`755201d`](https://github.com/cogenta-cms/cogenta/commit/755201d55fd8c04ba2794a03797696769b59f6cc), [`551a06c`](https://github.com/cogenta-cms/cogenta/commit/551a06c2e58bb4119618e5502dfcae4bb024b7d4), [`87bae8d`](https://github.com/cogenta-cms/cogenta/commit/87bae8dd4cc08261f3d5ba83947fa2ad77b0b826), [`b4e7deb`](https://github.com/cogenta-cms/cogenta/commit/b4e7deb11cb56f514da8533ffd9296a809bd45f0), [`62c2898`](https://github.com/cogenta-cms/cogenta/commit/62c28982ab130aafdb8b3aed04821b039e9e03ff), [`ca71b3b`](https://github.com/cogenta-cms/cogenta/commit/ca71b3bbd5d5d7371923d0521444fc94a525de06)]:
  - @cogenta/core@0.3.0
  - @cogenta/schema@0.2.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`fd0a52e`](https://github.com/cogenta-cms/cogenta/commit/fd0a52e155d802b102ac9012b3ed2d650b271c3f), [`4c95475`](https://github.com/cogenta-cms/cogenta/commit/4c9547543ec9a4464d8c9a05d1967dd15b7953aa)]:
  - @cogenta/core@0.2.0
  - @cogenta/schema@0.1.2

## 0.1.0

### Minor Changes

- [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Add `@cogenta/blocks`: the twelve-block semantic vocabulary of contract B.
  
  `defineBlock` declares a block manifest — `name`, `version`, `schema`, `runtime`,
  `fallback`, `a11y` — and compiles it into a Zod validator. The twelve blocks of
  `blocks@1.0` ship registered and ready: `hero`, `prose`, `mediaFigure`,
  `featureGrid`, `cta`, `gallery`, `quote`, `faq`, `stats`, `logos`,
  `collectionList` and `embed`.
  
  - `parseBlock` / `parseBlocks` validate on write and refuse anything
    presentational: HTML in a text field, an unrecognised `className`, a `style`
    value. The error names the block and the field.
  - `loadBlock` / `loadBlocks` migrate a block whose schema version has moved on,
    one version step at a time, and report `migrated` so the caller writes the
    result back. A block's `_key` survives the migration by construction.
  - Register your own steps on a `BlockMigrationRegistry`; a missing step is a
    refusal, never a silent partial migration.
  
  `@cogenta/core` gains the `BLOCK_UNKNOWN`, `BLOCK_INVALID`,
  `BLOCK_DEFINITION_INVALID` and `BLOCK_MIGRATION_FAILED` error codes.

### Patch Changes

- Updated dependencies [[`f323580`](https://github.com/cogenta-cms/cogenta/commit/f3235809422e16a4e9d34f16e1171d2ebcfaf01a), [`ea82de1`](https://github.com/cogenta-cms/cogenta/commit/ea82de10eba12d520e586b69e1bce733339da26d), [`8ae3456`](https://github.com/cogenta-cms/cogenta/commit/8ae3456d346ee2e169fceaa45c3cbaef1df01982), [`0877503`](https://github.com/cogenta-cms/cogenta/commit/0877503bf4a999543d51ce6dda2126471a4852c0), [`dc674b2`](https://github.com/cogenta-cms/cogenta/commit/dc674b2dc8a375b8ace5881a3fb8601855888500), [`b18a02c`](https://github.com/cogenta-cms/cogenta/commit/b18a02c3f5638520794db83bd1adfdb246a4f839), [`6f0b7bd`](https://github.com/cogenta-cms/cogenta/commit/6f0b7bdd457ba8d81e0aa18d0bde9b583bf810af), [`f870177`](https://github.com/cogenta-cms/cogenta/commit/f8701772440a4b3a7d0726b0836b94b7c1b57344), [`fd5ada9`](https://github.com/cogenta-cms/cogenta/commit/fd5ada927327946603a05349c2f87686ef8f003c), [`22bb5b2`](https://github.com/cogenta-cms/cogenta/commit/22bb5b2903b35c79d80a7df0bb99bead1533ba55), [`50d3b40`](https://github.com/cogenta-cms/cogenta/commit/50d3b4041fb5392502711c2bf20f4ec92d2ce76d), [`27e32b5`](https://github.com/cogenta-cms/cogenta/commit/27e32b52ed11e97969e2b319b2e74345bbc1f213), [`962073f`](https://github.com/cogenta-cms/cogenta/commit/962073f3aa5e56e68869c7d14a4b2937e506cfbd), [`59aced9`](https://github.com/cogenta-cms/cogenta/commit/59aced90e97d3aa2a98ab5e7aa067f50e2ceb611), [`b26dd9f`](https://github.com/cogenta-cms/cogenta/commit/b26dd9f636095b126ceb78e69bda50f7f5f8cb52), [`f52f97f`](https://github.com/cogenta-cms/cogenta/commit/f52f97ff8c553ab44f715b55f37ac726ea335160), [`39b6d33`](https://github.com/cogenta-cms/cogenta/commit/39b6d339a52ba97a1437167c15910971eee02383), [`6322731`](https://github.com/cogenta-cms/cogenta/commit/632273109648e850e415bb179bea6e5ea027c500), [`4921407`](https://github.com/cogenta-cms/cogenta/commit/4921407b4dbd283bdd76cf74d288a79c2ebcab64), [`7d9ed38`](https://github.com/cogenta-cms/cogenta/commit/7d9ed3878de61d54e58a4aa027c72447c118761c), [`046ffa8`](https://github.com/cogenta-cms/cogenta/commit/046ffa85769066150a0d0e8443d0d257ef72239c), [`d10724c`](https://github.com/cogenta-cms/cogenta/commit/d10724cb238399bf7203fff0bc151a832c555ad4), [`a958ee1`](https://github.com/cogenta-cms/cogenta/commit/a958ee12cee1130effb97e95d58fda219e153a4c), [`39fc7a4`](https://github.com/cogenta-cms/cogenta/commit/39fc7a4d490f0a1683ef69dd5495e0ff6494ca72), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`2a044a1`](https://github.com/cogenta-cms/cogenta/commit/2a044a1689f98a25258b6f45d9baf0b325194c95), [`5ae4e24`](https://github.com/cogenta-cms/cogenta/commit/5ae4e24e59cf807ef7aca5839623fd8a24798435), [`77ff957`](https://github.com/cogenta-cms/cogenta/commit/77ff95771e3fc415d9581e8d51ccae200167703d), [`22ec8de`](https://github.com/cogenta-cms/cogenta/commit/22ec8deec494a2925a943550fcf3c5e1689eb40e), [`3021aa1`](https://github.com/cogenta-cms/cogenta/commit/3021aa1c65d708b1267c662ce925d560f735d7d0), [`b2ecf93`](https://github.com/cogenta-cms/cogenta/commit/b2ecf9310366fcbaf18fbbf2c71bc45fccc577da), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`40539fc`](https://github.com/cogenta-cms/cogenta/commit/40539fcd48da958dba69f9a32f0b440f868d539f), [`24b1745`](https://github.com/cogenta-cms/cogenta/commit/24b174536c79a7b0f505e1ba4e70d5070fb14f6d), [`e8692eb`](https://github.com/cogenta-cms/cogenta/commit/e8692eba9f47a7a7eee176058f4638abec71dce0), [`3184163`](https://github.com/cogenta-cms/cogenta/commit/318416355a83d88828786344e1ff80e1b113c564), [`1f2eecc`](https://github.com/cogenta-cms/cogenta/commit/1f2eecc754286c9e140511634b465a6536f99f25), [`6ce944f`](https://github.com/cogenta-cms/cogenta/commit/6ce944ffac8e947a979b8dc46a64ee3699b0b402), [`fc13c44`](https://github.com/cogenta-cms/cogenta/commit/fc13c4484c1c01a64b23941622e8308731fd937e), [`f5b0d4c`](https://github.com/cogenta-cms/cogenta/commit/f5b0d4cd8b7a81b36f8c539b38a412b893cb125c), [`1041c9f`](https://github.com/cogenta-cms/cogenta/commit/1041c9fb8c39872350786e5dc5b8a4f84e2b3ff7), [`ed7e7d1`](https://github.com/cogenta-cms/cogenta/commit/ed7e7d1cd73eedff8877c974938b7134bd24ac3b), [`fe1e7b6`](https://github.com/cogenta-cms/cogenta/commit/fe1e7b693d3a5eb8635e783a75863f5613712fb4), [`a609efa`](https://github.com/cogenta-cms/cogenta/commit/a609efa46060a35b048a24e7d03b7bbde414b7a4), [`32dc81a`](https://github.com/cogenta-cms/cogenta/commit/32dc81adac441ecc0b105c4da02e9064ead09b99), [`ff45fb3`](https://github.com/cogenta-cms/cogenta/commit/ff45fb3fef9b076e0550e09601912ad759831476), [`f0915d5`](https://github.com/cogenta-cms/cogenta/commit/f0915d5b3040512560477cfbb95729a6e69a3f3c), [`269c38b`](https://github.com/cogenta-cms/cogenta/commit/269c38b4df5bae381cadbfa85d5c6fe12353e177), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`2aa38b4`](https://github.com/cogenta-cms/cogenta/commit/2aa38b4d466126c16afd0ac55febd35c7d163b00), [`11d592b`](https://github.com/cogenta-cms/cogenta/commit/11d592bbca9cea415c95aa0edb4a85aef8b05174), [`6a84427`](https://github.com/cogenta-cms/cogenta/commit/6a84427da789abdce1f61feeef7c1ff5bc7fb9f5), [`64b43fb`](https://github.com/cogenta-cms/cogenta/commit/64b43fb661784c855c1375dfcf995999198e93d3), [`c93a5f7`](https://github.com/cogenta-cms/cogenta/commit/c93a5f709bce8b380c270a1b4ef31dac86293535), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`163d88b`](https://github.com/cogenta-cms/cogenta/commit/163d88bc594b457a06e19ce39e4fbe9e4693e4d8), [`73acd6f`](https://github.com/cogenta-cms/cogenta/commit/73acd6f40a6c1904fde717891f04079d930a0e43), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`696c163`](https://github.com/cogenta-cms/cogenta/commit/696c163c05bb981413e52af74d63dcbcbe72c99e), [`d5896bb`](https://github.com/cogenta-cms/cogenta/commit/d5896bb8bbabb43873e82deb1acfdb818def201b), [`693697e`](https://github.com/cogenta-cms/cogenta/commit/693697ed41174c027c5acaa43abb3a9c0e41bbab), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a)]:
  - @cogenta/core@0.1.0
  - @cogenta/schema@0.1.0
