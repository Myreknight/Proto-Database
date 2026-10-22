import { patchReport, type PatchPoint } from './gear'
import { gearModelOf } from './models'
import { expandPorts, portKey } from './ports'
import { INCHES_PER_U, placedIn, rackProblems, topOf } from './racking'
import { steckMount } from './show'
import type { Rack, RackSide, Show } from './types'

// A rack drawing laid out in real inches (1U = 1.75 in, 19 in wide), so the same layout
// draws on screen, prints, and exports to SVG and DXF at true scale.

export interface DrawBox {
  x: number
  y: number
  w: number
  h: number
  // A unit seen from its mounted side, the back of a front-mounted unit seen from the rear,
  // or one slot of a steck rail.
  kind: 'unit' | 'back' | 'slot'
  gearId: string
  problem: string | null
  // Set on a unit seen from the rails it's mounted on (and its steck slots), so the
  // screen can drag it: where it sits now and how big it is.
  drag?: DragInfo
}

export interface DragInfo {
  side: RackSide
  bottom: number
  heightU: number
  half: boolean
}

// Where each view's rack sits in the drawing, for turning a pointer into a rack unit.
export interface DrawView {
  side: RackSide
  x: number
  top: number
  rows: number
}

export interface DrawText {
  x: number
  y: number
  size: number
  text: string
  anchor: 'start' | 'middle' | 'end'
  bold?: boolean
  muted?: boolean
  problem?: boolean
}

export interface DrawLine {
  x1: number
  y1: number
  x2: number
  y2: number
  // Rack frame, rack-unit rules, the over-the-top line; in flow diagrams, a cable (wire)
  // and a bundle line (bus).
  kind: 'frame' | 'rule' | 'limit' | 'wire' | 'bus'
  // A wire's cable color.
  color?: string | null
}

export interface Drawing {
  width: number
  height: number
  views: DrawView[]
  boxes: DrawBox[]
  texts: DrawText[]
  lines: DrawLine[]
}

const U = INCHES_PER_U
export const RACK_WIDTH_IN = 19
const BAY = RACK_WIDTH_IN
const LABEL = 1.6
const GAP = 4
const MARGIN = 1
const HEAD = 1.8
const TITLE_LINE = 1.3

// Rough width of text in inches at a font size, for trimming labels to fit a box.
const textWidth = (text: string, size: number) => text.length * size * 0.56

// Splits a label at the space or slash nearest its middle; one line if there's neither.
function wrapTwo(text: string): string[] {
  let best = -1
  for (let i = 1; i < text.length - 1; i++) {
    if ((text[i] === ' ' || text[i] === '/') && (best < 0 || Math.abs(i - text.length / 2) < Math.abs(best - text.length / 2))) best = i
  }
  if (best < 0) return [text]
  const cut = text[best] === '/' ? best + 1 : best
  return [text.slice(0, cut).trim(), text.slice(cut).trim()]
}

function fit(text: string, width: number, size: number): string {
  if (textWidth(text, size) <= width) return text
  let t = text
  while (t.length > 1 && textWidth(`${t}…`, size) > width) t = t.slice(0, -1)
  return t.length > 1 ? `${t.trimEnd()}…` : ''
}

