# Images of the `documentation` blueprint

Where the files in `src/blueprints/assets/photos/documentation/` come from, so
they can be checked or made again.

## Photographs

None. A documentation site needs diagrams and code, not photography, and a
decorative picture on the home page would only push the search field down.
Because nothing here is a photograph, there is no photo credits page to seed
and no licence to attribute; `test/documentation-blueprint-fr.test.ts` fails
if a file other than the two diagrams below appears in the folder, so a
photograph added later cannot arrive without a credit.

## Drawn for the blueprint

- `delivery-flow-fr.png` and `delivery-flow-en.png`: `delivery-flow.html`
  (`?lang=fr|en`), rendered by `render.mjs` with Playwright against a Chrome
  started with `--remote-debugging-port` (`node render.mjs <port>`). 588 × 448
  CSS pixels at a device scale factor of 3.5, flat colours on white, no
  gradient (the design rule every theme of this project keeps). It is drawn
  narrow and with large type on purpose: it is shown in a 340 px column on a
  phone and must stay readable. The hosts (`hooks.tessera.com`, ...) are
  invented and the picture carries no product name, so it stays true whatever
  the site is called. Typefaces: IBM Plex Sans and IBM Plex Mono (SIL Open
  Font License), loaded from Google Fonts while rendering.
