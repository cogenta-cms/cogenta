/**
 * Normalisation shared by the three engines.
 *
 * The reason it exists at all: accent handling is the one thing the three
 * dialects disagree about that a *caller* would notice. Postgres folds accents
 * only with the `unaccent` extension, which a managed instance may not allow;
 * MySQL folds them through the collation, so `café` and `cafe` already match;
 * SQLite's FTS5 unicode61 tokeniser folds them by default. Left alone, the same
 * search would answer differently on each — the divergence the contract suite
 * exists to prevent.
 *
 * So the text is folded **before** it reaches the database, on both the write
 * and the read side, and every engine indexes the folded form. The cost is that
 * Postgres stems `ete` rather than `été`; the gain is that "does searching for
 * `cafe` find `Café` ?" has one answer everywhere, and that answer does not
 * depend on an extension being installed.
 */

/** Lower-cased and stripped of diacritics. */
export function foldText(value: string): string {
  // NFD splits `é` into `e` + combining acute, which the second step removes.
  // `\p{Diacritic}` rather than a range: it also covers Greek, Vietnamese and
  // the Hebrew points, which a Latin-1 range would leave accented.
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/**
 * The words of a query or a document, folded.
 *
 * Splitting on anything that is not a letter or a digit is what makes the
 * query safe to hand to three engines with three query languages: a token can
 * never carry `+`, `-`, `*`, `"` or `(`, so no user input is ever read as a
 * boolean-mode operator or an FTS5 expression.
 */
export function tokenize(value: string): string[] {
  return foldText(value).match(/[\p{L}\p{N}]+/gu) ?? []
}

/** Collapses runs of whitespace so the stored text has no accidental structure. */
export function condense(value: string): string {
  return value.replace(/\s+/gu, ' ').trim()
}

/**
 * Length below which MySQL ignores a word.
 *
 * InnoDB's `innodb_ft_min_token_size` defaults to 3, so `+ai*` in boolean mode
 * matches nothing and, because of the `+`, makes the whole query match nothing.
 * Dropping such tokens everywhere rather than only on MySQL keeps the three
 * engines answering the same thing, which is worth more than two extra letters
 * of precision on the two dialects that could have handled them.
 */
export const MIN_TOKEN_LENGTH = 3

export function queryTokens(text: string): string[] {
  return tokenize(text).filter((token) => token.length >= MIN_TOKEN_LENGTH)
}
