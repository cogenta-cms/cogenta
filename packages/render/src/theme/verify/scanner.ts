import { type ForbiddenKind, matchForbidden } from './forbidden.js'

/**
 * The static analysis contract D requires, written by hand and on purpose.
 *
 * Rule R9 asks for a justification before any dependency, and here there is
 * none to buy: TypeScript 7 ships a native compiler with no JavaScript parser
 * API (`typescript.createSourceFile` no longer exists), and Astro's bundled
 * compiler parses `.astro` files, not the TypeScript inside them. Adding a full
 * parser — `@babel/parser`, `oxc-parser`, `acorn` + a TS plugin — to answer
 * three questions about module specifiers would be a large dependency, and a
 * *native* one in two of the three cases, which rule R10 forbids outright.
 *
 * So this is a lexer, not a parser. It never needs the syntax tree: it needs
 * string literals that sit in module-specifier position, plus two shapes that
 * are refused whatever they contain. Being a lexer also means it does not
 * choke on syntax it has never seen, which matters when the input is a theme
 * written against a newer TypeScript than the one that shipped this check.
 *
 * What it deliberately does **not** claim: soundness against a determined
 * attacker. Nothing static is. It refuses every path that can be recognised —
 * and refuses outright the paths that cannot be *read*, which is what closes
 * the aliasing hole: an `import()` whose specifier is computed is refused for
 * being unreadable, not for what it computes.
 */

export type FindingKind =
  /** A specifier that reaches a module the contract forbids. */
  | 'forbidden-import'
  /** An `import()` whose specifier cannot be read statically. */
  | 'unanalysable-import'
  /** CommonJS, which no theme may use — and the usual door back to `fs`. */
  | 'commonjs-require'

export interface SourceFinding {
  readonly kind: FindingKind
  /** 1-based, in the file as it is on disk. */
  readonly line: number
  /** 1-based. */
  readonly column: number
  /** The specifier as written, when one could be read. */
  readonly specifier: string | null
  /** The forbidden module the specifier reaches, in its canonical spelling. */
  readonly resolved: string | null
  readonly forbiddenKind: ForbiddenKind | null
}

interface Token {
  readonly kind: 'string' | 'ident' | 'punct' | 'other'
  readonly value: string
  readonly line: number
  readonly column: number
}

const IDENT_START = /[A-Za-z_$#@]/u
const IDENT_PART = /[A-Za-z0-9_$]/u

/** Keywords after which a `/` opens a regular expression rather than dividing. */
const OPERATOR_KEYWORDS = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'case',
  'do',
  'else',
  'yield',
  'await',
])

interface Cursor {
  index: number
  line: number
  column: number
}

/**
 * Turns source into the few token kinds the rules below need.
 *
 * Comments are dropped, so a commented-out import is not a refusal. Strings
 * stop at the end of the line unless they are template literals, exactly as
 * JavaScript does — which bounds the damage of any mis-lex to one line.
 */
function tokenize(code: string, startLine: number, startColumn: number): Token[] {
  const tokens: Token[] = []
  const cursor: Cursor = { index: 0, line: startLine, column: startColumn }

  const advance = (count: number): void => {
    for (let i = 0; i < count && cursor.index < code.length; i += 1) {
      if (code[cursor.index] === '\n') {
        cursor.line += 1
        cursor.column = 1
      } else {
        cursor.column += 1
      }
      cursor.index += 1
    }
  }

  const previous = (): Token | undefined => tokens[tokens.length - 1]

  /** Reads a quoted string, or a template literal including its `${…}` parts. */
  const readString = (quote: string): void => {
    const line = cursor.line
    const column = cursor.column
    const template = quote === '`'
    let value = ''
    let interpolated = false
    advance(1)

    while (cursor.index < code.length) {
      const char = code[cursor.index]
      if (char === undefined) break
      if (char === '\\') {
        value += code[cursor.index + 1] ?? ''
        advance(2)
        continue
      }
      if (char === quote) {
        advance(1)
        break
      }
      if (!template && char === '\n') break // unterminated: JavaScript ends it here too
      if (template && char === '$' && code[cursor.index + 1] === '{') {
        // The expression inside is code, so it is tokenised in place; the
        // template itself stops being a readable specifier.
        interpolated = true
        advance(2)
        let depth = 1
        while (cursor.index < code.length && depth > 0) {
          const inner = code[cursor.index]
          if (inner === '{') depth += 1
          else if (inner === '}') depth -= 1
          if (depth === 0) break
          const before = tokens.length
          readToken()
          if (tokens.length === before && cursor.index < code.length) advance(1)
        }
        advance(1)
        continue
      }
      value += char
      advance(1)
    }

    tokens.push({
      kind: interpolated ? 'other' : 'string',
      value,
      line,
      column,
    })
  }

  const readIdent = (): void => {
    const line = cursor.line
    const column = cursor.column
    let value = ''
    while (cursor.index < code.length) {
      const char = code[cursor.index]
      if (char === undefined || !(value === '' ? IDENT_START : IDENT_PART).test(char)) break
      value += char
      advance(1)
    }
    tokens.push({ kind: 'ident', value, line, column })
  }

  /** True when a `/` here starts a regular expression rather than a division. */
  const regexExpected = (): boolean => {
    const prev = previous()
    if (prev === undefined) return true
    if (prev.kind === 'ident') return OPERATOR_KEYWORDS.has(prev.value)
    if (prev.kind === 'other') return false
    return !(prev.value === ')' || prev.value === ']' || prev.value === '}')
  }

  const skipRegex = (): void => {
    advance(1)
    let inClass = false
    while (cursor.index < code.length) {
      const char = code[cursor.index]
      if (char === undefined || char === '\n') break
      if (char === '\\') {
        advance(2)
        continue
      }
      if (char === '[') inClass = true
      else if (char === ']') inClass = false
      else if (char === '/' && !inClass) {
        advance(1)
        break
      }
      advance(1)
    }
    tokens.push({ kind: 'other', value: '/regex/', line: cursor.line, column: cursor.column })
  }

  function readToken(): void {
    const char = code[cursor.index]
    if (char === undefined) return

    if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
      advance(1)
      return
    }
    if (char === '/' && code[cursor.index + 1] === '/') {
      while (cursor.index < code.length && code[cursor.index] !== '\n') advance(1)
      return
    }
    if (char === '/' && code[cursor.index + 1] === '*') {
      advance(2)
      while (cursor.index < code.length) {
        if (code[cursor.index] === '*' && code[cursor.index + 1] === '/') {
          advance(2)
          return
        }
        advance(1)
      }
      return
    }
    if (char === '/') {
      if (regexExpected()) skipRegex()
      else {
        tokens.push({ kind: 'punct', value: '/', line: cursor.line, column: cursor.column })
        advance(1)
      }
      return
    }
    if (char === '"' || char === "'" || char === '`') {
      readString(char)
      return
    }
    if (IDENT_START.test(char)) {
      readIdent()
      return
    }
    if (char >= '0' && char <= '9') {
      const line = cursor.line
      const column = cursor.column
      let value = ''
      while (cursor.index < code.length) {
        const digit = code[cursor.index]
        if (digit === undefined || !/[0-9A-Za-z._]/u.test(digit)) break
        value += digit
        advance(1)
      }
      tokens.push({ kind: 'other', value, line, column })
      return
    }
    tokens.push({ kind: 'punct', value: char, line: cursor.line, column: cursor.column })
    advance(1)
  }

  while (cursor.index < code.length) {
    const before = cursor.index
    readToken()
    if (cursor.index === before) advance(1)
  }

  return tokens
}

