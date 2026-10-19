# Fonts of `@cogenta/theme-entreprise`

Served by the site itself at `/_cogenta/fonts/entreprise/<file>`. A page of this
theme makes **no request to a font provider**.

| Family | Style | Subset | Weight | File | Size |
|---|---|---|---|---|---|
| Geist | normal | latin-ext | 300 700 | `geist-normal-latin-ext-824f485b.woff2` | 16.1 KiB |
| Geist | normal | latin | 300 700 | `geist-normal-latin-19f9c925.woff2` | 28.7 KiB |
| Geist Mono | normal | latin-ext | 400 600 | `geist-mono-normal-latin-ext-1a189eb9.woff2` | 14.4 KiB |
| Geist Mono | normal | latin | 400 600 | `geist-mono-normal-latin-684ad5b5.woff2` | 22.6 KiB |

Total: 4 files, 81.8 KiB.

## Licence

- **Geist**: SIL Open Font License 1.1, text in `OFL-geist.txt`
- **Geist Mono**: SIL Open Font License 1.1, text in `OFL-geist-mono.txt`

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
node scripts/fetch-theme-fonts.mjs entreprise
```

The script asks `https://fonts.googleapis.com/css2` with a modern User-Agent for
exactly the families, axes and weights this theme used before it was
self-hosted, downloads each `latin`/`latin-ext` file, names it after a hash of
its bytes (so a changed file gets a new URL and can be cached for a year), and
rewrites `src/styles/fonts.css`. It needs the network once, when it is run, and
never when a site is built, tested or served.
