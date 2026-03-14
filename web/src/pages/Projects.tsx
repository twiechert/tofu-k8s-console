import { Link } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { PhaseBadge } from '../components/PhaseBadge'

interface Project {
  name: string
  namespace: string
  spec: {
    programRef: { name: string }
    autoApprove?: boolean
    tofuVersion?: string
  }
  status: {
    phase: string
    message: string
    revision: number
    driftDetected?: boolean
    blastRadius?: { total: number }
  }
  createdAt: string
}

export function ProjectsPage() {
  const { data, loading } = useApi<Project[]>('/api/v1/projects')

  if (loading || !data) return <div className="loading">Loading...</div>

  return (
    <div>
      <h1>Projects ({data.length})</h1>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Namespace</th>
              <th>Program</th>
              <th>Phase</th>
              <th>Revision</th>
              <th>Drift</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {data.map(p => (
              <tr key={`${p.namespace}/${p.name}`}>
                <td>
                  <Link to={`/projects/${p.namespace}/${p.name}`}>{p.name}</Link>
                </td>
                <td style={{ color: 'var(--text-muted)' }}>{p.namespace}</td>
                <td>{p.spec?.programRef?.name}</td>
                <td><PhaseBadge phase={p.status?.phase} /></td>
                <td>{p.status?.revision || 0}</td>
                <td>{p.status?.driftDetected ? '⚠' : '-'}</td>
                <td style={{ color: 'var(--text-muted)' }}>
                  {new Date(p.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
