// Strip ANSI escape codes from text
// eslint-disable-next-line no-control-regex
const ansiRegex = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x07|\^\[\[[0-9;]*[a-zA-Z]/g

export function stripAnsi(text: string): string {
  return text.replace(ansiRegex, '')
}

// Format a date string as relative time (e.g. "5m ago", "2h ago")
export function timeAgo(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  if (isNaN(diffMs)) return dateStr

  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}
