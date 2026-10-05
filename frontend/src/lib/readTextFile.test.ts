import { describe, expect, it } from 'vitest'
import { MAX_FILE_BYTES, readTextFile } from './readTextFile'

const LOG = ['.txt', '.log']

function file(parts: BlobPart[], name: string) {
  return new File(parts, name)
}

describe('readTextFile', () => {
  it('reads UTF-8 text and normalizes line endings', async () => {
    const result = await readTextFile(file(['line 1\r\nline 2\r'], 'build.LOG'), LOG)
    expect(result).toEqual({ ok: true, text: 'line 1\nline 2\n' })
  })

  it('drops a byte order mark and decodes UTF-16', async () => {
    const utf8 = await readTextFile(file([new Uint8Array([0xef, 0xbb, 0xbf, 0x6f, 0x6b])], 'a.txt'), LOG)
    expect(utf8).toEqual({ ok: true, text: 'ok' })
    const utf16 = await readTextFile(file([new Uint8Array([0xff, 0xfe, 0x6f, 0x00, 0x6b, 0x00])], 'a.txt'), LOG)
    expect(utf16).toEqual({ ok: true, text: 'ok' })
  })

  it('rejects other extensions before reading', async () => {
    expect(await readTextFile(file(['name: CI'], 'ci.yml'), LOG)).toEqual({ ok: false, problem: 'type' })
    expect(await readTextFile(file(['x'], 'log'), LOG)).toEqual({ ok: false, problem: 'type' })
  })

  it('rejects empty, whitespace-only, oversized, and binary files', async () => {
    expect(await readTextFile(file([], 'a.log'), LOG)).toEqual({ ok: false, problem: 'empty' })
    expect(await readTextFile(file([' \n\t'], 'a.log'), LOG)).toEqual({ ok: false, problem: 'blank' })
    const big = file([new Uint8Array(MAX_FILE_BYTES + 1).fill(0x61)], 'a.log')
    expect(await readTextFile(big, LOG)).toEqual({ ok: false, problem: 'size' })
    const png = file([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff])], 'a.log')
    expect(await readTextFile(png, LOG)).toEqual({ ok: false, problem: 'unreadable' })
    expect(await readTextFile(file(['ok\0ok'], 'a.log'), LOG)).toEqual({ ok: false, problem: 'unreadable' })
  })
})
