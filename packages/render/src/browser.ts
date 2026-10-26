/**
 * The part of this package a browser can load: design-token specs, colour and
 * contrast arithmetic, the web-font catalogue and the documentation Markdown
 * renderer. None of them imports anything.
 *
 * The admin used to import the package root, which also re-exports the image
 * pipeline; its lazy `import('wasm-vips')` made the admin's build emit a 5 MB
 * WebAssembly file that `@cogenta/cli` then published, though no browser ever
 * resizes an image.
 */
export * from './docs/markdown.js'
export * from './skin/color.js'
export * from './skin/tokens.js'
export * from './skin/web-fonts.js'
