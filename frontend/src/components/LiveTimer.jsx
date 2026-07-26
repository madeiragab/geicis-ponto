import { useEffect, useState } from 'react'

function elapsed(sinceISO) {
  const start = new Date(sinceISO).getTime()
  return Math.max(0, Math.floor((Date.now() - start) / 1000))
}

function format(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

/**
 * Counts up from the server's `check_in`, recomputed from the clock on every
 * tick rather than incremented. A page refresh, a sleeping laptop, or a
 * throttled background tab cannot make it drift.
 */
export default function LiveTimer({ since, className }) {
  const [seconds, setSeconds] = useState(() => elapsed(since))

  useEffect(() => {
    setSeconds(elapsed(since))
    const id = setInterval(() => setSeconds(elapsed(since)), 1000)
    return () => clearInterval(id)
  }, [since])

  return (
    <span className={className}>
      <span className="tabular">{format(seconds)}</span>
    </span>
  )
}
