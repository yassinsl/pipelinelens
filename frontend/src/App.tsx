import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { CombinedSize } from './components/CombinedSize'
import { CheckIcon, LensMark } from './components/Icons'
import { SourceField } from './components/SourceField'
import { countCharacters, isBlank, MAX_COMBINED_CHARACTERS } from './lib/text'
import { useAnnouncer } from './lib/useAnnouncer'
import { formatNumber, SOURCE_ORDER, SOURCES, type SourceId } from './sources'
import { INITIAL_INPUTS, inputsReducer } from './state'

const SUMMARY_ID = 'combined-summary'
const MESSAGE_ID = 'combined-message'

function readinessText(missing: SourceId[], overLimit: boolean): string | null {
  const steps: string[] = []
  if (missing.length > 0) {
    const names = missing.map((id) => (id === 'logs' ? 'the failed build log' : 'the workflow YAML'))
    steps.push(`add ${names.join(' and ')}`)
  }
  if (overLimit) steps.push(`trim the input to ${formatNumber(MAX_COMBINED_CHARACTERS)} characters`)
  if (steps.length === 0) return null
  const sentence = steps.join(', then ')
  return `To continue, ${sentence}.`
}

export default function App() {
  const [inputs, dispatch] = useReducer(inputsReducer, INITIAL_INPUTS)
  const [clearCount, setClearCount] = useState(0)
  const [announcement, announce] = useAnnouncer()
  const logsInput = useRef<HTMLTextAreaElement>(null)

  const logsCharacters = useMemo(() => countCharacters(inputs.logs.value), [inputs.logs.value])
  const workflowCharacters = useMemo(() => countCharacters(inputs.workflow.value), [inputs.workflow.value])
  const characters: Record<SourceId, number> = { logs: logsCharacters, workflow: workflowCharacters }
  const overLimit = logsCharacters + workflowCharacters > MAX_COMBINED_CHARACTERS

  const missing = SOURCE_ORDER.filter((id) => isBlank(inputs[id].value))
  const readiness = readinessText(missing, overLimit)
  const canClear = SOURCE_ORDER.some((id) => inputs[id].value !== '' || inputs[id].fileError !== null)

  // A file dropped outside a field would make the browser open it and discard
  // everything entered so far.
  useEffect(() => {
    function guard(event: DragEvent) {
      if (event.defaultPrevented || !event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'none'
    }
    window.addEventListener('dragover', guard)
    window.addEventListener('drop', guard)
    return () => {
      window.removeEventListener('dragover', guard)
      window.removeEventListener('drop', guard)
    }
  }, [])

  // Clear disables itself, so move focus somewhere useful instead of losing it.
  useEffect(() => {
    if (clearCount > 0) logsInput.current?.focus()
  }, [clearCount])

  function handleClear() {
    dispatch({ type: 'clear' })
    setClearCount((count) => count + 1)
    announce('Cleared the build log and workflow YAML.')
  }

  const combinedDescribedBy = overLimit ? `${SUMMARY_ID} ${MESSAGE_ID}` : SUMMARY_ID

  return (
    <div className="page">
      <header className="masthead">
        <div className="brand">
          <LensMark className="brand-mark" />
          <h1 className="brand-name">PipelineLens</h1>
        </div>
        <p className="lede">
          Find out why a GitHub Actions run failed. Add the log from the failed run and the workflow file that ran
          it; PipelineLens suggests a likely cause backed by quoted lines from both, or tells you what context it
          still needs.
        </p>
        <p className="privacy">
          Files are read in your browser and kept in memory only. Nothing is uploaded or saved, and reloading the page
          discards everything.
        </p>
      </header>

      <main>
        <form className="bench" aria-label="Failed run input" noValidate onSubmit={(event) => event.preventDefault()}>
          <div className="sources">
            {SOURCE_ORDER.map((id) => (
              <SourceField
                key={`${id}-${clearCount}`}
                source={SOURCES[id]}
                state={inputs[id]}
                characters={characters[id]}
                overLimit={overLimit}
                combinedDescribedBy={combinedDescribedBy}
                textareaRef={id === 'logs' ? logsInput : undefined}
                onEdit={(value) => dispatch({ type: 'edit', source: id, value })}
                onFileLoaded={(fileName, text) => {
                  dispatch({ type: 'loadFile', source: id, fileName, text })
                  announce(`Loaded “${fileName}” into ${SOURCES[id].label}.`)
                }}
                onFileError={(message) => {
                  dispatch({ type: 'fileError', source: id, message })
                  announce(message)
                }}
              />
            ))}
          </div>

          <div className="bench-foot">
            <CombinedSize
              logs={logsCharacters}
              workflow={workflowCharacters}
              summaryId={SUMMARY_ID}
              messageId={MESSAGE_ID}
            />

            <div className="actions">
              <p className={`readiness${readiness ? '' : ' readiness--ready'}`}>
                {readiness ?? (
                  <>
                    <CheckIcon />
                    <span>Both inputs are ready.</span>
                  </>
                )}
              </p>
              <div className="action-buttons">
                <button type="button" className="button button--secondary" onClick={handleClear} disabled={!canClear}>
                  Clear
                </button>
                <button type="submit" className="button button--primary" disabled aria-describedby="analyze-note">
                  Analyze
                </button>
              </div>
              <p className="analyze-note" id="analyze-note">
                Analysis isn’t connected yet, so this screen doesn’t send your input anywhere.
              </p>
            </div>
          </div>
        </form>
      </main>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  )
}
