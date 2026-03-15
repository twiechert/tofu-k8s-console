import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Breadcrumb } from '../components/Breadcrumb'
import { useApi } from '../hooks/useApi'
import { Field, TextInput, TextArea, Checkbox, KeyValueEditor, Select } from '../components/FormFields'

interface Program {
  name: string
  namespace: string
}

export function CreateProjectPage() {
  const navigate = useNavigate()
  const { data: programs } = useApi<Program[]>('/api/v1/programs')

  const [name, setName] = useState('')
  const [namespace, setNamespace] = useState('default')
  const [programRef, setProgramRef] = useState('')
  const [autoApprove, setAutoApprove] = useState(true)
  const [params, setParams] = useState<Record<string, string>>({})
  const [tofuVersion, setTofuVersion] = useState('')
  const [workspace, setWorkspace] = useState('')
  const [syncInterval, setSyncInterval] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [backendType, setBackendType] = useState('kubernetes')
  const [s3Bucket, setS3Bucket] = useState('')
  const [s3Region, setS3Region] = useState('')
  const [additionalProvidersHCL, setAdditionalProvidersHCL] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!name) { setError('Name is required'); return }
    if (!programRef) { setError('Program reference is required'); return }
    setSubmitting(true)
    setError('')

    const spec: Record<string, unknown> = {
      programRef: { name: programRef },
      autoApprove,
    }
    if (Object.keys(params).length > 0) spec.params = params
    if (tofuVersion) spec.tofuVersion = tofuVersion
    if (workspace) spec.workspace = workspace
    if (syncInterval) spec.syncInterval = syncInterval
    if (backendType === 's3' && s3Bucket) {
      spec.backend = { type: 's3', s3: { bucket: s3Bucket, region: s3Region } }
    }
    if (additionalProvidersHCL) spec.additionalProvidersHCL = additionalProvidersHCL

    try {
      const res = await fetch('/api/v1/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: { name, namespace }, spec }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      navigate(`/projects/${namespace}/${name}`)
    } catch (e) {
      setError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const programOptions = [
    { value: '', label: 'Select a program...' },
    ...(programs || []).map(p => ({ value: p.name, label: `${p.name} (${p.namespace})` })),
  ]

  return (
    <div>
      <Breadcrumb items={[{ label: 'Projects', to: '/projects' }, { label: 'Create' }]} />
      <h1>Create Project</h1>
      {error && <div style={{ color: 'var(--error)', marginBottom: '16px', padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: '6px' }}>{error}</div>}

      <div className="card" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <Field label="Name"><TextInput value={name} onChange={setName} placeholder="my-project" /></Field>
          <Field label="Namespace"><TextInput value={namespace} onChange={setNamespace} placeholder="default" /></Field>
        </div>

        <Field label="Program Reference" hint="The TofuProgram this project uses">
          <Select value={programRef} onChange={setProgramRef} options={programOptions} />
        </Field>

        <Checkbox checked={autoApprove} onChange={setAutoApprove} label="Auto-approve (skip plan approval)" />
      </div>

      <div className="card" style={{ marginBottom: '16px' }}>
        <h2>Parameters</h2>
        <KeyValueEditor pairs={params} onChange={setParams} />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.85rem' }}
        >
          {showAdvanced ? '▾' : '▸'} Advanced Options
        </button>
      </div>

      {showAdvanced && (
        <>
          <div className="card" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              <Field label="OpenTofu Version" hint="e.g. 1.8.2">
                <TextInput value={tofuVersion} onChange={setTofuVersion} placeholder="latest" />
              </Field>
              <Field label="Workspace" hint="Optional workspace name">
                <TextInput value={workspace} onChange={setWorkspace} placeholder="" />
              </Field>
              <Field label="Sync Interval" hint="e.g. 5m, 1h">
                <TextInput value={syncInterval} onChange={setSyncInterval} placeholder="" />
              </Field>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '16px' }}>
            <Field label="Backend">
              <Select value={backendType} onChange={setBackendType} options={[
                { value: 'kubernetes', label: 'Kubernetes (default)' },
                { value: 's3', label: 'S3' },
              ]} />
            </Field>
            {backendType === 's3' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <Field label="S3 Bucket"><TextInput value={s3Bucket} onChange={setS3Bucket} placeholder="my-tfstate-bucket" /></Field>
                <Field label="S3 Region"><TextInput value={s3Region} onChange={setS3Region} placeholder="eu-central-1" /></Field>
              </div>
            )}
          </div>

          <div className="card" style={{ marginBottom: '16px' }}>
            <Field label="Additional Providers HCL" hint="Raw HCL for custom provider configuration">
              <TextArea value={additionalProvidersHCL} onChange={setAdditionalProvidersHCL} placeholder={'provider "aws" {\n  region = "eu-central-1"\n}'} rows={5} />
            </Field>
          </div>
        </>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        style={{
          padding: '10px 24px', borderRadius: '6px', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
          background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: '0.9rem', opacity: submitting ? 0.6 : 1,
        }}
      >
        {submitting ? 'Creating...' : 'Create Project'}
      </button>
    </div>
  )
}
