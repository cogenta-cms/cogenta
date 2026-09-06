---
'@cogenta/commerce': patch
---

`POST /api/commerce/payment/drivers/:name/test-connection` — the back office's "test connection" probe against a live payment driver — required only `commerce.read`, meaning any signed-in `viewer` could trigger a real `driver.init()`/`health()` call against the site's configured payment credentials on demand. No secret value ever leaked (the response is only `ok`/`message`), but probing a payment gateway live is a money-adjacent action, not a read. It now requires `commerce.payment.settle`, the same permission already gating other money-touching operations — reused rather than adding a seventh permission for one button, matching this package's deliberately coarse six-permission model. `GET .../drivers` (listing configured/testMode status, no probe) is unchanged and still only needs `commerce.read`.