// Front and rear views side by side (or just the views asked for), U1 at the bottom.
// From the rear, front-mounted gear shows as its back and half-width gear swaps sides.
export function rackDrawing(show: Show, rack: Rack, opts: { views?: RackSide[]; title?: string[] } = {}): Drawing {
  const views = opts.views ?? ['front', 'rear']
  const title = opts.title ?? []
  const placed = placedIn(show, rack.id)
  const problems = rackProblems(show, rack)
  // What's mounted in each steck rail's slots, by rail.
  const patches = placed.some((p) => gearModelOf(show, p.gear)?.steck) ? patchReport(show) : null
  const steckIn = (gearId: string) => (patches?.byGear.get(gearId) ?? []).filter((pt) => pt.field.startsWith('steck'))
  const rows = Math.max(rack.size ?? 0, ...placed.map(topOf), 1)
  const top = MARGIN + title.length * TITLE_LINE + HEAD
  const bayH = rows * U
  const viewW = LABEL + BAY
  const boxes: DrawBox[] = []
  const texts: DrawText[] = []
  const lines: DrawLine[] = []

  title.forEach((line, i) => {
    const size = i === 0 ? 1.0 : 0.7
    texts.push({ x: MARGIN, y: MARGIN + i * TITLE_LINE + size, size, text: line, anchor: 'start', bold: i === 0, muted: i > 0 })
  })

  const drawViews: DrawView[] = []
  views.forEach((view, vi) => {
    const x0 = MARGIN + vi * (viewW + GAP) + LABEL
    drawViews.push({ side: view, x: x0, top, rows })
    texts.push({ x: x0 + BAY / 2, y: top - 0.6, size: 0.9, text: view === 'front' ? 'FRONT' : 'REAR', anchor: 'middle', bold: true })

    for (let k = 1; k <= rows; k++) {
      const yTop = top + (rows - k) * U
      if (k < rows) lines.push({ x1: x0, y1: yTop + U, x2: x0 + BAY, y2: yTop + U, kind: 'rule' })
      texts.push({
        x: x0 - 0.35,
        y: yTop + U / 2 + 0.25,
        size: 0.7,
        text: String(k),
        anchor: 'end',
        muted: true,
        problem: !!rack.size && k > rack.size,
      })
    }
    lines.push(
      { x1: x0, y1: top, x2: x0 + BAY, y2: top, kind: 'frame' },
      { x1: x0, y1: top + bayH, x2: x0 + BAY, y2: top + bayH, kind: 'frame' },
      { x1: x0, y1: top, x2: x0, y2: top + bayH, kind: 'frame' },
      { x1: x0 + BAY, y1: top, x2: x0 + BAY, y2: top + bayH, kind: 'frame' },
    )
    if (rack.size && rows > rack.size) {
      const y = top + (rows - rack.size) * U
      lines.push({ x1: x0 - LABEL + 0.2, y1: y, x2: x0 + BAY, y2: y, kind: 'limit' })
    }

    // Rear-mounted gear draws over the backs of front-mounted gear it shares rows with.
    const shown = placed
      .filter((p) => view === 'rear' || p.side === 'front')
      .sort((a, b) => (a.side === view ? 1 : 0) - (b.side === view ? 1 : 0))
    // Where gear mounted on this view's rails sits, so backs it covers go unlabeled.
    const mounted = shown.filter((p) => p.side === view)
    const covered = (p: (typeof placed)[number]) =>
      mounted.some(
        (m) =>
          m.bottom < p.bottom + p.height &&
          p.bottom < m.bottom + m.height &&
          (m.slot == null || p.slot == null || m.slot === p.slot),
      )
    for (const p of shown) {
      const kind = p.side === view ? 'unit' : 'back'
      const slot = view === 'rear' && p.slot ? (p.slot === 'left' ? 'right' : 'left') : p.slot
      const x = x0 + (slot === 'right' ? BAY / 2 : 0)
      const w = slot ? BAY / 2 : BAY
      const y = top + (rows - topOf(p)) * U
      const h = p.height * U
      const drag = kind === 'unit' ? { side: p.side, bottom: p.bottom, heightU: p.height, half: !!p.slot } : undefined
      boxes.push({ x: x + 0.05, y: y + 0.04, w: w - 0.1, h: h - 0.08, kind, gearId: p.gear.id, problem: problems.get(p.gear.id) ?? null, drag })
      if (kind === 'back' && covered(p)) continue

      // A steck rail seen from its face: its slots, each with the tail mounted in it.
      const library = gearModelOf(show, p.gear)
      const slotNames = kind === 'unit' && library?.steck ? expandPorts(library.ports) : []
      if (slotNames.length) {
        drawSlots(boxes, texts, { x, y, w, h }, p.gear.id, p.gear.name.trim(), slotNames, steckIn(p.gear.id), show, drag)
        continue
      }

      const g = p.gear
      const named = !!g.name.trim()
      const name = named ? g.name.trim() : g.model.trim() || g.manufacturer.trim() || 'Unnamed'
      const model = named ? [g.manufacturer, g.model].map((v) => v.trim()).filter(Boolean).join(' ') : g.manufacturer.trim()
      const size = Math.min(0.8, h * 0.4)
      const pad = 0.4
      const ruText = g.qty > 1 ? `${g.qty}×${p.height / g.qty}U` : `${p.height}U`
      const ruSize = size * 0.85
      const room = w - pad * 2 - textWidth(ruText, ruSize) - 0.3
      const problem = !!problems.get(g.id)
      const muted = kind === 'back'
      texts.push({ x: x + w - pad, y: y + h / 2 + ruSize * 0.35, size: ruSize, text: ruText, anchor: 'end', muted: true, problem })
      if (model && h >= 2 * U) {
        texts.push({ x: x + pad, y: y + h / 2 - size * 0.2, size, text: fit(name, room, size), anchor: 'start', bold: !muted, muted, problem })
        texts.push({ x: x + pad, y: y + h / 2 + size * 1.0, size: size * 0.8, text: fit(model, room, size * 0.8), anchor: 'start', muted: true })
      } else {
        const both = model ? `${name} · ${model}` : name
        const text = textWidth(both, size) <= room ? both : fit(name, room, size)
        texts.push({ x: x + pad, y: y + h / 2 + size * 0.35, size, text, anchor: 'start', bold: !muted, muted, problem })
      }
    }
  })

  return {
    width: MARGIN * 2 + views.length * viewW + (views.length - 1) * GAP,
    height: top + bayH + MARGIN,
    views: drawViews,
    boxes,
    texts,
    lines,
  }
}

