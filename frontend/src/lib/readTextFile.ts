import { isBlank, normalizeLineEndings } from './text'

/**
 * 100,000 characters is at most ~400 KB of UTF-8. A larger cap lets people load
 * a longer log and trim it in place, without freezing the tab on huge files.
 */
export const MAX_FILE_BYTES = 2 * 1024 * 1024

export type FileProblem = 'type' | 'size' | 'empty' | 'blank' | 'unreadable' | 'read-failed'

export type FileReadResult = { ok: true; text: string } | { ok: false; problem: FileProblem }

export function hasExtension(fileName: string, extensions: readonly string[]): boolean {
  const name = fileName.toLowerCase()
  return extensions.some((extension) => name.endsWith(extension))
}

function detectEncoding(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le'
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be'
  return 'utf-8'
}

/** Reads a local text file into memory. Nothing is uploaded or stored. */
export async function readTextFile(file: File, extensions: readonly string[]): Promise<FileReadResult> {
  if (!hasExtension(file.name, extensions)) return { ok: false, problem: 'type' }
  if (file.size > MAX_FILE_BYTES) return { ok: false, problem: 'size' }
  if (file.size === 0) return { ok: false, problem: 'empty' }

  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch {
    return { ok: false, problem: 'read-failed' }
  }

  let text: string
  try {
    // fatal: invalid byte sequences throw instead of becoming U+FFFD. The
    // decoder also drops a leading byte order mark.
    text = new TextDecoder(detectEncoding(bytes), { fatal: true }).decode(bytes)
  } catch {
    return { ok: false, problem: 'unreadable' }
  }
  // NUL bytes decode as valid UTF-8 but mean the file is binary.
  if (text.includes('\0')) return { ok: false, problem: 'unreadable' }

  text = normalizeLineEndings(text)
  if (text === '') return { ok: false, problem: 'empty' }
  if (isBlank(text)) return { ok: false, problem: 'blank' }
  return { ok: true, text }
}
