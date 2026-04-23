import { useEffect, useMemo, useRef, useState } from 'react'
import * as d3 from 'd3'
import { useNavigate } from 'react-router-dom'
import { useWikiStore } from './WikiStore'
import type { PageType } from '../types'

// ── types ──────────────────────────────────────────────────────────────────

interface GraphNode extends d3.SimulationNodeDatum {
  id: string
  title: string
  type: PageType | 'unknown'
  inDegree: number
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: GraphNode | string
  target: GraphNode | string
}

// ── constants ──────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<PageType | 'unknown', string> = {
  vendor:  'var(--accent)',
  product: '#8b6914',
  sop:     '#4a7c59',
  event:   '#7a4a8c',
  person:  '#c05a2a',
  note:    'var(--tobacco)',
  unknown: 'var(--ink-faint)',
}

const MIN_RADIUS = 5
const MAX_RADIUS = 22
const LABEL_ZOOM_THRESHOLD = 1.5

// ── type aliases ───────────────────────────────────────────────────────────

type SvgSel  = d3.Selection<SVGSVGElement, unknown, null, undefined>
type RootSel = d3.Selection<SVGGElement,   unknown, null, undefined>
type NodeSel = d3.Selection<SVGGElement,   GraphNode, SVGGElement, unknown>
type LinkSel = d3.Selection<SVGLineElement, GraphLink, SVGGElement, unknown>
type RScale  = d3.ScalePower<number, number, never>

// ── CSS helpers ────────────────────────────────────────────────────────────

function readCssVar(name: string): string {
  if (typeof window === 'undefined') return '#999'
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#999'
}

function resolveColor(value: string): string {
  if (value.startsWith('var(')) {
    const varName = value.slice(4, -1).trim()
    return readCssVar(varName)
  }
  return value
}

// ── D3 helpers ─────────────────────────────────────────────────────────────

function createSimulation(
  nodes: GraphNode[],
  links: GraphLink[],
  width: number,
  height: number,
  rScale: RScale,
): d3.Simulation<GraphNode, GraphLink> {
  return d3
    .forceSimulation<GraphNode>(nodes)
    .force(
      'link',
      d3.forceLink<GraphNode, GraphLink>(links).id((d) => d.id).distance(60).strength(0.4),
    )
    .force('charge', d3.forceManyBody().strength(-180))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collide', d3.forceCollide<GraphNode>((d) => rScale(d.inDegree) + 4))
}

function appendArrowMarker(svgSel: SvgSel): void {
  svgSel
    .append('defs')
    .append('marker')
    .attr('id', 'arrow')
    .attr('viewBox', '0 -4 8 8')
    .attr('refX', 14)
    .attr('refY', 0)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-4L8,0L0,4')
    .attr('fill', readCssVar('--ink-faint') || '#aaa')
}

function appendEdges(root: RootSel, links: GraphLink[]): LinkSel {
  return root
    .append('g')
    .attr('class', 'links')
    .selectAll<SVGLineElement, GraphLink>('line')
    .data(links)
    .join('line')
    .attr('stroke', readCssVar('--ink-faint') || '#aaa')
    .attr('stroke-width', 1)
    .attr('stroke-opacity', 0.5)
    .attr('marker-end', 'url(#arrow)')
}

function appendNodeGroups(root: RootSel, nodes: GraphNode[], rScale: RScale): NodeSel {
  const nodeG = root
    .append('g')
    .attr('class', 'nodes')
    .selectAll<SVGGElement, GraphNode>('g')
    .data(nodes, (d) => d.id)
    .join('g')
    .attr('class', 'node-g')
    .style('cursor', 'pointer')

  nodeG
    .append('circle')
    .attr('r', (d) => rScale(d.inDegree))
    .attr('fill', (d) => resolveColor(TYPE_COLORS[d.type]))
    .attr('fill-opacity', 0.85)
    .attr('stroke', (d) => resolveColor(TYPE_COLORS[d.type]))
    .attr('stroke-width', 1.5)

  nodeG
    .append('text')
    .attr('class', 'node-label')
    .attr('dy', (d) => -(rScale(d.inDegree) + 4))
    .attr('text-anchor', 'middle')
    .attr('font-size', 11)
    .attr('fill', readCssVar('--ink') || '#1a1a1a')
    .attr('pointer-events', 'none')
    .text((d) => d.title)
    .attr('opacity', 0)

  return nodeG
}

