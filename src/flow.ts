import type { DrawBox, DrawLine, DrawText, Drawing } from './drawing'
import { fieldKey, gearLabel, patchReport, type PatchPoint } from './gear'
import { endConnectors } from './labels'
import { placedIn, topOf } from './racking'
import { bundleById, visibleTails } from './show'
import type { Cable, Gear, Rack, Show } from './types'

// A rack's signal flow: its devices as boxes with the ports in use, the cables between
// them, and where each cable leaves the rack, at a steck slot or out to a bundle line.
// Laid out in the same units as rack drawings, so it shows, prints and exports the same way.

type End =
  | { kind: 'device'; gearId: string; port: string }
  | { kind: 'steck'; gearId: string; row: string }
  | { kind: 'out'; group: string }

interface Edge {
  cable: Cable
  from: End
  to: End
  // What an exit says next to its line: the cable, and where it goes.
  exitLabel: string
}

const BOX_W = 12
const TITLE = 1.5
const ROW = 0.95
const NODE_GAP = 0.9
const MARGIN = 1
const FONT = 0.5
const LANE = 0.5
// Clear space in each gap, between the lanes and the next column, for wire names.
const LABEL_ROOM = 5.5
const TITLE_LINE = 1.3

const textWidth = (text: string, size: number) => text.length * size * 0.56

function fit(text: string, width: number, size: number): string {
  if (textWidth(text, size) <= width) return text
  let t = text
  while (t.length > 1 && textWidth(`${t}…`, size) > width) t = t.slice(0, -1)
  return t.length > 1 ? `${t.trimEnd()}…` : ''
}

// Every cable that touches the rack, as lines from one end to the other: device to
// device inside the rack, or from a device to where the cable leaves (its steck slot in
// this rack, or out to its bundle).
function flowEdges(show: Show, rack: Rack): Edge[] {
  const report = patchReport(show)
  const inRack = (g: Gear) => g.rackId === rack.id
  const edges: Edge[] = []
  for (const cable of show.cables) {
    const tails = visibleTails(show, cable)
    const ends = (['A', 'B'] as const).map((end) => {
      const field = end === 'A' ? 'patchA' : 'patchB'
      const count = Math.min(tails.length, endConnectors(show, cable, end))
      const all: PatchPoint[] = []
      for (let i = 0; i < count; i++) {
        const p = report.byField.get(fieldKey(cable.id, `${field}-${i}`))
        if (p) all.push(p)
      }
      const fromTo = report.byField.get(fieldKey(cable.id, end === 'A' ? 'from' : 'to'))
      if (fromTo) all.push(fromTo)
      // One per plug: a From and Patch A cell on the same connector are the same.
      const devices = all.filter((p, i) => inRack(p.gear) && all.findIndex((x) => x.slot === p.slot) === i)
      const steckPoint = report.byField.get(fieldKey(cable.id, `steck${end}`))
      return { end, all, devices, steck: steckPoint && inRack(steckPoint.gear) ? steckPoint : undefined }
    })
    const [a, b] = ends
    const device = (p: PatchPoint): End => ({ kind: 'device', gearId: p.gear.id, port: p.port ?? '' })
    const name = cable.name.trim() || 'Unnamed'

    if (a.devices.length && b.devices.length) {
      // Inside the rack at both ends: connector by connector.
      const n = Math.max(a.devices.length, b.devices.length)
      for (let i = 0; i < n; i++) {
        const from = a.devices[Math.min(i, a.devices.length - 1)]
        const to = b.devices[Math.min(i, b.devices.length - 1)]
        edges.push({ cable, from: device(from), to: device(to), exitLabel: '' })
      }
      continue
    }
    const inside = a.devices.length ? a : b.devices.length ? b : null
    if (!inside) continue
    const other = inside === a ? b : a
    const steck = inside.steck ?? other.steck
    let exit: End
    let exitLabel = ''
    if (steck) {
      exit = { kind: 'steck', gearId: steck.gear.id, row: `${steck.port ?? '?'} · ${name}` }
    } else {
      // Out to its bundle, or to another rack, or just out.
      const otherRack = other.all.map((p) => p.gear.rackId).find((id) => id && id !== rack.id)
      const rackName = otherRack ? show.racks.find((r) => r.id === otherRack)?.name : undefined
      const bundle = bundleById(show, cable.bundleId)?.name
      const group = bundle ? `Bundle · ${bundle}` : rackName ? `To ${rackName}` : 'Outside the rack'
      const where = (other.end === 'A' ? cable.from : cable.to).trim()
      exit = { kind: 'out', group }
      // Arrows run End A to End B: out of the rack if this end is A, in if it's B.
      const arrow = inside === a ? '→' : '←'
      exitLabel = where ? `${name} ${arrow} ${where}` : name
    }
    for (const p of inside.devices) {
      edges.push(inside === a ? { cable, from: device(p), to: exit, exitLabel } : { cable, from: exit, to: device(p), exitLabel })
    }
  }
  return edges
}

