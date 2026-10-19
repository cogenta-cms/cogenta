# Fonts of `@cogenta/theme-canonical`

Served by the site itself at `/_cogenta/fonts/canonical/<file>`. A page of this
theme makes **no request to a font provider**.

| Family | Style | Subset | Weight | File | Size |
|---|---|---|---|---|---|
| Instrument Sans | italic | latin-ext | 400 700 (width 100%) | `instrument-sans-italic-latin-ext-2c2d6eb0.woff2` | 11.4 KiB |
| Instrument Sans | italic | latin | 400 700 (width 100%) | `instrument-sans-italic-latin-77210cdd.woff2` | 31.1 KiB |
| Instrument Sans | normal | latin-ext | 400 700 (width 100%) | `instrument-sans-normal-latin-ext-c4fcfea4.woff2` | 10.9 KiB |
| Instrument Sans | normal | latin | 400 700 (width 100%) | `instrument-sans-normal-latin-2ee17598.woff2` | 29.4 KiB |
| Instrument Serif | italic | latin-ext | 400 | `instrument-serif-italic-latin-ext-d0014821.woff2` | 12.1 KiB |
| Instrument Serif | italic | latin | 400 | `instrument-serif-italic-latin-5a51946d.woff2` | 21.6 KiB |
| Instrument Serif | normal | latin-ext | 400 | `instrument-serif-normal-latin-ext-290e6267.woff2` | 11.3 KiB |
| Instrument Serif | normal | latin | 400 | `instrument-serif-normal-latin-5eb09b5a.woff2` | 20.5 KiB |

Total: 8 files, 148.3 KiB.

## Licence

- **Instrument Sans**: SIL Open Font License 1.1, text in `OFL-instrument-sans.txt`
- **Instrument Serif**: SIL Open Font License 1.1, text in `OFL-instrument-serif.txt`

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
node scripts/fetch-theme-fonts.mjs canonical
```

The script asks `https://fonts.googleapis.com/css2` with a modern User-Agent for
exactly the families, axes and weights this theme used before it was
self-hosted, downloads each `latin`/`latin-ext` file, names it after a hash of
its bytes (so a changed file gets a new URL and can be cached for a year), and
rewrites `src/styles/fonts.css`. It needs the network once, when it is run, and
never when a site is built, tested or served.
