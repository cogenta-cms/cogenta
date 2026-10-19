# Fonts of `@cogenta/theme-blog`

Served by the site itself at `/_cogenta/fonts/blog/<file>`. A page of this
theme makes **no request to a font provider**.

| Family | Style | Subset | Weight | File | Size |
|---|---|---|---|---|---|
| Figtree | normal | latin-ext | 400 700 | `figtree-normal-latin-ext-bf7828e2.woff2` | 10.0 KiB |
| Figtree | normal | latin | 400 700 | `figtree-normal-latin-4ba7d3d0.woff2` | 19.7 KiB |
| Literata | italic | latin-ext | 300 600 | `literata-italic-latin-ext-09e48237.woff2` | 89.3 KiB |
| Literata | italic | latin | 300 600 | `literata-italic-latin-97bc5aa3.woff2` | 110.5 KiB |
| Literata | normal | latin-ext | 300 700 | `literata-normal-latin-ext-1160835f.woff2` | 87.6 KiB |
| Literata | normal | latin | 300 700 | `literata-normal-latin-29de894c.woff2` | 107.5 KiB |

Total: 6 files, 424.6 KiB.

## Licence

- **Figtree**: SIL Open Font License 1.1, text in `OFL-figtree.txt`
- **Literata**: SIL Open Font License 1.1, text in `OFL-literata.txt`

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
node scripts/fetch-theme-fonts.mjs blog
```

The script asks `https://fonts.googleapis.com/css2` with a modern User-Agent for
exactly the families, axes and weights this theme used before it was
self-hosted, downloads each `latin`/`latin-ext` file, names it after a hash of
its bytes (so a changed file gets a new URL and can be cached for a year), and
rewrites `src/styles/fonts.css`. It needs the network once, when it is run, and
never when a site is built, tested or served.
