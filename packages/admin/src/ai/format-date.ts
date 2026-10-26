/** A server timestamp in the reader's own time zone and language ("21 oct. 2026, 15:07"). */
export function formatDateTime(iso: string, language: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
