import { useEffect, useRef, useState } from 'react'
import { useApi } from '../hooks/useApi'

interface GraphNode {
  id: string
  label: string
  type: 'project' | 'program'
  namespace: string
  phase?: string
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

function layoutNodes(nodes: GraphNode[], edges: GraphEdge[], width: number, height: number) {
  // Separate by type
  const programs = nodes.filter(n => n.type === 'program')
  const projects = nodes.filter(n => n.type === 'project')

  // Group projects by namespace
  const nsByNs = new Map<string, GraphNode[]>()
  for (const p of projects) {
    const list = nsByNs.get(p.namespace) || []
    list.push(p)
    nsByNs.set(p.namespace, list)
  }

  // Layout: programs on the left, projects on the right grouped by namespace
  const programX = 160
  const projectX = width - 200
  const midX = width / 2

  // Programs column
  const progSpacing = Math.min(80, (height - 100) / Math.max(programs.length, 1))
  const progStartY = (height - progSpacing * (programs.length - 1)) / 2
  programs.forEach((p, i) => {
    p.x = programX
    p.y = progStartY + i * progSpacing
  })

  // Projects: if there are dependencies, use topological sort for vertical ordering
  const depEdges = edges.filter(e => e.label !== 'programRef')
  const hasDepGraph = depEdges.length > 0

  if (hasDepGraph) {
    // Topological layers
    const inDegree = new Map<string, number>()
    const adjList = new Map<string, string[]>()
    for (const p of projects) {
      inDegree.set(p.id, 0)
      adjList.set(p.id, [])
    }
    for (const e of depEdges) {
      adjList.get(e.source)?.push(e.target)
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1)
    }

    const layers: string[][] = []
    const visited = new Set<string>()
    let queue = [...projects.filter(p => (inDegree.get(p.id) || 0) === 0).map(p => p.id)]

    while (queue.length > 0) {
      layers.push(queue)
      queue.forEach(id => visited.add(id))
      const next: string[] = []
      for (const id of queue) {
        for (const dep of adjList.get(id) || []) {
          if (!visited.has(dep)) {
            const newDeg = (inDegree.get(dep) || 1) - 1
            inDegree.set(dep, newDeg)
            if (newDeg === 0) next.push(dep)
          }
        }
      }
      queue = next
    }
    // Add any unvisited
    const remaining = projects.filter(p => !visited.has(p.id)).map(p => p.id)
    if (remaining.length) layers.push(remaining)

    const layerSpacingX = layers.length > 1 ? (width - 400) / (layers.length - 1) : 0
    layers.forEach((layer, li) => {
      const x = midX - (layerSpacingX * (layers.length - 1)) / 2 + li * layerSpacingX
      const spacing = Math.min(80, (height - 100) / Math.max(layer.length, 1))
      const startY = (height - spacing * (layer.length - 1)) / 2
      layer.forEach((id, i) => {
        const node = nodes.find(n => n.id === id)
        if (node) {
          node.x = x
          node.y = startY + i * spacing
        }
      })
    })
  } else {
    // Simple layout: one column per namespace
    const namespaces = [...nsByNs.keys()].sort()
    const nsSpacing = namespaces.length > 1 ? (width - 400) / (namespaces.length - 1) : 0
    namespaces.forEach((ns, ni) => {
      const list = nsByNs.get(ns) || []
      const x = projectX - nsSpacing * (namespaces.length - 1 - ni)
      const spacing = Math.min(80, (height - 100) / Math.max(list.length, 1))
      const startY = (height - spacing * (list.length - 1)) / 2
      list.forEach((p, i) => {
        p.x = x
        p.y = startY + i * spacing
      })
    })
  }
}

