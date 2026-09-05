# @cogenta/export

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
