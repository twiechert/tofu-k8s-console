import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { PhaseBadge } from '../components/PhaseBadge'
import { timeAgo } from '../utils'

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
  const { data, loading } = useApi<Project[]>('/api/v1/projects', 5000)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  if (loading || !data) return <div className="loading">Loading...</div>

  const q = search.toLowerCase()
  const filtered = q
    ? data.filter(p => p.name.toLowerCase().includes(q) || p.namespace.toLowerCase().includes(q) || p.spec?.programRef?.name?.toLowerCase().includes(q))
    : data

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h1 style={{ marginBottom: 0 }}>Projects ({filtered.length})</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={() => navigate('/projects/new')} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: '0.85rem' }}>+ Create</button>
        <input
          type="text"
          placeholder="Search projects..."
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
              <th>Program</th>
              <th>Phase</th>
              <th>Revision</th>
              <th>Drift</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={`${p.namespace}/${p.name}`}>
                <td>
                  <Link to={`/projects/${p.namespace}/${p.name}`}>{p.name}</Link>
                </td>
                <td style={{ color: 'var(--text-muted)' }}>{p.namespace}</td>
                <td>{p.spec?.programRef?.name}</td>
                <td><PhaseBadge phase={p.status?.phase} /></td>
                <td>{p.status?.revision || 0}</td>
                <td>{p.status?.driftDetected ? '⚠' : '-'}</td>
                <td style={{ color: 'var(--text-muted)' }} title={p.createdAt}>
                  {timeAgo(p.createdAt)}
                </td>
                <td>
                  <button onClick={async (e) => { e.stopPropagation(); if (!confirm(`Delete project ${p.name}?`)) return; await fetch(`/api/v1/projects/${p.namespace}/${p.name}`, { method: 'DELETE' }); window.location.reload() }} style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: '0.8rem' }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
