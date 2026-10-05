import { useEffect, useRef, useState } from 'react'
import { MAX_COMBINED_CHARACTERS } from '../lib/text'
import { formatCount, formatNumber, SOURCES } from '../sources'
import { AlertIcon } from './Icons'

type BudgetStatus = 'ok' | 'near' | 'over'

const NEAR_RATIO = 0.9

function budgetStatus(total: number): BudgetStatus {
  if (total > MAX_COMBINED_CHARACTERS) return 'over'
  return total >= MAX_COMBINED_CHARACTERS * NEAR_RATIO ? 'near' : 'ok'
}

const LIMIT = formatNumber(MAX_COMBINED_CHARACTERS)

const STATUS_ANNOUNCEMENTS: Record<BudgetStatus, string> = {
  ok: `Combined input is within the ${LIMIT} character limit.`,
  near: `Combined input is close to the ${LIMIT} character limit.`,
  over: `Combined input is over the ${LIMIT} character limit.`,
}

interface CombinedSizeProps {
  logs: number
  workflow: number
  summaryId: string
  messageId: string
}

export function CombinedSize({ logs, workflow, summaryId, messageId }: CombinedSizeProps) {
  const total = logs + workflow
  const status = budgetStatus(total)
  const scale = Math.max(total, MAX_COMBINED_CHARACTERS)
  const share = (value: number) => `${(value / scale) * 100}%`

  // Announce crossings once typing settles, not every keystroke.
  const [announcement, setAnnouncement] = useState('')
  const announced = useRef<BudgetStatus>(status)
  useEffect(() => {
    if (status === announced.current) return
    const timer = window.setTimeout(() => {
      announced.current = status
      // Emptied inputs (e.g. after Clear) are announced by whatever emptied them.
      setAnnouncement(total === 0 ? '' : STATUS_ANNOUNCEMENTS[status])
    }, 700)
    return () => window.clearTimeout(timer)
  }, [status, total])

  let message
  if (status === 'over') {
    message = (
      <>
        <AlertIcon />
        <span>
          <span className="sr-only">Error: </span>
          {formatCount(total - MAX_COMBINED_CHARACTERS, 'character')} over the limit. Remove log lines unrelated
          to the failure; the failed step’s output is usually enough.
        </span>
      </>
    )
  } else if (total === 0) {
    message = `The build log and workflow YAML share one ${LIMIT} character limit.`
  } else {
    message = `${formatCount(MAX_COMBINED_CHARACTERS - total, 'character')} left.`
  }

  return (
    <section className={`budget budget--${status}`} aria-labelledby="budget-title">
      <div className="budget-head">
        <h2 className="budget-title" id="budget-title">
          Combined size
        </h2>
        <p className="budget-count" id={summaryId}>
          <span className="budget-total">{formatNumber(total)}</span> of {LIMIT} characters
        </p>
      </div>

      <div className="budget-bar" aria-hidden="true">
        <span className="budget-segment budget-segment--logs" style={{ width: share(logs) }} />
        <span className="budget-segment budget-segment--workflow" style={{ width: share(workflow) }} />
        {status === 'over' && (
          <span className="budget-overflow" style={{ left: share(MAX_COMBINED_CHARACTERS) }} />
        )}
      </div>

      <div className="budget-foot">
        <p className="budget-message" id={messageId}>
          {message}
        </p>
        <ul className="budget-legend" aria-hidden="true">
          <li className="legend-item legend-item--logs">{SOURCES.logs.label}</li>
          <li className="legend-item legend-item--workflow">{SOURCES.workflow.label}</li>
        </ul>
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </section>
  )
}
