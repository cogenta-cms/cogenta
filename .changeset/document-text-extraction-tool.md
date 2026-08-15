---
'@cogenta/core': minor
'@cogenta/agents': minor
---

Document text extraction, as a contract C tool (L19 task 1). `@cogenta/agents`
gains `document.extract_text` and the `extractDocumentText` function behind it:
PDF, DOCX, Markdown and plain text in, plain text out. Format detection reads
the bytes rather than the extension, since a brief emailed as `.pdf` is often
really a `.docx`.

No new dependency, on purpose (R9/R10). A `.docx` is a ZIP whose
`word/document.xml` holds the body, and `node:zlib` already opens it — the
~120 lines of central-directory reading here replace a callback-era unzip
library. The PDF reader walks content streams and their text-showing
operators (`Tj`, `TJ`, `'`, `"`) instead of pulling in `pdf.js` through
`pdf-parse`.

It refuses rather than guesses, which is the part that matters downstream: a
scan with no text layer is `DOCUMENT_NO_TEXT_LAYER`, an encrypted PDF says so,
a legacy binary `.doc` is named as such, and — calibrated against real
LaTeX-exported specifications — a PDF whose text layer is subset-font glyph
indices is refused too, rather than passing mojibake on to an agent that would
happily build a confident, entirely invented site plan from it. Footnotes and
endnotes of a `.docx` are appended rather than dropped, and an embedded image
produces a warning saying any requirement written inside it was not read.

`@cogenta/core` gains the error codes this needs
(`DOCUMENT_FORMAT_UNSUPPORTED`, `DOCUMENT_TOO_LARGE`,
`DOCUMENT_EXTRACTION_FAILED`, `DOCUMENT_NO_TEXT_LAYER`) plus the ones L19's
later tasks use.

Contract C moves to `tools@1.1`: the permission taxonomy gains
`document.extract`. No existing tool signature changes.
