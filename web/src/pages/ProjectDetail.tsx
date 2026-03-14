import { useParams } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { PhaseBadge } from '../components/PhaseBadge'

interface Project {
  name: string
  namespace: string
  spec: Record<string, unknown>
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

export function ProjectDetailPage() {
  const { namespace, name } = useParams()
  const { data, loading } = useApi<Project>(`/api/v1/projects/${namespace}/${name}`)

  if (loading || !data) return <div className="loading">Loading...</div>

  const s = data.status

  return (
    <div>
      <h1>{data.namespace}/{data.name}</h1>

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
        <div className="card" style={{ marginBottom: '16px' }}>
          <h2>Plan Output</h2>
          <pre>{s.planOutput}</pre>
        </div>
      )}

      <div className="card">
        <h2>Spec</h2>
        <pre>{JSON.stringify(data.spec, null, 2)}</pre>
      </div>
    </div>
  )
}
