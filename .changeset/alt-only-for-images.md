---
'@cogenta/core': patch
---

Ask for alt text on an image, not on every file.

Uploading a PDF, a spreadsheet or a `.txt` without alt text was refused with
"Alt text is required unless the image is marked decorative", advising the
uploader to "describe what the image shows". None of those has an `alt`
anywhere in its rendering, so the rule asked for something that could not be
used and the message described a file that was not there.

The requirement now applies to `kind: 'image'`. A description given for a
document is still stored; it is simply no longer demanded.
