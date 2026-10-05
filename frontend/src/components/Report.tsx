import type { Ref } from 'react'
import type { AnalysisReport } from '../lib/api'
import { SOURCES } from '../sources'

const STATUS_LABELS: Record<AnalysisReport['status'], string> = {
  diagnosed: 'Diagnosed',
  needs_more_context: 'Needs more context',
}

interface ReportProps {
  report: AnalysisReport
  ref?: Ref<HTMLElement>
}

// Every value is rendered as a React text node, so report content can never
// become markup or script.
export function Report({ report, ref }: ReportProps) {
  return (
    <section className="report" aria-labelledby="report-title" tabIndex={-1} ref={ref}>
      <div className="report-head">
        <h2 className="report-title" id="report-title">
          Analysis
        </h2>
        <p className={`report-status report-status--${report.status}`}>{STATUS_LABELS[report.status]}</p>
      </div>
      <p className="report-summary">{report.summary}</p>

      {report.likely_cause && (
        <section className="report-section" aria-labelledby="report-cause">
          <h3 id="report-cause">Likely cause</h3>
          <p>{report.likely_cause}</p>
        </section>
      )}

      {report.missing_information.length > 0 && (
        <section className="report-section" aria-labelledby="report-missing">
          <h3 id="report-missing">Missing information</h3>
          <ul className="report-list">
            {report.missing_information.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {report.evidence.length > 0 && (
        <section className="report-section" aria-labelledby="report-evidence">
          <h3 id="report-evidence">Evidence</h3>
          <ol className="evidence-list">
            {report.evidence.map((item, index) => (
              <li key={index} className={`evidence evidence--${item.source}`}>
                <p className="evidence-ref">
                  <span className="swatch" aria-hidden="true" />
                  {SOURCES[item.source].label}, line {item.line_number}
                </p>
                <pre className="evidence-quote">
                  <code>{item.quoted_text}</code>
                </pre>
              </li>
            ))}
          </ol>
        </section>
      )}

      {report.suggested_changes.length > 0 && (
        <section className="report-section" aria-labelledby="report-changes">
          <h3 id="report-changes">Suggested changes</h3>
          <p className="report-caveat">Suggestions only. Nothing has been applied or tested; review each change first.</p>
          <ol className="report-list">
            {report.suggested_changes.map((change, index) => (
              <li key={index}>
                <p>{change.description}</p>
                {change.file && (
                  <p className="change-file">
                    File: <code>{change.file}</code>
                  </p>
                )}
                {change.details && <p className="change-details">{change.details}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {report.verification_steps.length > 0 && (
        <section className="report-section" aria-labelledby="report-verify">
          <h3 id="report-verify">Verification steps</h3>
          <ol className="report-list">
            {report.verification_steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </section>
      )}

      <p className="report-footnote">
        Written by the configured AI model, so it can be wrong. Each quote was checked against your input: that
        shows where it came from, not that the diagnosis is right.
      </p>
    </section>
  )
}
