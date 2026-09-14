/**
 * The one date format of this theme — `Intl`'s long date, in the page's own
 * language — shared by the collection list, the term archive and the entry
 * header (`renderEntryHeader` formats the same way), so a date reads alike on
 * every page. An invalid locale or date falls back to the ISO day, a true
 * answer rather than a thrown error.
 */
export function formatEntryDate(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(iso))
  } catch {
    return iso.slice(0, 10)
  }
}
