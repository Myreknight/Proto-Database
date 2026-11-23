// Port labels for network switches, drawn at real size: everything is in millimetres and
// the SVG is sized in mm, so printed at 100% each port lands over the one on the switch.
// RJ45 jacks are drawn as the opening with its latch notch, SFP ports as wider cages. Each
// port is filled with its colour (its VLAN's, unless it has its own) and shows its number
// and VLAN; a trunk gets a band of its tagged VLANs' colours. From the NETGEAR config
// builder's label printer.

import type { PatchPoint } from './gear'
import { gearLabel } from './gear'
import { gearModelOf } from './models'
import { isSfpName, portFill, portMatcher, portSetup, switchPortList, vlanById, vlanColor } from './network'
import { rackById } from './show'
import { loadViewSetting, storeViewSetting } from './sorting'
import type { Gear, Show, SwitchLayout } from './types'

export interface SwitchLabelStyle {
  shape: 'rj45' | 'box'
  latch: 'auto' | 'up' | 'down'
  // The female RJ45 opening, notch included, and the SFP cage, in mm.
  jackW: number
  jackH: number
  notchW: number
  notchH: number
  sfpW: number
  sfpH: number
  // Centre-to-centre spacing on the switch.
  pitchX: number
  pitchY: number
  descPos: 'outside' | 'above' | 'below' | 'none'
  // A port with no description of its own: what's patched there (the far end, or the
  // cable's name), or nothing.
  autoDesc: 'far' | 'cable' | 'none'
  descSize: number
  descLines: number
  descRotate: boolean
  descLen: number
  showNumber: boolean
  showVlan: boolean
  showTitle: boolean
  showLegend: boolean
  showRuler: boolean
  showCut: boolean
  paper: 'letter' | 'legal' | 'a4' | 'a3'
  orient: 'landscape' | 'portrait'
  margin: number
  // Actual size, to sit over the ports; or fitted into an area somewhere else (on top
  // of the switch, a blank panel), scaled to fit and centred. In mm.
  size: 'actual' | 'fit'
  areaW: number
  areaH: number
  // How lengths are shown and typed; they're kept in mm either way.
  units: 'in' | 'mm'
}

// Port sizes are estimates, not measured from hardware: measure one switch per model.
export const LABEL_DEFAULTS: SwitchLabelStyle = {
  shape: 'rj45',
  latch: 'auto',
  jackW: 11.7,
  jackH: 8.3,
  notchW: 6.0,
  notchH: 1.6,
  sfpW: 13.8,
  sfpH: 9.0,
  pitchX: 14.0,
  pitchY: 13.5,
  descPos: 'outside',
  autoDesc: 'far',
  descSize: 6,
  descLines: 2,
  descRotate: false,
  descLen: 18,
  showNumber: true,
  showVlan: true,
  showTitle: true,
  showLegend: true,
  showRuler: true,
  showCut: true,
  paper: 'letter',
  orient: 'landscape',
  margin: 10,
  size: 'actual',
  areaW: 482.6,
  areaH: 44.45,
  units: 'in',
}

// Blank panels a label often goes on instead, in mm.
export const AREA_PRESETS: { label: string; w: number; h: number }[] = [
  { label: '1RU blank', w: 482.6, h: 44.45 },
  { label: '2RU blank', w: 482.6, h: 88.9 },
]

export const MM_PER_IN = 25.4
// A length in the style's units, and back to mm.
export const toUnits = (mm: number, units: SwitchLabelStyle['units']) =>
  units === 'in' ? Math.round((mm / MM_PER_IN) * 1000) / 1000 : Math.round(mm * 10) / 10
export const fromUnits = (v: number, units: SwitchLabelStyle['units']) => (units === 'in' ? v * MM_PER_IN : v)
export const lengthText = (mm: number, units: SwitchLabelStyle['units']) =>
  units === 'in' ? `${toUnits(mm, 'in').toFixed(2).replace(/\.?0+$/, '')} in` : `${toUnits(mm, 'mm')} mm`

const STYLE_KEY = 'proto-database:switch-labels'
export const loadLabelStyle = () => loadViewSetting<SwitchLabelStyle>(STYLE_KEY, LABEL_DEFAULTS)
export const storeLabelStyle = (style: SwitchLabelStyle) => storeViewSetting(STYLE_KEY, style)

