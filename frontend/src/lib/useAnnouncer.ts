import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Text for a polite live region. Emptying the region before writing makes
 * screen readers repeat a message even when it matches the previous one.
 */
export function useAnnouncer(): [string, (message: string) => void] {
  const [message, setMessage] = useState('')
  const timer = useRef<number | undefined>(undefined)

  const announce = useCallback((next: string) => {
    setMessage('')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMessage(next), 100)
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return [message, announce]
}
