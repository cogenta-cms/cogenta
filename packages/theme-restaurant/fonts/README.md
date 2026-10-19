# Fonts of `@cogenta/theme-restaurant`

Served by the site itself at `/_cogenta/fonts/restaurant/<file>`. A page of this
theme makes **no request to a font provider**.

| Family | Style | Subset | Weight | File | Size |
|---|---|---|---|---|---|
| Cormorant Garamond | italic | latin-ext | 300 700 | `cormorant-garamond-italic-latin-ext-cd5bf126.woff2` | 33.6 KiB |
| Cormorant Garamond | italic | latin | 300 700 | `cormorant-garamond-italic-latin-6f2f5c3b.woff2` | 38.3 KiB |
| Cormorant Garamond | normal | latin-ext | 300 700 | `cormorant-garamond-normal-latin-ext-cfa9a397.woff2` | 32.9 KiB |
| Cormorant Garamond | normal | latin | 300 700 | `cormorant-garamond-normal-latin-d80df8ff.woff2` | 36.8 KiB |
| Karla | italic | latin-ext | 200 800 | `karla-italic-latin-ext-7632f995.woff2` | 15.6 KiB |
| Karla | italic | latin | 200 800 | `karla-italic-latin-29363b02.woff2` | 32.2 KiB |
| Karla | normal | latin-ext | 200 800 | `karla-normal-latin-ext-14291dd5.woff2` | 14.9 KiB |
| Karla | normal | latin | 200 800 | `karla-normal-latin-cd614fed.woff2` | 31.4 KiB |

Total: 8 files, 235.7 KiB.

## Licence

- **Cormorant Garamond**: SIL Open Font License 1.1, text in `OFL-cormorant-garamond.txt`
- **Karla**: SIL Open Font License 1.1, text in `OFL-karla.txt`

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
node scripts/fetch-theme-fonts.mjs restaurant
```

The script asks `https://fonts.googleapis.com/css2` with a modern User-Agent for
exactly the families, axes and weights this theme used before it was
self-hosted, downloads each `latin`/`latin-ext` file, names it after a hash of
its bytes (so a changed file gets a new URL and can be cached for a year), and
rewrites `src/styles/fonts.css`. It needs the network once, when it is run, and
never when a site is built, tested or served.
