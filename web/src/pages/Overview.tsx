import { useApi } from '../hooks/useApi'

interface OverviewData {
  totalProjects: number
  totalPrograms: number
  phaseBreakdown: Record<string, number>
  driftCount: number
  errorCount: number
  namespaces: string[]
}

export function OverviewPage() {
  const { data, loading } = useApi<OverviewData>('/api/v1/overview')

  if (loading || !data) return <div className="loading">Loading...</div>

  return (
    <div>
      <h1>Overview</h1>
      <div className="grid grid-4" style={{ marginBottom: '24px' }}>
        <div className="card">
          <div className="stat-value">{data.totalProjects}</div>
          <div className="stat-label">Projects</div>
        </div>
        <div className="card">
          <div className="stat-value">{data.totalPrograms}</div>
          <div className="stat-label">Programs</div>
        </div>
        <div className="card">
          <div className="stat-value" style={{ color: data.errorCount > 0 ? 'var(--error)' : 'var(--success)' }}>
            {data.errorCount}
          </div>
          <div className="stat-label">Errors</div>
        </div>
        <div className="card">
          <div className="stat-value" style={{ color: data.driftCount > 0 ? 'var(--warning)' : 'var(--success)' }}>
            {data.driftCount}
          </div>
          <div className="stat-label">Drift Detected</div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div className="card">
          <h2>Phase Breakdown</h2>
          <table>
            <thead>
              <tr><th>Phase</th><th>Count</th></tr>
            </thead>
            <tbody>
              {Object.entries(data.phaseBreakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([phase, count]) => (
                  <tr key={phase}>
                    <td>{phase}</td>
                    <td>{count}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>Namespaces</h2>
          <table>
            <thead>
              <tr><th>Namespace</th></tr>
            </thead>
            <tbody>
              {data.namespaces.sort().map(ns => (
                <tr key={ns}><td>{ns}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
