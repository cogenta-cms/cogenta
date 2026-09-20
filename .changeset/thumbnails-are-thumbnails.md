---
'@cogenta/cli': minor
---

Let the media library ask for a thumbnail instead of the whole upload.

`<img src>` cannot carry a bearer token, so the admin fetches media bytes
through `/api/media/{id}/file` and hands the grid an object URL — the reason
that route stays authenticated rather than the file being made public. What
it fetched was the full-resolution original, every time: 5.6 MB for
twenty-five tiles on a real site, with the 320px renditions already sitting
in storage beside them and never read.

The route now accepts `?w=`, answering with the stored rendition of that
width when there is one and the whole file when there is not — it never
renders on demand, for the same reason the public `/_image` never does. The
width is ignored alongside `?original=1`, whose point is the untouched file
the image editor works from.

Both endpoints now pick the rendition through one `storedVariantFor`, so the
public and authenticated paths cannot drift about which widths exist.
