import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { PhaseBadge } from '../components/PhaseBadge'
import { stripAnsi, timeAgo } from '../utils'

interface Project {
  name: string
  namespace: string
  spec: Record<string, unknown> & {
    approval?: { mode?: string }
    suspend?: boolean
  }
  status: {
    phase: string
    message: string
    revision: number
    lastJobName: string
    lastAppliedHash: string
    pendingPlanHash: string
    planOutput: string
    planSummary: string
    driftDetected: boolean
    blastRadius?: { add: number; change: number; destroy: number; total: number }
    outputs?: Record<string, string>
    pendingPRURL?: string
  }
  createdAt: string
}

interface Revision {
  revision: number
  appliedHash: string
  jobName: string
  timestamp: string
  status: string
  planSummary: string
  planOutput?: string
  outputs?: Record<string, string>
  snapshot?: Record<string, string>
}

type Tab = 'overview' | 'revisions' | 'spec'

export function ProjectDetailPage() {
  const { namespace, name } = useParams()
  const { data, loading } = useApi<Project>(`/api/v1/projects/${namespace}/${name}`)
  const { data: revisions } = useApi<Revision[]>(`/api/v1/projects/${namespace}/${name}/revisions`)
  const [tab, setTab] = useState<Tab>('overview')
  const [expandedRev, setExpandedRev] = useState<number | null>(null)
  const [approving, setApproving] = useState(false)
  const [rerunning, setRerunning] = useState(false)
  const [suspending, setSuspending] = useState(false)

  if (loading || !data) return <div className="loading">Loading...</div>

  const s = data.status
  const isGitHubPR = data.spec?.approval?.mode === 'githubPR'
  const canApprove = s.phase === 'WaitingApproval' && s.pendingPlanHash && !isGitHubPR
  const isSuspended = data.spec?.suspend === true

  const handleAction = async (action: 'approve' | 'rerun' | 'suspend') => {
    const labels: Record<string, string> = { approve: 'approve this plan', rerun: 'trigger a rerun', suspend: isSuspended ? 'resume this project' : 'suspend this project' }
    if (!confirm(`Are you sure you want to ${labels[action]}?`)) return
    const setters: Record<string, (v: boolean) => void> = { approve: setApproving, rerun: setRerunning, suspend: setSuspending }
    setters[action](true)
    try {
      const url = `/api/v1/projects/${namespace}/${name}/${action}`
      const opts: RequestInit = { method: 'POST', headers: { 'Content-Type': 'application/json' } }
      if (action === 'approve') {
        opts.body = JSON.stringify({ hash: s.pendingPlanHash })
      } else if (action === 'suspend') {
        opts.body = JSON.stringify({ suspend: !isSuspended })
      }
      const res = await fetch(url, opts)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      window.location.reload()
    } catch (e) {
      alert(`${action} failed: ${e}`)
    } finally {
      setters[action](false)
    }
  }

  const actionButton = (label: string, action: 'approve' | 'rerun' | 'suspend', color: string, busy: boolean) => (
    <button
      onClick={() => handleAction(action)}
      disabled={busy}
      style={{
        padding: '8px 20px',
        borderRadius: '6px',
        border: 'none',
        cursor: busy ? 'not-allowed' : 'pointer',
        background: color,
        color: '#fff',
        fontWeight: 600,
        fontSize: '0.9rem',
        opacity: busy ? 0.6 : 1,
      }}
    >
      {busy ? label.replace(/^/, '') + '...' : label}
    </button>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h1 style={{ marginBottom: 0 }}>{data.namespace}/{data.name}</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          {canApprove && actionButton('Approve Plan', 'approve', 'var(--success)', approving)}
          {actionButton('Rerun', 'rerun', 'var(--info)', rerunning)}
          {actionButton(isSuspended ? 'Resume' : 'Suspend', 'suspend', isSuspended ? 'var(--success)' : 'var(--warning)', suspending)}
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: '24px' }}>
        <div className="card">
          <div className="stat-label">Phase</div>
          <div style={{ marginTop: '8px' }}><PhaseBadge phase={s.phase} /></div>
        </div>
        <div className="card">
          <div className="stat-label">Revision</div>
          <div className="stat-value">{s.revision || 0}</div>
        </div>
        <div className="card">
          <div className="stat-label">Drift</div>
          <div className="stat-value" style={{ color: s.driftDetected ? 'var(--warning)' : 'var(--success)' }}>
            {s.driftDetected ? 'Yes' : 'No'}
          </div>
        </div>
        {s.blastRadius && (
          <div className="card">
            <div className="stat-label">Blast Radius</div>
            <div style={{ marginTop: '4px', fontSize: '0.9rem' }}>
              <span style={{ color: 'var(--success)' }}>+{s.blastRadius.add}</span>{' '}
              <span style={{ color: 'var(--warning)' }}>~{s.blastRadius.change}</span>{' '}
              <span style={{ color: 'var(--error)' }}>-{s.blastRadius.destroy}</span>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
        {(['overview', 'revisions', 'spec'] as Tab[]).map(t => (
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
            {t}{t === 'revisions' && revisions ? ` (${revisions.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          {s.message && (
            <div className="card" style={{ marginBottom: '16px' }}>
              <h2>Message</h2>
              <p>{s.message}</p>
            </div>
          )}

          {s.pendingPRURL && (
            <div className="card" style={{ marginBottom: '16px' }}>
              <h2>Pending Approval</h2>
              <a href={s.pendingPRURL} target="_blank" rel="noopener noreferrer">{s.pendingPRURL}</a>
            </div>
          )}

          {s.outputs && Object.keys(s.outputs).length > 0 && (
            <div className="card" style={{ marginBottom: '16px' }}>
              <h2>Outputs</h2>
              <table>
                <thead><tr><th>Key</th><th>Value</th></tr></thead>
                <tbody>
                  {Object.entries(s.outputs).map(([k, v]) => (
                    <tr key={k}><td>{k}</td><td><code>{v}</code></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {s.planOutput && (
            <div className="card">
              <h2>Plan Output</h2>
              <pre>{stripAnsi(s.planOutput)}</pre>
            </div>
          )}
        </>
      )}

      {tab === 'revisions' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {!revisions || revisions.length === 0 ? (
            <div className="loading">No revisions found</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Rev</th>
                  <th>Status</th>
                  <th>Summary</th>
                  <th>Job</th>
                  <th>Hash</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {revisions.map(rev => (
                  <>
                    <tr
                      key={rev.revision}
                      onClick={() => setExpandedRev(expandedRev === rev.revision ? null : rev.revision)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={{ fontWeight: 600 }}>#{rev.revision}</td>
                      <td>
                        <span className={`badge ${rev.status === 'succeeded' ? 'badge-success' : 'badge-error'}`}>
                          {rev.status}
                        </span>
                      </td>
                      <td>{rev.planSummary || '-'}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{rev.jobName}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{rev.appliedHash.slice(0, 8)}</td>
                      <td style={{ color: 'var(--text-muted)' }}>
                        <span title={rev.timestamp}>{timeAgo(rev.timestamp)}</span>
                      </td>
                    </tr>
                    {expandedRev === rev.revision && (
                      <tr key={`${rev.revision}-detail`}>
                        <td colSpan={6} style={{ padding: '16px', background: 'var(--bg)' }}>
                          {rev.outputs && Object.keys(JSON.parse(typeof rev.outputs === 'string' ? rev.outputs : JSON.stringify(rev.outputs))).length > 0 && (
                            <div style={{ marginBottom: '12px' }}>
                              <h2>Outputs</h2>
                              <pre>{typeof rev.outputs === 'string' ? rev.outputs : JSON.stringify(rev.outputs, null, 2)}</pre>
                            </div>
                          )}
                          {rev.snapshot && Object.keys(rev.snapshot).length > 0 && (
                            <div style={{ marginBottom: '12px' }}>
                              <h2>Snapshot Files</h2>
                              {Object.entries(rev.snapshot).map(([file, content]) => (
                                <div key={file} style={{ marginBottom: '8px' }}>
                                  <div style={{ color: 'var(--accent)', fontSize: '0.85rem', marginBottom: '4px' }}>{file}</div>
                                  <pre>{content}</pre>
                                </div>
                              ))}
                            </div>
                          )}
                          {rev.planOutput && (
                            <div>
                              <h2>Plan Output</h2>
                              <pre>{stripAnsi(rev.planOutput)}</pre>
                            </div>
                          )}
                          {!rev.planOutput && !rev.snapshot && (
                            <span style={{ color: 'var(--text-muted)' }}>No detailed data stored for this revision.</span>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'spec' && (
        <div className="card">
          <h2>Spec</h2>
          <pre>{JSON.stringify(data.spec, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}
