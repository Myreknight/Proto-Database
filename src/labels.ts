import { gearMatcher } from './match'
import { bundleById, cableRack, hasTails, steckMount, typeById, visibleTails } from './show'
import type { Cable, CableType, Show, Tail } from './types'

export type SheetId = 'avery5167' | 'avery5160'

// All measurements in inches, from the manufacturers' templates for US Letter.
export interface SheetSpec {
  id: SheetId
  name: string
  detail: string
  cols: number
  rows: number
  labelW: number
  labelH: number
  left: number
  top: number
  pitchX: number
  pitchY: number
  padX: number
  padY: number
  // Tail labels: top line (cable name, number), the big tail name, the patch line and
  // the gender tag in the corner. Cable labels: the cable name and smaller detail lines.
  pt: { tailTop: number; tailName: number; patch: number; gender: number; cableTitle: number; line: number }
}

export const SHEETS: Record<SheetId, SheetSpec> = {
  avery5167: {
    id: 'avery5167',
    name: 'Avery 5167 / OL25',
    detail: '80 per sheet · 1¾ × ½ in',
    cols: 4,
    rows: 20,
    labelW: 1.75,
    labelH: 0.5,
    left: 0.28125,
    top: 0.5,
    pitchX: 2.0625,
    pitchY: 0.5,
    padX: 0.06,
    padY: 0.03,
    pt: { tailTop: 8, tailName: 15, patch: 6.5, gender: 5.5, cableTitle: 9, line: 6.5 },
  },
  avery5160: {
    id: 'avery5160',
    name: 'Avery 5160',
    detail: '30 per sheet · 2⅝ × 1 in',
    cols: 3,
    rows: 10,
    labelW: 2.625,
    labelH: 1,
    left: 0.1875,
    top: 0.5,
    pitchX: 2.75,
    pitchY: 1,
    padX: 0.1,
    padY: 0.07,
    pt: { tailTop: 13, tailName: 26, patch: 11, gender: 9, cableTitle: 16, line: 10 },
  },
}

export type LabelSet = 'tail' | 'cable' | 'steck'

export interface TailLabel {
  kind: 'tail'
  key: string
  cableName: string
  color: string | null
  // The tail's number, or a range like "1–2" when one connector carries several circuits.
  number: string | null
  tailName: string
  gender: Gender | null
  patch: string
  // A one-channel cable (an XLR, say): printed with just the cable name, then its
  // bundle or rack and where this end is.
  single: boolean
  group: string
  location: string
  // Which extension piece this label is on (1 = Ext 1), or null for the main piece.
  ext: number | null
}

// Goes on the multipin end of a fan or box: the cable name over the tail type and location.
export interface BlockLabel {
  kind: 'block'
  key: string
  cableName: string
  color: string | null
  lines: string[]
}

// Goes on a steck: the cable name over where the steck is and what mounts in it.
export interface SteckLabel {
  kind: 'steck'
  key: string
  cableName: string
  color: string | null
  lines: string[]
}

// Gray-shaded separator printed ahead of each cable or tail set.
export interface HeaderLabel {
  kind: 'header'
  key: string
  cableName: string
  color: string | null
  lines: string[]
}

export type Label = TailLabel | BlockLabel | SteckLabel | HeaderLabel

export type Gender = 'Male' | 'Female'

// Reads gender from a connector as written in the cable types: XLR3-F, TRUE1 (M),
// NEMA 5-20R (receptacle = female), L5-20P (plug = male). Combo ends use the first part.
export function genderOf(connector: string): Gender | null {
  const first = connector.split('+')[0]
  if (/-F\b|\(F\)|\bfemale\b/i.test(first)) return 'Female'
  if (/-M\b|\(M\)|\bmale\b/i.test(first)) return 'Male'
  if (/\d-\d+R\b/.test(first)) return 'Female'
  if (/\d-\d+P\b/.test(first)) return 'Male'
  return null
}

export type TailLayout = 'stacked' | 'centered'

// 'down' fills each column top to bottom before moving right; 'across' fills rows.
export type FillOrder = 'down' | 'across'

export interface LabelSettings {
  sheets: Record<LabelSet, SheetId>
  fill: Record<LabelSet, FillOrder>
  tailLayout: TailLayout
  headers: Record<LabelSet, boolean>
  offsetX: number
  offsetY: number
  perPiece: 1 | 2
  outlines: boolean
}

export const DEFAULT_LABEL_SETTINGS: LabelSettings = {
  sheets: { tail: 'avery5167', cable: 'avery5160', steck: 'avery5160' },
  fill: { tail: 'down', cable: 'across', steck: 'across' },
  tailLayout: 'stacked',
  // Most cables have one or two steck labels, so steck sets skip the header by default.
  headers: { tail: true, cable: true, steck: false },
  offsetX: 0,
  offsetY: 0,
  perPiece: 2,
  outlines: false,
}

