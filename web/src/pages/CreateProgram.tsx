import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Field, TextInput, TextArea, Select } from '../components/FormFields'

interface Provider {
  name: string
  source: string
  version: string
  configHCL: string
}

export function CreateProgramPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [namespace, setNamespace] = useState('default')
  const [sourceType, setSourceType] = useState<'inline' | 'git'>('inline')
  const [programHCL, setProgramHCL] = useState('')
  const [gitUrl, setGitUrl] = useState('')
  const [gitRef, setGitRef] = useState('main')
  const [gitPath, setGitPath] = useState('')
  const [providers, setProviders] = useState<Provider[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const addProvider = () => setProviders([...providers, { name: '', source: '', version: '', configHCL: '' }])
  const updateProvider = (i: number, field: keyof Provider, val: string) => {
    const next = [...providers]
    next[i] = { ...next[i], [field]: val }
    setProviders(next)
  }
  const removeProvider = (i: number) => setProviders(providers.filter((_, j) => j !== i))

  const handleSubmit = async () => {
    if (!name) { setError('Name is required'); return }
    setSubmitting(true)
    setError('')

    const spec: Record<string, unknown> = {}
    if (sourceType === 'inline') {
      spec.programHCL = programHCL
    } else {
      spec.source = { url: gitUrl, ref: gitRef || undefined, path: gitPath || undefined }
    }
    if (providers.length > 0) {
      spec.providers = providers.filter(p => p.name).map(p => ({
        name: p.name,
        ...(p.source && { source: p.source }),
        ...(p.version && { version: p.version }),
        ...(p.configHCL && { configHCL: p.configHCL }),
      }))
    }

    try {
      const res = await fetch('/api/v1/programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: { name, namespace }, spec }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      navigate('/programs')
    } catch (e) {
      setError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <h1>Create Program</h1>
      {error && <div style={{ color: 'var(--error)', marginBottom: '16px', padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: '6px' }}>{error}</div>}

      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <Field label="Name"><TextInput value={name} onChange={setName} placeholder="my-program" /></Field>
          <Field label="Namespace"><TextInput value={namespace} onChange={setNamespace} placeholder="default" /></Field>
        </div>

        <Field label="Source Type">
          <Select value={sourceType} onChange={v => setSourceType(v as 'inline' | 'git')} options={[
            { value: 'inline', label: 'Inline HCL' },
            { value: 'git', label: 'Git Repository' },
          ]} />
        </Field>

        {sourceType === 'inline' ? (
          <Field label="Program HCL" hint="Terraform/OpenTofu configuration">
            <TextArea value={programHCL} onChange={setProgramHCL} placeholder={'variable "name" { type = string }\n\nresource "null_resource" "example" {\n  ...\n}'} rows={10} />
          </Field>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px' }}>
            <Field label="Git URL"><TextInput value={gitUrl} onChange={setGitUrl} placeholder="https://github.com/org/repo.git" /></Field>
            <Field label="Ref"><TextInput value={gitRef} onChange={setGitRef} placeholder="main" /></Field>
            <Field label="Path"><TextInput value={gitPath} onChange={setGitPath} placeholder="modules/vpc" /></Field>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ marginBottom: 0 }}>Providers</h2>
          <button onClick={addProvider} style={{ background: 'none', border: '1px dashed var(--border)', color: 'var(--text-muted)', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>+ Add Provider</button>
        </div>
        {providers.map((p, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '8px', marginBottom: '8px', alignItems: 'end' }}>
            <Field label={i === 0 ? 'Name' : ''}><TextInput value={p.name} onChange={v => updateProvider(i, 'name', v)} placeholder="aws" /></Field>
            <Field label={i === 0 ? 'Source' : ''}><TextInput value={p.source} onChange={v => updateProvider(i, 'source', v)} placeholder="hashicorp/aws" /></Field>
            <Field label={i === 0 ? 'Version' : ''}><TextInput value={p.version} onChange={v => updateProvider(i, 'version', v)} placeholder="~> 5.0" /></Field>
            <button onClick={() => removeProvider(i)} style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: '1.1rem', padding: '8px', marginBottom: '16px' }}>x</button>
          </div>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting}
        style={{
          padding: '10px 24px', borderRadius: '6px', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
          background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: '0.9rem', opacity: submitting ? 0.6 : 1,
        }}
      >
        {submitting ? 'Creating...' : 'Create Program'}
      </button>
    </div>
  )
}
