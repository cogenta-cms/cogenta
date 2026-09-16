---
'@cogenta/blocks': minor
'@cogenta/plugins': minor
'@cogenta/widgets': minor
'@cogenta/theme-kit': minor
'@cogenta/cli': minor
---

A plugin can provide a widget type, not only a block

`provides.widgets` declares a type and the settings it holds, the same way
`provides.blocks` declares a block. Deliberately without a fallback, unlike a
block: a widget is chrome, not content — one that cannot render is simply not
drawn, its settings stay in the database, and reinstalling the plugin brings it
back exactly as it was.

`@cogenta/widgets` accepts `extraTypes` on the store and on
`validateWidgetSettings`: a type a plugin provides is validated against the
schema that plugin declared, and a type nothing can render is still refused —
the store must never hold a widget no one can draw.

`@cogenta/theme-kit`'s `ResolvedWidget` gains a member carrying markup the host
already produced (contract D `theme@1.7`, same bump as the blocks). Every theme
gets it for free: widget areas are rendered by `renderWidgetArea`, which lives
here rather than in each theme. The section still carries the plugin's own type
name in its class, so a theme styles `cg-widget--openingHours` like any other.

`@cogenta/blocks` gains `declaredObjectSchema`, the settings-object counterpart
of `blockSchemaFromDeclaration`.
