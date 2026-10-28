# Fonts of `@cogenta/theme-blog`

Served by the site itself at `/_cogenta/fonts/blog/<file>`. A page of this
theme makes **no request to a font provider**.

| Family | Style | Subset | Weight | File | Size |
|---|---|---|---|---|---|
| Sofia Sans Condensed | normal | latin-ext | 500 900 | `sofia-sans-condensed-normal-latin-ext-91741065.woff2` | 18.1 KiB |
| Sofia Sans Condensed | normal | latin | 500 900 | `sofia-sans-condensed-normal-latin-a9b02e43.woff2` | 40.3 KiB |
| Hanken Grotesk | italic | latin-ext | 400 700 | `hanken-grotesk-italic-latin-ext-8f7c62f4.woff2` | 19.9 KiB |
| Hanken Grotesk | italic | latin | 400 700 | `hanken-grotesk-italic-latin-bb432642.woff2` | 34.8 KiB |
| Hanken Grotesk | normal | latin-ext | 400 700 | `hanken-grotesk-normal-latin-ext-768af292.woff2` | 19.1 KiB |
| Hanken Grotesk | normal | latin | 400 700 | `hanken-grotesk-normal-latin-e9201edd.woff2` | 33.9 KiB |
| Geist Mono | normal | latin-ext | 400 600 | `geist-mono-normal-latin-ext-1a189eb9.woff2` | 14.4 KiB |
| Geist Mono | normal | latin | 400 600 | `geist-mono-normal-latin-684ad5b5.woff2` | 22.6 KiB |

Total: 8 files, 203.0 KiB.

## Licence

- **Sofia Sans Condensed**: SIL Open Font License 1.1, text in `OFL-sofia-sans-condensed.txt`
- **Hanken Grotesk**: SIL Open Font License 1.1, text in `OFL-hanken-grotesk.txt`
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
node scripts/fetch-theme-fonts.mjs blog
```

The script asks `https://fonts.googleapis.com/css2` with a modern User-Agent for
exactly the families, axes and weights this theme used before it was
self-hosted, downloads each `latin`/`latin-ext` file, names it after a hash of
its bytes (so a changed file gets a new URL and can be cached for a year), and
rewrites `src/styles/fonts.css`. It needs the network once, when it is run, and
never when a site is built, tested or served.
