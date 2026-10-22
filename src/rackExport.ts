import { drawingToDxf, drawingToSvg, rackDrawing, wireColor, type Drawing } from './drawing'
import { rackFlow } from './flow'
import { downloadBytes, downloadText, safeFilename } from './files'
import { gearLabel, gearRu, rackGear } from './gear'
import { fitText, pdfBytes, PdfPage, type Rgb } from './pdf'
import { frontRowsUsed, placedIn, rackProblems, topOf } from './racking'
import type { Rack, Show } from './types'

const today = () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

// "Amp Room · 12U rack, 11U used"
export function rackSummary(show: Show, rack: Rack): string {
  const used = frontRowsUsed(show, rack.id)
  return [rack.location, rack.size ? `${rack.size}U rack, ${used}U used` : `${used}U used`].filter(Boolean).join(' · ')
}

export interface PartRow {
  gearId: string
  u: string
  side: string
  gear: string
  model: string
  ru: string
  problem: string | null
  placed: boolean
}

// The parts list for a rack, top to bottom, then anything not placed yet.
export function rackParts(show: Show, rack: Rack): PartRow[] {
  const placed = placedIn(show, rack.id).sort((a, b) => topOf(b) - topOf(a) || (a.side === 'front' ? -1 : 1))
  const problems = rackProblems(show, rack)
  const model = (g: { manufacturer: string; model: string }) =>
    [g.manufacturer, g.model].map((v) => v.trim()).filter(Boolean).join(' ')
  const rows: PartRow[] = placed.map((p) => {
    const g = p.gear
    const name = g.name.trim()
    return {
      gearId: g.id,
      u: p.height > 1 ? `${topOf(p)}–${p.bottom}` : String(p.bottom),
      side: `${p.side === 'front' ? 'Front' : 'Rear'}${p.slot ? ` ${p.slot === 'left' ? 'L' : 'R'}` : ''}`,
      gear: name ? `${name}${g.qty > 1 ? ` ×${g.qty}` : ''}` : g.qty > 1 ? `${g.qty} pcs` : '—',
      model: model(g),
      ru: String(p.height),
      problem: problems.get(g.id) ?? null,
      placed: true,
    }
  })
  for (const g of rackGear(show, rack.id)) {
    if (placed.some((p) => p.gear.id === g.id)) continue
    rows.push({
      gearId: g.id,
      u: '—',
      side: gearRu(show, g) ? 'Unplaced' : 'No size',
      gear: gearLabel(g),
      model: model(g),
      ru: String(gearRu(show, g) ?? ''),
      problem: null,
      placed: false,
    })
  }
  return rows
}

export type RackView = 'elevation' | 'flow'

// A rack's elevation (front and rear) or its flow, with the show and rack named on top,
// for export.
function titled(show: Show, rack: Rack, view: RackView, date?: string): Drawing | null {
  const name = rack.name || 'Unnamed rack'
  const title = [`${show.name} · ${name}${view === 'flow' ? ' · Flow' : ''}`, [rackSummary(show, rack), date || today()].filter(Boolean).join(' · ')]
  return view === 'flow' ? rackFlow(show, rack, { title }) : rackDrawing(show, rack, { title })
}

const fileName = (show: Show, rack: Rack, view: RackView = 'elevation') =>
  `${safeFilename(show.name)} ${safeFilename(rack.name || 'Unnamed rack')} ${view === 'flow' ? 'Rack Flow' : 'Rack'}`

export function downloadRackSvg(show: Show, rack: Rack, date?: string, view: RackView = 'elevation'): void {
  const d = titled(show, rack, view, date)
  if (d) downloadText(`${fileName(show, rack, view)}.svg`, drawingToSvg(d), 'image/svg+xml')
}

export function downloadRackDxf(show: Show, rack: Rack, date?: string, view: RackView = 'elevation'): void {
  const d = titled(show, rack, view, date)
  if (d) downloadText(`${fileName(show, rack, view)}.dxf`, drawingToDxf(d), 'application/dxf')
}

// PDF: landscape letter, one rack per page (more if its parts list runs long).

const PAGE_W = 792
const PAGE_H = 612
const MARGIN = 30
const BLACK: Rgb = [0, 0, 0]
const GRAY: Rgb = [0.4, 0.4, 0.4]
const LIGHT: Rgb = [0.75, 0.75, 0.75]
const RED: Rgb = [0.8, 0, 0]

const hexRgb = (hex: string): Rgb => {
  const v = parseInt(hex.slice(1), 16)
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]
}

// Draws a rack drawing (laid out in inches) into a box on the page, as large as fits.
function drawInto(page: PdfPage, d: Drawing, x: number, y: number, w: number, h: number) {
  const s = Math.min(w / d.width, h / d.height)
  const px = (v: number) => x + v * s
  const py = (v: number) => y + v * s
  const pt = (v: number) => Math.max(0.3, v * s)
  for (const l of d.lines) {
    const color = l.kind === 'limit' ? RED : l.kind === 'rule' ? LIGHT : l.kind === 'wire' ? hexRgb(wireColor(l.color)) : BLACK
    const width = { frame: 0.08, limit: 0.1, rule: 0.03, wire: 0.07, bus: 0.2 }[l.kind]
    page.line(px(l.x1), py(l.y1), px(l.x2), py(l.y2), { width: pt(width), color })
  }
  for (const b of d.boxes) {
    const stroke = b.problem ? RED : b.kind === 'back' ? [0.53, 0.53, 0.53] : b.kind === 'slot' ? [0.33, 0.33, 0.33] : BLACK
    const fill: Rgb = b.kind === 'back' ? [0.95, 0.95, 0.95] : b.kind === 'slot' ? [0.98, 0.98, 0.98] : [1, 1, 1]
    page.rect(px(b.x), py(b.y), b.w * s, b.h * s, {
      width: pt(b.kind === 'slot' ? 0.04 : 0.06),
      color: stroke as Rgb,
      fill,
      dash: b.kind === 'back' ? [pt(0.3), pt(0.2)] : undefined,
    })
  }
  for (const t of d.texts) {
    page.text(px(t.x), py(t.y), t.text, {
      size: t.size * s,
      bold: t.bold,
      anchor: t.anchor,
      color: t.problem ? RED : t.muted ? GRAY : BLACK,
    })
  }
}