// Printer calibration belongs to this computer, not the show, so it lives in browser storage.
const SETTINGS_KEY = 'proto-database:label-settings'

export function loadLabelSettings(): LabelSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null')
    if (raw && typeof raw === 'object') {
      return {
        ...DEFAULT_LABEL_SETTINGS,
        ...raw,
        sheets: { ...DEFAULT_LABEL_SETTINGS.sheets, ...raw.sheets },
        fill: { ...DEFAULT_LABEL_SETTINGS.fill, ...raw.fill },
        // Older settings had one header switch for every set.
        headers:
          typeof raw.headers === 'boolean'
            ? { tail: raw.headers, cable: raw.headers, steck: false }
            : { ...DEFAULT_LABEL_SETTINGS.headers, ...raw.headers },
      }
    }
  } catch {
    // Storage blocked or unreadable: use defaults.
  }
  return DEFAULT_LABEL_SETTINGS
}

export function storeLabelSettings(settings: LabelSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Storage blocked: settings just won't persist.
  }
}

// A run of labels that belongs together, printed behind its own header label.
export interface LabelGroup {
  key: string
  header: HeaderLabel
  labels: Label[]
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// How many connectors a tail's fan side has ("NL4 x2" is 2), when that's fewer than
// the trunk's circuits and splits them evenly. Otherwise it's one per circuit.
export function connectorsOn(tail: CableType, circuits: number): number {
  const match = /x\s*(\d+)/i.exec(tail.endB)
  const count = match ? Number(match[1]) : circuits
  return count > 0 && count < circuits && circuits % count === 0 ? count : circuits
}

// How many connectors are on a cable's end, as both the editor and the labels see it:
// a trunk end with a tail has that tail's connectors, a trunk end without one has just
// its own connector, and a plain cable end has whatever its connector says.
export function endConnectors(show: Show, cable: Cable, end: 'A' | 'B'): number {
  const type = typeById(show, cable.typeId)
  const circuits = visibleTails(show, cable).length
  if (!type) return circuits
  if (type.part === 'Trunk') {
    const tail = typeById(show, end === 'A' ? cable.tailATypeId : cable.tailBTypeId)
    return tail ? connectorsOn(tail, circuits) : 1
  }
  return connectorCount(end === 'A' ? type.endA : type.endB, circuits)
}

// How many connectors are on a plain cable's end: "XLR3-M x8" is 8, a lone "NL4" is 1.
// A count that doesn't divide the circuits evenly falls back to one per circuit.
function connectorCount(connector: string, circuits: number): number {
  const match = /x\s*(\d+)/i.exec(connector)
  const count = match ? Number(match[1]) : 1
  return count > 0 && count < circuits && circuits % count === 0 ? count : circuits
}

// One label per connector. A single connector carrying several circuits prints as a
// single-cable label (the cable name, its bundle and location); several connectors
// each list their circuits.
function fold(labels: TailLabel[], connectors: number, key: string): TailLabel[] {
  if (connectors >= labels.length) return labels
  if (connectors === 1) {
    return [
      {
        ...labels[0],
        key: `${key}-connector`,
        number: null,
        tailName: '',
        single: true,
        patch: labels[0].patch,
      },
    ]
  }
  return byConnector(labels, connectors, key)
}

// Folds per-circuit labels into one per connector: an NL8's 2x NL4 end prints
// "1–2 · Sub HL / Sub HR" and "3–4 · …" rather than four labels.
function byConnector(labels: TailLabel[], connectors: number, key: string): TailLabel[] {
  if (connectors >= labels.length) return labels
  const per = labels.length / connectors
  return Array.from({ length: connectors }, (_, k) => {
    const part = labels.slice(k * per, (k + 1) * per)
    const first = part[0]
    const last = part[part.length - 1]
    return {
      ...first,
      key: `${key}-connector-${k + 1}`,
      number: first.number && last.number ? `${first.number}–${last.number}` : first.number,
      tailName: part
        .map((l) => l.tailName)
        .filter(Boolean)
        .join(' / '),
      // Patch cells fill from the top, one per connector: connector k's is on row k.
      patch: labels[k].patch,
    }
  })
}

// What every label for a cable shares, and builders for its end, tail and header labels.
function labelContext(show: Show, cable: Cable) {
  const type = typeById(show, cable.typeId)
  const tails = visibleTails(show, cable)
  const numbered = tails.length > 1
  const cableName = cable.name.trim() || 'Unnamed'
  const group = bundleById(show, cable.bundleId)?.name ?? cableRack(show, cable)?.name ?? ''
  // Ends between an extension and the piece before it are mid-run, so they get no
  // location or patch point; only the run's outer ends do.
  const make = (
    prefix: string,
    connector: string,
    outerEnd: 'A' | 'B' | null,
    list: Tail[],
    single: boolean,
    ext: number | null,
  ): TailLabel[] =>
    list.map((t) => ({
      kind: 'tail',
      key: `${prefix}-${t.number}`,
      cableName,
      color: cable.color,
      number: numbered ? String(t.number) : null,
      tailName: t.name.trim(),
      gender: genderOf(connector),
      patch: (outerEnd === 'A' ? t.patchA : outerEnd === 'B' ? t.patchB : '').trim(),
      single,
      group,
      location: (outerEnd === 'A' ? cable.from : outerEnd === 'B' ? cable.to : '').trim(),
      ext,
    }))
  const header = (key: string, lines: string[]): HeaderLabel => ({
    kind: 'header',
    key: `${key}-header`,
    cableName,
    color: cable.color,
    lines: lines.filter(Boolean),
  })
  return { type, tails, cableName, group, make, header }
}

// Tail sets: only tails picked from a trunk's tail menus. Each end with a tail (fan or
// box) gets its block label, then one label per connector on its fan side, with that
// side's gender. The cable's own ends, single cables and extensions print as cable labels.
export function tailGroups(show: Show, cable: Cable): LabelGroup[] {
  const { type, tails, cableName, group, make, header } = labelContext(show, cable)
  if (type?.part !== 'Trunk' || !hasTails(cable)) return []
  return (['A', 'B'] as const).flatMap((end) => {
    const tail = typeById(show, end === 'A' ? cable.tailATypeId : cable.tailBTypeId)
    if (!tail) return []
    const key = `${cable.id}-${end}`
    const where = end === 'A' ? cable.from : cable.to
    const block: BlockLabel = {
      kind: 'block',
      key: `${key}-block`,
      cableName,
      color: cable.color,
      lines: [tail.name, where].filter(Boolean),
    }
    const connectors = connectorsOn(tail, tails.length)
    return [
      {
        key,
        header: header(key, [
          [`End ${end}`, where].filter(Boolean).join(' · '),
          [connectors < tails.length ? `${plural(connectors, 'tail')} (${tails.length} circuits)` : plural(tails.length, 'tail'), group]
            .filter(Boolean)
            .join(' · '),
        ]),
        labels: [block, ...byConnector(make(key, tail.endB, end, tails, false, null), connectors, key)],
      },
    ]
  })
}

// Cable sets: every cable and trunk, with a label at each end of each piece (extensions
// included, tagged EXT). A plain cable's end prints one label per connector on it: a lone
// NL4 or XLR is one, a hard-wired fan like "XLR3-M x8" one per jack. A trunk's end is
// one label: on the trunk where its tail plugs in, or on its own connector if it has none.
export function cableGroups(show: Show, cable: Cable, settings: LabelSettings): LabelGroup[] {
  const { type, tails, group, make, header } = labelContext(show, cable)
  if (!type || (type.part !== 'Cable' && type.part !== 'Trunk')) return []
  const trunk = type.part === 'Trunk'
  const last = cable.segments.length - 1
  const route = [[cable.from, cable.to].filter(Boolean).join(' → '), group].filter(Boolean).join(' · ')
  const ends: ('A' | 'B')[] = settings.perPiece === 1 ? ['A'] : ['A', 'B']

  return cable.segments.flatMap((g, i) => {
    const ext = g.extension ? i : null
    const key = cable.segments.length > 1 ? `${cable.id}-${g.id}` : cable.id
    const endLabels = (end: 'A' | 'B'): TailLabel[] => {
      const outer = (end === 'A' && i === 0) || (end === 'B' && i === last)
      const connector = (end === 'A' ? type.endA : type.endB) ?? ''
      const endKey = `${cable.id}-${g.id}-${end}`
      if (trunk) {
        // The patch point belongs to the tails when this end has some.
        const hasTail = !!(end === 'A' ? cable.tailATypeId : cable.tailBTypeId)
        const [label] = make(endKey, connector, outer ? end : null, tails.slice(0, 1), true, ext)
        return [{ ...label, key: `${endKey}-end`, number: null, tailName: '', patch: hasTail ? '' : label.patch }]
      }
      const labels = make(endKey, connector, outer ? end : null, tails, tails.length === 1, ext)
      return fold(labels, connectorCount(connector, tails.length), endKey)
    }
    const labels = ends.flatMap(endLabels)
    if (!labels.length) return []
    const piece = [type.name, g.length != null ? `${g.length}'` : '', ext ? `Ext ${ext}` : '', plural(labels.length, 'label')]
    return [{ key, header: header(key, [piece.filter(Boolean).join(' · '), route]), labels }]
  })
}

// Steck sets: a label for each end that mounts in a steck, naming the rack (for an
// interconnect) or location, and what's in it: the tail's multipin side, or the
// cable's own connector.
export function steckGroups(show: Show, cable: Cable): LabelGroup[] {
  const ends = (['A', 'B'] as const).filter((end) => (end === 'A' ? cable.steckA : cable.steckB))
  if (!ends.length) return []
  const type = typeById(show, cable.typeId)
  const cableName = cable.name.trim() || 'Unnamed'
  const rack = cableRack(show, cable)?.name
  const group = bundleById(show, cable.bundleId)?.name ?? rack
  const match = gearMatcher(show.gear)
  const labels: SteckLabel[] = ends.map((end) => {
    const location = (end === 'A' ? cable.from : cable.to).trim()
    // Mounted on a steck rail in a rack: "@ Comm Video Rack", like a shop's steck labels.
    const rail = match(end === 'A' ? cable.steckAAt : cable.steckBAt)?.gear
    const railRack = rail?.rackId ? show.racks.find((r) => r.id === rail.rackId) : undefined
    const mount = steckMount(show, cable, end)
    const connector = mount.tail ? `${mount.tail.name} · ${mount.connector}` : mount.connector
    return {
      kind: 'steck',
      key: `${cable.id}-steck-${end}`,
      cableName,
      color: cable.color,
      lines: [
        railRack ? `@ ${railRack.name.trim() || 'Unnamed rack'}` : ['Steck', rack, location].filter(Boolean).join(' · '),
        [`End ${end}`, connector].filter(Boolean).join(' · '),
      ],
    }
  })
  return [
    {
      key: `${cable.id}-stecks`,
      header: {
        kind: 'header',
        key: `${cable.id}-stecks-header`,
        cableName,
        color: cable.color,
        lines: [[type?.name, plural(labels.length, 'steck')].filter(Boolean).join(' · '), group ?? ''].filter(Boolean),
      },
      labels,
    },
  ]
}

export function groupsFor(show: Show, cable: Cable, set: LabelSet, settings: LabelSettings): LabelGroup[] {
  if (set === 'steck') return steckGroups(show, cable)
  return set === 'tail' ? tailGroups(show, cable) : cableGroups(show, cable, settings)
}

export function groupLabels(groups: LabelGroup[], headers: boolean): Label[] {
  return groups.flatMap((g) => (headers ? [g.header, ...g.labels] : g.labels))
}

// Leading nulls are skipped positions on a partly used first sheet.
export function paginate(labels: Label[], sheet: SheetSpec, skip: number): (Label | null)[][] {
  const perSheet = sheet.cols * sheet.rows
  const slots: (Label | null)[] = [...Array(Math.min(Math.max(0, skip), perSheet - 1)).fill(null), ...labels]
  const pages: (Label | null)[][] = []
  for (let i = 0; i < slots.length; i += perSheet) pages.push(slots.slice(i, i + perSheet))
  return pages
}

// Where the i-th label on a sheet goes, in inches from the top-left of the page.
export function slotPosition(i: number, sheet: SheetSpec, fill: FillOrder): { x: number; y: number } {
  const col = fill === 'down' ? Math.floor(i / sheet.rows) : i % sheet.cols
  const row = fill === 'down' ? i % sheet.rows : Math.floor(i / sheet.cols)
  return { x: sheet.left + col * sheet.pitchX, y: sheet.top + row * sheet.pitchY }
}

// Layout 1 is a geometric sans like the first example; layout 2 a condensed one.
export const FONTS = {
  plain: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  geometric: "'Century Gothic', 'Avenir Next', Futura, 'Helvetica Neue', sans-serif",
  condensed: "'Avenir Next Condensed', 'Bahnschrift Condensed', 'Arial Narrow', 'Helvetica Neue', sans-serif",
}

let measureCtx: CanvasRenderingContext2D | null | undefined
const fitCache = new Map<string, number>()

function context(): CanvasRenderingContext2D | null {
  if (measureCtx === undefined) measureCtx = document.createElement('canvas').getContext('2d')
  return measureCtx
}

// Width of a single line of text, in inches.
export function measureIn(text: string, weight: number, pt: number, font: string = FONTS.plain): number {
  const ctx = context()
  if (!ctx) return 0
  ctx.font = `${weight} ${pt}pt ${font}`
  return ctx.measureText(text).width / 96
}

// Largest point size (down to minPt) at which the text fits on one line.
export function fitPt(
  text: string,
  weight: number,
  maxPt: number,
  minPt: number,
  widthIn: number,
  font: string = FONTS.plain,
): number {
  const key = `${weight}|${maxPt}|${minPt}|${widthIn}|${font}|${text}`
  const cached = fitCache.get(key)
  if (cached != null) return cached
  let size = maxPt
  const width = measureIn(text, weight, maxPt, font)
  const avail = widthIn * 0.97
  if (width > avail) size = Math.max(minPt, Math.floor(((maxPt * avail) / width) * 10) / 10)
  fitCache.set(key, size)
  return size
}
