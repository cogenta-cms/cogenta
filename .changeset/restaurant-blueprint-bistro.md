---
'create-cogenta': patch
---

The `restaurant` blueprint now scaffolds a contemporary bistro in a former
silk-weaving workshop on the slopes of the Croix-Rousse in Lyon. Its menu has
nineteen dishes and wines for a week in early autumn, in four sections
(starters, mains, cheese and desserts, wine by the glass), each with a price in
euros, a description, where it comes from, allergens, a wine to drink with it
where it has one, a vegetarian flag and a note from the kitchen or the cellar.
Each dish page lists the rest of its section.

The home page opens on the dining room with the restaurant's own name and one
"Reserve a table" link, then a short welcome, the week's menu with its prices,
a band of four dish photographs, the kitchen's story, a press quote, the hours
and address, the private room and how to book. New pages: menu (with set menus
and allergy notes), our story (the room, the kitchen, the wine, the suppliers),
reservations, private dining, hours and address, and the legal notice. There is
no booking engine and nothing pretends to be one: the reservations page says
how booking works (telephone hours, an email answered the same day, the
counter kept for guests without a booking, deposits for groups, cancelling),
and its actions are a telephone link and an email link.

The copy names the site it was created for, and the email addresses are
derived from that name. The footer note is the address card with the hours,
comments are closed on the menu, and the starting skin matches
`@cogenta/theme-restaurant` (Cormorant Garamond and Karla, cream and charcoal,
one brass).

The `menu_item` collection gains `currency`, `vegetarian`, `sourcing`,
`pairing`, `allergens` and a `blocks` zone, and its sections are renamed. The
dish photographs are cropped to one 4:5 ratio and renamed after the dishes they
show; the crème brûlée, the two wine glasses and the glass of water are no
longer bundled, and the procedural gallery shots and testimonial avatar are no
longer seeded.
