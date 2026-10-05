/** A pipeline of steps with a lens over the failing one. */
export function LensMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M4 16H13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="4" cy="16" r="2.75" fill="currentColor" />
      <circle cx="10.5" cy="16" r="2.75" fill="currentColor" />
      <circle cx="20" cy="16" r="6.75" fill="none" stroke="var(--logs)" strokeWidth="2.5" />
      <circle cx="20" cy="16" r="2.75" fill="var(--danger)" />
      <path d="M25 21L29 25" stroke="var(--logs)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function AlertIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path d="M8 4.25V9" stroke="var(--on-status)" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="8" cy="11.5" r="1" fill="var(--on-status)" />
    </svg>
  )
}

export function CheckIcon() {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path
        d="M5 8.25L7.1 10.25L11 6"
        fill="none"
        stroke="var(--on-status)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