interface Node {
  gearId: string
  steck: boolean
  title: string
  col: number
  left: string[]
  right: string[]
  x: number
  y: number
  h: number
}

export function rackFlow(show: Show, rack: Rack, opts: { title?: string[] } = {}): Drawing | null {
  const edges = flowEdges(show, rack)
  if (!edges.length) return null
  const gearById = new Map(show.gear.map((g) => [g.id, g]))
  const nodeIds = (kind: 'device' | 'steck') =>
    [...new Set(edges.flatMap((e) => [e.from, e.to]).filter((x) => x.kind === kind).map((x) => (x as { gearId: string }).gearId))]
  const steckIds = nodeIds('steck')
  // A steck rail someone also patched to by name still draws once, as a steck.
  const deviceIds = nodeIds('device').filter((id) => !steckIds.includes(id))

  // Columns: each device to the right of what feeds it (longest path), stecks after them.
  const layer = new Map(deviceIds.map((id) => [id, 0]))
  for (let pass = 0; pass < deviceIds.length; pass++) {
    let changed = false
    for (const e of edges) {
      if (e.from.kind !== 'device' || e.to.kind !== 'device' || e.from.gearId === e.to.gearId) continue
      const next = Math.min(deviceIds.length, (layer.get(e.from.gearId) ?? 0) + 1)
      if (next > (layer.get(e.to.gearId) ?? 0)) {
        layer.set(e.to.gearId, next)
        changed = true
      }
    }
    if (!changed) break
  }
  const deviceCols = Math.max(0, ...layer.values()) + 1
  const steckCol = deviceCols

  // Top to bottom in rack order, so the flow reads like the rack.
  const placed = placedIn(show, rack.id)
  const position = (id: string) => {
    const p = placed.find((x) => x.gear.id === id)
    return p ? topOf(p) : -1
  }
  const nodes: Node[] = [...deviceIds, ...steckIds]
    .map((id) => {
      const g = gearById.get(id)!
      const model = [g.manufacturer, g.model].map((v) => v.trim()).filter(Boolean).join(' ')
      return {
        gearId: id,
        steck: steckIds.includes(id),
        title: g.name.trim() && model ? `${g.name.trim()} · ${model}` : gearLabel(g),
        col: steckIds.includes(id) ? steckCol : (layer.get(id) ?? 0),
        left: [] as string[],
        right: [] as string[],
        x: 0,
        y: 0,
        h: 0,
      }
    })
    .sort((a, b) => position(b.gearId) - position(a.gearId))
  const nodeOf = (id: string) => nodes.find((n) => n.gearId === id)!

  // Which side each port sits on: facing where its cable goes.
  const sideOf = (here: Node, there: End): 'left' | 'right' => {
    if (there.kind !== 'device') return 'right'
    return nodeOf(there.gearId).col < here.col ? 'left' : 'right'
  }
  const addRow = (node: Node, side: 'left' | 'right', row: string) => {
    if (!node[side].includes(row)) node[side].push(row)
  }
  for (const e of edges) {
    if (e.from.kind === 'device') addRow(nodeOf(e.from.gearId), sideOf(nodeOf(e.from.gearId), e.to), e.from.port)
    if (e.to.kind === 'device') addRow(nodeOf(e.to.gearId), sideOf(nodeOf(e.to.gearId), e.from), e.to.port)
    if (e.from.kind === 'steck') addRow(nodeOf(e.from.gearId), 'left', e.from.row)
    if (e.to.kind === 'steck') addRow(nodeOf(e.to.gearId), 'left', e.to.row)
  }

  // Routes: a wire between nodes turns down a lane in the gap beside where it starts.
  type Route = { edge: Edge; gap: number; lane: number }
  const routes: Route[] = []
  const lanesInGap = new Map<number, number>()
  const routeKey = new Set<string>()
  for (const e of edges) {
    if (e.from.kind === 'out' || e.to.kind === 'out') continue
    const key = JSON.stringify([e.from, e.to])
    if (routeKey.has(key)) continue
    routeKey.add(key)
    const src = nodeOf(e.from.gearId)
    const dst = nodeOf(e.to.gearId)
    const gap = dst.col < src.col ? src.col - 1 : src.col
    const lane = lanesInGap.get(gap) ?? 0
    lanesInGap.set(gap, lane + 1)
    routes.push({ edge: e, gap, lane })
  }

  const top = MARGIN + (opts.title?.length ?? 0) * TITLE_LINE + 0.5
  const gapWidth = (gap: number) => 1.6 + (lanesInGap.get(gap) ?? 0) * LANE + LABEL_ROOM
  const colX: number[] = []
  let cx = MARGIN
  for (let c = 0; c <= steckCol; c++) {
    colX.push(cx)
    cx += BOX_W + gapWidth(c)
  }
  let y = top
  for (const n of nodes) {
    n.x = colX[n.col]
    n.y = y
    n.h = TITLE + Math.max(1, n.left.length, n.right.length) * ROW + 0.3
    y += n.h + NODE_GAP
  }

  const portY = (n: Node, side: 'left' | 'right', row: string) => n.y + TITLE + (n[side].indexOf(row) + 0.5) * ROW
  const boxes: DrawBox[] = []
  const texts: DrawText[] = []
  const lines: DrawLine[] = []
  ;(opts.title ?? []).forEach((line, i) => {
    const size = i === 0 ? 1.0 : 0.7
    texts.push({ x: MARGIN, y: MARGIN + i * TITLE_LINE + size, size, text: line, anchor: 'start', bold: i === 0, muted: i > 0 })
  })

  for (const n of nodes) {
    boxes.push({ x: n.x, y: n.y, w: BOX_W, h: n.h, kind: 'unit', gearId: n.gearId, problem: null })
    texts.push({ x: n.x + 0.35, y: n.y + 0.95, size: 0.6, text: fit(n.title, BOX_W - 0.7, 0.6), anchor: 'start', bold: true })
    lines.push({ x1: n.x, y1: n.y + TITLE - 0.25, x2: n.x + BOX_W, y2: n.y + TITLE - 0.25, kind: 'rule' })
    const half = n.steck ? BOX_W - 0.7 : BOX_W / 2 - 0.5
    n.left.forEach((row, i) =>
      texts.push({ x: n.x + 0.35, y: n.y + TITLE + (i + 0.5) * ROW + FONT * 0.35, size: FONT, text: fit(row || '—', half, FONT), anchor: 'start' }),
    )
    n.right.forEach((row, i) =>
      texts.push({ x: n.x + BOX_W - 0.35, y: n.y + TITLE + (i + 0.5) * ROW + FONT * 0.35, size: FONT, text: fit(row || '—', half, FONT), anchor: 'end' }),
    )
  }

  const wire = (cable: Cable, x1: number, y1: number, x2: number, y2: number) =>
    lines.push({ x1, y1, x2, y2, kind: 'wire', color: cable.color })
  const arrow = (cable: Cable, x: number, y: number, dir: 1 | -1) => {
    wire(cable, x - dir * 0.35, y - 0.2, x, y)
    wire(cable, x - dir * 0.35, y + 0.2, x, y)
  }
  const wireLabel = (text: string, x: number, y: number, anchor: 'start' | 'end', room: number) =>
    texts.push({ x, y: y - 0.15, size: 0.4, text: fit(text, room, 0.4), anchor, muted: true })

  // Between nodes: out of the start port, along a lane, into the end port.
  for (const { edge, gap, lane } of routes) {
    if (edge.from.kind === 'out' || edge.to.kind === 'out') continue
    const src = nodeOf(edge.from.gearId)
    const dst = nodeOf(edge.to.gearId)
    const srcSide = edge.from.kind === 'steck' ? 'left' : sideOf(src, edge.to)
    const dstSide = edge.to.kind === 'steck' ? 'left' : sideOf(dst, edge.from)
    const fromRow = edge.from.kind === 'device' ? edge.from.port : edge.from.row
    const toRow = edge.to.kind === 'device' ? edge.to.port : edge.to.row
    const y1 = portY(src, srcSide, fromRow)
    const y2 = portY(dst, dstSide, toRow)
    const x1 = srcSide === 'right' ? src.x + BOX_W : src.x
    const x2 = dstSide === 'right' ? dst.x + BOX_W : dst.x
    const laneX = colX[gap] + BOX_W + 1 + lane * LANE
    wire(edge.cable, x1, y1, laneX, y1)
    wire(edge.cable, laneX, y1, laneX, y2)
    wire(edge.cable, laneX, y2, x2, y2)
    arrow(edge.cable, x2, y2, dstSide === 'left' ? 1 : -1)
    const name = edge.cable.name.trim() || 'Unnamed'
    if (dstSide === 'left') wireLabel(name, x2 - 0.5, y2, 'end', LABEL_ROOM - 0.8)
    else wireLabel(name, x2 + 0.5, y2, 'start', LABEL_ROOM - 0.8)
  }

  // Out of the rack: straight across to the bundle's line, labeled with where it goes.
  const exits = edges.filter((e) => e.from.kind === 'out' || e.to.kind === 'out')
  const groups = [...new Set(exits.map((e) => ((e.from.kind === 'out' ? e.from : e.to) as { group: string }).group))]
  let busX = colX[steckCol] + (steckIds.length ? BOX_W + 4 : 0) + 4
  const groupX = new Map<string, number>()
  for (const g of groups) {
    groupX.set(g, busX)
    busX += Math.max(2.5, textWidth(g, 0.55) + 0.8)
  }
  const span = new Map<string, [number, number]>()
  for (const e of exits) {
    const out = (e.from.kind === 'out' ? e.from : e.to) as { group: string }
    const dev = (e.from.kind === 'device' ? e.from : e.to) as { gearId: string; port: string }
    const n = nodeOf(dev.gearId)
    const yy = portY(n, 'right', dev.port)
    const bx = groupX.get(out.group)!
    wire(e.cable, n.x + BOX_W, yy, bx, yy)
    if (e.to.kind === 'out') arrow(e.cable, bx, yy, 1)
    else arrow(e.cable, n.x + BOX_W, yy, -1)
    wireLabel(e.exitLabel, n.x + BOX_W + 0.5, yy, 'start', Math.max(3, bx - n.x - BOX_W - 1))
    const [lo, hi] = span.get(out.group) ?? [yy, yy]
    span.set(out.group, [Math.min(lo, yy), Math.max(hi, yy)])
  }
  for (const g of groups) {
    const bx = groupX.get(g)!
    const [lo, hi] = span.get(g)!
    lines.push({ x1: bx, y1: lo - 0.8, x2: bx, y2: hi + 0.8, kind: 'bus' })
    texts.push({ x: bx - 0.2, y: lo - 1.1, size: 0.55, text: g, anchor: 'start', bold: true })
  }

  const width = Math.max(busX, colX[steckCol] + BOX_W) + MARGIN
  const height = Math.max(y, top + 2) + MARGIN
  return { width, height, views: [], boxes, texts, lines }
}
