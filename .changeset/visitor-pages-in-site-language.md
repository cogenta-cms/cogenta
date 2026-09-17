---
'@cogenta/theme-kit': minor
'@cogenta/comments': patch
'@cogenta/cli': patch
'@cogenta/theme-canonical': patch
'@cogenta/theme-association': patch
'@cogenta/theme-blog': patch
'@cogenta/theme-docs': patch
'@cogenta/theme-ecommerce': patch
'@cogenta/theme-entreprise': patch
'@cogenta/theme-magazine': patch
'@cogenta/theme-portfolio': patch
'@cogenta/theme-restaurant': patch
'@cogenta/theme-saas': patch
---

Comments, public forms and search speak the site's language

The comment section and its form were English on every site: `renderCommentsSection`
now reads every word from `THEME_STRINGS` (French and English), writes dates in
the page's language, accepts the page's own translator (`t`) and shows what
became of a comment just sent (`notice`: published, awaiting review, or why it
failed). `commentNoticeFor` reads that from the redirect; a comment held as spam
reads as awaiting review, and a tripped honeypot only as a failure.

`@cogenta/comments` sends a no-JavaScript submission back to `#cg-comments`,
where the notice is. `cogenta serve` passes the notice and the page translator,
and writes `/forms/{name}` and `/search` in the site's language: buttons, field
errors, and refusals chosen by error code rather than the API's English message.
Every theme styles the notice as it styles a form's message.