const COLUMNS: { key: keyof PartRow; label: string; share: number; right?: boolean }[] = [
  { key: 'u', label: 'U', share: 0.1 },
  { key: 'side', label: 'Side', share: 0.15 },
  { key: 'gear', label: 'Gear', share: 0.3 },
  { key: 'model', label: 'Make / model', share: 0.35 },
  { key: 'ru', label: 'RU', share: 0.1, right: true },
]
const ROW_H = 13
const TEXT = 7.5

// The parts list as a table; returns the rows that didn't fit.
function partsTable(page: PdfPage, rows: PartRow[], x: number, y: number, w: number, h: number): PartRow[] {
  let cx = x
  const xs = COLUMNS.map((c) => {
    const at = cx
    cx += c.share * w
    return at
  })
  page.rect(x, y, w, ROW_H, { width: 0.4, color: LIGHT, fill: [0.93, 0.93, 0.93] })
  COLUMNS.forEach((c, i) => {
    const cw = c.share * w
    page.text(c.right ? xs[i] + cw - 3 : xs[i] + 3, y + 9, c.label, { size: TEXT, bold: true, anchor: c.right ? 'end' : 'start' })
  })
  let ry = y + ROW_H
  let shown = 0
  for (const row of rows) {
    if (ry + ROW_H > y + h) break
    page.line(x, ry + ROW_H, x + w, ry + ROW_H, { width: 0.3, color: LIGHT })
    const color = row.problem ? RED : row.placed ? BLACK : GRAY
    COLUMNS.forEach((c, i) => {
      const cw = c.share * w
      const bold = c.key === 'gear'
      const text = fitText(String(row[c.key] ?? ''), cw - 6, TEXT, bold)
      page.text(c.right ? xs[i] + cw - 3 : xs[i] + 3, ry + 9, text, { size: TEXT, bold, color, anchor: c.right ? 'end' : 'start' })
    })
    ry += ROW_H
    shown++
  }
  return rows.slice(shown)
}

function header(page: PdfPage, show: Show, rack: Rack, date: string, what = 'Rack Drawing') {
  const name = rack.name || 'Unnamed rack'
  page.text(MARGIN, MARGIN + 14, `${show.name} · ${what} · ${name}`, { size: 14, bold: true })
  page.text(MARGIN, MARGIN + 28, [rackSummary(show, rack), show.info.venue, date, `Proto Database v${__APP_VERSION__}`].filter(Boolean).join(' · '), {
    size: 8.5,
    color: GRAY,
  })
}

function rackPages(show: Show, rack: Rack, date: string): PdfPage[] {
  const top = MARGIN + 44
  const bodyH = PAGE_H - top - MARGIN
  const contentW = PAGE_W - MARGIN * 2
  const drawingW = contentW * 0.6
  const page = new PdfPage(PAGE_W, PAGE_H)
  header(page, show, rack, date)
  drawInto(page, rackDrawing(show, rack), MARGIN, top, drawingW, bodyH)
  const pages = [page]
  let rest = partsTable(page, rackParts(show, rack), MARGIN + drawingW + 18, top, contentW - drawingW - 18, bodyH)
  // A long parts list carries on, full width, on pages of its own.
  while (rest.length) {
    const more = new PdfPage(PAGE_W, PAGE_H)
    header(more, show, rack, date, 'Rack Drawing (continued)')
    rest = partsTable(more, rest, MARGIN, top, contentW, bodyH)
    pages.push(more)
  }
  // Then how cables run in and out of the rack, if any are linked to its gear.
  const flow = rackFlow(show, rack)
  if (flow) {
    const flowPage = new PdfPage(PAGE_W, PAGE_H)
    header(flowPage, show, rack, date, 'Rack Flow')
    drawInto(flowPage, flow, MARGIN, top, contentW, bodyH)
    pages.push(flowPage)
  }
  return pages
}

// The PDF for some racks, one after another.
export function racksPdf(show: Show, racks: Rack[], date?: string): Uint8Array {
  const when = date || today()
  const title = racks.length === 1 ? `${show.name} · ${racks[0].name}` : `${show.name} · Rack Drawings`
  return pdfBytes(racks.flatMap((rack) => rackPages(show, rack, when)), title)
}

export function downloadRackPdf(show: Show, rack: Rack, date?: string): void {
  downloadBytes(`${fileName(show, rack)}.pdf`, racksPdf(show, [rack], date), 'application/pdf')
}

export function downloadRacksPdf(show: Show, date?: string): void {
  downloadBytes(`${safeFilename(show.name)} Racks.pdf`, racksPdf(show, show.racks, date), 'application/pdf')
}
