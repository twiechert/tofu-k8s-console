import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { PhaseBadge } from '../components/PhaseBadge'
import { timeAgo } from '../utils'

interface BlastRadius {
  add: number
  change: number
  destroy: number
  total: number
}

interface DriftProject {
  name: string
  namespace: string
  phase: string
  driftDetected: boolean
  blastRadius?: BlastRadius
  planSummary?: string
  programRef: string
  suspended: boolean
  pendingPlanHash?: string
}

interface DriftJob {
  name: string
  namespace: string
  project: string
  jobType: string
  status: string
  startTime?: string
  endTime?: string
  durationSec?: number
}

interface DriftData {
  totalProjects: number
  driftedCount: number
  byNamespace: Record<string, number>
  bySeverity: Record<string, number>
  projects: DriftProject[]
  driftJobs: DriftJob[]
}

type Filter = 'all' | 'drifted' | 'clean'

const severityColor: Record<string, string> = {
  high: 'var(--error)',
  medium: 'var(--warning)',
  low: 'var(--info)',
}

function classifySeverity(br?: BlastRadius): string {
  if (!br) return 'low'
  if (br.total >= 10) return 'high'
  if (br.total >= 3) return 'medium'
  return 'low'
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

const statusBadge: Record<string, { cls: string; label: string }> = {
  running: { cls: 'badge-info', label: 'running' },
  succeeded: { cls: 'badge-success', label: 'succeeded' },
  failed: { cls: 'badge-error', label: 'failed' },
  pending: { cls: 'badge-muted', label: 'pending' },
}

export function DriftPage() {
  const { data, loading } = useApi<DriftData>('/api/v1/drift', 5000)
  const [filter, setFilter] = useState<Filter>('drifted')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'projects' | 'jobs'>('projects')
  const [rerunning, setRerunning] = useState<string | null>(null)

  if (loading || !data) return <div className="loading">Loading...</div>

  const q = search.toLowerCase()
  const filteredProjects = data.projects.filter(p => {
    if (filter === 'drifted' && !p.driftDetected) return false
    if (filter === 'clean' && p.driftDetected) return false
    if (q && !p.name.toLowerCase().includes(q) && !p.namespace.toLowerCase().includes(q) && !p.programRef.toLowerCase().includes(q)) return false
    return true
  })

  // Sort: drifted first, then by severity (high first), then alphabetically
  const sortedProjects = [...filteredProjects].sort((a, b) => {
    if (a.driftDetected !== b.driftDetected) return a.driftDetected ? -1 : 1
    const sa = classifySeverity(a.blastRadius)
    const sb = classifySeverity(b.blastRadius)
    const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
    if (severityOrder[sa] !== severityOrder[sb]) return severityOrder[sa] - severityOrder[sb]
    return a.name.localeCompare(b.name)
  })

  // Sort drift jobs by start time desc
  const sortedJobs = [...(data.driftJobs || [])].sort((a, b) =>
    (b.startTime || '').localeCompare(a.startTime || '')
  )

  // Find latest drift job per project
  const latestDriftJob: Record<string, DriftJob> = {}
  for (const j of sortedJobs) {
    const key = `${j.namespace}/${j.project}`
    if (!latestDriftJob[key]) latestDriftJob[key] = j
  }

  const handleRerun = async (ns: string, name: string) => {
    const key = `${ns}/${name}`
    if (!confirm(`Trigger a rerun for ${name}?`)) return
    setRerunning(key)
    try {
      const res = await fetch(`/api/v1/projects/${ns}/${name}/rerun`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    } catch (e) {
      alert(`Rerun failed: ${e}`)
    } finally {
      setRerunning(null)
    }
  }

  const highCount = data.bySeverity?.high || 0
  const medCount = data.bySeverity?.medium || 0
  const lowCount = data.bySeverity?.low || 0

  return (
    <div>
      <h1>Drift Detection</h1>

      {/* Summary cards */}
      <div className="grid grid-4" style={{ marginBottom: '24px' }}>
        <div className="card">
          <div className="stat-value" style={{ color: data.driftedCount > 0 ? 'var(--warning)' : 'var(--success)' }}>
            {data.driftedCount}
          </div>
          <div className="stat-label">Projects with Drift</div>
        </div>
        <div className="card">
          <div className="stat-value" style={{ color: highCount > 0 ? 'var(--error)' : 'var(--text-muted)' }}>
            {highCount}
          </div>
          <div className="stat-label">High Severity</div>
        </div>
        <div className="card">
          <div className="stat-value" style={{ color: medCount > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
            {medCount}
          </div>
          <div className="stat-label">Medium Severity</div>
        </div>
        <div className="card">
          <div className="stat-value" style={{ color: lowCount > 0 ? 'var(--info)' : 'var(--text-muted)' }}>
            {lowCount}
          </div>
          <div className="stat-label">Low Severity</div>
        </div>
      </div>

      {/* Drift by namespace */}
      {data.driftedCount > 0 && Object.keys(data.byNamespace).length > 0 && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <h2>Drift by Namespace</h2>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {Object.entries(data.byNamespace)
              .sort(([, a], [, b]) => b - a)
              .map(([ns, count]) => (
                <div key={ns} style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  background: 'rgba(234, 179, 8, 0.1)',
                  border: '1px solid rgba(234, 179, 8, 0.2)',
                  fontSize: '0.85rem',
                }}>
                  <span style={{ color: 'var(--text)' }}>{ns}</span>
                  <span style={{ color: 'var(--warning)', fontWeight: 600, marginLeft: '8px' }}>{count}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Tab toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['projects', 'jobs'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: tab === t ? 'rgba(20, 184, 166, 0.15)' : 'var(--bg-card)',
                color: tab === t ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: tab === t ? 600 : 400,
                textTransform: 'capitalize',
              }}
            >
              {t === 'projects' ? `Projects (${filteredProjects.length})` : `Drift Jobs (${sortedJobs.length})`}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {tab === 'projects' && (
            <div style={{ display: 'flex', gap: '2px' }}>
              {(['drifted', 'all', 'clean'] as const).map(f => (
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
                  {f}{f === 'drifted' ? ` (${data.driftedCount})` : ''}
                </button>
              ))}
            </div>
          )}
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: 'var(--text)',
              fontSize: '0.85rem',
              width: '200px',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Projects table */}
      {tab === 'projects' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Namespace</th>
                <th>Program</th>
                <th>Phase</th>
                <th>Drift</th>
                <th>Severity</th>
                <th>Blast Radius</th>
                <th>Last Check</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedProjects.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                  {filter === 'drifted' ? 'No drift detected across any projects' : 'No projects found'}
                </td></tr>
              ) : sortedProjects.map(p => {
                const severity = p.driftDetected ? classifySeverity(p.blastRadius) : null
                const lastJob = latestDriftJob[`${p.namespace}/${p.name}`]
                const key = `${p.namespace}/${p.name}`
                return (
                  <tr key={key}>
                    <td>
                      <Link to={`/projects/${p.namespace}/${p.name}`}>{p.name}</Link>
                      {p.suspended && <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: '6px' }}>(suspended)</span>}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{p.namespace}</td>
                    <td>{p.programRef}</td>
                    <td><PhaseBadge phase={p.phase} /></td>
                    <td>
                      {p.driftDetected ? (
                        <span className="badge badge-warning">drift</span>
                      ) : (
                        <span className="badge badge-success">clean</span>
                      )}
                    </td>
                    <td>
                      {severity ? (
                        <span style={{ color: severityColor[severity], fontWeight: 600, fontSize: '0.85rem', textTransform: 'uppercase' }}>
                          {severity}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
                    <td>
                      {p.driftDetected && p.blastRadius ? (
                        <span style={{ fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--success)' }}>+{p.blastRadius.add}</span>{' '}
                          <span style={{ color: 'var(--warning)' }}>~{p.blastRadius.change}</span>{' '}
                          <span style={{ color: 'var(--error)' }}>-{p.blastRadius.destroy}</span>
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {lastJob ? (
                        <span title={lastJob.startTime}>
                          {timeAgo(lastJob.startTime || '')}
                          {lastJob.status === 'failed' && <span style={{ color: 'var(--error)', marginLeft: '4px' }}>(failed)</span>}
                          {lastJob.status === 'running' && <span style={{ color: 'var(--info)', marginLeft: '4px' }}>(running)</span>}
                        </span>
                      ) : '-'}
                    </td>
                    <td>
                      {p.driftDetected && (
                        <button
                          onClick={() => handleRerun(p.namespace, p.name)}
                          disabled={rerunning === key}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            border: 'none',
                            cursor: rerunning === key ? 'not-allowed' : 'pointer',
                            background: 'var(--info)',
                            color: '#fff',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            opacity: rerunning === key ? 0.6 : 1,
                          }}
                        >
                          {rerunning === key ? '...' : 'Rerun'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Drift Jobs tab */}
      {tab === 'jobs' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Project</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {sortedJobs.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>No drift jobs found</td></tr>
              ) : sortedJobs.map(j => {
                const sb = statusBadge[j.status] || { cls: 'badge-muted', label: j.status }
                return (
                  <tr key={`${j.namespace}/${j.name}`}>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{j.name}</td>
                    <td>
                      {j.project ? (
                        <Link to={`/projects/${j.namespace}/${j.project}`}>{j.project}</Link>
                      ) : '-'}
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}> ({j.namespace})</span>
                    </td>
                    <td>
                      <span className={`badge ${sb.cls}`}>
                        {j.status === 'running' && '● '}{sb.label}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {j.status === 'running' ? (
                        <span style={{ color: 'var(--info)' }}>{formatDuration(j.durationSec)} ...</span>
                      ) : formatDuration(j.durationSec)}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }} title={j.startTime}>
                      {j.startTime ? timeAgo(j.startTime) : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