export function GraphPage() {
  const { data, loading } = useApi<GraphData>('/api/v1/graph')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; node: GraphNode } | null>(null)

  useEffect(() => {
    if (!data || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const width = rect.width
    const height = rect.height

    const nodes = data.nodes.map(n => ({ ...n }))
    const nodeMap = new Map(nodes.map(n => [n.id, n]))

    layoutNodes(nodes, data.edges, width, height)

    // Clear
    ctx.fillStyle = '#0f1117'
    ctx.fillRect(0, 0, width, height)

    // Draw edges
    for (const edge of data.edges) {
      const src = nodeMap.get(edge.source)
      const tgt = nodeMap.get(edge.target)
      if (!src?.x || !tgt?.x || !src.y || !tgt.y) continue

      ctx.beginPath()
      ctx.strokeStyle = edge.label === 'programRef' ? '#2a2d37' : '#4a5568'
      ctx.lineWidth = edge.label === 'programRef' ? 1 : 2
      ctx.setLineDash(edge.label === 'programRef' ? [4, 4] : [])
      ctx.moveTo(src.x, src.y)

      // Curved line
      const midXe = (src.x + tgt.x) / 2
      ctx.quadraticCurveTo(midXe, src.y, tgt.x, tgt.y)
      ctx.stroke()
      ctx.setLineDash([])

      // Arrow
      const angle = Math.atan2(tgt.y - src.y, tgt.x - src.x)
      const arrowLen = 8
      ctx.beginPath()
      ctx.fillStyle = edge.label === 'programRef' ? '#2a2d37' : '#4a5568'
      ctx.moveTo(tgt.x, tgt.y)
      ctx.lineTo(tgt.x - arrowLen * Math.cos(angle - 0.4), tgt.y - arrowLen * Math.sin(angle - 0.4))
      ctx.lineTo(tgt.x - arrowLen * Math.cos(angle + 0.4), tgt.y - arrowLen * Math.sin(angle + 0.4))
      ctx.fill()

      // Edge label
      if (edge.label && edge.label !== 'programRef') {
        ctx.fillStyle = '#8b8fa3'
        ctx.font = '10px -apple-system, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(edge.label, midXe, (src.y + tgt.y) / 2 - 8)
      }
    }

    // Draw nodes
    for (const node of nodes) {
      if (!node.x || !node.y) continue

      const isProgram = node.type === 'program'
      const w = isProgram ? 120 : 140
      const h = 36
      const r = 6

      // Background
      ctx.beginPath()
      ctx.roundRect(node.x - w / 2, node.y - h / 2, w, h, r)
      ctx.fillStyle = isProgram ? '#1e293b' : '#1a1d27'
      ctx.fill()

      // Border
      ctx.strokeStyle = isProgram ? '#334155' : (phaseColor[node.phase || ''] || '#2a2d37')
      ctx.lineWidth = isProgram ? 1 : 2
      ctx.stroke()

      // Phase indicator dot for projects
      if (!isProgram && node.phase) {
        ctx.beginPath()
        ctx.arc(node.x - w / 2 + 14, node.y, 4, 0, Math.PI * 2)
        ctx.fillStyle = phaseColor[node.phase] || '#6b7280'
        ctx.fill()
      }

      // Label
      ctx.fillStyle = '#e1e4ea'
      ctx.font = `${isProgram ? '11' : '12'}px -apple-system, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const labelX = isProgram ? node.x : node.x + 6
      ctx.fillText(node.label.length > 16 ? node.label.slice(0, 15) + '...' : node.label, labelX, node.y)

      // Type indicator
      ctx.fillStyle = '#8b8fa3'
      ctx.font = '9px -apple-system, sans-serif'
      ctx.fillText(isProgram ? 'program' : node.namespace, node.x, node.y + h / 2 + 12)
    }

    // Mouse handler for tooltips
    const handleMouse = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top

      for (const node of nodes) {
        if (!node.x || !node.y) continue
        const w = node.type === 'program' ? 120 : 140
        const h = 36
        if (mx >= node.x - w / 2 && mx <= node.x + w / 2 && my >= node.y - h / 2 && my <= node.y + h / 2) {
          setTooltip({ x: e.clientX, y: e.clientY, node })
          canvas.style.cursor = 'pointer'
          return
        }
      }
      setTooltip(null)
      canvas.style.cursor = 'default'
    }

    canvas.addEventListener('mousemove', handleMouse)
    return () => canvas.removeEventListener('mousemove', handleMouse)
  }, [data])

  if (loading || !data) return <div className="loading">Loading...</div>

  return (
    <div style={{ position: 'relative' }}>
      <h1>Stack Graph</h1>
      <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: '500px', display: 'block' }}
        />
        <div style={{
          position: 'absolute', bottom: '12px', right: '16px',
          display: 'flex', gap: '16px', fontSize: '0.75rem', color: 'var(--text-muted)',
        }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#1e293b', border: '1px solid #334155', borderRadius: 2, marginRight: 4 }} /> Program</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#1a1d27', border: '2px solid #22c55e', borderRadius: 2, marginRight: 4 }} /> Project</span>
          <span style={{ borderLeft: '1px dashed #4a5568', paddingLeft: 8 }}>--- programRef</span>
          <span style={{ borderLeft: '2px solid #4a5568', paddingLeft: 8 }}>&mdash; dependency</span>
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
            {tooltip.node.type} &middot; {tooltip.node.namespace}
            {tooltip.node.phase && <> &middot; {tooltip.node.phase}</>}
          </div>
        </div>
      )}
    </div>
  )
}
