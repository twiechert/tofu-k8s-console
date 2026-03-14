import { useApi } from '../hooks/useApi'

interface Program {
  name: string
  namespace: string
  spec: {
    programHCL?: string
    source?: { url: string; ref?: string; path?: string }
    providers?: { name: string; source?: string; version?: string }[]
  }
  createdAt: string
}

export function ProgramsPage() {
  const { data, loading } = useApi<Program[]>('/api/v1/programs')

  if (loading || !data) return <div className="loading">Loading...</div>

  return (
    <div>
      <h1>Programs ({data.length})</h1>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Namespace</th>
              <th>Source</th>
              <th>Providers</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {data.map(p => (
              <tr key={`${p.namespace}/${p.name}`}>
                <td>{p.name}</td>
                <td style={{ color: 'var(--text-muted)' }}>{p.namespace}</td>
                <td>
                  {p.spec?.source
                    ? <span title={p.spec.source.url}>{p.spec.source.url.split('/').pop()} @ {p.spec.source.ref || 'main'}</span>
                    : <span style={{ color: 'var(--text-muted)' }}>inline HCL</span>
                  }
                </td>
                <td>
                  {p.spec?.providers?.map(pr => pr.name).join(', ') || '-'}
                </td>
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
