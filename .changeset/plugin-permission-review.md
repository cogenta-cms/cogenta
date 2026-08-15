---
'@cogenta/plugins': minor
'@cogenta/admin': minor
---

L7 task 8: "Révision et révocation de permissions après installation."

`@cogenta/plugins` gains `listGrantedCapabilities`/`revokeCapability`/
`describePendingApproval` (`permissions/review.ts`) — real post-install
review functions assembled entirely from task 5's `PluginGrantStore`/
`resolveGrantedCapabilities`/`detectCapabilitiesNeedingApproval` and task
7's `describeCapability`, no new persistence or translation logic.
`revokeCapability` proves the end-to-end property that matters: after
revocation, `resolveGrantedCapabilities` genuinely excludes the capability
(the SDK method becomes absent again, not merely "marked revoked").

`@cogenta/admin` gains `PluginGrantedPermissions` — the already-installed
counterpart to task 7's install-time `PluginPermissionReview`, listing
current grants with a real revoke action per item, plus a clearly
separated "new permissions requested" section (reusing
`PluginPermissionReview` itself) when a plugin update declares a
capability beyond what's already granted. No live plugin-list screen
exists yet (tasks 12/13) — this is the real, tested, prop-driven
component that screen will render.
