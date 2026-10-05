import { afterEach, describe, expect, it, vi } from 'vitest'
import { ANALYZE_URL, describeFailure, parseReport, requestAnalysis } from './api'

// Shaped like backend/pipelinelens/examples/python_version_mismatch/expected_report.json.
const REPORT = {
  status: 'diagnosed',
  summary: 'The workflow runs on Python 3.9, but the project requires 3.11.',
  likely_cause: 'setup-python pins 3.9.',
  evidence: [{ source: 'workflow', line_number: 17, quoted_text: '          python-version: "3.9"' }],
  suggested_changes: [{ description: 'Use Python 3.11.', file: '.github/workflows/ci.yml', details: null }],
  verification_steps: ['Re-run the workflow.'],
  missing_information: [],
}

const INPUT = { logs: 'log line', workflow_yaml: 'name: CI' }

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function mockFetch(implementation: (url: string, init: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(implementation)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** A fetch that never answers, rejecting only when its signal aborts. */
function hangingFetch() {
  return mockFetch(
    (_url, init) =>
      new Promise((_resolve, reject) =>
        init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))),
      ),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('parseReport', () => {
  it('accepts the backend contract', () => {
    expect(parseReport(REPORT)).toEqual(REPORT)
  })

  it('accepts needs_more_context with a null cause', () => {
    const report = { ...REPORT, status: 'needs_more_context', likely_cause: null, missing_information: ['Full log'] }
    expect(parseReport(report)?.status).toBe('needs_more_context')
  })

  it('rejects bodies that do not match', () => {
    expect(parseReport(null)).toBeNull()
    expect(parseReport({ ...REPORT, status: 'fixed' })).toBeNull()
    expect(parseReport({ ...REPORT, summary: 3 })).toBeNull()
    expect(parseReport({ ...REPORT, evidence: [{ source: 'logs', line_number: 0, quoted_text: 'x' }] })).toBeNull()
    expect(parseReport({ ...REPORT, evidence: [{ source: 'stdout', line_number: 1, quoted_text: 'x' }] })).toBeNull()
    expect(parseReport({ ...REPORT, verification_steps: [1] })).toBeNull()
  })
})

describe('requestAnalysis', () => {
  it('posts exactly logs and workflow_yaml as JSON', async () => {
    const fetchMock = mockFetch(async () => jsonResponse(200, REPORT))
    const outcome = await requestAnalysis(INPUT, new AbortController().signal)
    expect(outcome).toEqual({ type: 'report', report: REPORT })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(ANALYZE_URL)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(INPUT)
  })

  it('reports a malformed success body instead of rendering it', async () => {
    mockFetch(async () => jsonResponse(200, { status: 'diagnosed' }))
    const outcome = await requestAnalysis(INPUT, new AbortController().signal)
    expect(outcome.type === 'error' && outcome.error.kind).toBe('unexpected')
  })

  it('treats a network failure as a connection problem', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    const outcome = await requestAnalysis(INPUT, new AbortController().signal)
    expect(outcome.type === 'error' && outcome.error.kind).toBe('connection')
  })

  it('resolves to canceled when the caller aborts', async () => {
    hangingFetch()
    const controller = new AbortController()
    const pending = requestAnalysis(INPUT, controller.signal)
    controller.abort()
    expect(await pending).toEqual({ type: 'canceled' })
  })

  it('gives up after the client timeout', async () => {
    vi.useFakeTimers()
    hangingFetch()
    const pending = requestAnalysis(INPUT, new AbortController().signal, 1000)
    await vi.advanceTimersByTimeAsync(1000)
    const outcome = await pending
    expect(outcome.type === 'error' && outcome.error.kind).toBe('timeout')
  })
})

describe('describeFailure', () => {
  it('names the rejected fields on 422', () => {
    const body = { detail: [{ loc: ['body', 'workflow_yaml'], msg: 'Invalid request field.', type: 'value_error' }] }
    expect(describeFailure(422, body).detail).toContain('workflow YAML')
  })

  it('maps backend errors by status and keeps their detail', () => {
    expect(describeFailure(413, { detail: 'Too large.' })).toMatchObject({ kind: 'too-large' })
    expect(describeFailure(503, { detail: 'Set LLM_API_KEY.' })).toMatchObject({
      kind: 'not-configured',
      detail: 'Set LLM_API_KEY.',
    })
    expect(describeFailure(504, { detail: 'Timed out.' })).toMatchObject({ kind: 'timeout' })
    expect(describeFailure(502, { detail: 'Provider failed.' })).toMatchObject({ kind: 'provider' })
  })

  it('treats gateway errors without a backend detail as unreachable', () => {
    expect(describeFailure(502, undefined).kind).toBe('connection')
    expect(describeFailure(504, '<html>Gateway Timeout</html>').kind).toBe('connection')
  })

  it('falls back for anything else', () => {
    expect(describeFailure(500, undefined)).toMatchObject({ kind: 'unexpected' })
  })
})
