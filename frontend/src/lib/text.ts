/** Mirrors MAX_INPUT_CHARACTERS in backend/pipelinelens/analysis.py. */
export const MAX_COMBINED_CHARACTERS = 100_000

/**
 * Counts characters the way the backend does. Python's len() counts Unicode
 * code points, while JavaScript's .length counts UTF-16 code units, so a
 * surrogate pair (most emoji, some CJK) counts once here, not twice.
 */
export function countCharacters(text: string): number {
  let count = text.length
  for (let i = 0; i < text.length - 1; i++) {
    const code = text.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        count--
        i++
      }
    }
  }
  return count
}

// The backend rejects a field when value.strip() is empty. These are the code
// points Python's str.isspace() accepts. The set differs from JavaScript's
// trim(): it includes U+001C–U+001F and U+0085, and excludes U+FEFF.
const PYTHON_WHITESPACE = new Set([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002,
  0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
])

export function isBlank(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (!PYTHON_WHITESPACE.has(text.charCodeAt(i))) return false
  }
  return true
}

/**
 * Textareas convert CRLF and lone CR to LF. Applying the same rule to file
 * contents keeps the count equal to what the field holds and will send. The
 * backend treats all three as line breaks, so line numbers are unchanged.
 */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

/** Lines as the backend numbers them for evidence citations. */
export function countLines(text: string): number {
  return text === '' ? 0 : text.split(/\r\n|\r|\n/).length
}
