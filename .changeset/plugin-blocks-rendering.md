---
'@cogenta/theme-kit': minor
'@cogenta/theme-canonical': minor
'@cogenta/theme-blog': minor
'@cogenta/theme-docs': minor
'@cogenta/theme-association': minor
'@cogenta/theme-ecommerce': minor
'@cogenta/theme-entreprise': minor
'@cogenta/theme-magazine': minor
'@cogenta/theme-portfolio': minor
'@cogenta/theme-restaurant': minor
'@cogenta/theme-saas': minor
'@cogenta/cli': minor
---

A block a plugin provides is rendered on the page

Contract D grows one optional field, `RenderContext.blockNodes` (`theme@1.7`):
markup the host already produced, keyed by the block's contract B `_key`. A
theme honours it with one line — `providedBlockNode(block, ctx)` — and a theme
that does not is not broken: it renders the block's declared fallback, which
is the degradation contract B has promised since L3. The ten themes in this
repository honour it.

`cogenta serve` runs a plugin's `onRenderBlock` handler in the
permission-restricted child process, with exactly the capabilities that plugin
was granted, and checks the tree it returns against a tag and attribute
allowlist before it reaches a page: no `script`, no `on*`, no `javascript:`,
bounded depth, node count and text. A plugin that throws, times out or returns
something else degrades to its fallback — the page is never defaced and never
emptied.

Rendered trees are cached against the plugin, its version, the block type, the
stored values and the locale, so a block is not a forked process per visit.
`PluginRuntime` gains `invokeHandler`, so this runs under the same concurrency
ceiling, grants and disable-on-violation policy as a plugin route.
