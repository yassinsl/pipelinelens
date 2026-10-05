import { describe, expect, it } from 'vitest'
import { countCharacters, countLines, isBlank, normalizeLineEndings } from './text'

describe('countCharacters', () => {
  it('counts code points like Python len()', () => {
    expect(countCharacters('')).toBe(0)
    expect(countCharacters('abc')).toBe(3)
    expect(countCharacters(`a${String.fromCodePoint(0x1f600)}b`)).toBe(3) // emoji: one code point, two UTF-16 units
    expect(countCharacters(String.fromCodePoint(0x1f1eb, 0x1f1f7))).toBe(2) // flag: two regional indicators
    expect(countCharacters(String.fromCodePoint(0x65, 0x301))).toBe(2) // e + combining accent
    expect(countCharacters('\r\n')).toBe(2)
  })

  it('counts unpaired surrogates once each', () => {
    expect(countCharacters(String.fromCharCode(0xd83d))).toBe(1)
    expect(countCharacters(`${String.fromCharCode(0xde00)}x`)).toBe(2)
    expect(countCharacters(String.fromCharCode(0xd83d, 0xd83d, 0xde00))).toBe(2)
  })
})

describe('isBlank', () => {
  it('matches Python str.strip() emptiness', () => {
    expect(isBlank('')).toBe(true)
    expect(isBlank(' \t\n\r\v\f')).toBe(true)
    expect(isBlank(String.fromCodePoint(0x1c, 0x1d, 0x1e, 0x1f, 0x85, 0xa0, 0x2003, 0x2028, 0x3000))).toBe(true)
    // JavaScript's trim() strips U+FEFF, but Python keeps it.
    expect(isBlank(String.fromCodePoint(0xfeff))).toBe(false)
    expect(isBlank('  x  ')).toBe(false)
  })
})

describe('line handling', () => {
  it('normalizes CRLF and lone CR to LF like a textarea', () => {
    expect(normalizeLineEndings('a\r\nb\rc\n')).toBe('a\nb\nc\n')
  })

  it('numbers lines like the backend, keeping blank and trailing lines', () => {
    expect(countLines('')).toBe(0)
    expect(countLines('one')).toBe(1)
    expect(countLines('one\n\nthree')).toBe(3)
    expect(countLines('one\r\ntwo\rthree\n')).toBe(4)
  })
})
