# Fonts of `@cogenta/theme-magazine`

Served by the site itself at `/_cogenta/fonts/magazine/<file>`. A page of this
theme makes **no request to a font provider**.

| Family | Style | Subset | Weight | File | Size |
|---|---|---|---|---|---|
| Fraunces | normal | latin-ext | 300 800 | `fraunces-normal-latin-ext-a2930b27.woff2` | 58.0 KiB |
| Fraunces | normal | latin | 300 800 | `fraunces-normal-latin-7234ed86.woff2` | 65.7 KiB |
| Libre Franklin | normal | latin-ext | 400 800 | `libre-franklin-normal-latin-ext-61216d8e.woff2` | 25.1 KiB |
| Libre Franklin | normal | latin | 400 800 | `libre-franklin-normal-latin-52e60585.woff2` | 28.6 KiB |
| Source Serif 4 | italic | latin-ext | 400 600 | `source-serif-4-italic-latin-ext-2078240c.woff2` | 107.7 KiB |
| Source Serif 4 | italic | latin | 400 600 | `source-serif-4-italic-latin-96e63932.woff2` | 127.1 KiB |
| Source Serif 4 | normal | latin-ext | 400 700 | `source-serif-4-normal-latin-ext-155f6e70.woff2` | 98.5 KiB |
| Source Serif 4 | normal | latin | 400 700 | `source-serif-4-normal-latin-f2ea9c12.woff2` | 119.5 KiB |

Total: 8 files, 630.3 KiB.

## Licence

- **Fraunces**: SIL Open Font License 1.1, text in `OFL-fraunces.txt`
- **Libre Franklin**: SIL Open Font License 1.1, text in `OFL-libre-franklin.txt`
- **Source Serif 4**: SIL Open Font License 1.1, text in `OFL-source-serif-4.txt`

The OFL permits bundling and redistributing these files with this package, as
long as the licence text travels with them (it does) and the fonts are not sold
on their own.

## Source and subsets

The files are the variable WOFF2 builds that the Google Fonts `css2` API
serves, taken from the `google/fonts` open-source repository's distribution.
Only the `latin` and `latin-ext` subsets are kept: together they cover
French (œ Œ ’ « » and every accented capital), the other Western European
languages, and the euro sign. A language written in another script falls back to
the next family of the theme's stack.

## How they were fetched

```sh
node scripts/fetch-theme-fonts.mjs magazine
```

The script asks `https://fonts.googleapis.com/css2` with a modern User-Agent for
exactly the families, axes and weights this theme used before it was
self-hosted, downloads each `latin`/`latin-ext` file, names it after a hash of
its bytes (so a changed file gets a new URL and can be cached for a year), and
rewrites `src/styles/fonts.css`. It needs the network once, when it is run, and
never when a site is built, tested or served.
