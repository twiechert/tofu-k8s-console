import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../hooks/useApi'

interface GraphNode {
  id: string
  label: string
  type: 'project' | 'program' | 'namespace'
  namespace: string
  phase?: string
  count?: number
  x?: number
  y?: number
}

interface GraphEdge {
  source: string
  target: string
  label?: string
}

interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

const phaseColor: Record<string, string> = {
  Succeeded: '#22c55e',
  Running: '#3b82f6',
  Planning: '#3b82f6',
  WaitingApproval: '#f59e0b',
  Error: '#ef4444',
  DestroyFailed: '#ef4444',
  Retrying: '#f59e0b',
  Suspended: '#6b7280',
  DriftChecking: '#3b82f6',
}

type Level = 'all' | 'namespace' | 'project'

interface ViewState {
  level: Level
  namespace?: string
  projectId?: string
}

function buildNamespaceView(data: GraphData): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nsMap = new Map<string, { projects: number; programs: number; hasError: boolean }>()

  for (const n of data.nodes) {
    if (!nsMap.has(n.namespace)) nsMap.set(n.namespace, { projects: 0, programs: 0, hasError: false })
    const entry = nsMap.get(n.namespace)!
    if (n.type === 'project') {
      entry.projects++
      if (n.phase === 'Error' || n.phase === 'DestroyFailed') entry.hasError = true
    } else {
      entry.programs++
    }
  }

  const nodes: GraphNode[] = []
  for (const [ns, info] of nsMap) {
    nodes.push({
      id: 'ns:' + ns,
      label: ns,
      type: 'namespace',
      namespace: ns,
      count: info.projects + info.programs,
      phase: info.hasError ? 'Error' : 'Succeeded',
    })
  }

  // Edges between namespaces (cross-namespace dependencies)
  const edges: GraphEdge[] = []
  const nsEdgeSet = new Set<string>()
  for (const e of data.edges) {
    if (e.label === 'programRef') continue
    const srcNode = data.nodes.find(n => n.id === e.source)
    const tgtNode = data.nodes.find(n => n.id === e.target)
    if (srcNode && tgtNode && srcNode.namespace !== tgtNode.namespace) {
      const key = srcNode.namespace + '->' + tgtNode.namespace
      if (!nsEdgeSet.has(key)) {
        nsEdgeSet.add(key)
        edges.push({ source: 'ns:' + srcNode.namespace, target: 'ns:' + tgtNode.namespace })
      }
    }
  }

  return { nodes, edges }
}

function filterByNamespace(data: GraphData, ns: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodeIds = new Set(data.nodes.filter(n => n.namespace === ns).map(n => n.id))
  // Also include programs referenced by projects in this namespace
  for (const e of data.edges) {
    if (e.label === 'programRef' && nodeIds.has(e.source)) nodeIds.add(e.target)
  }
  const nodes = data.nodes.filter(n => nodeIds.has(n.id))
  const edges = data.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
  return { nodes, edges }
}

function filterByProject(data: GraphData, projectId: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodeIds = new Set<string>([projectId])

  // Add direct dependencies (both directions) and program
  for (const e of data.edges) {
    if (e.source === projectId || e.target === projectId) {
      nodeIds.add(e.source)
      nodeIds.add(e.target)
    }
  }
  // Add programs for all included projects
  for (const e of data.edges) {
    if (e.label === 'programRef' && nodeIds.has(e.source)) nodeIds.add(e.target)
  }

  const nodes = data.nodes.filter(n => nodeIds.has(n.id))
  const edges = data.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
  return { nodes, edges }
}

function layoutGrid(nodes: GraphNode[], width: number, height: number) {
  const cols = Math.ceil(Math.sqrt(nodes.length))
  const spacingX = width / (cols + 1)
  const rows = Math.ceil(nodes.length / cols)
  const spacingY = height / (rows + 1)
  nodes.forEach((n, i) => {
    n.x = spacingX * ((i % cols) + 1)
    n.y = spacingY * (Math.floor(i / cols) + 1)
  })
}

function layoutTwoColumn(nodes: GraphNode[], _edges: GraphEdge[], width: number, height: number) {
  const programs = nodes.filter(n => n.type === 'program')
  const projects = nodes.filter(n => n.type === 'project')

  const leftX = width * 0.25
  const rightX = width * 0.75

  const progSpacing = Math.min(80, (height - 100) / Math.max(programs.length, 1))
  const progStartY = (height - progSpacing * (programs.length - 1)) / 2
  programs.forEach((p, i) => {
    p.x = leftX
    p.y = Math.max(40, progStartY + i * progSpacing)
  })

  const projSpacing = Math.min(80, (height - 100) / Math.max(projects.length, 1))
  const projStartY = (height - projSpacing * (projects.length - 1)) / 2
  projects.forEach((p, i) => {
    p.x = rightX
    p.y = Math.max(40, projStartY + i * projSpacing)
  })
}

