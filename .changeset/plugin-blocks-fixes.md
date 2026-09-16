---
'@cogenta/plugins': minor
'@cogenta/cli': minor
---

Three fixes to the blocks and widgets a plugin provides

**Uninstalling a plugin now really degrades a page instead of emptying it.** It
did not: once the plugin was gone, nothing knew what its block had been or what
to fall back on, so the block vanished along with the words someone wrote in it
— while the release notes said otherwise. A site now records what each plugin
declares (`cogenta_plugin_provisions`, `createPluginProvisionStore`), and a type
whose plugin is no longer installed stays registered: the content still
validates, the page can still be saved, and the renderer still finds the
fallback the manifest named.

**A page's plugin blocks render with bounded overlap** rather than one process
start after another — four at a time, deliberately under the runtime's ceiling
of eight so one page cannot spend the whole site's budget on itself.

**A plugin can ship a stylesheet** (`provides.styles`), static CSS from its
package served from the site's own origin under the file's digest. A block
nobody can style was half a feature. `checkPluginStylesheet` is exported so a
plugin author's test runs the host's own rules: no `@import`, no `url()` that is
not an inline image (a URL in a selector is how CSS becomes an exfiltration
channel), no script under another name. Comments are stripped first — found by
this project's own example being refused for documenting the rule it follows.

**`cogenta plugin check` now says what a plugin adds** — its blocks and what each
degrades to, its widget types, and whether its stylesheet would be served. Run
against this repository's own example it immediately found a block that would
vanish on uninstall, which is why a `prose` fallback with no field mapping now
keeps the block's own text as paragraphs rather than nothing.
