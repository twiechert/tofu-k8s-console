import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '../hooks/useApi'

interface Project {
  name: string
  namespace: string
  status: { phase: string }
}

interface Resource {
  address: string
  type: string
  name: string
  action: string
  id?: string
}

const actionBadge: Record<string, { cls: string; label: string }> = {
  exists: { cls: 'badge-success', label: 'in sync' },
  create: { cls: 'badge-info', label: 'create' },
  update: { cls: 'badge-warning', label: 'update' },
  destroy: { cls: 'badge-error', label: 'destroy' },
  replace: { cls: 'badge-error', label: 'replace' },
  read: { cls: 'badge-muted', label: 'read' },
}

function ResourceTable({ resources, showProject, projectLink }: { resources: (Resource & { project?: string; namespace?: string })[]; showProject?: boolean; projectLink?: (ns: string, name: string) => string }) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <table>
        <thead>
          <tr>
            {showProject && <th>Project</th>}
            <th>Address</th>
            <th>Type</th>
            <th>Name</th>
            <th>Status</th>
            <th>ID</th>
          </tr>
        </thead>
        <tbody>
          {resources.length === 0 ? (
            <tr><td colSpan={showProject ? 6 : 5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>No resources found</td></tr>
          ) : resources.map((r, i) => {
            const badge = actionBadge[r.action] || { cls: 'badge-muted', label: r.action }
            return (
              <tr key={i}>
                {showProject && r.namespace && r.project && (
                  <td>
                    <Link to={projectLink?.(r.namespace, r.project) || '#'}>{r.project}</Link>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}> ({r.namespace})</span>
                  </td>
                )}
                <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{r.address}</td>
                <td style={{ color: 'var(--text-muted)' }}>{r.type}</td>
                <td>{r.name}</td>
                <td><span className={`badge ${badge.cls}`}>{badge.label}</span></td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.id}>{r.id || '-'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function ResourcesPage() {
  const { data: projects, loading } = useApi<Project[]>('/api/v1/projects')
  const [search, setSearch] = useState('')
  const [allResources, setAllResources] = useState<(Resource & { project: string; namespace: string })[] | null>(null)
  const [loadingRes, setLoadingRes] = useState(false)

  const loadAll = async () => {
    if (!projects) return
    setLoadingRes(true)
    const all: (Resource & { project: string; namespace: string })[] = []
    for (const p of projects) {
      try {
        const res = await fetch(`/api/v1/projects/${p.namespace}/${p.name}/resources`)
        if (res.ok) {
          const resources: Resource[] = await res.json()
          for (const r of resources) {
            all.push({ ...r, project: p.name, namespace: p.namespace })
          }
        }
      } catch { /* skip */ }
    }
    setAllResources(all)
    setLoadingRes(false)
  }

  if (loading) return <div className="loading">Loading...</div>

  if (!allResources) {
    return (
      <div>
        <h1>Resources</h1>
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>Load resources from all {projects?.length} projects</p>
          <button
            onClick={loadAll}
            disabled={loadingRes}
            style={{
              padding: '10px 24px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: 'var(--accent)',
              color: '#fff',
              fontWeight: 600,
            }}
          >
            {loadingRes ? 'Loading...' : 'Load Resources'}
          </button>
        </div>
      </div>
    )
  }

  const q = search.toLowerCase()
  const filtered = q
    ? allResources.filter(r => r.address.toLowerCase().includes(q) || r.type.toLowerCase().includes(q) || r.project.toLowerCase().includes(q))
    : allResources

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h1 style={{ marginBottom: 0 }}>Resources ({filtered.length})</h1>
        <input
          type="text"
          placeholder="Search resources..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
            background: 'var(--bg-card)',
            color: 'var(--text)',
            fontSize: '0.85rem',
            width: '280px',
            outline: 'none',
          }}
        />
      </div>
      <ResourceTable
        resources={filtered}
        showProject
        projectLink={(ns, name) => `/projects/${ns}/${name}`}
      />
    </div>
  )
}

export { ResourceTable, actionBadge }
export type { Resource }
