import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { timeAgo } from '../utils'

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
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  if (loading || !data) return <div className="loading">Loading...</div>

  const q = search.toLowerCase()
  const filtered = q
    ? data.filter(p => p.name.toLowerCase().includes(q) || p.namespace.toLowerCase().includes(q))
    : data

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h1 style={{ marginBottom: 0 }}>Programs ({filtered.length})</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={() => navigate('/programs/new')} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: '0.85rem' }}>+ Create</button>
        <input
          type="text"
          placeholder="Search programs..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--text)',
            fontSize: '0.85rem',
            width: '240px',
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
              <th>Namespace</th>
              <th>Source</th>
              <th>Providers</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
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
                <td style={{ color: 'var(--text-muted)' }} title={p.createdAt}>
                  {timeAgo(p.createdAt)}
                </td>
                <td>
                  <button onClick={async () => { if (!confirm(`Delete program ${p.name}?`)) return; await fetch(`/api/v1/programs/${p.namespace}/${p.name}`, { method: 'DELETE' }); window.location.reload() }} style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: '0.8rem' }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