// Steck rail slots across the rail, left to right in port order, after a strip with the
// rail's name. Each slot shows its number and splits among the connectors mounted in it
// (one G-block, or a couple of etherCONs), each labeled with its cable.
function drawSlots(
  boxes: DrawBox[],
  texts: DrawText[],
  area: { x: number; y: number; w: number; h: number },
  gearId: string,
  railName: string,
  slots: string[],
  points: PatchPoint[],
  show: Show,
  drag: DragInfo | undefined,
) {
  const nameW = railName ? Math.min(3, area.w * 0.16) : 0
  if (railName) {
    const size = Math.min(0.55, area.h * 0.3)
    texts.push({ x: area.x + 0.3, y: area.y + area.h / 2 + size * 0.35, size, text: fit(railName, nameW - 0.4, size), anchor: 'start', bold: true })
  }
  const left = area.x + nameW + 0.2
  const cellW = (area.w - nameW - 0.4) / slots.length
  slots.forEach((slot, i) => {
    const cx = left + i * cellW
    const here = points.filter((pt) => pt.port && portKey(pt.port) === portKey(slot))
    // One cell per connector in the slot, left to right by cable name.
    const ends = here
      .filter((pt, k) => here.findIndex((x) => x.slot === pt.slot) === k)
      .sort((a, b) => a.cable.name.localeCompare(b.cable.name, undefined, { numeric: true, sensitivity: 'base' }))
    const numSize = Math.min(0.4, area.h * 0.2)
    texts.push({ x: cx + 0.25, y: area.y + 0.25 + numSize, size: numSize, text: slot, anchor: 'start', muted: true })
    if (!ends.length) {
      boxes.push({ x: cx + 0.08, y: area.y + 0.2, w: cellW - 0.16, h: area.h - 0.4, kind: 'slot', gearId, problem: null, drag })
      return
    }
    const subW = cellW / ends.length
    ends.forEach((pt, k) => {
      const sx = cx + k * subW
      boxes.push({ x: sx + 0.08, y: area.y + 0.2, w: subW - 0.16, h: area.h - 0.4, kind: 'slot', gearId, problem: pt.issue, drag })
      const size = Math.min(0.6, area.h * 0.28, subW * 0.17)
      const room = subW - 0.35
      const name = pt.cable.name.trim() || 'Unnamed'
      const cy = area.y + area.h / 2
      // A name too long for the cell wraps onto two lines ("CPU/Amp" over "1a.1").
      const lines = textWidth(name, size) > room ? wrapTwo(name) : [name]
      if (lines.length === 2) {
        const small = size * 0.85
        lines.forEach((line, li) =>
          texts.push({ x: sx + subW / 2, y: cy + (li - 0.5) * small * 1.05 + small * 0.2, size: small, text: fit(line, room, small), anchor: 'middle', bold: true, problem: !!pt.issue }),
        )
      } else {
        texts.push({ x: sx + subW / 2, y: cy + size * 0.45, size, text: fit(name, room, size), anchor: 'middle', bold: true, problem: !!pt.issue })
      }
      // What it is under the name, when there's room: the tail, or the connector.
      const mount = steckMount(show, pt.cable, pt.field === 'steckA' ? 'A' : 'B')
      const detail = mount.tail?.name ?? mount.connector
      if (detail && area.h >= (lines.length === 2 ? 3 : 1.5)) {
        const small = size * 0.7
        texts.push({ x: sx + subW / 2, y: area.y + area.h - 0.35, size: small, text: fit(detail, room, small), anchor: 'middle', muted: true })
      }
    })
  })
}

