# Fonts of `@cogenta/theme-docs`

Served by the site itself at `/_cogenta/fonts/docs/<file>`. A page of this
theme makes **no request to a font provider**.

| Family | Style | Subset | Weight | File | Size |
|---|---|---|---|---|---|
| IBM Plex Sans | italic | latin-ext | 100 700 (width 100%) | `ibm-plex-sans-italic-latin-ext-bf44b77c.woff2` | 33.1 KiB |
| IBM Plex Sans | italic | latin | 100 700 (width 100%) | `ibm-plex-sans-italic-latin-4363757d.woff2` | 49.0 KiB |
| IBM Plex Sans | normal | latin-ext | 100 700 (width 100%) | `ibm-plex-sans-normal-latin-ext-d160e209.woff2` | 30.2 KiB |
| IBM Plex Sans | normal | latin | 100 700 (width 100%) | `ibm-plex-sans-normal-latin-e2291e84.woff2` | 44.6 KiB |
| IBM Plex Mono | italic | latin-ext | 400 | `ibm-plex-mono-italic-latin-ext-1b07eee6.woff2` | 14.2 KiB |
| IBM Plex Mono | italic | latin | 400 | `ibm-plex-mono-italic-latin-0840095f.woff2` | 16.1 KiB |
| IBM Plex Mono | normal | latin-ext | 400 | `ibm-plex-mono-normal-latin-ext-6bc0f226.woff2` | 13.0 KiB |
| IBM Plex Mono | normal | latin | 400 | `ibm-plex-mono-normal-latin-08949f72.woff2` | 14.4 KiB |
| IBM Plex Mono | normal | latin-ext | 500 | `ibm-plex-mono-normal-latin-ext-6bb06407.woff2` | 13.1 KiB |
| IBM Plex Mono | normal | latin | 500 | `ibm-plex-mono-normal-latin-01d28544.woff2` | 14.5 KiB |
| IBM Plex Mono | normal | latin-ext | 600 | `ibm-plex-mono-normal-latin-ext-32057cf5.woff2` | 14.0 KiB |
| IBM Plex Mono | normal | latin | 600 | `ibm-plex-mono-normal-latin-0d1f0b8d.woff2` | 15.3 KiB |

Total: 12 files, 271.5 KiB.

## Licence

- **IBM Plex Sans**: SIL Open Font License 1.1, text in `OFL-ibm-plex-sans.txt`
- **IBM Plex Mono**: SIL Open Font License 1.1, text in `OFL-ibm-plex-mono.txt`

The OFL permits bundling and redistributing these files with this package, as
long as the licence text travels with them (it does) and the fonts are not sold
on their own.

**Reserved Font Names.** IBM Plex Sans declares "Plex"; IBM Plex Mono declares "Plex". The
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
node scripts/fetch-theme-fonts.mjs docs
```

The script asks `https://fonts.googleapis.com/css2` with a modern User-Agent for
exactly the families, axes and weights this theme used before it was
self-hosted, downloads each `latin`/`latin-ext` file, names it after a hash of
its bytes (so a changed file gets a new URL and can be cached for a year), and
rewrites `src/styles/fonts.css`. It needs the network once, when it is run, and
never when a site is built, tested or served.
