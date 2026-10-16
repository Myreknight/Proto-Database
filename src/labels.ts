import { bundleById, cableRack, hasTails, typeById, visibleTails } from './show'
import type { Cable, Show } from './types'

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

export type LabelSet = 'tail' | 'cable'

export interface TailLabel {
  kind: 'tail'
  key: string
  cableName: string
  color: string | null
  number: number | null
  tailName: string
  gender: Gender | null
  patch: string
  // A one-channel cable (an XLR, say): printed with just the cable name, then its
  // bundle or rack and where this end is.
  single: boolean
  group: string
  location: string
}

// Mult pieces and tail blocks: the cable name over a couple of detail lines.
export interface CableLabel {
  kind: 'cable'
  key: string
  cableName: string
  color: string | null
  lines: string[]
}

// Goes on the multipin end of a fan or box: the cable name over the tail type and location.
export interface BlockLabel {
  kind: 'block'
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

export type Label = TailLabel | CableLabel | BlockLabel | HeaderLabel

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
  headers: boolean
  offsetX: number
  offsetY: number
  perPiece: 1 | 2
  includeSingles: boolean
  outlines: boolean
}

export const DEFAULT_LABEL_SETTINGS: LabelSettings = {
  sheets: { tail: 'avery5167', cable: 'avery5160' },
  fill: { tail: 'down', cable: 'across' },
  tailLayout: 'stacked',
  headers: true,
  offsetX: 0,
  offsetY: 0,
  perPiece: 2,
  includeSingles: false,
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

// Tail sets: on a trunk, one per end with a tail (fan or box): its block label, then one
// label per tail with the gender of the fan side. On a plain cable, one set covering
// both ends of every piece, with the gender of that end's connector. Patch points only
// print on the run's outer ends, not where an extension joins.
export function tailGroups(show: Show, cable: Cable): LabelGroup[] {
  const type = typeById(show, cable.typeId)
  const tails = visibleTails(show, cable)
  const numbered = tails.length > 1
  const cableName = cable.name.trim() || 'Unnamed'
  const group = bundleById(show, cable.bundleId)?.name ?? cableRack(show, cable)?.name
  const trunkWithTails = type?.part === 'Trunk' && hasTails(cable)
  const single = !trunkWithTails && tails.length === 1
  // Ends between an extension and the piece before it are mid-run, so they get no
  // location or patch point; only the run's outer ends do.
  const make = (
    prefix: string,
    connector: string,
    outerEnd: 'A' | 'B' | null,
    list = tails,
    asSingle = single,
  ): TailLabel[] =>
    list.map((t) => ({
      kind: 'tail',
      key: `${prefix}-${t.number}`,
      cableName,
      color: cable.color,
      number: numbered ? t.number : null,
      tailName: t.name.trim(),
      gender: genderOf(connector),
      patch: (outerEnd === 'A' ? t.patchA : outerEnd === 'B' ? t.patchB : '').trim(),
      single: asSingle,
      group: group ?? '',
      location: (outerEnd === 'A' ? cable.from : outerEnd === 'B' ? cable.to : '').trim(),
    }))
  const header = (key: string, lines: string[]): HeaderLabel => ({
    kind: 'header',
    key: `${key}-header`,
    cableName,
    color: cable.color,
    lines: lines.filter(Boolean),
  })

  if (trunkWithTails) {
    return (['A', 'B'] as const).flatMap((end) => {
      const tail = typeById(show, end === 'A' ? cable.tailATypeId : cable.tailBTypeId)
      const key = `${cable.id}-${end}`
      const where = end === 'A' ? cable.from : cable.to
      // The end without a breakout is the trunk's own connector (an NL8 into an amp):
      // one single-cable label for it.
      if (!tail) {
        const plain = make(key, end === 'A' ? type.endA : type.endB, end, tails.slice(0, 1), true)
        return [
          {
            key,
            header: header(key, [
              [`End ${end}`, where].filter(Boolean).join(' · '),
              [type.name, group].filter(Boolean).join(' · '),
            ]),
            labels: plain.map((l) => ({ ...l, number: null, key: `${key}-plain` })),
          },
        ]
      }
      const block: BlockLabel = {
        kind: 'block',
        key: `${key}-block`,
        cableName,
        color: cable.color,
        lines: [tail.name, where].filter(Boolean),
      }
      return [
        {
          key,
          header: header(key, [
            [`End ${end}`, where].filter(Boolean).join(' · '),
            [plural(tails.length, 'tail'), group].filter(Boolean).join(' · '),
          ]),
          labels: [block, ...make(key, tail.endB, end)],
        },
      ]
    })
  }

  const last = cable.segments.length - 1
  const labels = cable.segments.flatMap((g, i) => [
    ...make(`${cable.id}-${g.id}-A`, type?.endA ?? '', i === 0 ? 'A' : null),
    ...make(`${cable.id}-${g.id}-B`, type?.endB ?? '', i === last ? 'B' : null),
  ])
  if (!labels.length) return []
  return [
    {
      key: cable.id,
      header: header(cable.id, [
        [type?.name, plural(labels.length, 'label')].filter(Boolean).join(' · '),
        [[cable.from, cable.to].filter(Boolean).join(' → '), group].filter(Boolean).join(' · '),
      ]),
      labels,
    },
  ]
}

// Cable sets: one per cable, a label for each trunk piece (main and extensions).
// Tail blocks print with the tail labels.
export function cableGroups(show: Show, cable: Cable, settings: LabelSettings): LabelGroup[] {
  const type = typeById(show, cable.typeId)
  if (!type) return []
  if (type.part !== 'Trunk' && !settings.includeSingles) return []

  const cableName = cable.name.trim() || 'Unnamed'
  const route = [cable.from, cable.to].filter(Boolean).join(' → ')
  const group = bundleById(show, cable.bundleId)?.name ?? cableRack(show, cable)?.name
  const detail = [route, group].filter(Boolean).join(' · ')

  const labels: CableLabel[] = cable.segments.flatMap((g, i) => {
    const sub = [type.name, g.length != null ? `${g.length}'` : '', g.extension ? `Ext ${i}` : '']
      .filter(Boolean)
      .join(' · ')
    return Array.from({ length: settings.perPiece }, (_, n) => ({
      kind: 'cable' as const,
      key: `${cable.id}-${g.id}-${n}`,
      cableName,
      color: cable.color,
      lines: [sub, detail].filter(Boolean),
    }))
  })
  return [
    {
      key: cable.id,
      header: {
        kind: 'header',
        key: `${cable.id}-header`,
        cableName,
        color: cable.color,
        lines: [
          [type.name, plural(labels.length, 'label')].join(' · '),
          detail,
        ].filter(Boolean),
      },
      labels,
    },
  ]
}

export function groupsFor(show: Show, cable: Cable, set: LabelSet, settings: LabelSettings): LabelGroup[] {
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
