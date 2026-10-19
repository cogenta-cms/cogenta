# Fonts of `@cogenta/theme-portfolio`

Served by the site itself at `/_cogenta/fonts/portfolio/<file>`. A page of this
theme makes **no request to a font provider**.

| Family | Style | Subset | Weight | File | Size |
|---|---|---|---|---|---|
| Archivo | normal | latin-ext | 100 900 (width 62% 125%) | `archivo-normal-latin-ext-5717f370.woff2` | 84.2 KiB |
| Archivo | normal | latin | 100 900 (width 62% 125%) | `archivo-normal-latin-e3a28ead.woff2` | 88.0 KiB |

Total: 2 files, 172.2 KiB.

## Licence

- **Archivo**: SIL Open Font License 1.1, text in `OFL-archivo.txt`

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
node scripts/fetch-theme-fonts.mjs portfolio
```

The script asks `https://fonts.googleapis.com/css2` with a modern User-Agent for
exactly the families, axes and weights this theme used before it was
self-hosted, downloads each `latin`/`latin-ext` file, names it after a hash of
its bytes (so a changed file gets a new URL and can be cached for a year), and
rewrites `src/styles/fonts.css`. It needs the network once, when it is run, and
never when a site is built, tested or served.
