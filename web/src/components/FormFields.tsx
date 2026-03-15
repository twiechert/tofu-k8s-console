import { CSSProperties } from 'react'

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontSize: '0.85rem',
  outline: 'none',
  fontFamily: 'inherit',
}

const textareaStyle: CSSProperties = {
  ...inputStyle,
  fontFamily: 'monospace',
  minHeight: '120px',
  resize: 'vertical',
}

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: '4px',
  fontSize: '0.8rem',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>{hint}</div>}
    </div>
  )
}

export function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
}

export function TextArea({ value, onChange, placeholder, rows }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{ ...textareaStyle, minHeight: rows ? `${rows * 24}px` : undefined }} />
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

export function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function KeyValueEditor({ pairs, onChange }: { pairs: Record<string, string>; onChange: (p: Record<string, string>) => void }) {
  const entries = Object.entries(pairs)

  const update = (oldKey: string, newKey: string, val: string) => {
    const next = { ...pairs }
    if (oldKey !== newKey) delete next[oldKey]
    next[newKey] = val
    onChange(next)
  }

  const remove = (key: string) => {
    const next = { ...pairs }
    delete next[key]
    onChange(next)
  }

  const add = () => {
    onChange({ ...pairs, '': '' })
  }

  return (
    <div>
      {entries.map(([k, v], i) => (
        <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
          <input
            type="text"
            value={k}
            onChange={e => update(k, e.target.value, v)}
            placeholder="key"
            style={{ ...inputStyle, flex: 1 }}
          />
          <input
            type="text"
            value={v}
            onChange={e => update(k, k, e.target.value)}
            placeholder="value"
            style={{ ...inputStyle, flex: 2 }}
          />
          <button onClick={() => remove(k)} style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: '1.1rem', padding: '0 8px' }}>x</button>
        </div>
      ))}
      <button
        onClick={add}
        style={{ background: 'none', border: '1px dashed var(--border)', color: 'var(--text-muted)', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
      >
        + Add
      </button>
    </div>
  )
}
