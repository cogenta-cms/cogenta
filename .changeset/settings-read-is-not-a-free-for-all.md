---
'@cogenta/schema': minor
'@cogenta/api': minor
---

Stop `GET /api/settings` handing the whole registry to anybody who asks.

The route answered an unauthenticated caller with all sixty-four settings,
including `general.adminEmail`, `discussion.notifyEmail`, `seo.indexNowKey`,
`seo.googleSiteVerification`, `seo.bingSiteVerification`,
`updates.autoUpdatePolicy` and the channel bot names. Reproduced on a freshly
scaffolded site with no token at all.

Public read was a deliberate choice, and its stated reason is what bounds it:
"the values here feed a page's own render … an anonymous visitor has to see
the same thing the theme does". A tagline does. An administrator's email
address does not. So the rule is applied rather than assumed: **a setting is
publicly readable when its value is already visible on the public site.**

`@cogenta/schema` gains `PUBLIC_READ_SETTING_KEYS` and
`isPubliclyReadableSetting`, listed beside the registry they describe so the
whole public surface can be reviewed in one place — nineteen keys: the page
chrome, date formatting, the home path and page size, whether comments are
open, the cookie banner, the currency, and the white-label mark. Unlisted
means private, so a setting added without thinking about this is closed
rather than open. A signed-in caller still receives everything.

**Breaking for an anonymous reader of this route.** The only one in this
repository is the admin login screen, which needs the site's name and its
white-label branding so a rebranded site does not say "Cogenta" on the way
in; all three keys are public. A headless client that read other settings
without a token now needs one.

Verified end to end against a running site: nineteen settings anonymously,
sixty-four with an admin token, none of the named keys in the anonymous
answer.
