# Fonts of `@cogenta/theme-association`

Served by the site itself at `/_cogenta/fonts/association/<file>`. A page of this
theme makes **no request to a font provider**.

| Family | Style | Subset | Weight | File | Size |
|---|---|---|---|---|---|
| Bricolage Grotesque | normal | latin-ext | 200 800 (width 75% 100%) | `bricolage-grotesque-normal-latin-ext-e1a04c16.woff2` | 52.3 KiB |
| Bricolage Grotesque | normal | latin | 200 800 (width 75% 100%) | `bricolage-grotesque-normal-latin-a756882d.woff2` | 128.5 KiB |
| Source Sans 3 | italic | latin-ext | 200 900 | `source-sans-3-italic-latin-ext-6fe10a66.woff2` | 58.1 KiB |
| Source Sans 3 | italic | latin | 200 900 | `source-sans-3-italic-latin-5fbc14d5.woff2` | 27.8 KiB |
| Source Sans 3 | normal | latin-ext | 200 900 | `source-sans-3-normal-latin-ext-a85a7459.woff2` | 58.7 KiB |
| Source Sans 3 | normal | latin | 200 900 | `source-sans-3-normal-latin-19143dca.woff2` | 28.2 KiB |

Total: 6 files, 353.6 KiB.

## Licence

- **Bricolage Grotesque**: SIL Open Font License 1.1, text in `OFL-bricolage-grotesque.txt`
- **Source Sans 3**: SIL Open Font License 1.1, text in `OFL-source-sans-3.txt`

The OFL permits bundling and redistributing these files with this package, as
long as the licence text travels with them (it does) and the fonts are not sold
on their own.

**Reserved Font Names.** Source Sans 3 declares "Source". The
files are subsets of the upstream fonts, as the Google Fonts
`css2` API serves them under the family's own name (the same files every web-font
distribution of these families ships); no outline was redrawn and nothing was renamed. A strict
reading of OFL 1.1 section 3 may treat a subset as a Modified Version, so a
legal review of this point belongs to the maintainers.

## Source and subsets

The files are the variable WOFF2 builds that the Google Fonts `css2` API
serves, taken from the `google/fonts` open-source repository's distribution.
Only the `latin` and `latin-ext` subsets are kept: together they cover
French (œ Œ ’ « » and every accented capital), the other Western European
languages, and the euro sign. A language written in another script falls back to
the next family of the theme's stack.

## How they were fetched

```sh
node scripts/fetch-theme-fonts.mjs association
```

The script asks `https://fonts.googleapis.com/css2` with a modern User-Agent for
exactly the families, axes and weights this theme used before it was
self-hosted, downloads each `latin`/`latin-ext` file, names it after a hash of
its bytes (so a changed file gets a new URL and can be cached for a year), and
rewrites `src/styles/fonts.css`. It needs the network once, when it is run, and
never when a site is built, tested or served.