function specifierFinding(token: Token): SourceFinding | null {
  const match = matchForbidden(token.value)
  if (match === null) return null
  return {
    kind: 'forbidden-import',
    line: token.line,
    column: token.column,
    specifier: token.value,
    resolved: match.specifier,
    forbiddenKind: match.kind,
  }
}

/** `createRequire`, `require`, `__require`: every door back to CommonJS. */
function isRequireLike(value: string): boolean {
  return value.toLowerCase().includes('require')
}

/**
 * Applies the rules to a token stream.
 *
 * Only strings in module-specifier position are matched against the forbidden
 * list. Checking *every* string literal was the first design and it was wrong:
 * `process`, `net`, `http` and `redis` are ordinary words, and a theme refused
 * because a CSS class is called `process` teaches theme authors that the check
 * is noise.
 */
function findingsFrom(tokens: readonly Token[]): SourceFinding[] {
  const findings: SourceFinding[] = []
  const push = (finding: SourceFinding | null): void => {
    if (finding !== null) findings.push(finding)
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (token === undefined || token.kind !== 'ident') continue
    const next = tokens[i + 1]
    if (next === undefined) continue

    // `import 'x'` and `… from 'x'` — static import, re-export, `import type`.
    if ((token.value === 'import' || token.value === 'from') && next.kind === 'string') {
      push(specifierFinding(next))
      continue
    }

    if (token.value === 'import' && next.kind === 'punct' && next.value === '(') {
      const argument = tokens[i + 2]
      const closing = tokens[i + 3]
      const readable =
        argument?.kind === 'string' && closing?.kind === 'punct' && closing.value === ')'
      if (readable && argument !== undefined) push(specifierFinding(argument))
      else {
        // Refused for being unreadable. This is what closes aliasing: a
        // specifier built from a variable, a concatenation or a template
        // cannot be proven safe, so it is not given the benefit of the doubt.
        findings.push({
          kind: 'unanalysable-import',
          line: token.line,
          column: token.column,
          specifier: null,
          resolved: null,
          forbiddenKind: null,
        })
      }
      continue
    }

    if (next.kind !== 'punct' || next.value !== '(') continue
    const argument = tokens[i + 2]

    if (isRequireLike(token.value)) {
      findings.push({
        kind: 'commonjs-require',
        line: token.line,
        column: token.column,
        specifier: argument?.kind === 'string' ? argument.value : null,
        resolved: null,
        forbiddenKind: null,
      })
    }

    // A `node:` prefix makes a string a module specifier wherever it appears,
    // with nothing else it could plausibly be. So a call that receives one is
    // loading a module whatever its callee is named, which is what catches the
    // handle a `createRequire` was stored in.
    if (argument?.kind === 'string' && argument.value.startsWith('node:')) {
      push(specifierFinding(argument))
    }
  }

  return findings
}

export interface ScanOptions {
  /** Line the snippet starts on in the file, 1-based. */
  readonly line?: number
  /** Column the snippet starts on, 1-based. */
  readonly column?: number
}

/** Scans a fragment of TypeScript or JavaScript. */
export function scanCode(code: string, options: ScanOptions = {}): SourceFinding[] {
  return findingsFrom(tokenize(code, options.line ?? 1, options.column ?? 1))
}
