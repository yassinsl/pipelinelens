import { type DragEvent, type Ref, useEffect, useRef, useState } from 'react'
import { readTextFile } from '../lib/readTextFile'
import { countLines, isBlank } from '../lib/text'
import { fileProblemMessage, formatCount, listExtensions, type SourceConfig } from '../sources'
import type { SourceState } from '../state'
import { AlertIcon } from './Icons'

interface SourceFieldProps {
  source: SourceConfig
  state: SourceState
  characters: number
  overLimit: boolean
  /** Ids of the combined-size text, read along with the field's own hint. */
  combinedDescribedBy: string
  textareaRef?: Ref<HTMLTextAreaElement>
  onEdit: (value: string) => void
  onFileLoaded: (fileName: string, text: string) => void
  onFileError: (message: string) => void
}

function carriesFiles(event: DragEvent) {
  return Array.from(event.dataTransfer.types).includes('Files')
}

function blankMessage(source: SourceConfig, value: string): string {
  const upload = `upload a ${listExtensions(source.extensions)} file`
  return value === ''
    ? `Enter the ${source.noun}, or ${upload}.`
    : `The ${source.noun} contains only whitespace. Add its text, or ${upload}.`
}

export function SourceField({
  source,
  state,
  characters,
  overLimit,
  combinedDescribedBy,
  textareaRef,
  onEdit,
  onFileLoaded,
  onFileError,
}: SourceFieldProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const readToken = useRef(0)
  const dragDepth = useRef(0)
  const [readingName, setReadingName] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  // Clear remounts this field; drop the result of any read still in flight.
  useEffect(() => {
    const token = readToken
    return () => {
      token.current++
    }
  }, [])

  async function loadFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    if (files.length > 1) {
      onFileError(`Drop one file at a time into ${source.label}.`)
      return
    }
    const file = files[0]
    const token = ++readToken.current
    setReadingName(file.name)
    const result = await readTextFile(file, source.extensions)
    if (token !== readToken.current) return
    setReadingName(null)
    if (result.ok) onFileLoaded(file.name, result.text)
    else onFileError(fileProblemMessage(result.problem, file, source))
  }

  function handleDragEnter(event: DragEvent) {
    if (!carriesFiles(event)) return
    event.preventDefault()
    dragDepth.current++
    setDragging(true)
  }

  function handleDragOver(event: DragEvent) {
    if (!carriesFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  function handleDragLeave(event: DragEvent) {
    if (!carriesFiles(event)) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  function handleDrop(event: DragEvent) {
    if (!carriesFiles(event)) return
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    void loadFiles(event.dataTransfer.files)
  }

  const ids = {
    input: `${source.id}-input`,
    hint: `${source.id}-hint`,
    status: `${source.id}-status`,
  }
  const blankError = state.dirty && isBlank(state.value) ? blankMessage(source, state.value) : null
  const error = readingName ? null : (state.fileError ?? blankError)
  const hasContent = state.value !== ''
  const accept = source.extensions.join(',')

  let status = null
  if (readingName) {
    status = <span>Reading “{readingName}”…</span>
  } else if (error) {
    status = (
      <span className="status-error">
        <AlertIcon />
        <span>
          <span className="sr-only">Error: </span>
          {error}
        </span>
      </span>
    )
  } else if (state.fileName) {
    status = (
      <span>
        Loaded from “{state.fileName}”
        {state.editedSinceLoad ? ', with your edits.' : '. Edits here don’t change the file.'}
      </span>
    )
  }

  return (
    <div
      className={`source source--${source.id}`}
      data-dragging={dragging || undefined}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="source-head">
        <label className="source-label" htmlFor={ids.input}>
          <span className="swatch" aria-hidden="true" />
          {source.label}
        </label>
        <button type="button" className="button button--quiet" onClick={() => fileInput.current?.click()}>
          {hasContent ? 'Replace from file' : 'Upload file'}
          <span className="sr-only"> for {source.label}</span>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={accept}
          hidden
          onChange={(event) => {
            void loadFiles(event.currentTarget.files)
            // Reset so choosing the same file again still fires a change.
            event.currentTarget.value = ''
          }}
        />
      </div>
      <p className="source-hint" id={ids.hint}>
        {source.hint} <span className="drop-hint">You can drop a file here.</span> Accepts{' '}
        {listExtensions(source.extensions)}.
      </p>

      <div className="editor">
        <textarea
          ref={textareaRef}
          id={ids.input}
          className="source-input"
          value={state.value}
          onChange={(event) => onEdit(event.target.value)}
          placeholder={source.placeholder}
          rows={14}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          aria-required="true"
          aria-invalid={Boolean(error) || overLimit || undefined}
          aria-describedby={`${ids.hint} ${ids.status} ${combinedDescribedBy}`}
          aria-busy={readingName ? true : undefined}
        />
        {dragging && (
          <div className="drop-overlay" aria-hidden="true">
            {hasContent ? `Drop to replace ${source.label}` : `Drop to load into ${source.label}`}
          </div>
        )}
      </div>

      <div className="source-foot">
        <p className="source-status" id={ids.status}>
          {status}
        </p>
        <p className="source-meta">
          <span>{formatCount(characters, 'character')}</span>
          <span>{formatCount(countLines(state.value), 'line')}</span>
        </p>
      </div>
    </div>
  )
}
