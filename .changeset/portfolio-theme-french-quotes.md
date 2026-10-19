---
'@cogenta/theme-portfolio': patch
---

Set a quotation in French guillemets on a French site.

The quote block and the quote widget used English curly quotes whatever the language of the page. On a page whose language is French they now open with `«` and close with `»`, each with a no-break space inside, as French typography asks. Pages in other languages are unchanged.
