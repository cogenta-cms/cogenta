function splitSentences(text: string): readonly string[] {
  return text
    .split(/[.!?]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
}

function splitWords(text: string): readonly string[] {
  return text
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0)
}

/** A heuristic vowel-group count — not a dictionary lookup (R9: no new dependency for this), imprecise on edge cases but stable and dependency-free. */
function countSyllables(word: string): number {
  const normalized = word.toLowerCase().replace(/[^a-z]/g, '')
  if (normalized.length === 0) return 0
  const vowelGroups = normalized.match(/[aeiouy]+/g)
  let count = vowelGroups === null ? 1 : vowelGroups.length
  if (normalized.endsWith('e') && count > 1) count -= 1
  return Math.max(count, 1)
}

/**
 * Flesch Reading Ease, standard formula — higher is easier to read (roughly
 * 0–100, though the formula can technically exceed those bounds). No
 * dictionary or NLP dependency: syllables are counted heuristically, which
 * is exactly why this is a "readability may be off" signal for the audit,
 * not a hard fact.
 */
export function fleschReadingEase(text: string): number {
  const sentences = splitSentences(text)
  const words = splitWords(text)
  if (sentences.length === 0 || words.length === 0) return 0

  const syllables = words.reduce((sum, word) => sum + countSyllables(word), 0)
  const wordsPerSentence = words.length / sentences.length
  const syllablesPerWord = syllables / words.length

  return 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord
}

export function countWords(text: string): number {
  return splitWords(text).length
}
