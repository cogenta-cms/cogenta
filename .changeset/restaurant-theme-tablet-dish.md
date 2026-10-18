---
'@cogenta/theme-restaurant': patch
---

Fix how a dish page is laid out on a tablet, and give a figure's unit some air.

Between 640 and 1023 px a dish's photograph stacked above its words as a full-width 4:5
portrait, 940 px tall on a 820 px screen, so the price and the details started below the
fold. The photograph now sits beside the words from 640 px up, as it already did from
1024 px. On wider screens the photograph and the words now align on their top edge
instead of centring on each other, which left the photograph floating below the section
label whenever the words were the taller column. A unit beside a figure (`100 km`) was
set 0.08 em from its number and read as `100km`; it now keeps 0.18 em.
