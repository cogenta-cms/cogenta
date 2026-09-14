---
'create-cogenta': patch
---

The `store` blueprint now scaffolds the shop of a small brand of durable
everyday goods with a shop and a repair bench in Lisbon. It sells twelve
products from the workshops it buys from (a field jacket, a canvas shoulder
bag, a porcelain pour-over set, a striped wool blanket and eight more), each
with a price in euros, stock, material, dimensions, origin, care, a delivery
note, two paragraphs on how it is made, and an order link that emails the shop
with the product in the subject line. Two are sold out.

Products are grouped in four categories (Wear, Carry, Kitchen, Living), now a
small `category` collection routed at `/category/:slug`, each with a
photograph, a summary, its goods and a note on its makers. Product pages list
more from the same category. The home page opens on a full-width photograph,
then the categories, the season's four newest pieces, a line of commitments,
the brand's story beside a photograph, a customer's letter, questions before
ordering and a line about the workshop's letters. New pages: shop, about, how
to order, delivery and returns, repairs, contact, and terms and privacy.

The copy names the site it was created for, and the email addresses are
derived from that name. The footer note gives the address and company
registration, comments are closed on the catalogue, and the starting skin
matches `@cogenta/theme-ecommerce` (Albert Sans, sand and ink, one terracotta).

The bundled photographs are retouched to remove invented lettering from the
labels and cards, a floating shadow, a mannequin and three objects from the
banner that are not in the catalogue. Six files are renamed after the products
they show. The procedural testimonial avatar and the five placeholder marks
are no longer seeded.
