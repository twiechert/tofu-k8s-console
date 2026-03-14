import { NavLink, Outlet } from 'react-router-dom'

const linkStyle = (isActive: boolean) => ({
  display: 'block',
  padding: '8px 16px',
  borderRadius: '6px',
  color: isActive ? 'var(--accent)' : 'var(--text-muted)',
  background: isActive ? 'rgba(20, 184, 166, 0.1)' : 'transparent',
  fontWeight: isActive ? 600 : 400,
  fontSize: '0.9rem',
})

export function Layout() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <nav style={{
        width: '220px',
        borderRight: '1px solid var(--border)',
        background: 'var(--bg-card)',
        padding: '16px 12px',
        flexShrink: 0,
      }}>
        <div style={{ fontWeight: 700, fontSize: '1rem', padding: '8px 16px', marginBottom: '20px' }}>
          tofu-k8s-console
        </div>

        <div style={{ marginBottom: '20px' }}>
          <div style={{ padding: '4px 16px', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '4px' }}>
            Dashboard
          </div>
          <NavLink to="/" end style={({ isActive }) => linkStyle(isActive)}>Overview</NavLink>
          <NavLink to="/graph" style={({ isActive }) => linkStyle(isActive)}>Stack Graph</NavLink>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <div style={{ padding: '4px 16px', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '4px' }}>
            Resources
          </div>
          <NavLink to="/projects" style={({ isActive }) => linkStyle(isActive)}>Projects</NavLink>
          <NavLink to="/programs" style={({ isActive }) => linkStyle(isActive)}>Programs</NavLink>
        </div>
      </nav>

      <main style={{ flex: 1, overflow: 'auto' }}>
        <div className="container">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
