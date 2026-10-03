# @cogenta/export

## 0.3.0

### Minor Changes

- [`dfad74b`](https://github.com/cogenta-cms/cogenta/commit/dfad74b535f06159b61efbb1a941c27839eca85d) Thanks [@georgesmomo](https://github.com/georgesmomo)! - Actually write the media references `cogenta export` has always claimed to write.
  
  The command printed "7 media references" over a file that contained none:
  `exportMediaReferences` and `exportMediaArchive` were complete, tested, and called by
  nothing. Every entry imported from such a file pointed at an identifier the target site
  could not resolve. `exportContent` now emits a `media-ref` record per referenced medium
  when it is given a `media` store, and `counts.mediaRefs` counts **records written**
  rather than media found — so the number and the file can no longer disagree.
  
  `ExportContentOptions` gains `mediaIn`, an optional per-entry resolver for media this
  package cannot see by itself. Most of a real site's pictures live inside contract B
  blocks and rich text rather than in declared `f.media()` fields, and finding those means
  reading the block vocabulary, which `@cogenta/export` depends on neither directly nor
  through `@cogenta/api` (R9). So the caller is asked instead: `cogenta export` passes a
  resolver backed by the same `collectDependencies` the REST layer uses to declare a
  response's dependencies. Without it, an export still carries every declared media field
  and undercounts a site by roughly half — which is what it did before.
  
  `cogenta export` also gains `--media-archive <file>`, writing a ZIP of the referenced
  media's bytes for the case the target site does not share the source's storage.

### Patch Changes

- Updated dependencies [[`dcf76f4`](https://github.com/cogenta-cms/cogenta/commit/dcf76f4ef93be5bae52196a5a610df4f0a36dfba), [`99c21a0`](https://github.com/cogenta-cms/cogenta/commit/99c21a0ac93a49064b77cf9ba08cfe15815f1782), [`8bbcc4f`](https://github.com/cogenta-cms/cogenta/commit/8bbcc4ff883051241cbf06f65b59458ecb7d9f57), [`ccf489d`](https://github.com/cogenta-cms/cogenta/commit/ccf489d67a1ba81b4f0aa5ccbbcecc30f671f1d6), [`ea2d505`](https://github.com/cogenta-cms/cogenta/commit/ea2d505c2204996eed5737596de7863dd5eda188), [`0bd4e72`](https://github.com/cogenta-cms/cogenta/commit/0bd4e72d937d0b522315a401225dd4741508fd50)]:
  - @cogenta/core@0.12.1
  - @cogenta/schema@0.11.0
  - @cogenta/auth@0.5.12

## 0.2.12

### Patch Changes

- Updated dependencies [`8bd7c89`, `8bd7c89`]:
  - @cogenta/schema@0.10.0
  - @cogenta/auth@0.5.11

## 0.2.11

### Patch Changes

- Updated dependencies [`4747d81`, `2a34b50`]:
  - @cogenta/core@0.12.0
  - @cogenta/schema@0.9.0
  - @cogenta/auth@0.5.10

## 0.2.10

### Patch Changes

- Updated dependencies [`01deb2a`, `db6ee94`]:
  - @cogenta/schema@0.8.0
  - @cogenta/auth@0.5.9

## 0.2.9

### Patch Changes

- Updated dependencies [`cf981a0`]:
  - @cogenta/schema@0.7.1
  - @cogenta/auth@0.5.8

## 0.2.8

### Patch Changes

- Updated dependencies [`aef3a40`]:
  - @cogenta/schema@0.7.0
  - @cogenta/auth@0.5.7

## 0.2.7

### Patch Changes

- Updated dependencies [`082a630`, `43d82cf`, `3872f56`]:
  - @cogenta/schema@0.6.0
  - @cogenta/auth@0.5.6

## 0.2.6

### Patch Changes

- Updated dependencies [`614f545`]:
  - @cogenta/core@0.11.0
  - @cogenta/auth@0.5.5
  - @cogenta/schema@0.5.4

## 0.2.5

### Patch Changes

- Updated dependencies [`166b71e`, [`7944c60`](https://github.com/cogenta-cms/cogenta/commit/7944c609bcc66874b14ab8d4eb950ec337585de0), `8153b2d`]:
  - @cogenta/core@0.10.0
  - @cogenta/auth@0.5.4
  - @cogenta/schema@0.5.3

## 0.2.4

### Patch Changes

- Updated dependencies [[`8f0e946`](https://github.com/cogenta-cms/cogenta/commit/8f0e946573b8d8b31c89c956bb75d9a1eb6061a2), [`0e346da`](https://github.com/cogenta-cms/cogenta/commit/0e346da6204f91c0efa47066667e127c76c4ecde), [`d222023`](https://github.com/cogenta-cms/cogenta/commit/d222023000e4933c5c8cefe21bb1c64fafd34b67)]:
  - @cogenta/core@0.9.0
  - @cogenta/schema@0.5.2
  - @cogenta/auth@0.5.3

## 0.2.3

### Patch Changes

- Updated dependencies [[`10db071`](https://github.com/cogenta-cms/cogenta/commit/10db07162f24b56d750770480ebb2b5e2868773a), [`b0c8677`](https://github.com/cogenta-cms/cogenta/commit/b0c86775f2fe8d68bce3a5b248803911b57ed71f), `c9dffa4`, [`858aec8`](https://github.com/cogenta-cms/cogenta/commit/858aec8a332fe434975e34b6f9b2a1ec173b65cd)]:
  - @cogenta/core@0.8.0
  - @cogenta/auth@0.5.2
  - @cogenta/schema@0.5.1

## 0.2.2

### Patch Changes

- Updated dependencies [[`13a7989`](https://github.com/cogenta-cms/cogenta/commit/13a79891c3e0c64137ac74e838c4a30fc03e9f7f), [`89e7579`](https://github.com/cogenta-cms/cogenta/commit/89e7579129712a5978ff57b884151731f5c340ea)]:
  - @cogenta/schema@0.5.0
  - @cogenta/core@0.7.0
  - @cogenta/auth@0.5.1

## 0.2.1

### Patch Changes

- Updated dependencies [[`74e07e9`](https://github.com/cogenta-cms/cogenta/commit/74e07e92fda41c0d0d573a59e8bfafdecd48fbfc), [`b85ce4e`](https://github.com/cogenta-cms/cogenta/commit/b85ce4edad72ff065cd63c852a9f42aeefc5ab9a), [`bde02b5`](https://github.com/cogenta-cms/cogenta/commit/bde02b518f98a8d4cbc58544ea809c658b8dee7b)]:
  - @cogenta/auth@0.5.0
  - @cogenta/core@0.6.0
  - @cogenta/schema@0.4.1

## 0.2.0

### Minor Changes

- d0bfa1d: Add `@cogenta/export`: content export/import (`export@1.0`, NDJSON, permission-aware),
  media archive export (streaming ZIP, references or full bytes), full-site backup and
  restore (`cogenta-backup@1.0`, engine-independent, checksummed, optionally encrypted
  with a passphrase), and GDPR/RGPD personal-data export by email — fiche 26.
  
  `@cogenta/core` gains nine error codes (`EXPORT_*`, `BACKUP_*`, `RESTORE_*`) and exports
  `MEDIA_TABLE`, its media table's physical name, so a caller assembling a full-site
  backup can name every table without depending on `@cogenta/core`'s internals.
  
  `@cogenta/cli` gains four new commands: `cogenta export`, `cogenta import content`,
  `cogenta backup create|list`, and `cogenta restore preview|apply`. Restoring a full
  backup is **CLI-only, by design** — it overwrites the database an admin session would
  be running against, so it is never exposed over HTTP; an admin instead applies a
  *content* export (additive, reversible through the trash).

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
- Updated dependencies [c555723]
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
  - @cogenta/auth@0.4.0
