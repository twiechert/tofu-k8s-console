import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { timeAgo, stripAnsi } from '../utils'

interface Job {
  name: string
  namespace: string
  project: string
  jobType: string
  status: string
  startTime?: string
  endTime?: string
  durationSec?: number
}

const statusBadge: Record<string, { cls: string; label: string }> = {
  running: { cls: 'badge-info', label: 'running' },
  succeeded: { cls: 'badge-success', label: 'succeeded' },
  failed: { cls: 'badge-error', label: 'failed' },
  pending: { cls: 'badge-muted', label: 'pending' },
}

const typeBadge: Record<string, string> = {
  plan: 'badge-info',
  apply: 'badge-success',
  destroy: 'badge-error',
  drift: 'badge-warning',
}

function formatDuration(sec?: number): string {
  if (sec === undefined || sec === null) return '-'
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const s = sec % 60
  if (min < 60) return `${min}m ${s}s`
  const h = Math.floor(min / 60)
  return `${h}h ${min % 60}m`
}

export function JobsPage() {
  const { data, loading } = useApi<Job[]>('/api/v1/jobs')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'running' | 'failed'>('all')
  const [expandedJob, setExpandedJob] = useState<string | null>(null)
  const [logs, setLogs] = useState<Record<string, string>>({})
  const [loadingLogs, setLoadingLogs] = useState<string | null>(null)

  if (loading || !data) return <div className="loading">Loading...</div>

  // Sort: running first, then by start time desc
  const sorted = [...data].sort((a, b) => {
    if (a.status === 'running' && b.status !== 'running') return -1
    if (b.status === 'running' && a.status !== 'running') return 1
    return (b.startTime || '').localeCompare(a.startTime || '')
  })

  const q = search.toLowerCase()
  const filtered = sorted.filter(j => {
    if (filter === 'running' && j.status !== 'running') return false
    if (filter === 'failed' && j.status !== 'failed') return false
    if (q && !j.name.toLowerCase().includes(q) && !j.project.toLowerCase().includes(q) && !j.namespace.toLowerCase().includes(q)) return false
    return true
  })

  const toggleLogs = async (ns: string, name: string) => {
    const key = `${ns}/${name}`
    if (expandedJob === key) {
      setExpandedJob(null)
      return
    }
    setExpandedJob(key)
    if (!logs[key]) {
      setLoadingLogs(key)
      try {
        const res = await fetch(`/api/v1/jobs/${ns}/${name}/logs`)
        if (res.ok) {
          const data = await res.json()
          setLogs(prev => ({ ...prev, [key]: data.logs }))
        } else {
          setLogs(prev => ({ ...prev, [key]: `(failed to load logs: HTTP ${res.status})` }))
        }
      } catch (e) {
        setLogs(prev => ({ ...prev, [key]: `(failed to load logs: ${e})` }))
      } finally {
        setLoadingLogs(null)
      }
    }
  }

  const runningCount = data.filter(j => j.status === 'running').length
  const failedCount = data.filter(j => j.status === 'failed').length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h1 style={{ marginBottom: 0 }}>
          Jobs ({filtered.length})
          {runningCount > 0 && <span style={{ fontSize: '0.8rem', color: 'var(--info)', marginLeft: '8px' }}>{runningCount} running</span>}
        </h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '2px' }}>
            {(['all', 'running', 'failed'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '4px',
                  border: 'none',
                  cursor: 'pointer',
                  background: filter === f ? 'rgba(20, 184, 166, 0.15)' : 'var(--bg-card)',
                  color: filter === f ? 'var(--accent)' : 'var(--text-muted)',
                  fontSize: '0.8rem',
                  fontWeight: filter === f ? 600 : 400,
                  textTransform: 'capitalize',
                }}
              >
                {f}{f === 'running' && runningCount > 0 ? ` (${runningCount})` : ''}{f === 'failed' && failedCount > 0 ? ` (${failedCount})` : ''}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Search jobs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: 'var(--text)',
              fontSize: '0.85rem',
              width: '220px',
              outline: 'none',
            }}
          />
        </div>
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Project</th>
              <th>Type</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Started</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>No jobs found</td></tr>
            ) : filtered.map(j => {
              const sb = statusBadge[j.status] || { cls: 'badge-muted', label: j.status }
              const tb = typeBadge[j.jobType] || 'badge-muted'
              const key = `${j.namespace}/${j.name}`
              const isExpanded = expandedJob === key
              return (
                <>
                  <tr key={key} onClick={() => toggleLogs(j.namespace, j.name)} style={{ cursor: 'pointer' }}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      <span style={{ color: 'var(--text-muted)', marginRight: '6px' }}>{isExpanded ? '▾' : '▸'}</span>
                      {j.name}
                    </td>
                    <td>
                      {j.project ? (
                        <Link to={`/projects/${j.namespace}/${j.project}`} onClick={e => e.stopPropagation()}>{j.project}</Link>
                      ) : '-'}
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}> ({j.namespace})</span>
                    </td>
                    <td><span className={`badge ${tb}`}>{j.jobType}</span></td>
                    <td>
                      <span className={`badge ${sb.cls}`}>
                        {j.status === 'running' && '● '}{sb.label}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {j.status === 'running' ? (
                        <span style={{ color: 'var(--info)' }}>{formatDuration(j.durationSec)} ...</span>
                      ) : (
                        formatDuration(j.durationSec)
                      )}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }} title={j.startTime}>
                      {j.startTime ? timeAgo(j.startTime) : '-'}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${key}-logs`}>
                      <td colSpan={6} style={{ padding: '0 16px 16px', background: 'var(--bg)' }}>
                        {loadingLogs === key ? (
                          <div style={{ color: 'var(--text-muted)', padding: '12px' }}>Loading logs...</div>
                        ) : (
                          <pre style={{ maxHeight: '400px', overflow: 'auto' }}>{stripAnsi(logs[key] || '')}</pre>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
