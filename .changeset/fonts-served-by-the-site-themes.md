---
'@cogenta/theme-association': minor
'@cogenta/theme-blog': minor
'@cogenta/theme-canonical': minor
'@cogenta/theme-docs': minor
'@cogenta/theme-ecommerce': minor
'@cogenta/theme-entreprise': minor
'@cogenta/theme-magazine': minor
'@cogenta/theme-portfolio': minor
'@cogenta/theme-restaurant': minor
'@cogenta/theme-saas': minor
---

Ship the fonts with the theme instead of fetching them from Google.

Every theme loaded its typefaces with an `@import` to `fonts.googleapis.com`, which sent
the IP address of every visitor to Google before any consent — a practice the regional
court of Munich held unlawful under the GDPR (LG München I, 20 January 2022, 3 O 17493/20).

Each theme package now carries its faces in `fonts/` (WOFF2, Latin and Latin Extended
subsets, variable fonts where the family has one, SIL Open Font License text and a
`README.md` next to the files) and declares them in `src/styles/fonts.css`, which
`theme.css` imports where the remote `@import` used to be. The families, weights, widths
and italics are exactly the ones each theme asked Google for, so the typography does not
change: before and after screenshots of the entreprise, blog and magazine themes are
identical pixel for pixel.

The `@font-face` rules point at `/_cogenta/fonts/<theme>/<file>`, which `cogenta serve`
(`@cogenta/cli`) answers from the package. **Update `@cogenta/cli` with the theme**: an
older `cogenta serve` does not know that route and the page falls back to the next family
of its font stack. The package now publishes `fonts/` and exports `./fonts/*.woff2` and
`./fonts/manifest.json`.
