import { describe, expect, it } from 'vitest'
import {
  condense,
  foldText,
  MIN_TOKEN_LENGTH,
  queryTokens,
  tokenize,
} from '../../src/search/text.js'

describe('foldText', () => {
  it('removes the accents that would otherwise make two spellings differ', () => {
    expect(foldText('Cathédrale')).toBe('cathedrale')
    expect(foldText('ÉTÉ')).toBe('ete')
    expect(foldText('naïve')).toBe('naive')
  })

  it('folds accents outside Latin script too', () => {
    expect(foldText('Ἀθῆναι')).toBe('αθηναι')
  })

  it('leaves a letter that is not an accented form alone', () => {
    // `ø` and `ß` are letters in their own right, not a base plus a mark: NFD
    // does not split them, and pretending otherwise would be a transliteration.
    expect(foldText('Køge')).toBe('køge')
    expect(foldText('Straße')).toBe('straße')
  })
})

describe('tokenize', () => {
  it('splits on everything that is not a letter or a digit', () => {
    expect(tokenize("L'atelier de Saint-Denis, 1211.")).toEqual([
      'l',
      'atelier',
      'de',
      'saint',
      'denis',
      '1211',
    ])
  })

  it('leaves no query-language operator in a token', () => {
    // What makes the same user input safe to hand to `tsquery`, to MySQL's
    // boolean mode and to FTS5 without three escaping routines.
    expect(tokenize('+reims* -"cathedrale" AND (nef)')).toEqual([
      'reims',
      'cathedrale',
      'and',
      'nef',
    ])
  })

  it('returns nothing for a string with no words in it', () => {
    expect(tokenize('   ---  ')).toEqual([])
  })
})

describe('queryTokens', () => {
  it('drops the words no full-text engine would have indexed', () => {
    expect(MIN_TOKEN_LENGTH).toBe(3)
    expect(queryTokens('la nef de la cathedrale')).toEqual(['nef', 'cathedrale'])
  })
})

describe('condense', () => {
  it('collapses the whitespace that joining extracted fields leaves behind', () => {
    expect(condense('  Le  vitrail \n restauré  ')).toBe('Le vitrail restauré')
  })
})
