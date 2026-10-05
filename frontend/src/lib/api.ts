// Client for POST /analyze. Types mirror backend/pipelinelens/models.py.

export const ANALYZE_URL = '/api/analyze'

/** The backend gives the provider 65 s in total; allow for that plus overhead. */
export const CLIENT_TIMEOUT_MS = 90_000

export type EvidenceSource = 'logs' | 'workflow'

export interface Evidence {
  source: EvidenceSource
  /** 1-based line within the submitted (redacted) source. */
  line_number: number
  quoted_text: string
}

/** A proposed change. The backend never applies or verifies it. */
export interface SuggestedChange {
  description: string
  file: string | null
  details: string | null
}

export interface AnalysisReport {
  status: 'diagnosed' | 'needs_more_context'
  summary: string
  likely_cause: string | null
  evidence: Evidence[]
  suggested_changes: SuggestedChange[]
  verification_steps: string[]
  missing_information: string[]
}

export interface AnalysisRequest {
  logs: string
  workflow_yaml: string
}

export type FailureKind =
  | 'validation'
  | 'too-large'
  | 'not-configured'
  | 'timeout'
  | 'provider'
  | 'connection'
  | 'unexpected'

export interface AnalysisFailure {
  kind: FailureKind
  title: string
  detail: string
}

export type AnalysisOutcome =
  | { type: 'report'; report: AnalysisReport }
  | { type: 'error'; error: AnalysisFailure }
  | { type: 'canceled' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return value === null || value === undefined || typeof value === 'string'
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isEvidence(value: unknown): value is Evidence {
  return (
    isRecord(value) &&
    (value.source === 'logs' || value.source === 'workflow') &&
    Number.isInteger(value.line_number) &&
    (value.line_number as number) >= 1 &&
    typeof value.quoted_text === 'string'
  )
}

function isSuggestedChange(value: unknown): value is SuggestedChange {
  return (
    isRecord(value) &&
    typeof value.description === 'string' &&
    isOptionalString(value.file) &&
    isOptionalString(value.details)
  )
}

/** Checks a response body against AnalysisResponse; null if it doesn't match. */
export function parseReport(data: unknown): AnalysisReport | null {
  if (!isRecord(data)) return null
  const { status, summary, likely_cause, evidence = [], suggested_changes = [] } = data
  const { verification_steps = [], missing_information = [] } = data
  if (status !== 'diagnosed' && status !== 'needs_more_context') return null
  if (typeof summary !== 'string' || !isOptionalString(likely_cause)) return null
  if (!Array.isArray(evidence) || !evidence.every(isEvidence)) return null
  if (!Array.isArray(suggested_changes) || !suggested_changes.every(isSuggestedChange)) return null
  if (!isStringList(verification_steps) || !isStringList(missing_information)) return null
  return {
    status,
    summary,
    likely_cause: likely_cause ?? null,
    evidence,
    suggested_changes: suggested_changes.map((change) => ({
      description: change.description,
      file: change.file ?? null,
      details: change.details ?? null,
    })),
    verification_steps,
    missing_information,
  }
}

const FIELD_NAMES: Record<string, string> = { logs: 'build log', workflow_yaml: 'workflow YAML' }

const CONNECTION_FAILURE: AnalysisFailure = {
  kind: 'connection',
  title: 'Can’t reach the PipelineLens backend',
  detail: 'Check that the backend is running, then try again.',
}

const CLIENT_TIMEOUT_FAILURE: AnalysisFailure = {
  kind: 'timeout',
  title: 'No response from the backend',
  detail: `The backend didn’t answer within ${CLIENT_TIMEOUT_MS / 1000} seconds. Try again in a moment.`,
}

const UNREADABLE_REPORT_FAILURE: AnalysisFailure = {
  kind: 'unexpected',
  title: 'The backend sent a report this page can’t read',
  detail: 'Try again. If it keeps happening, check that the frontend and backend versions match.',
}

/** Turns an error response into a message. FastAPI errors carry a JSON `detail`. */
export function describeFailure(status: number, data: unknown): AnalysisFailure {
  const detail = isRecord(data) ? data.detail : undefined
  const message = typeof detail === 'string' && detail.trim() ? detail : null

  if (status === 422) {
    const fields = Array.isArray(detail)
      ? [...new Set(detail.flatMap((error) => (isRecord(error) && Array.isArray(error.loc) ? error.loc : [])))]
          .filter((part): part is string => typeof part === 'string' && part in FIELD_NAMES)
          .map((part) => FIELD_NAMES[part])
      : []
    return {
      kind: 'validation',
      title: 'The backend rejected the input',
      detail:
        fields.length > 0
          ? `It couldn’t accept the ${fields.join(' or the ')}. Check that it contains text, then try again.`
          : 'The request wasn’t valid. Check both fields, then try again.',
    }
  }
  if (status === 413) {
    return {
      kind: 'too-large',
      title: 'The input is too large',
      detail: `${message ?? 'The backend’s size limit was exceeded.'} Shorten the build log, then try again.`,
    }
  }
  if (status === 502 || status === 503 || status === 504) {
    // A gateway or the dev proxy answers without a JSON detail when the backend
    // itself is down; the backend's own 502/503/504 always include one.
    if (!message) return CONNECTION_FAILURE
    if (status === 503) return { kind: 'not-configured', title: 'Analysis isn’t set up on the backend', detail: message }
    if (status === 504) return { kind: 'timeout', title: 'The analysis provider timed out', detail: message }
    return { kind: 'provider', title: 'The analysis provider failed', detail: message }
  }
  return {
    kind: 'unexpected',
    title: 'Unexpected response from the backend',
    detail: `The backend answered with HTTP ${status}. Try again; if it keeps happening, check the backend’s terminal output.`,
  }
}

/**
 * Sends both inputs to the backend. Aborting `signal` resolves to `canceled`
 * so callers can drop the response of a request the user abandoned.
 */
export async function requestAnalysis(
  input: AnalysisRequest,
  signal: AbortSignal,
  timeoutMs = CLIENT_TIMEOUT_MS,
): Promise<AnalysisOutcome> {
  const controller = new AbortController()
  let timedOut = false
  const cancel = () => controller.abort()
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  signal.addEventListener('abort', cancel)
  if (signal.aborted) controller.abort()

  const interrupted = (): AnalysisOutcome | null => {
    if (signal.aborted) return { type: 'canceled' }
    if (timedOut) return { type: 'error', error: CLIENT_TIMEOUT_FAILURE }
    return null
  }

  try {
    let response: Response
    try {
      response = await fetch(ANALYZE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ logs: input.logs, workflow_yaml: input.workflow_yaml }),
        signal: controller.signal,
      })
    } catch {
      return interrupted() ?? { type: 'error', error: CONNECTION_FAILURE }
    }

    let data: unknown
    try {
      data = await response.json()
    } catch {
      data = undefined
    }
    const stopped = interrupted()
    if (stopped) return stopped

    if (!response.ok) return { type: 'error', error: describeFailure(response.status, data) }
    const report = parseReport(data)
    return report ? { type: 'report', report } : { type: 'error', error: UNREADABLE_REPORT_FAILURE }
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', cancel)
  }
}