// Cable colors are soft for the screen; on paper they're darkened so a wire stays visible.
export function wireColor(color: string | null | undefined): string {
  const m = color?.match(/^#?([0-9a-f]{6})$/i)
  if (!m) return '#333333'
  const v = parseInt(m[1], 16)
  const dark = (c: number) => Math.round(c * 0.62)
    .toString(16)
    .padStart(2, '0')
  return `#${dark((v >> 16) & 255)}${dark((v >> 8) & 255)}${dark(v & 255)}`
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const n = (v: number) => Number(v.toFixed(3))

// A standalone SVG in black and white, sized in inches so it imports at true scale.
export function drawingToSvg(d: Drawing): string {
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(d.width)}in" height="${n(d.height)}in" viewBox="0 0 ${n(d.width)} ${n(d.height)}" font-family="Helvetica, Arial, sans-serif">`,
    `<rect x="0" y="0" width="${n(d.width)}" height="${n(d.height)}" fill="#fff"/>`,
  ]
  for (const l of d.lines) {
    const style =
      l.kind === 'frame'
        ? 'stroke="#000" stroke-width="0.08"'
        : l.kind === 'limit'
          ? 'stroke="#c00" stroke-width="0.1"'
          : l.kind === 'wire'
            ? `stroke="${xml(wireColor(l.color))}" stroke-width="0.07" stroke-linecap="round"`
            : l.kind === 'bus'
              ? 'stroke="#000" stroke-width="0.2"'
              : 'stroke="#bbb" stroke-width="0.03"'
    out.push(`<line x1="${n(l.x1)}" y1="${n(l.y1)}" x2="${n(l.x2)}" y2="${n(l.y2)}" ${style}/>`)
  }
  for (const b of d.boxes) {
    const stroke = b.problem ? '#c00' : b.kind === 'back' ? '#888' : b.kind === 'slot' ? '#555' : '#000'
    const dash = b.kind === 'back' ? ' stroke-dasharray="0.3 0.2"' : ''
    const fill = b.kind === 'back' ? '#f2f2f2' : b.kind === 'slot' ? '#fafafa' : '#fff'
    out.push(
      `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(b.h)}" fill="${fill}" stroke="${stroke}" stroke-width="${b.kind === 'slot' ? 0.04 : 0.06}"${dash}/>`,
    )
  }
  for (const t of d.texts) {
    const fill = t.problem ? '#c00' : t.muted ? '#666' : '#000'
    out.push(
      `<text x="${n(t.x)}" y="${n(t.y)}" font-size="${n(t.size)}" text-anchor="${t.anchor}" fill="${fill}"${t.bold ? ' font-weight="bold"' : ''}>${xml(t.text)}</text>`,
    )
  }
  out.push('</svg>')
  return out.join('\n')
}

// DXF text is plain ASCII.
const ascii = (s: string) =>
  s
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/[·•–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/×/g, 'x')
    .replace(/[^\x20-\x7e]/g, '')

// An R12 DXF in inches (lines and text on layers), for Vectorworks or AutoCAD. DXF's Y
// axis points up, so the drawing is flipped to keep U1 at the bottom.
export function drawingToDxf(d: Drawing): string {
  const out: string[] = []
  const pair = (code: number, value: string | number) => out.push(String(code), typeof value === 'number' ? String(n(value)) : value)
  const line = (layer: string, x1: number, y1: number, x2: number, y2: number) => {
    pair(0, 'LINE')
    pair(8, layer)
    pair(10, x1)
    pair(20, d.height - y1)
    pair(30, 0)
    pair(11, x2)
    pair(21, d.height - y2)
    pair(31, 0)
  }
  pair(0, 'SECTION')
  pair(2, 'HEADER')
  pair(9, '$ACADVER')
  pair(1, 'AC1009')
  pair(0, 'ENDSEC')
  pair(0, 'SECTION')
  pair(2, 'ENTITIES')
  const layers: Record<DrawLine['kind'], string> = { frame: 'RACK', limit: 'OVER', rule: 'U-LINES', wire: 'CABLES', bus: 'BUNDLES' }
  for (const l of d.lines) line(layers[l.kind], l.x1, l.y1, l.x2, l.y2)
  for (const b of d.boxes) {
    const layer = b.kind === 'back' ? 'GEAR-BACKS' : b.kind === 'slot' ? 'STECK-SLOTS' : 'GEAR'
    line(layer, b.x, b.y, b.x + b.w, b.y)
    line(layer, b.x + b.w, b.y, b.x + b.w, b.y + b.h)
    line(layer, b.x + b.w, b.y + b.h, b.x, b.y + b.h)
    line(layer, b.x, b.y + b.h, b.x, b.y)
  }
  for (const t of d.texts) {
    const text = ascii(t.text)
    if (!text) continue
    pair(0, 'TEXT')
    pair(8, 'TEXT')
    pair(10, t.x)
    pair(20, d.height - t.y)
    pair(30, 0)
    pair(40, t.size * 0.7)
    pair(1, text)
    if (t.anchor !== 'start') {
      pair(72, t.anchor === 'middle' ? 1 : 2)
      pair(11, t.x)
      pair(21, d.height - t.y)
      pair(31, 0)
    }
  }
  pair(0, 'ENDSEC')
  pair(0, 'EOF')
  return out.join('\n') + '\n'
}
