---
'create-cogenta': patch
---

The `association` blueprint now scaffolds a neighbourhood charity run from an
old library in a northern English town: a Thursday food bank, a homework club,
a community garden and a winter coat bank, with 312 volunteers and two
part-time staff. The site is named after the organisation the person typed, in
its copy, its volunteer's story and its email addresses.

The home page opens on a photograph of the volunteers with the statement of
the cause and two actions (donate, volunteer), then last year's figures with a
sentence of context each, the four programmes, the next four events, a
volunteer's story with her photograph, where each pound goes, a monthly-gift
band that says what £5, £12 and £30 pay for, the partners' wordmarks and the
questions people ask. New pages: what we do, events, volunteer with us, ways to
give, where the money goes, our story (history, trustees, staff, partners),
contact us and privacy.

Nothing takes a payment, and nothing pretends to. Ways to give explains a
standing order set up with the donor's own bank from details the treasurer
sends, cheques and cash, Gift Aid, payroll giving and gifts in wills, with an
email and a telephone number. Volunteering is an email, a call or the next
orientation evening, which is a real event page.

The `event` collection gains `endsAt`, `address`, `cost` and `booking`; a new
`programme` collection (`/what-we-do/:slug`) carries a schedule, place,
audience, cost and contact. Six events are dated one to six weeks after the
site is created, each with a page of its own. The footer is seeded in three
headed columns and its note carries the registered charity number, the
address, the telephone number and the site's own email address; comments are
closed. The telephone number is in the range reserved for drama. The starting
skin matches `@cogenta/theme-association` (Bricolage Grotesque and Source
Sans 3, paper, ink and a deep green).

The photographs were checked at full size: invented lettering on T-shirts,
caps, boxes and signs was retouched or cropped out, the river clean-up picture
and the food drive picture with printed packaging were dropped, and the
procedural gallery, avatar and partner marks are replaced by a volunteer's
portrait crop and six partner wordmarks rendered from OFL typefaces.
