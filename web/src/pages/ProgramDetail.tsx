import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useApi } from '../hooks/useApi'
import { Breadcrumb } from '../components/Breadcrumb'
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

interface Commit {
  sha: string
  message: string
  author: string
  date: string
  url?: string
}

interface CommitDetail extends Commit {
  files: { filename: string; status: string; additions: number; deletions: number; patch?: string }[]
}

type Tab = 'overview' | 'commits' | 'spec'

export function ProgramDetailPage() {
  const { namespace, name } = useParams()
  const { data, loading } = useApi<Program>(`/api/v1/programs/${namespace}/${name}`)
  const { data: commits, error: commitsError } = useApi<Commit[]>(`/api/v1/programs/${namespace}/${name}/commits`)
  const [tab, setTab] = useState<Tab>('overview')
  const [expandedSha, setExpandedSha] = useState<string | null>(null)
  const [commitDetails, setCommitDetails] = useState<Record<string, CommitDetail>>({})
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null)

  if (loading || !data) return <div className="loading">Loading...</div>

  const hasGitSource = !!data.spec?.source?.url

  const toggleCommit = async (sha: string) => {
    if (expandedSha === sha) {
      setExpandedSha(null)
      return
    }
    setExpandedSha(sha)
    if (!commitDetails[sha]) {
      setLoadingDetail(sha)
      try {
        const res = await fetch(`/api/v1/programs/${namespace}/${name}/commits/${sha}`)
        if (res.ok) {
          const detail: CommitDetail = await res.json()
          setCommitDetails(prev => ({ ...prev, [sha]: detail }))
        }
      } catch { /* ignore */ }
      finally { setLoadingDetail(null) }
    }
  }

  return (
    <div>
      <Breadcrumb items={[
        { label: 'Programs', to: '/programs' },
        { label: data.namespace },
        { label: data.name },
      ]} />
      <h1>{data.name}</h1>

      <div className="grid grid-4" style={{ marginBottom: '24px' }}>
        <div className="card">
          <div className="stat-label">Source</div>
          <div style={{ marginTop: '4px', fontSize: '0.9rem' }}>
            {data.spec?.source ? data.spec.source.url.split('/').pop()?.replace('.git', '') : 'inline HCL'}
          </div>
        </div>
        {data.spec?.source && (
          <>
            <div className="card">
              <div className="stat-label">Ref</div>
              <div style={{ marginTop: '4px', fontSize: '0.9rem' }}>{data.spec.source.ref || 'main'}</div>
            </div>
            <div className="card">
              <div className="stat-label">Path</div>
              <div style={{ marginTop: '4px', fontSize: '0.9rem' }}>{data.spec.source.path || '/'}</div>
            </div>
          </>
        )}
        <div className="card">
          <div className="stat-label">Providers</div>
          <div style={{ marginTop: '4px', fontSize: '0.9rem' }}>
            {data.spec?.providers?.map(p => p.name).join(', ') || 'none'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
        {(['overview', ...(hasGitSource ? ['commits'] : []), 'spec'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer',
              background: tab === t ? 'rgba(20, 184, 166, 0.15)' : 'var(--bg-card)',
              color: tab === t ? 'var(--accent)' : 'var(--text-muted)',
              fontWeight: tab === t ? 600 : 400, textTransform: 'capitalize',
            }}
          >
            {t}{t === 'commits' && commits ? ` (${commits.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          {data.spec?.programHCL && (
            <div className="card">
              <h2>Program HCL</h2>
              <pre>{data.spec.programHCL}</pre>
            </div>
          )}
          {data.spec?.providers && data.spec.providers.length > 0 && (
            <div className="card" style={{ marginTop: '16px' }}>
              <h2>Providers</h2>
              <table>
                <thead><tr><th>Name</th><th>Source</th><th>Version</th></tr></thead>
                <tbody>
                  {data.spec.providers.map(p => (
                    <tr key={p.name}><td>{p.name}</td><td>{p.source || '-'}</td><td>{p.version || '-'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'commits' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {commitsError ? (
            <div style={{ padding: '24px', color: 'var(--text-muted)', textAlign: 'center' }}>
              {commitsError}
            </div>
          ) : !commits || commits.length === 0 ? (
            <div className="loading">No commits found</div>
          ) : (
            <table>
              <thead>
                <tr><th>SHA</th><th>Message</th><th>Author</th><th>Date</th></tr>
              </thead>
              <tbody>
                {commits.map(c => (
                  <>
                    <tr key={c.sha} onClick={() => toggleCommit(c.sha)} style={{ cursor: 'pointer' }}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                        <span style={{ color: 'var(--text-muted)', marginRight: '6px' }}>{expandedSha === c.sha ? '▾' : '▸'}</span>
                        {c.url ? (
                          <a href={c.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{c.sha.slice(0, 7)}</a>
                        ) : c.sha.slice(0, 7)}
                      </td>
                      <td>{c.message.split('\n')[0]}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{c.author}</td>
                      <td style={{ color: 'var(--text-muted)' }} title={c.date}>{timeAgo(c.date)}</td>
                    </tr>
                    {expandedSha === c.sha && (
                      <tr key={`${c.sha}-detail`}>
                        <td colSpan={4} style={{ padding: '12px 16px', background: 'var(--bg)' }}>
                          {loadingDetail === c.sha ? (
                            <span style={{ color: 'var(--text-muted)' }}>Loading diff...</span>
                          ) : commitDetails[c.sha] ? (
                            <div>
                              {commitDetails[c.sha].files.map(f => (
                                <div key={f.filename} style={{ marginBottom: '12px' }}>
                                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                                    <span className={`badge ${f.status === 'added' ? 'badge-success' : f.status === 'removed' ? 'badge-error' : 'badge-warning'}`}>{f.status}</span>
                                    <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{f.filename}</span>
                                    <span style={{ color: 'var(--success)', fontSize: '0.8rem' }}>+{f.additions}</span>
                                    <span style={{ color: 'var(--error)', fontSize: '0.8rem' }}>-{f.deletions}</span>
                                  </div>
                                  {f.patch && <pre style={{ fontSize: '0.8rem', maxHeight: '300px', overflow: 'auto' }}>{f.patch}</pre>}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>No diff available</span>
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
