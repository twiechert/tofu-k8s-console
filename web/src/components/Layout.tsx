import { NavLink, Outlet } from 'react-router-dom'

const navStyle = (isActive: boolean) => ({
  padding: '8px 16px',
  borderRadius: '6px',
  color: isActive ? 'var(--accent)' : 'var(--text-muted)',
  background: isActive ? 'rgba(20, 184, 166, 0.1)' : 'transparent',
  fontWeight: isActive ? 600 : 400,
})

export function Layout() {
  return (
    <div>
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 24px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-card)',
      }}>
        <span style={{ fontWeight: 700, fontSize: '1.1rem', marginRight: '24px' }}>
          tofu-k8s-console
        </span>
        <NavLink to="/" end style={({ isActive }) => navStyle(isActive)}>Overview</NavLink>
        <NavLink to="/projects" style={({ isActive }) => navStyle(isActive)}>Projects</NavLink>
        <NavLink to="/programs" style={({ isActive }) => navStyle(isActive)}>Programs</NavLink>
      </nav>
      <div className="container">
        <Outlet />
      </div>
    </div>
  )
}
