---
'@cogenta/theme-portfolio': patch
---

Speak French on a French page, down to the quotation marks.

The quote block and the quote widget used English curly quotes whatever the language of the page. On a page whose language is French they now open with `«` and close with `»`, each with a no-break space inside, as French typography asks. The "Primary" and "Footer" names that a screen reader announces for the header and footer navigation are now "Navigation principale" and "Pied de page" there. Pages in other languages are unchanged.
