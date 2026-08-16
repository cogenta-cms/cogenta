# @cogenta/import

## 0.1.3

### Patch Changes

- Updated dependencies [[`552645e`](https://github.com/cogenta-cms/cogenta/commit/552645e039b8c8c4f5340d065ea2f4a552950815), [`cc3ea98`](https://github.com/cogenta-cms/cogenta/commit/cc3ea981188f16efa17352370251374b62709060), [`8b561d1`](https://github.com/cogenta-cms/cogenta/commit/8b561d1ba735eb2b42c27725f67faf64e53866e5), [`182ef48`](https://github.com/cogenta-cms/cogenta/commit/182ef48d97e2757e7b1404dc407327f53ed377dd), [`6ad0f3a`](https://github.com/cogenta-cms/cogenta/commit/6ad0f3a495176169fe95f4955dfef30a6af376fd), [`17aa538`](https://github.com/cogenta-cms/cogenta/commit/17aa538e94da132ce1ca48d2213d2b84df231c78), [`755201d`](https://github.com/cogenta-cms/cogenta/commit/755201d55fd8c04ba2794a03797696769b59f6cc), [`551a06c`](https://github.com/cogenta-cms/cogenta/commit/551a06c2e58bb4119618e5502dfcae4bb024b7d4), [`8ebd276`](https://github.com/cogenta-cms/cogenta/commit/8ebd2768190f34d9ba1d67878e9024f19edb6f0f), [`7ed521e`](https://github.com/cogenta-cms/cogenta/commit/7ed521edc6f8affb11020a7012e858411d40699d), [`87bae8d`](https://github.com/cogenta-cms/cogenta/commit/87bae8dd4cc08261f3d5ba83947fa2ad77b0b826), [`b4e7deb`](https://github.com/cogenta-cms/cogenta/commit/b4e7deb11cb56f514da8533ffd9296a809bd45f0), [`62c2898`](https://github.com/cogenta-cms/cogenta/commit/62c28982ab130aafdb8b3aed04821b039e9e03ff), [`ca71b3b`](https://github.com/cogenta-cms/cogenta/commit/ca71b3bbd5d5d7371923d0521444fc94a525de06)]:
  - @cogenta/core@0.3.0
  - @cogenta/auth@0.2.0
  - @cogenta/schema@0.2.0
  - @cogenta/blocks@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies [[`fd0a52e`](https://github.com/cogenta-cms/cogenta/commit/fd0a52e155d802b102ac9012b3ed2d650b271c3f), [`4c95475`](https://github.com/cogenta-cms/cogenta/commit/4c9547543ec9a4464d8c9a05d1967dd15b7953aa)]:
  - @cogenta/core@0.2.0
  - @cogenta/auth@0.1.2
  - @cogenta/blocks@0.1.2
  - @cogenta/schema@0.1.2

## 0.1.0

### Minor Changes

- [`d5896bb`](https://github.com/cogenta-cms/cogenta/commit/d5896bb8bbabb43873e82deb1acfdb818def201b) Thanks [@georgesmomo](https://github.com/georgesmomo)! - New package `@cogenta/import`: `cogenta import wordpress <file.xml>` (L9 task
  6). Imports a WordPress "Export All Content" WXR file — posts, pages,
  categories, tags, media (downloaded and re-stored through `MediaStore`/
  `StorageDriver`), authors (as real, credential-less users), approved comments,
  postmeta (carried as opaque `f.json()` `customFields`, contract A has no
  free-form field kind), Gutenberg blocks converted to the block vocabulary
  (`prose`/`mediaFigure`/`quote`/`gallery`/`embed`) where a mapping exists, and
  301 redirects from each entry's old permalink (`reason: 'import'`, the
  `@cogenta/schema` redirect store's own case for this). Every WXR reader is a
  zero-dependency, WXR-scoped XML tokenizer (`deps-auditor` rejected
  `fast-xml-parser`: a single-maintainer seven-package split published the same
  day, and a general parser's DTD support is an unnecessary XXE surface for a
  file of unknown provenance) — a document declaring `<!DOCTYPE ... ENTITY` is
  rejected outright.
  
  Nothing that cannot be converted is silently dropped: an unmappable Gutenberg
  block, a dead media URL, an author with no email, a trashed post — every one
  of them lands in the returned `ConversionReport` (`imported`/`skipped`/
  `unconvertedBlocks`/`warnings`), which `cogenta import wordpress` prints. The
  command exits `0` even with items reported as unconverted — a reported
  partial import is the intended outcome for a real-world export, not a
  failure — and only exits non-zero when the file cannot be read or parsed at
  all.
  
  Two new `@cogenta/core` error codes: `IMPORT_WXR_PARSE_FAILED`,
  `IMPORT_WXR_UNSAFE_DOCUMENT`.

### Patch Changes

- Updated dependencies [[`f323580`](https://github.com/cogenta-cms/cogenta/commit/f3235809422e16a4e9d34f16e1171d2ebcfaf01a), [`ea82de1`](https://github.com/cogenta-cms/cogenta/commit/ea82de10eba12d520e586b69e1bce733339da26d), [`8ae3456`](https://github.com/cogenta-cms/cogenta/commit/8ae3456d346ee2e169fceaa45c3cbaef1df01982), [`0877503`](https://github.com/cogenta-cms/cogenta/commit/0877503bf4a999543d51ce6dda2126471a4852c0), [`a9a7553`](https://github.com/cogenta-cms/cogenta/commit/a9a75531fe0b52fd9b55a3940c4abc337446cdc1), [`dc674b2`](https://github.com/cogenta-cms/cogenta/commit/dc674b2dc8a375b8ace5881a3fb8601855888500), [`b18a02c`](https://github.com/cogenta-cms/cogenta/commit/b18a02c3f5638520794db83bd1adfdb246a4f839), [`6f0b7bd`](https://github.com/cogenta-cms/cogenta/commit/6f0b7bdd457ba8d81e0aa18d0bde9b583bf810af), [`f870177`](https://github.com/cogenta-cms/cogenta/commit/f8701772440a4b3a7d0726b0836b94b7c1b57344), [`fd5ada9`](https://github.com/cogenta-cms/cogenta/commit/fd5ada927327946603a05349c2f87686ef8f003c), [`22bb5b2`](https://github.com/cogenta-cms/cogenta/commit/22bb5b2903b35c79d80a7df0bb99bead1533ba55), [`50d3b40`](https://github.com/cogenta-cms/cogenta/commit/50d3b4041fb5392502711c2bf20f4ec92d2ce76d), [`27e32b5`](https://github.com/cogenta-cms/cogenta/commit/27e32b52ed11e97969e2b319b2e74345bbc1f213), [`962073f`](https://github.com/cogenta-cms/cogenta/commit/962073f3aa5e56e68869c7d14a4b2937e506cfbd), [`59aced9`](https://github.com/cogenta-cms/cogenta/commit/59aced90e97d3aa2a98ab5e7aa067f50e2ceb611), [`b26dd9f`](https://github.com/cogenta-cms/cogenta/commit/b26dd9f636095b126ceb78e69bda50f7f5f8cb52), [`f52f97f`](https://github.com/cogenta-cms/cogenta/commit/f52f97ff8c553ab44f715b55f37ac726ea335160), [`39b6d33`](https://github.com/cogenta-cms/cogenta/commit/39b6d339a52ba97a1437167c15910971eee02383), [`6322731`](https://github.com/cogenta-cms/cogenta/commit/632273109648e850e415bb179bea6e5ea027c500), [`4921407`](https://github.com/cogenta-cms/cogenta/commit/4921407b4dbd283bdd76cf74d288a79c2ebcab64), [`7d9ed38`](https://github.com/cogenta-cms/cogenta/commit/7d9ed3878de61d54e58a4aa027c72447c118761c), [`046ffa8`](https://github.com/cogenta-cms/cogenta/commit/046ffa85769066150a0d0e8443d0d257ef72239c), [`d10724c`](https://github.com/cogenta-cms/cogenta/commit/d10724cb238399bf7203fff0bc151a832c555ad4), [`a958ee1`](https://github.com/cogenta-cms/cogenta/commit/a958ee12cee1130effb97e95d58fda219e153a4c), [`39fc7a4`](https://github.com/cogenta-cms/cogenta/commit/39fc7a4d490f0a1683ef69dd5495e0ff6494ca72), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`c522dda`](https://github.com/cogenta-cms/cogenta/commit/c522dda594169b5148643726fbd41dbbf1c9a308), [`2a044a1`](https://github.com/cogenta-cms/cogenta/commit/2a044a1689f98a25258b6f45d9baf0b325194c95), [`5ae4e24`](https://github.com/cogenta-cms/cogenta/commit/5ae4e24e59cf807ef7aca5839623fd8a24798435), [`77ff957`](https://github.com/cogenta-cms/cogenta/commit/77ff95771e3fc415d9581e8d51ccae200167703d), [`22ec8de`](https://github.com/cogenta-cms/cogenta/commit/22ec8deec494a2925a943550fcf3c5e1689eb40e), [`3021aa1`](https://github.com/cogenta-cms/cogenta/commit/3021aa1c65d708b1267c662ce925d560f735d7d0), [`b2ecf93`](https://github.com/cogenta-cms/cogenta/commit/b2ecf9310366fcbaf18fbbf2c71bc45fccc577da), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`8d3b27c`](https://github.com/cogenta-cms/cogenta/commit/8d3b27ce2334c7ea6e75182707aa6d6e78688b31), [`40539fc`](https://github.com/cogenta-cms/cogenta/commit/40539fcd48da958dba69f9a32f0b440f868d539f), [`24b1745`](https://github.com/cogenta-cms/cogenta/commit/24b174536c79a7b0f505e1ba4e70d5070fb14f6d), [`e8692eb`](https://github.com/cogenta-cms/cogenta/commit/e8692eba9f47a7a7eee176058f4638abec71dce0), [`3184163`](https://github.com/cogenta-cms/cogenta/commit/318416355a83d88828786344e1ff80e1b113c564), [`1f2eecc`](https://github.com/cogenta-cms/cogenta/commit/1f2eecc754286c9e140511634b465a6536f99f25), [`6ce944f`](https://github.com/cogenta-cms/cogenta/commit/6ce944ffac8e947a979b8dc46a64ee3699b0b402), [`fc13c44`](https://github.com/cogenta-cms/cogenta/commit/fc13c4484c1c01a64b23941622e8308731fd937e), [`f5b0d4c`](https://github.com/cogenta-cms/cogenta/commit/f5b0d4cd8b7a81b36f8c539b38a412b893cb125c), [`1041c9f`](https://github.com/cogenta-cms/cogenta/commit/1041c9fb8c39872350786e5dc5b8a4f84e2b3ff7), [`ed7e7d1`](https://github.com/cogenta-cms/cogenta/commit/ed7e7d1cd73eedff8877c974938b7134bd24ac3b), [`fe1e7b6`](https://github.com/cogenta-cms/cogenta/commit/fe1e7b693d3a5eb8635e783a75863f5613712fb4), [`a609efa`](https://github.com/cogenta-cms/cogenta/commit/a609efa46060a35b048a24e7d03b7bbde414b7a4), [`32dc81a`](https://github.com/cogenta-cms/cogenta/commit/32dc81adac441ecc0b105c4da02e9064ead09b99), [`ff45fb3`](https://github.com/cogenta-cms/cogenta/commit/ff45fb3fef9b076e0550e09601912ad759831476), [`f0915d5`](https://github.com/cogenta-cms/cogenta/commit/f0915d5b3040512560477cfbb95729a6e69a3f3c), [`269c38b`](https://github.com/cogenta-cms/cogenta/commit/269c38b4df5bae381cadbfa85d5c6fe12353e177), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a), [`2aa38b4`](https://github.com/cogenta-cms/cogenta/commit/2aa38b4d466126c16afd0ac55febd35c7d163b00), [`11d592b`](https://github.com/cogenta-cms/cogenta/commit/11d592bbca9cea415c95aa0edb4a85aef8b05174), [`6a84427`](https://github.com/cogenta-cms/cogenta/commit/6a84427da789abdce1f61feeef7c1ff5bc7fb9f5), [`64b43fb`](https://github.com/cogenta-cms/cogenta/commit/64b43fb661784c855c1375dfcf995999198e93d3), [`c93a5f7`](https://github.com/cogenta-cms/cogenta/commit/c93a5f709bce8b380c270a1b4ef31dac86293535), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`163d88b`](https://github.com/cogenta-cms/cogenta/commit/163d88bc594b457a06e19ce39e4fbe9e4693e4d8), [`73acd6f`](https://github.com/cogenta-cms/cogenta/commit/73acd6f40a6c1904fde717891f04079d930a0e43), [`1c5efd2`](https://github.com/cogenta-cms/cogenta/commit/1c5efd24572d6295e5e21f476637adf8ebc92819), [`696c163`](https://github.com/cogenta-cms/cogenta/commit/696c163c05bb981413e52af74d63dcbcbe72c99e), [`d5896bb`](https://github.com/cogenta-cms/cogenta/commit/d5896bb8bbabb43873e82deb1acfdb818def201b), [`693697e`](https://github.com/cogenta-cms/cogenta/commit/693697ed41174c027c5acaa43abb3a9c0e41bbab), [`ee839be`](https://github.com/cogenta-cms/cogenta/commit/ee839be0c862bea209acd080b6a44bcd41738d5a)]:
  - @cogenta/core@0.1.0
  - @cogenta/auth@0.1.0
  - @cogenta/schema@0.1.0
  - @cogenta/blocks@0.1.0
