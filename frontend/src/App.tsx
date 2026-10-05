import { type FormEvent, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { CombinedSize } from './components/CombinedSize'
import { AlertIcon, CheckIcon, LensMark } from './components/Icons'
import { Report } from './components/Report'
import { SourceField } from './components/SourceField'
import { type AnalysisFailure, type AnalysisReport, requestAnalysis } from './lib/api'
import { countCharacters, isBlank, MAX_COMBINED_CHARACTERS } from './lib/text'
import { useAnnouncer } from './lib/useAnnouncer'
import { formatNumber, SOURCE_ORDER, SOURCES, type SourceId } from './sources'
import { type InputsAction, INITIAL_INPUTS, inputsReducer } from './state'

const SUMMARY_ID = 'combined-summary'
const MESSAGE_ID = 'combined-message'

type Analysis =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'done'; report: AnalysisReport }
  | { phase: 'failed'; error: AnalysisFailure }

const IDLE: Analysis = { phase: 'idle' }

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
  const [analysis, setAnalysis] = useState<Analysis>(IDLE)
  // The request whose response may still be shown. Replacing or clearing it
  // makes any later response from the old request irrelevant.
  const activeRequest = useRef<AbortController | null>(null)
  const reportRef = useRef<HTMLElement>(null)

  const logsCharacters = useMemo(() => countCharacters(inputs.logs.value), [inputs.logs.value])
  const workflowCharacters = useMemo(() => countCharacters(inputs.workflow.value), [inputs.workflow.value])
  const characters: Record<SourceId, number> = { logs: logsCharacters, workflow: workflowCharacters }
  const overLimit = logsCharacters + workflowCharacters > MAX_COMBINED_CHARACTERS

  const missing = SOURCE_ORDER.filter((id) => isBlank(inputs[id].value))
  const readiness = readinessText(missing, overLimit)
  const canClear = SOURCE_ORDER.some((id) => inputs[id].value !== '' || inputs[id].fileError !== null)
  const running = analysis.phase === 'running'
  const ready = readiness === null

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

  // Take keyboard and screen reader users to a new report.
  useEffect(() => {
    if (analysis.phase === 'done') reportRef.current?.focus()
  }, [analysis])

  useEffect(() => {
    const requests = activeRequest
    return () => requests.current?.abort()
  }, [])

  /** Cancels a running request and drops any report or error for old input. */
  function discardAnalysis() {
    activeRequest.current?.abort()
    activeRequest.current = null
    setAnalysis(IDLE)
  }

  function changeInputs(action: InputsAction) {
    discardAnalysis()
    dispatch(action)
  }

  function handleClear() {
    const canceled = running
    changeInputs({ type: 'clear' })
    setClearCount((count) => count + 1)
    announce(`Cleared the build log and workflow YAML.${canceled ? ' Analysis canceled.' : ''}`)
  }

  async function handleAnalyze(event: FormEvent) {
    event.preventDefault()
    // The ref check also stops a double click that lands before re-render.
    if (!ready || activeRequest.current) return
    const request = new AbortController()
    activeRequest.current = request
    setAnalysis({ phase: 'running' })
    announce('Analyzing…')

    const outcome = await requestAnalysis(
      { logs: inputs.logs.value, workflow_yaml: inputs.workflow.value },
      request.signal,
    )
    if (activeRequest.current !== request || outcome.type === 'canceled') return
    activeRequest.current = null
    if (outcome.type === 'report') {
      setAnalysis({ phase: 'done', report: outcome.report })
      announce(outcome.report.status === 'diagnosed' ? 'Analysis ready: diagnosed.' : 'Analysis ready: needs more context.')
    } else {
      setAnalysis({ phase: 'failed', error: outcome.error })
    }
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
          Files are read in your browser and kept in memory only. Nothing leaves this page until you choose Analyze,
          and reloading the page discards everything.
        </p>
      </header>

      <main>
        <form className="bench" aria-label="Failed run input" noValidate onSubmit={handleAnalyze}>
          <div className="sources">
            {SOURCE_ORDER.map((id) => (
              <SourceField
                key={`${id}-${clearCount}`}
                source={SOURCES[id]}
                state={inputs[id]}
                characters={characters[id]}
                overLimit={overLimit}
                locked={running}
                combinedDescribedBy={combinedDescribedBy}
                textareaRef={id === 'logs' ? logsInput : undefined}
                onEdit={(value) => changeInputs({ type: 'edit', source: id, value })}
                onFileLoaded={(fileName, text) => {
                  changeInputs({ type: 'loadFile', source: id, fileName, text })
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
              {running ? (
                <p className="readiness">Analyzing… This can take up to a minute. Clear cancels it.</p>
              ) : (
                <p className={`readiness${ready ? ' readiness--ready' : ''}`}>
                  {readiness ?? (
                    <>
                      <CheckIcon />
                      <span>Both inputs are ready.</span>
                    </>
                  )}
                </p>
              )}
              <div className="action-buttons">
                <button type="button" className="button button--secondary" onClick={handleClear} disabled={!canClear}>
                  Clear
                </button>
                {/* aria-disabled while running keeps focus on the button. */}
                <button
                  type="submit"
                  className="button button--primary"
                  disabled={!ready}
                  aria-disabled={running || undefined}
                  aria-describedby="analyze-note"
                >
                  {running ? 'Analyzing…' : 'Analyze'}
                </button>
              </div>
              {analysis.phase === 'failed' && (
                <div className="analysis-error" role="alert">
                  <AlertIcon />
                  <div>
                    <p className="analysis-error-title">{analysis.error.title}</p>
                    <p>{analysis.error.detail}</p>
                    <p>Your input is unchanged, so you can try again.</p>
                  </div>
                </div>
              )}
              <p className="analyze-note" id="analyze-note">
                Analyze sends both inputs to the PipelineLens backend, which removes recognizable secrets (best effort)
                and passes them to the configured AI provider.
              </p>
            </div>
          </div>
        </form>

        {analysis.phase === 'done' && <Report report={analysis.report} ref={reportRef} />}
      </main>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  )
}
