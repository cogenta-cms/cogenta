---
"@cogenta/import": patch
---

The WordPress import keeps bold, italic and inline code. A closing `</strong>`, `</em>` or `</code>` removed the mark before the words it wrapped were written out, so every imported article lost its emphasis; a stray closing tag could also remove the wrong mark.