function attachInteractions(
  nodeG: NodeSel,
  sim: d3.Simulation<GraphNode, GraphLink>,
  navigate: (to: string) => void,
  setHoveredId: (id: string | null) => void,
): void {
  const drag = d3
    .drag<SVGGElement, GraphNode>()
    .on('start', (event, d) => {
      if (!event.active) sim.alphaTarget(0.3).restart()
      d.fx = d.x
      d.fy = d.y
    })
    .on('drag', (event, d) => {
      d.fx = event.x
      d.fy = event.y
    })
    .on('end', (event, d) => {
      if (!event.active) sim.alphaTarget(0)
      d.fx = null
      d.fy = null
    })

  nodeG.call(drag)
  nodeG.on('click', (_event, d) => navigate(`/wiki/${d.id}`))
  nodeG.on('mouseenter', (_event, d) => setHoveredId(d.id))
  nodeG.on('mouseleave', () => setHoveredId(null))
}

function attachZoom(
  svgSel: SvgSel,
  root: RootSel,
  nodeG: NodeSel,
  zoomRef: { current: d3.ZoomBehavior<SVGSVGElement, unknown> | null },
  currentZoomRef: { current: number },
): void {
  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.1, 8])
    .on('zoom', (event) => {
      root.attr('transform', event.transform)
      currentZoomRef.current = event.transform.k
      const showLabels = event.transform.k >= LABEL_ZOOM_THRESHOLD
      nodeG.select<SVGTextElement>('text.node-label').attr('opacity', showLabels ? 1 : 0)
    })

  zoomRef.current = zoom
  svgSel.call(zoom)
}

// ── component ──────────────────────────────────────────────────────────────

