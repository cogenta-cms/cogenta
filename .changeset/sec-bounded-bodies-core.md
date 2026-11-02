---
"@cogenta/core": patch
---

New `readBoundedBody` / `readBoundedText` helpers read the body of a response someone else controls as a stream: bytes are counted as they arrive, the transfer is cancelled at the limit (throwing `HTTP_BODY_TOO_LARGE` or truncating, as asked), and a deadline and the caller's abort signal stay active until the last byte. Adds the error codes `HTTP_BODY_TOO_LARGE`, `HTTP_BODY_TIMEOUT` and `HTTP_BODY_ABORTED`.
