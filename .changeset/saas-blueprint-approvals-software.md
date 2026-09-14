---
'create-cogenta': patch
---

The `saas` blueprint now scaffolds the marketing site of a B2B product for
finance and operations teams: spend approvals, an audit log that cannot be
rewritten, ERP sync, SSO and SCIM, spend reporting and an API. The product is
named after the site (falling back to "Ledgerline"), and its email addresses
are derived from that name.

The home page opens on a screenshot of the approvals queue, then a strip of
six customer wordmarks, the six capabilities, how a request moves through the
product in three steps, a tour of three features with their screenshots,
figures with their units, one customer's words, the plans compared in a
table, questions finance teams ask, and a closing call to action. New pages:
product, pricing (with billing questions), security (hosting, access, the
audit log, subprocessors), changelog, company, book a demo, legal and
privacy.

There is no signup or billing system behind the site and nothing pretends to
be one: "Book a demo", "Start a trial" and "Talk to sales" lead to a page that
explains how a solutions engineer sets up a 14-day trial with your own
approval policy, with an email link and a telephone link.

The `feature` collection gains a `blocks` zone, so each feature has a page of
its own, and a new `changelog` collection holds six dated product updates. The
footer menu is seeded in four headed columns (Product, Company, Resources,
Legal) with the demo content; the header menu no longer links to pages that do
not exist. Comments are closed and the starting skin matches
`@cogenta/theme-saas` (Geist and Geist Mono, white and grey, one blue).

Pictures: seven interface screenshots (the approvals queue, the policy editor,
the audit log, the ERP connection, sign-in and provisioning, the time-to-approve
report, the API and webhooks settings) and six customer wordmarks, all rendered
once with OFL typefaces and bundled as PNG files. The photograph of people
around laptops is no longer bundled, and the procedural product visual,
feature covers and avatars are no longer seeded; the one customer portrait is
kept.
