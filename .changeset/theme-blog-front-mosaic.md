---
"@cogenta/theme-blog": minor
---

The front (an untitled grid listing) is now a news mosaic when its lead story has a picture: the lead and four tiles, each picture over a flat ink band carrying the topic as a chip, the headline and the date. The lead picture is the page's first paint (eager, high priority), and a page that opens on the front keeps its title for screen readers and search engines without printing it above the stories.

Fixes: a hero with a picture no longer grows taller than the screen with a long headline (the picture sets the height, the headline is sized for its column); a list row's picture frame no longer stretches to the row's height; a rail with a single story sets its picture beside the words instead of full width.