export function GraphView() {
  const { pages, backlinks } = useWikiStore()
  const navigate = useNavigate()
  const svgRef = useRef<SVGSVGElement>(null)
  const [query, setQuery] = useState('')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const simRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null)
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const currentZoomRef = useRef(1)

  // ── build graph data ──────────────────────────────────────────────────

  const { nodes, links } = useMemo(() => {
    const inDegreeMap: Record<string, number> = {}
    for (const [slug, sources] of Object.entries(backlinks.incoming)) {
      inDegreeMap[slug] = sources.length
    }

    const nodes: GraphNode[] = pages.map((p) => ({
      id: p.slug,
      title: p.frontmatter.title ?? p.slug,
      type: (p.frontmatter.type as PageType) ?? 'unknown',
      inDegree: inDegreeMap[p.slug] ?? 0,
    }))

    const slugSet = new Set(pages.map((p) => p.slug))
    const links: GraphLink[] = []
    for (const [source, targets] of Object.entries(backlinks.outgoing)) {
      if (!slugSet.has(source)) continue
      for (const target of targets) {
        if (slugSet.has(target) && source !== target) {
          links.push({ source, target })
        }
      }
    }

    return { nodes, links }
  }, [pages, backlinks])

  // ── D3 render ──────────────────────────────────────────────────────────

  useEffect(() => {
    const svg = svgRef.current
    if (!svg || nodes.length === 0) return

    d3.select(svg).selectAll('*').remove()

    const width = svg.clientWidth || 800
    const height = svg.clientHeight || 600
    const maxIn = Math.max(1, d3.max(nodes, (d) => d.inDegree) ?? 1)
    const rScale = d3.scaleSqrt().domain([0, maxIn]).range([MIN_RADIUS, MAX_RADIUS])

    const svgSel = d3.select(svg)
    const root = svgSel.append('g').attr('class', 'graph-root')
    const sim = createSimulation(nodes, links, width, height, rScale)
    simRef.current = sim

    appendArrowMarker(svgSel)
    const linkSel = appendEdges(root, links)
    const nodeG = appendNodeGroups(root, nodes, rScale)
    attachInteractions(nodeG, sim, navigate, setHoveredId)
    attachZoom(svgSel, root, nodeG, zoomRef, currentZoomRef)

    sim.on('tick', () => {
      linkSel
        .attr('x1', (d) => (d.source as GraphNode).x ?? 0)
        .attr('y1', (d) => (d.source as GraphNode).y ?? 0)
        .attr('x2', (d) => (d.target as GraphNode).x ?? 0)
        .attr('y2', (d) => (d.target as GraphNode).y ?? 0)
      nodeG.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`)
    })

    return () => { sim.stop() }
  }, [nodes, links, navigate])

  // ── hover highlight effect ─────────────────────────────────────────────

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const neighborSet = new Set<string>()
    if (hoveredId !== null) {
      neighborSet.add(hoveredId)
      for (const link of links) {
        const s = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id
        const t = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id
        if (s === hoveredId) neighborSet.add(t)
        if (t === hoveredId) neighborSet.add(s)
      }
    }

    d3.select(svg)
      .selectAll<SVGGElement, GraphNode>('.node-g')
      .select('circle')
      .attr('fill-opacity', (d) => (hoveredId === null ? 0.85 : neighborSet.has(d.id) ? 1 : 0.15))
      .attr('stroke-opacity', (d) => (hoveredId === null ? 1 : neighborSet.has(d.id) ? 1 : 0.15))

    d3.select(svg)
      .selectAll<SVGLineElement, GraphLink>('line')
      .attr('stroke-opacity', (d) => {
        if (hoveredId === null) return 0.5
        const s = typeof d.source === 'string' ? d.source : (d.source as GraphNode).id
        const t = typeof d.target === 'string' ? d.target : (d.target as GraphNode).id
        return s === hoveredId || t === hoveredId ? 0.9 : 0.05
      })

    if (currentZoomRef.current < LABEL_ZOOM_THRESHOLD) {
      d3.select(svg)
        .selectAll<SVGTextElement, GraphNode>('.node-g text.node-label')
        .attr('opacity', (d) => (d.id === hoveredId ? 1 : 0))
    }
  }, [hoveredId, links])

  // ── search dim effect ──────────────────────────────────────────────────

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const q = query.trim().toLowerCase()

    d3.select(svg)
      .selectAll<SVGGElement, GraphNode>('.node-g')
      .attr('opacity', (d) => {
        if (!q) return 1
        const matches =
          d.title.toLowerCase().includes(q) ||
          d.id.toLowerCase().includes(q) ||
          d.type.toLowerCase().includes(q)
        return matches ? 1 : 0.1
      })
  }, [query])

  // ── reset zoom ─────────────────────────────────────────────────────────

  function resetZoom() {
    const svg = svgRef.current
    if (!svg || !zoomRef.current) return
    d3.select(svg).transition().duration(400).call(zoomRef.current.transform, d3.zoomIdentity)
  }

  // ── legend ─────────────────────────────────────────────────────────────

  const types: Array<PageType | 'unknown'> = ['vendor', 'product', 'sop', 'event', 'person', 'note']
  const presentTypes = types.filter((t) => nodes.some((n) => n.type === t))

  return (
    <div className="graph-view">
      <div className="graph-toolbar">
        <input
          className="graph-search"
          type="search"
          placeholder="Filter nodes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter graph nodes"
        />
        <button className="graph-reset" onClick={resetZoom} title="Reset zoom">
          ↺ Reset
        </button>
        <span className="graph-count">{nodes.length} pages · {links.length} links</span>
      </div>

      <svg ref={svgRef} className="graph-svg" aria-label="Wiki page relationship graph" />

      {presentTypes.length > 0 && (
        <div className="graph-legend">
          {presentTypes.map((t) => (
            <span key={t} className="graph-legend-item">
              <span
                className="graph-legend-dot"
                style={{ background: resolveColor(TYPE_COLORS[t]) }}
              />
              {t}
            </span>
          ))}
        </div>
      )}

      {nodes.length === 0 && (
        <div className="graph-empty">No pages loaded yet.</div>
      )}
    </div>
  )
}
