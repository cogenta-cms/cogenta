---
'create-cogenta': patch
---

A blueprint's demo content can now name the business the person is actually
creating: `SeedContext` carries the site name given at install
(`siteName`, optional), so seeded copy no longer has to refer to a fictional
company whose name matches nothing on the site.

Bundled demo assets can also be PNG files (a wordmark, an interface mock), not
only JPEG photographs: `seedDemoMedia` now labels each asset by its bytes.
