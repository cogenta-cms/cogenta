// The plugin's actual runtime code — what runs INSIDE the isolated worker,
// via `runPlugin` (`@cogenta/plugins`). Read docs/guide-plugin.md "Comment le
// code s'exécute" before assuming this looks like a normal Node module: it
// does not. There is no `import` and no `require`. The host reads this file —
// the one the manifest's `main` names, `plugin.js` by default — and the
// sandbox runs it as a classic (non-module) script with exactly one real
// global: `sdk`, built with only the methods the granted capabilities allow
// (`sdk.content`, `sdk.storage` here — nothing else exists on it, not even a
// present-but-refusing stub).
//
// The script's own completion value is the set of handlers the plugin
// exposes. The host calls exactly one of them by name, with a payload
// (`cogenta plugin run <name> --invoke greet --input '{"id":"welcome"}'`),
// and awaits what it returns. Only plain data survives the trip back: no
// function, no class instance.
//
// A classic script has no top-level `await` — do async work inside a
// handler, which may be `async`, rather than around this object.

// A block and a widget this plugin adds to a site (L32) are rendered by the
// two handlers below. They return a TREE, never a string of HTML: the host
// checks every tag and attribute against an allowlist before the markup
// reaches a page, so a `<script>` or an `onclick` is refused outright rather
// than escaped into something else. These two helpers are the whole of what
// building one takes.
const el = (tag, attrs, children) => ({
  kind: 'element',
  tag,
  attrs: attrs ?? {},
  children: children ?? [],
})
const txt = (value) => ({ kind: 'text', value: String(value ?? '') })

;({
  /**
   * The `callout` block the manifest declares. `input.values` holds exactly
   * the fields it declared; nothing else is granted, and nothing else is
   * needed.
   */
  onRenderBlock: (input) =>
    el('aside', { class: `cg-callout cg-callout--${input.values.tone ?? 'info'}` }, [
      el('p', {}, [txt(input.values.message)]),
    ]),

  /** And the `keyFigure` widget, drawn wherever a person placed it. */
  onRenderWidget: (input) =>
    el('div', { class: 'cg-key-figure' }, [
      el('strong', { class: 'cg-key-figure__value' }, [txt(input.values.value)]),
      txt(' '),
      el('span', { class: 'cg-key-figure__caption' }, [txt(input.values.caption)]),
    ]),

  /** Reads one entry and records that it ran, in its own storage prefix. */
  greet: async (input) => {
    const entry = await sdk.content.read({ id: input.id })
    await sdk.storage.write({
      key: 'plugins/plugin-starter/last-run.json',
      content: JSON.stringify({ ranAt: new Date().toISOString(), readTitle: entry?.title ?? null }),
    })
    return `Hello from @example/plugin-starter — read "${entry?.title ?? 'nothing'}".`
  },
})
