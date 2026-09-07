// A stand-in for a theme's `theme.render.*` — proves `runIsolatedModule`'s
// real deliverable: an `HtmlElement`-shaped plain tree survives the worker
// boundary, and a call to a host-bound "RenderContext" method (`t`,
// `content.entry`) round-trips through the callback RPC before the tree is
// built, exactly the way a real theme's `renderPage` would call `ctx.t()`
// or `ctx.content.entry()` mid-render.
export async function renderPage(title, callbacks) {
  const translated = await callbacks.t('greeting')
  const entry = await callbacks['content.entry']('article', 'welcome')
  return {
    tag: 'main',
    attrs: { class: 'cg-main' },
    children: [
      { tag: 'h1', attrs: {}, children: [title] },
      { tag: 'p', attrs: {}, children: [translated] },
      { tag: 'p', attrs: {}, children: [entry.title] },
    ],
  }
}
