import { describe, expect, it } from 'vitest'
import { NAME_MAX_LENGTH, NAME_MIN_LENGTH, isValidName, normalizeName } from './name'

describe('isValidName', () => {
  it.each([
    ['abc', true],
    ['alice', true],
    ['abcdefghij', true],
    ['ab', true],
    ['a', false],
    ['', false],
    ['abcdefghijk', false],
    ['あいう', true],
    ['あい', true],
    ['あ', false],
    ['  abc  ', true],
    ['  ab  ', true],
    ['  a  ', false],
    ['   ', false],
    [' abcdefghij ', true],
    ['abcdefghijk ', false],
    ['a b', true],
  ])('%j → %s', (name, expected) => {
    expect(isValidName(name)).toBe(expected)
  })

  it('counts UTF-16 code units like the old middleware (name.length)', () => {
    // one astral emoji is two code units
    expect(isValidName('😀a')).toBe(true)
    expect(isValidName('😀')).toBe(true)
    expect(isValidName('a')).toBe(false)
    expect(isValidName('😀😀😀😀😀')).toBe(true)
    expect(isValidName('😀😀😀😀😀a')).toBe(false)
  })

  it.each([undefined, null, 123, {}, ['abc']])('rejects non-strings (%j)', (value) => {
    expect(isValidName(value)).toBe(false)
  })

  it('exposes the bounds', () => {
    expect([NAME_MIN_LENGTH, NAME_MAX_LENGTH]).toEqual([2, 10])
  })
})

describe('normalizeName', () => {
  it('trims surrounding whitespace only', () => {
    expect(normalizeName('  a b  ')).toBe('a b')
    expect(normalizeName('\tbob\n')).toBe('bob')
  })
})