function drawGraph(
  canvas: HTMLCanvasElement,
  nodes: GraphNode[],
  edges: GraphEdge[],
  highlightId?: string,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr
  ctx.scale(dpr, dpr)
  const width = rect.width
  const height = rect.height

  ctx.fillStyle = '#0f1117'
  ctx.fillRect(0, 0, width, height)

  const nodeMap = new Map(nodes.map(n => [n.id, n]))

  // Edges
  for (const edge of edges) {
    const src = nodeMap.get(edge.source)
    const tgt = nodeMap.get(edge.target)
    if (!src?.x || !tgt?.x || !src.y || !tgt.y) continue

    const isProgramRef = edge.label === 'programRef'
    ctx.beginPath()
    ctx.strokeStyle = isProgramRef ? '#2a2d37' : '#4a5568'
    ctx.lineWidth = isProgramRef ? 1 : 2
    ctx.setLineDash(isProgramRef ? [4, 4] : [])
    ctx.moveTo(src.x, src.y)
    const midX = (src.x + tgt.x) / 2
    ctx.quadraticCurveTo(midX, src.y, tgt.x, tgt.y)
    ctx.stroke()
    ctx.setLineDash([])

    // Arrow
    const angle = Math.atan2(tgt.y - src.y, tgt.x - src.x)
    ctx.beginPath()
    ctx.fillStyle = isProgramRef ? '#2a2d37' : '#4a5568'
    ctx.moveTo(tgt.x, tgt.y)
    ctx.lineTo(tgt.x - 8 * Math.cos(angle - 0.4), tgt.y - 8 * Math.sin(angle - 0.4))
    ctx.lineTo(tgt.x - 8 * Math.cos(angle + 0.4), tgt.y - 8 * Math.sin(angle + 0.4))
    ctx.fill()

    if (edge.label && !isProgramRef) {
      ctx.fillStyle = '#8b8fa3'
      ctx.font = '10px -apple-system, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(edge.label, midX, (src.y + tgt.y) / 2 - 8)
    }
  }

  // Nodes
  for (const node of nodes) {
    if (!node.x || !node.y) continue

    const isNs = node.type === 'namespace'
    const isProgram = node.type === 'program'
    const isHighlighted = node.id === highlightId
    const w = isNs ? 160 : isProgram ? 120 : 140
    const h = isNs ? 50 : 36
    const r = isNs ? 10 : 6

    ctx.beginPath()
    ctx.roundRect(node.x - w / 2, node.y - h / 2, w, h, r)
    ctx.fillStyle = isNs ? '#1a2332' : isProgram ? '#1e293b' : '#1a1d27'
    ctx.fill()

    const borderColor = isNs
      ? (node.phase === 'Error' ? '#ef4444' : '#14b8a6')
      : isProgram ? '#334155' : (phaseColor[node.phase || ''] || '#2a2d37')
    ctx.strokeStyle = isHighlighted ? '#14b8a6' : borderColor
    ctx.lineWidth = isHighlighted ? 3 : isNs ? 2 : isProgram ? 1 : 2
    ctx.stroke()

    // Phase dot for projects
    if (!isProgram && !isNs && node.phase) {
      ctx.beginPath()
      ctx.arc(node.x - w / 2 + 14, node.y, 4, 0, Math.PI * 2)
      ctx.fillStyle = phaseColor[node.phase] || '#6b7280'
      ctx.fill()
    }

    // Label
    ctx.fillStyle = '#e1e4ea'
    ctx.font = `${isNs ? '13' : isProgram ? '11' : '12'}px -apple-system, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const labelX = (!isProgram && !isNs) ? node.x + 6 : node.x
    const maxLen = isNs ? 20 : 16
    ctx.fillText(node.label.length > maxLen ? node.label.slice(0, maxLen - 1) + '...' : node.label, labelX, isNs ? node.y - 6 : node.y)

    // Subtitle
    ctx.fillStyle = '#8b8fa3'
    ctx.font = '9px -apple-system, sans-serif'
    if (isNs) {
      ctx.fillText(`${node.count} resources`, node.x, node.y + 10)
    } else {
      ctx.fillText(isProgram ? 'program' : node.namespace, node.x, node.y + h / 2 + 12)
    }
  }
}

function hitTest(nodes: GraphNode[], mx: number, my: number): GraphNode | null {
  for (const node of nodes) {
    if (!node.x || !node.y) continue
    const isNs = node.type === 'namespace'
    const w = isNs ? 160 : node.type === 'program' ? 120 : 140
    const h = isNs ? 50 : 36
    if (mx >= node.x - w / 2 && mx <= node.x + w / 2 && my >= node.y - h / 2 && my <= node.y + h / 2) {
      return node
    }
  }
  return null
}

export function GraphPage() {
  const { data, loading } = useApi<GraphData>('/api/v1/graph')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [view, setView] = useState<ViewState>({ level: 'all' })
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: GraphNode } | null>(null)
  const [renderedNodes, setRenderedNodes] = useState<GraphNode[]>([])
  const navigate = useNavigate()

  const render = useCallback(() => {
    if (!data || !canvasRef.current) return

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const width = rect.width
    const height = rect.height

    let viewData: { nodes: GraphNode[]; edges: GraphEdge[] }

    if (view.level === 'all') {
      // Check if there are multiple namespaces
      const namespaces = new Set(data.nodes.map(n => n.namespace))
      if (namespaces.size > 1) {
        viewData = buildNamespaceView(data)
        layoutGrid(viewData.nodes, width, height)
      } else {
        // Single namespace — skip to namespace level
        viewData = { nodes: data.nodes.map(n => ({ ...n })), edges: data.edges }
        layoutTwoColumn(viewData.nodes, viewData.edges, width, height)
      }
    } else if (view.level === 'namespace' && view.namespace) {
      viewData = filterByNamespace(data, view.namespace)
      viewData.nodes = viewData.nodes.map(n => ({ ...n }))
      layoutTwoColumn(viewData.nodes, viewData.edges, width, height)
    } else if (view.level === 'project' && view.projectId) {
      viewData = filterByProject(data, view.projectId)
      viewData.nodes = viewData.nodes.map(n => ({ ...n }))
      layoutTwoColumn(viewData.nodes, viewData.edges, width, height)
    } else {
      return
    }

    setRenderedNodes(viewData.nodes)
    drawGraph(canvas, viewData.nodes, viewData.edges, view.projectId)
  }, [data, view])

  useEffect(() => { render() }, [render])

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const node = hitTest(renderedNodes, mx, my)
    if (!node) return

    if (node.type === 'namespace') {
      setView({ level: 'namespace', namespace: node.namespace })
    } else if (node.type === 'project') {
      if (view.level === 'project' && view.projectId === node.id) {
        // Double-click on focused project → navigate to detail
        const [, nsName] = node.id.split(':')
        const [ns, name] = nsName.split('/')
        navigate(`/projects/${ns}/${name}`)
      } else {
        setView({ level: 'project', projectId: node.id, namespace: node.namespace })
      }
    }
  }, [renderedNodes, view, navigate])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const node = hitTest(renderedNodes, mx, my)
    if (node) {
      setTooltip({ x: e.clientX, y: e.clientY, node })
      if (canvasRef.current) canvasRef.current.style.cursor = 'pointer'
    } else {
      setTooltip(null)
      if (canvasRef.current) canvasRef.current.style.cursor = 'default'
    }
  }, [renderedNodes])

  if (loading || !data) return <div className="loading">Loading...</div>

  const breadcrumbs: { label: string; onClick?: () => void }[] = [
    { label: 'All', onClick: () => setView({ level: 'all' }) },
  ]
  if (view.namespace) {
    breadcrumbs.push({
      label: view.namespace,
      onClick: view.level === 'project' ? () => setView({ level: 'namespace', namespace: view.namespace }) : undefined,
    })
  }
  if (view.projectId) {
    const projName = view.projectId.split('/').pop() || view.projectId
    breadcrumbs.push({ label: projName })
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h1 style={{ marginBottom: 0 }}>Stack Graph</h1>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', fontSize: '0.85rem' }}>
          {breadcrumbs.map((bc, i) => (
            <span key={i}>
              {i > 0 && <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>/</span>}
              {bc.onClick ? (
                <a onClick={bc.onClick} style={{ cursor: 'pointer' }}>{bc.label}</a>
              ) : (
                <span style={{ color: 'var(--text)' }}>{bc.label}</span>
              )}
            </span>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
        <canvas
          ref={canvasRef}
          onClick={handleClick}
          onMouseMove={handleMouseMove}
          style={{ width: '100%', height: '500px', display: 'block' }}
        />
        <div style={{
          position: 'absolute', bottom: '12px', right: '16px',
          display: 'flex', gap: '16px', fontSize: '0.75rem', color: 'var(--text-muted)',
        }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#1e293b', border: '1px solid #334155', borderRadius: 2, marginRight: 4 }} /> Program</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#1a1d27', border: '2px solid #22c55e', borderRadius: 2, marginRight: 4 }} /> Project</span>
          <span style={{ color: 'var(--text-muted)' }}>Click to drill down</span>
        </div>
      </div>

      {tooltip && (
        <div style={{
          position: 'fixed',
          left: tooltip.x + 12,
          top: tooltip.y + 12,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          padding: '8px 12px',
          fontSize: '0.85rem',
          pointerEvents: 'none',
          zIndex: 100,
        }}>
          <div style={{ fontWeight: 600 }}>{tooltip.node.label}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            {tooltip.node.type}{tooltip.node.type === 'namespace' ? ` (${tooltip.node.count} resources)` : ` \u00b7 ${tooltip.node.namespace}`}
            {tooltip.node.phase && tooltip.node.type !== 'namespace' && <> &middot; {tooltip.node.phase}</>}
          </div>
          {tooltip.node.type === 'project' && view.level === 'project' && view.projectId === tooltip.node.id && (
            <div style={{ color: 'var(--accent)', fontSize: '0.7rem', marginTop: '2px' }}>Click again to open detail</div>
          )}
        </div>
      )}
    </div>
  )
}
