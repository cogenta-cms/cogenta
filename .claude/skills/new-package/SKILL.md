---
name: new-package
description: Use when creating a new @cogenta/* package in the monorepo — produces the exact skeleton (package.json, tsconfig, exports, test layout, changeset) that matches the project's ESM-strict, publishable-package conventions.
---

# Créer un paquet `@cogenta/*`

## Avant

Vérifie que le paquet est bien prévu par la spec du lot en cours (`docs/lots/`). Ne crée
pas un paquet « au cas où » : AGENTS.md interdit l'abstraction pour un cas hypothétique.

## Emplacement

```
packages/<nom-court>/          # @cogenta/<nom-court>, kebab-case
├── package.json
├── tsconfig.json
├── src/
│   └── index.ts               # la SEULE surface publique
└── test/
```

Paquets prévus : `core`, `cli`, `schema`, `api`, `blocks`, `admin`, `render`,
`theme-canonical`, `agents`, `mcp`, plus `create-cogenta` à la racine de `packages/`.

## `package.json` de référence

```json
{
  "name": "@cogenta/<nom>",
  "version": "0.0.0",
  "description": "<une phrase, en anglais>",
  "license": "MPL-2.0",
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
  },
  "files": ["dist"],
  "engines": { "node": ">=22.11.0" },
  "publishConfig": { "access": "public", "provenance": true },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/cogenta-cms/cogenta.git",
    "directory": "packages/<nom>"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run --passWithNoTests",
    "test:integration": "vitest run --config vitest.integration.config.ts --passWithNoTests"
  }
}
```

## `tsconfig.json` de référence

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src"]
}
```

## Règles à ne pas rater

- **Un seul point d'entrée public** (`.`). Un sous-chemin d'export est une décision, pas
  une commodité : chaque `exports` supplémentaire devient une surface publique à
  maintenir en semver.
- `"type": "module"` et rien d'autre. Aucun build CJS, aucun `main`, aucun `require`.
- `"provenance": true` : la publication passe par GitHub Actions en OIDC, jamais par un
  jeton long-vivant (docs/02-architecture.md § 8).
- `--passWithNoTests` n'est pas optionnel : sans lui, `vitest` sort en erreur pour un
  paquet qui n'a pas encore de tests de ce type, et la CI échoue sur un paquet vide.
- Un paquet publiable qui change **exige un changeset** (skill `changeset`).
- Ajoute le paquet à la CI si elle liste les paquets explicitement.

## Après

1. `pnpm install` à la racine pour lier le workspace.
2. `pnpm -F @cogenta/<nom> typecheck` doit passer sur un `index.ts` vide.
3. Mets à jour `docs/lots/L0-socle.md` § Arborescence si l'emplacement diffère de la spec.
