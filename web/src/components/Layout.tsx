import { NavLink, Outlet } from 'react-router-dom'
import { useApi } from '../hooks/useApi'

interface AuthUser {
  email: string
  name: string
  role: string
}

const linkStyle = (isActive: boolean) => ({
  display: 'block',
  padding: '8px 16px',
  borderRadius: '6px',
  color: isActive ? 'var(--accent)' : 'var(--text-muted)',
  background: isActive ? 'rgba(20, 184, 166, 0.1)' : 'transparent',
  fontWeight: isActive ? 600 : 400,
  fontSize: '0.9rem',
})

const roleBadgeColor: Record<string, string> = {
  admin: 'var(--error)',
  editor: 'var(--warning)',
  operator: 'var(--info)',
  viewer: 'var(--text-muted)',
}

export function Layout() {
  const { data: user } = useApi<AuthUser>('/api/v1/auth/me')

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={{
        width: '220px',
        borderRight: '1px solid var(--border)',
        background: 'var(--bg-card)',
        padding: '16px 12px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px', marginBottom: '20px' }}>
          <img src="/logo.png" alt="logo" style={{ width: 28, height: 28 }} />
          <span style={{ fontWeight: 700, fontSize: '1rem' }}>Console</span>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <div style={{ padding: '4px 16px', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '4px' }}>
            Dashboard
          </div>
          <NavLink to="/" end style={({ isActive }) => linkStyle(isActive)}>Overview</NavLink>
          <NavLink to="/drift" style={({ isActive }) => linkStyle(isActive)}>Drift</NavLink>
          <NavLink to="/graph" style={({ isActive }) => linkStyle(isActive)}>Stack Graph</NavLink>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <div style={{ padding: '4px 16px', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '4px' }}>
            Resources
          </div>
          <NavLink to="/projects" style={({ isActive }) => linkStyle(isActive)}>Projects</NavLink>
          <NavLink to="/programs" style={({ isActive }) => linkStyle(isActive)}>Programs</NavLink>
          <NavLink to="/resources" style={({ isActive }) => linkStyle(isActive)}>Resources</NavLink>
          <NavLink to="/jobs" style={({ isActive }) => linkStyle(isActive)}>Jobs</NavLink>
        </div>

        <div style={{ marginTop: 'auto', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          {user && (
            <div style={{ fontSize: '0.8rem' }}>
              <div style={{ color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name || user.email}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: roleBadgeColor[user.role] || 'var(--text-muted)', display: 'inline-block' }} />
                <span style={{ color: 'var(--text-muted)', textTransform: 'capitalize' }}>{user.role}</span>
              </div>
            </div>
          )}
        </div>
      </nav>

      <main style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {user && (
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            padding: '10px 32px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg-card)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>{user.name || user.email}</span>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '2px 10px',
                borderRadius: '12px',
                background: `${roleBadgeColor[user.role] || 'var(--text-muted)'}20`,
                border: `1px solid ${roleBadgeColor[user.role] || 'var(--text-muted)'}40`,
                fontSize: '0.75rem',
                fontWeight: 600,
                textTransform: 'capitalize',
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: roleBadgeColor[user.role] || 'var(--text-muted)', display: 'inline-block' }} />
                <span style={{ color: roleBadgeColor[user.role] || 'var(--text-muted)' }}>{user.role}</span>
              </span>
            </div>
          </div>
        )}
        <div className="container" style={{ flex: 1 }}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