// Which switch's label the printout shows ('all', or one switch), remembered like the
// other print settings; a switch's page opens it on that switch.
export const SWITCH_PICK_KEY = 'proto-database:switch-label-pick'
export const pickSwitchLabel = (id: string | null) => storeViewSetting(SWITCH_PICK_KEY, { id: id ?? 'all' })

export const PAPER: Record<SwitchLabelStyle['paper'], [number, number]> = {
  letter: [215.9, 279.4],
  legal: [215.9, 355.6],
  a4: [210, 297],
  a3: [297, 420],
}
const PT = 0.3528 // mm per point
const LPAD = 3 // inside the cut line
const FONT = 'Helvetica, Arial, sans-serif'
const f2 = (n: number) => Math.round(n * 100) / 100
const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

// Black or white, whichever reads on the colour.
export function textOn(hex: string): string {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(h.substring(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.18 ? '#111111' : '#ffffff'
}

function wrapText(text: string, maxW: number, size: number, maxLines: number): string[] {
  const maxChars = Math.max(1, Math.floor(maxW / (size * 0.55)))
  const lines: string[] = []
  let cur = ''
  for (let w of text.split(/\s+/).filter(Boolean)) {
    while (w.length > maxChars) {
      if (cur) {
        lines.push(cur)
        cur = ''
      }
      lines.push(w.slice(0, maxChars))
      w = w.slice(maxChars)
    }
    const next = cur ? `${cur} ${w}` : w
    if (next.length <= maxChars) cur = next
    else {
      if (cur) lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  const last = kept[maxLines - 1]
  kept[maxLines - 1] = `${last.length >= maxChars ? last.slice(0, maxChars - 1) : last}…`
  return kept
}

// What's plugged into a port, for its label: the other end of the cable, or its name.
export function patchedText(points: PatchPoint[], port: string, mode: 'far' | 'cable'): string {
  const here = points.filter((p) => p.port === port)
  const texts = here.map((p) => {
    if (mode === 'cable') return p.cable.name.trim()
    const tail = /^patch([AB])-(\d+)$/.exec(p.field)
    const far = p.field === 'from'
      ? p.cable.to
      : p.field === 'to'
        ? p.cable.from
        : tail
          ? (p.cable.tails[Number(tail[2])]?.[tail[1] === 'A' ? 'patchB' : 'patchA'] ?? '')
          : ''
    return far.trim() || p.cable.name.trim()
  })
  return [...new Set(texts.filter(Boolean))].join(', ')
}

const portText = (port: string) => (/^\d+$/.test(port.trim()) ? String(Number(port)) : port.replace(/\s+/g, '').slice(0, 6))

// Where each port sits: columns of `rows` ports (odd on top, even below on two rows),
// with gaps before the ports the layout names, and every so many columns.
function columns(ports: string[], layout: SwitchLayout, style: SwitchLabelStyle) {
  const rows = layout.rows
  const gapAt = portMatcher(layout.gapBefore)
  const ncols = Math.ceil(ports.length / rows)
  const colX: number[] = []
  let x = 0
  for (let c = 0; c < ncols; c++) {
    if (c > 0) {
      const inCol = ports.slice(c * rows, c * rows + rows)
      if ((layout.groupCols > 0 && c % layout.groupCols === 0) || inCol.some(gapAt)) x += layout.gap
    }
    colX.push(x)
    x += style.pitchX
  }
  const sfp = portMatcher(layout.sfp)
  return { rows, ncols, colX, isSfp: (p: string) => sfp(p) || isSfpName(p) }
}

const NO_LAYOUT: SwitchLayout = { rows: 1, sfp: '', gapBefore: '', gap: 4, groupCols: 0 }

function setup(show: Show, g: Gear, style: SwitchLabelStyle) {
  const ports = switchPortList(show, g)
  const layout = gearModelOf(show, g)?.switchLayout ?? NO_LAYOUT
  return { ports, layout, geo: columns(ports, layout, style) }
}

export function printableWidth(style: SwitchLabelStyle): number {
  const [pw, ph] = PAPER[style.paper] ?? PAPER.letter
  return (style.orient === 'landscape' ? ph : pw) - 2 * style.margin
}

// A wide switch's label split into column ranges that each fit across the page.
export function labelParts(show: Show, g: Gear, style: SwitchLabelStyle): [number, number][] {
  const { geo } = setup(show, g, style)
  const avail = printableWidth(style) - 2 * LPAD
  const parts: [number, number][] = []
  let start = 0
  for (let c = 0; c < geo.ncols; c++) {
    if (c > start && geo.colX[c] + style.pitchX - geo.colX[start] > avail) {
      parts.push([start, c])
      start = c
    }
  }
  parts.push([start, Math.max(geo.ncols, 1)])
  return parts
}

function jackPath(cx: number, cy: number, w: number, h: number, notch: 'up' | 'down', nw: number, nh: number): string {
  const x0 = cx - w / 2
  const x1 = cx + w / 2
  const nx0 = cx - nw / 2
  const nx1 = cx + nw / 2
  const top = cy - h / 2
  const bot = cy + h / 2
  const P = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${f2(x)},${f2(y)}`).join(' L')} Z`
  if (notch === 'up') {
    const bt = top + nh
    return P([[x0, bt], [nx0, bt], [nx0, top], [nx1, top], [nx1, bt], [x1, bt], [x1, bot], [x0, bot]])
  }
  const bb = bot - nh
  return P([[x0, top], [x1, top], [x1, bb], [nx1, bb], [nx1, bot], [nx0, bot], [nx0, bb], [x0, bb]])
}

export interface LabelOptions {
  // Columns to draw (a part of a wide switch), and which part it is.
  range?: [number, number]
  part?: [number, number]
  // What's patched to the switch's ports, for ports with no description of their own.
  points?: PatchPoint[]
  // On screen: ports picked, outlined, and each port tagged so a click can find it.
  selected?: Set<string>
  interactive?: boolean
  // At actual size whatever the style says (the switch's page draws it that way).
  natural?: boolean
}

// The label's drawing at actual size, without its background or cut line.
function drawLabel(show: Show, g: Gear, style: SwitchLabelStyle, opts: LabelOptions): { inner: string; w: number; h: number } {
  const L = style
  // A fitted label is scaled, so a ruler on it wouldn't measure anything.
  const ruler = L.showRuler && (opts.natural || L.size !== 'fit')
  const { ports, geo } = setup(show, g, style)
  const [c0, c1] = opts.range ?? [0, Math.max(geo.ncols, 1)]
  const portsW = geo.ncols ? geo.colX[c1 - 1] + L.pitchX - geo.colX[c0] : L.pitchX
  const W = Math.max(portsW, 70) + 2 * LPAD
  const fs = L.descSize * PT
  const lineH = fs * 1.2
  const portAt = (c: number, r: number) => ports[c * geo.rows + r]
  const descOf = (port: string) => {
    const own = portSetup(g, port).desc.trim()
    if (own || L.autoDesc === 'none' || !opts.points) return own
    return patchedText(opts.points, port, L.autoDesc)
  }
  const rowHasDesc = (r: number) => {
    for (let c = c0; c < c1; c++) {
      const port = portAt(c, r)
      if (port && descOf(port)) return true
    }
    return false
  }

  // Which rows' descriptions go in the band above the ports, and which below.
  let above: number[] = []
  let below: number[] = []
  const both = geo.rows === 2 ? [0, 1] : [0]
  if (L.descPos === 'outside') {
    above = [0]
    if (geo.rows === 2) below = [1]
  } else if (L.descPos === 'above') above = both
  else if (L.descPos === 'below') below = both
  above = above.filter(rowHasDesc)
  below = below.filter(rowHasDesc)
  const subH = L.descRotate ? L.descLen : L.descLines * lineH + 0.8

  const out: string[] = []
  let y = LPAD
  if (L.showTitle) {
    out.push(`<text x="${LPAD}" y="${f2(y + 3.4)}" font-size="3.6" font-weight="700">${esc(gearLabel(g))}</text>`)
    const model = [g.manufacturer, g.model].filter(Boolean).join(' ')
    const meta = [model, rackById(show, g.rackId)?.name ?? '', opts.part ? `part ${opts.part[0]} of ${opts.part[1]}` : '']
      .filter(Boolean)
      .join('  ·  ')
    out.push(`<text x="${f2(W - LPAD)}" y="${f2(y + 3.4)}" font-size="2.4" text-anchor="end" fill="#555">${esc(meta)}</text>`)
    y += 6
  }
  const aboveTop = y
  y += above.length * subH
  const portsTop = y
  y += geo.rows * L.pitchY
  const belowTop = y
  y += below.length * subH

  const cxOf = (c: number) => LPAD + geo.colX[c] - geo.colX[c0] + L.pitchX / 2

  const drawDesc = (r: number, bandTop: number, towardPortsIsBottom: boolean) => {
    for (let c = c0; c < c1; c++) {
      const port = portAt(c, r)
      const text = port ? descOf(port) : ''
      if (!text) continue
      const cx = cxOf(c)
      const bandBot = bandTop + subH
      if (L.descRotate) {
        const maxLines = Math.max(1, Math.min(L.descLines, Math.floor((L.pitchX - 0.6) / lineH)))
        const lines = wrapText(text, subH - 0.8, fs, maxLines)
        lines.forEach((line, k) => {
          const xb = cx + (k - (lines.length - 1) / 2) * lineH + fs * 0.35
          const [yb, anchor] = towardPortsIsBottom ? [bandBot - 0.4, 'start'] : [bandTop + 0.4, 'end']
          out.push(`<text transform="translate(${f2(xb)},${f2(yb)}) rotate(-90)" font-size="${f2(fs)}" text-anchor="${anchor}">${esc(line)}</text>`)
        })
      } else {
        const lines = wrapText(text, L.pitchX - 0.8, fs, L.descLines)
        const blockH = lines.length * lineH
        const start = towardPortsIsBottom ? bandBot - 0.4 - blockH : bandTop + 0.4
        lines.forEach((line, k) => {
          const yb = start + k * lineH + (lineH - fs) / 2 + fs * 0.8
          out.push(`<text x="${f2(cx)}" y="${f2(yb)}" font-size="${f2(fs)}" text-anchor="middle">${esc(line)}</text>`)
        })
      }
    }
  }
  above.forEach((r, i) => drawDesc(r, aboveTop + i * subH, true))
  below.forEach((r, i) => drawDesc(r, belowTop + i * subH, false))

  // The ports.
  const used = new Set<number>()
  let anyTagged = false
  for (const port of ports) {
    const p = portSetup(g, port)
    used.add(p.vlan)
    for (const t of p.tagged) used.add(t)
    if (p.mode === 'trunk' && p.tagged.length) anyTagged = true
  }
  for (let c = c0; c < c1; c++) {
    for (let r = 0; r < geo.rows; r++) {
      const port = portAt(c, r)
      if (!port) continue
      const p = portSetup(g, port)
      const sfp = geo.isSfp(port)
      const w = sfp ? L.sfpW : L.jackW
      const h = sfp ? L.sfpH : L.jackH
      const cx = cxOf(c)
      const cy = portsTop + r * L.pitchY + L.pitchY / 2
      const fill = portFill(show, p)
      const ink = textOn(fill)
      const notch: 'up' | 'down' | null =
        !sfp && L.shape === 'rj45' ? (L.latch === 'up' ? 'up' : L.latch === 'down' ? 'down' : geo.rows === 2 && r === 0 ? 'up' : 'down') : null
      const nh = notch ? L.notchH : 0
      const bodyTop = cy - h / 2 + (notch === 'up' ? nh : 0)
      const bodyBot = cy + h / 2 - (notch === 'down' ? nh : 0)
      const picked = opts.selected?.has(port)
      out.push(opts.interactive ? `<g data-port="${esc(port)}" style="cursor:pointer">` : '<g>')
      if (opts.interactive) {
        // A hit area the size of the port's whole cell, so gaps between ports still pick.
        out.push(`<rect x="${f2(cx - L.pitchX / 2)}" y="${f2(portsTop + r * L.pitchY)}" width="${f2(L.pitchX)}" height="${f2(L.pitchY)}" fill="transparent"/>`)
      }
      if (picked) {
        out.push(`<rect x="${f2(cx - w / 2 - 1.1)}" y="${f2(cy - h / 2 - 1.1)}" width="${f2(w + 2.2)}" height="${f2(h + 2.2)}" rx="1.2" fill="none" stroke="#2f7ed8" stroke-width="0.9"/>`)
      }
      if (notch) out.push(`<path d="${jackPath(cx, cy, w, h, notch, L.notchW, nh)}" fill="${fill}" stroke="#222" stroke-width="0.25"/>`)
      else out.push(`<rect x="${f2(cx - w / 2)}" y="${f2(cy - h / 2)}" width="${f2(w)}" height="${f2(h)}" rx="0.4" fill="${fill}" stroke="#222" stroke-width="0.25"/>`)

      // Tagged VLANs: a band of colour on the edge away from the latch notch.
      let txtTop = bodyTop
      let txtBot = bodyBot
      const tagged = p.mode === 'trunk' ? p.tagged : []
      if (tagged.length) {
        const bh = 1.6
        const bw = w - 1.0
        const atBottom = notch !== 'down'
        const by = atBottom ? bodyBot - 0.5 - bh : bodyTop + 0.5
        tagged.forEach((t, k) => {
          out.push(
            `<rect x="${f2(cx - bw / 2 + (k * bw) / tagged.length)}" y="${f2(by)}" width="${f2(bw / tagged.length)}" height="${bh}" fill="${vlanColor(show, t)}" stroke="#fff" stroke-width="0.15"/>`,
          )
        })
        if (atBottom) txtBot = by
        else txtTop = by + bh
      }
      const mid = (txtTop + txtBot) / 2
      const num = portText(port)
      const numSize = num.length > 3 ? 2.0 : 2.8
      const vlanText = p.mode === 'trunk' ? 'Trunk' : `V${p.vlan}`
      if (L.showNumber && L.showVlan) {
        out.push(`<text x="${f2(cx)}" y="${f2(mid - 0.15)}" font-size="${numSize}" font-weight="700" text-anchor="middle" fill="${ink}">${esc(num)}</text>`)
        out.push(`<text x="${f2(cx)}" y="${f2(mid + 1.75)}" font-size="1.7" text-anchor="middle" fill="${ink}">${esc(vlanText)}</text>`)
      } else if (L.showNumber || L.showVlan) {
        const text = L.showNumber ? num : vlanText
        out.push(`<text x="${f2(cx)}" y="${f2(mid + 1.0)}" font-size="${L.showNumber ? numSize : 2.4}" font-weight="700" text-anchor="middle" fill="${ink}">${esc(text)}</text>`)
      }
      out.push('</g>')
    }
  }

  if (L.showLegend) {
    y += 2
    const items: { color?: string; tagged?: boolean; text: string }[] = [...used]
      .sort((a, b) => a - b)
      .map((id) => ({ color: vlanColor(show, id), text: `${id}  ${vlanById(show, id)?.name ?? ''}`.trim() }))
    if (anyTagged) items.push({ tagged: true, text: 'band = tagged (trunk) VLANs' })
    let x = LPAD
    const itemH = 4
    for (const it of items) {
      const iw = 4 + it.text.length * 2.4 * 0.55 + 4
      if (x + iw > W - LPAD && x > LPAD) {
        x = LPAD
        y += itemH
      }
      if (it.tagged) {
        out.push(`<rect x="${f2(x)}" y="${f2(y + 0.5)}" width="3" height="3" fill="#fff" stroke="#222" stroke-width="0.2"/>`)
        out.push(`<rect x="${f2(x + 0.3)}" y="${f2(y + 2.3)}" width="2.4" height="0.9" fill="#888"/>`)
      } else {
        out.push(`<rect x="${f2(x)}" y="${f2(y + 0.5)}" width="3" height="3" fill="${it.color}" stroke="#222" stroke-width="0.2"/>`)
      }
      out.push(`<text x="${f2(x + 4)}" y="${f2(y + 3.0)}" font-size="2.4">${esc(it.text)}</text>`)
      x += iw
    }
    y += itemH
  }

  if (ruler) {
    y += 2
    const ry = y + 1.5
    out.push(`<line x1="${LPAD}" y1="${f2(ry)}" x2="${LPAD + 50}" y2="${f2(ry)}" stroke="#222" stroke-width="0.25"/>`)
    for (let i = 0; i <= 50; i += 5) {
      const th = i % 10 === 0 ? 1.6 : 0.8
      out.push(`<line x1="${LPAD + i}" y1="${f2(ry - th)}" x2="${LPAD + i}" y2="${f2(ry)}" stroke="#222" stroke-width="0.2"/>`)
    }
    out.push(`<text x="${LPAD + 52}" y="${f2(ry + 0.2)}" font-size="2.2" fill="#555">50 mm: measure this after printing to check the scale</text>`)
    y += 4
  }

  return { inner: out.join(''), w: W, h: y + LPAD }
}

const cutLine = (w: number, h: number) =>
  `<rect x="0.2" y="0.2" width="${f2(w - 0.4)}" height="${f2(h - 0.4)}" fill="none" stroke="#999" stroke-width="0.2" stroke-dasharray="1.5 1"/>`

// An SVG sized in mm, showing `w` mm across from `x0` of a drawing `h` high.
const wrapSvg = (inner: string, x0: number, w: number, h: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${f2(w)}mm" height="${f2(h)}mm" viewBox="${f2(x0)} 0 ${f2(w)} ${f2(h)}" font-family="${FONT}">${inner}</svg>`

// The label filling the style's area: the drawing scaled to fit inside it (a little in
// from the edge) and centred, with the cut line at the area's size.
function fitted(show: Show, g: Gear, style: SwitchLabelStyle, opts: LabelOptions): { inner: string; w: number; h: number; scale: number } {
  const { inner, w, h } = drawLabel(show, g, style, opts)
  const W = Math.max(10, style.areaW)
  const H = Math.max(5, style.areaH)
  const pad = 1.5
  const scale = Math.min((W - 2 * pad) / w, (H - 2 * pad) / h)
  const tx = (W - w * scale) / 2
  const ty = (H - h * scale) / 2
  const body = `<rect width="${f2(W)}" height="${f2(H)}" fill="#fff"/>${style.showCut ? cutLine(W, H) : ''}<g transform="translate(${f2(tx)},${f2(ty)}) scale(${Math.round(scale * 10000) / 10000})">${inner}</g>`
  return { inner: body, w: W, h: H, scale }
}

// How much a fitted label is scaled from actual size (1: not at all).
export function fitScale(show: Show, g: Gear, style: SwitchLabelStyle): number {
  return fitted(show, g, style, {}).scale
}

// One switch's label (or part of it) as SVG, and its size in mm.
export function buildLabelSvg(show: Show, g: Gear, style: SwitchLabelStyle, opts: LabelOptions = {}): { svg: string; w: number; h: number } {
  if (style.size === 'fit' && !opts.natural) {
    const f = fitted(show, g, style, opts)
    return { svg: wrapSvg(f.inner, 0, f.w, f.h), w: f.w, h: f.h }
  }
  const { inner, w, h } = drawLabel(show, g, style, opts)
  const body = `<rect width="${f2(w)}" height="${f2(h)}" fill="#fff"/>${style.showCut ? cutLine(w, h) : ''}${inner}`
  return { svg: wrapSvg(body, 0, w, h), w, h }
}

export interface LabelPiece {
  key: string
  svg: string
  w: number
  h: number
  // Which piece of how many, when it takes more than one.
  part: [number, number] | null
}

// A switch's label as it prints. At actual size, a switch wider than the page splits
// between columns of ports, each part a label of its own. Fitted into an area wider than
// the page, the area is cut into equal pieces that butt together, the joins marked.
export function labelPieces(show: Show, g: Gear, style: SwitchLabelStyle, points?: PatchPoint[]): LabelPiece[] {
  if (style.size !== 'fit') {
    const parts = labelParts(show, g, style)
    return parts.map((range, i) => {
      const part: [number, number] | null = parts.length > 1 ? [i + 1, parts.length] : null
      return { key: `${g.id}:${i}`, part, ...buildLabelSvg(show, g, style, { range, part: part ?? undefined, points }) }
    })
  }
  const f = fitted(show, g, style, { points })
  const across = printableWidth(style)
  const n = Math.max(1, Math.ceil(f.w / across - 1e-6))
  if (n === 1) return [{ key: `${g.id}:0`, part: null, svg: wrapSvg(f.inner, 0, f.w, f.h), w: f.w, h: f.h }]
  const tw = f.w / n
  const joins = Array.from({ length: n - 1 }, (_, i) => {
    const x = f2((i + 1) * tw)
    return `<line x1="${x}" y1="0" x2="${x}" y2="${f2(f.h)}" stroke="#999" stroke-width="0.2" stroke-dasharray="0.6 0.8"/>`
  }).join('')
  return Array.from({ length: n }, (_, i) => {
    const mark = `<text x="${f2((i + 1) * tw - 1)}" y="${f2(f.h - 1)}" font-size="1.8" text-anchor="end" fill="#888">${i + 1}/${n}</text>`
    return { key: `${g.id}:${i}`, part: [i + 1, n] as [number, number], svg: wrapSvg(f.inner + joins + mark, i * tw, tw, f.h), w: tw, h: f.h }
  })
}
