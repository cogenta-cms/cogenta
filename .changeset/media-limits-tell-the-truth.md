---
'@cogenta/api': minor
---

Answer `GET /api/media/-/limits` with the image rule the ingest actually applies.

`acceptedMimeTypes` has always been a hint: configurable, reported, and
enforced by nothing. The upload screen printed it as a closed list of accepted
types, while a `.txt`, a `.docx` and a CSV all uploaded fine and none of them
was on it — deliberately, since a media library has every reason to hold them.

The response gains `imageMimeTypes`, derived from the byte sniffer that
decides an image's real type rather than from a list kept in step by hand, so
the two cannot drift. `acceptedMimeTypes` is unchanged and still sent, for
callers that already read it.
