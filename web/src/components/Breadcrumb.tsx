import { Link } from 'react-router-dom'

interface Crumb {
  label: string
  to?: string
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav style={{ fontSize: '0.8rem', marginBottom: '12px', display: 'flex', gap: '4px', alignItems: 'center' }}>
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && <span style={{ color: 'var(--text-muted)', margin: '0 2px' }}>/</span>}
          {item.to ? (
            <Link to={item.to} style={{ color: 'var(--text-muted)' }}>{item.label}</Link>
          ) : (
            <span style={{ color: 'var(--text)' }}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
