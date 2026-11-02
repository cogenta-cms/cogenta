---
"@cogenta/export": patch
---

`openZip` checks the sizes and offsets an archive declares against the file before it allocates or reads anything, so a crafted central directory, entry count or entry size is refused with `EXPORT_FORMAT_INVALID` instead of exhausting memory; `openZip(path, { maxEntries })` lets a caller lower the entry cap.
