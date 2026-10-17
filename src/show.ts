import seedCsv from '../cable_types.csv?raw'
import { softenColor } from './colors'
import { cableTypesFromCsv } from './csv'
import { newId } from './ids'
import {
  DEPLOYMENTS,
  PARTS,
  ROLES,
  SCHEDULE,
  type Bundle,
  type Cable,
  type CableType,
  type Part,
  type Rack,
  type Segment,
  type Show,
  type ShowInfo,
  type Tail,
} from './types'

const STORAGE_KEY = 'proto-database:show'

export function seedCableTypes(): CableType[] {
  return cableTypesFromCsv(seedCsv).types
}

function emptyInfo(): ShowInfo {
  return {
    venue: '',
    dates: {
      prep: { start: '', end: '' },
      loadIn: { start: '', end: '' },
      tech: { start: '', end: '' },
      previews: { start: '', end: '' },
      open: { start: '', end: '' },
      close: { start: '', end: '' },
      extension: { start: '', end: '' },
    },
    logo: null,
    team: { designer: [], associate: [], assistant: [], productionAudio: [], a1: [], a2: [] },
  }
}

function normalizeInfo(raw: Partial<ShowInfo> | undefined): ShowInfo {
  const info = emptyInfo()
  if (!raw || typeof raw !== 'object') return info
  info.venue = typeof raw.venue === 'string' ? raw.venue : ''
  const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  for (const { id } of SCHEDULE) {
    const span = raw.dates?.[id]
    info.dates[id] = { start: isDate(span?.start) ? span.start : '', end: isDate(span?.end) ? span.end : '' }
  }
  info.logo = typeof raw.logo === 'string' && raw.logo.startsWith('data:image/') ? raw.logo : null
  for (const role of ROLES) {
    const names = raw.team?.[role.id]
    if (Array.isArray(names)) info.team[role.id] = names.filter((n) => typeof n === 'string')
  }
  return info
}

export function newShow(): Show {
  return {
    format: 'proto-database-show',
    formatVersion: 1,
    name: 'Untitled Show',
    info: emptyInfo(),
    cableTypes: seedCableTypes(),
    cables: [],
    bundles: [],
    racks: [],
    checks: {},
  }
}

// Fills in anything missing so older or hand-edited show files still open.
export function normalizeShow(raw: unknown): Show {
  if (!raw || typeof raw !== 'object' || (raw as Show).format !== 'proto-database-show') {
    throw new Error('This is not a Proto Database show file.')
  }
  const s = raw as Partial<Show>
  const cableTypes = (s.cableTypes ?? []).map((t) => ({
    id: t.id ?? newId(),
    name: t.name ?? '',
    part: t.part ?? 'Cable',
    channels: Math.max(1, Math.floor(t.channels ?? 1)),
    endA: t.endA ?? '',
    endB: t.endB ?? '',
    lengths: Array.isArray(t.lengths) ? t.lengths : [],
    notes: t.notes ?? '',
  }))
  const bundles = (s.bundles ?? []).map((b) => ({
    id: b.id ?? newId(),
    name: b.name ?? '',
    from: b.from ?? '',
    to: b.to ?? '',
    length: b.length ?? null,
    notes: b.notes ?? '',
  }))
  const bundleIds = new Set(bundles.map((b) => b.id))
  const racks: Rack[] = (s.racks ?? []).map((r) => ({
    id: r.id ?? newId(),
    name: r.name ?? '',
    location: r.location ?? '',
    notes: r.notes ?? '',
  }))
  // Shows from before racks were their own records kept a rack name on each cable.
  const rackIdFor = (c: Partial<Cable> & { rack?: unknown }): string | null => {
    if (c.rackId && racks.some((r) => r.id === c.rackId)) return c.rackId
    const legacy = typeof c.rack === 'string' ? c.rack.trim() : ''
    if (!legacy) return null
    let rack = racks.find((r) => r.name.toLowerCase() === legacy.toLowerCase())
    if (!rack) {
      rack = { id: newId(), name: legacy, location: '', notes: '' }
      racks.push(rack)
    }
    return rack.id
  }
  const cables = (s.cables ?? []).map((c) => {
    const bundleId = c.bundleId && bundleIds.has(c.bundleId) ? c.bundleId : null
    const segments = c.segments?.length
      ? c.segments.map((g, i) => ({
          id: g.id ?? newId(),
          length: g.length ?? null,
          extension: i > 0,
        }))
      : [{ id: newId(), length: null, extension: false }]
    return {
      id: c.id ?? newId(),
      name: c.name ?? '',
      typeId: c.typeId ?? '',
      tailATypeId: c.tailATypeId ?? null,
      tailBTypeId: c.tailBTypeId ?? null,
      deployment: DEPLOYMENTS.includes(c.deployment!) ? c.deployment! : 'loose',
      bundleId,
      rackId: rackIdFor(c),
      from: c.from ?? '',
      to: c.to ?? '',
      segments,
      tails: (c.tails ?? []).map((t, i) => ({
        number: i + 1,
        name: t.name ?? '',
        patchA: t.patchA ?? '',
        patchB: t.patchB ?? '',
      })),
      color: softenColor(c.color ?? null),
      flagEnd: c.flagEnd === 'A' || c.flagEnd === 'B' ? c.flagEnd : null,
      steckA: c.steckA === true,
      steckB: c.steckB === true,
      linkId: typeof c.linkId === 'string' ? c.linkId : null,
      linkOrder: typeof c.linkOrder === 'number' ? c.linkOrder : 0,
      notes: c.notes ?? '',
    }
  })
  return {
    format: 'proto-database-show',
    formatVersion: 1,
    name: s.name ?? 'Untitled Show',
    info: normalizeInfo(s.info),
    cableTypes,
    cables,
    bundles,
    racks,
    checks: s.checks && typeof s.checks === 'object' ? s.checks : {},
  }
}

export function loadStoredShow(): Show {
  try {
    const text = localStorage.getItem(STORAGE_KEY)
    if (text) return normalizeShow(JSON.parse(text))
  } catch {
    // Storage blocked or data unreadable: start fresh.
  }
  return newShow()
}

export function storeShow(show: Show): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(show))
  } catch {
    // Storage blocked or full: the show file is still the source of truth.
  }
}

export function typeById(show: Show, id: string | null): CableType | undefined {
  return id ? show.cableTypes.find((t) => t.id === id) : undefined
}

export function bundleById(show: Show, id: string | null): Bundle | undefined {
  return id ? show.bundles.find((b) => b.id === id) : undefined
}

// Tails that fit a trunk: same channel count, and End A plugs into the trunk's
// connector. Loosens to channel count alone, then to every tail type.
export function tailOptions(show: Show, trunk: CableType | undefined): CableType[] {
  const tails = show.cableTypes.filter((t) => t.part === 'Tail')
  if (!trunk) return tails
  const sameChannels = tails.filter((t) => t.channels === trunk.channels)
  const sameConnector = sameChannels.filter(
    (t) => t.endA.toLowerCase() === trunk.endA.toLowerCase() || t.endA.toLowerCase() === trunk.endB.toLowerCase(),
  )
  if (sameConnector.length) return sameConnector
  return sameChannels.length ? sameChannels : tails
}

// Mults get a female fan on End A (plugs into the source) and a male fan on End B.
// Trunks without F/M fans (e.g. NL8) start with no tails; breakouts are picked by hand.
function defaultTails(show: Show, type: CableType | undefined) {
  if (!type || type.part !== 'Trunk') return { tailATypeId: null, tailBTypeId: null }
  const options = tailOptions(show, type)
  const female = options.find((t) => /-F\b/.test(t.endB))
  const male = options.find((t) => /-M\b/.test(t.endB))
  return { tailATypeId: female?.id ?? null, tailBTypeId: male?.id ?? null }
}

export function resizeTails(tails: Tail[], count: number): Tail[] {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    name: tails[i]?.name ?? '',
    patchA: tails[i]?.patchA ?? '',
    patchB: tails[i]?.patchB ?? '',
  }))
}

export function newCable(show: Show, overrides: Partial<Cable> = {}): Cable {
  const type =
    typeById(show, overrides.typeId ?? null) ??
    show.cableTypes.find((t) => t.name === 'XLR3') ??
    show.cableTypes.find((t) => t.part === 'Cable' || t.part === 'Trunk')
  return {
    id: newId(),
    name: '',
    typeId: type?.id ?? '',
    ...defaultTails(show, type),
    deployment: 'loose',
    bundleId: null,
    rackId: null,
    from: '',
    to: '',
    segments: [{ id: newId(), length: null, extension: false }],
    tails: [],
    color: null,
    flagEnd: null,
    steckA: false,
    steckB: false,
    linkId: null,
    linkOrder: 0,
    notes: '',
    ...overrides,
  }
}

// Changing type resets the tail types. Tail names are kept even past the new
// channel count, so switching 19pr -> 12pr -> 19pr doesn't lose names 13-19.
export function withType(show: Show, cable: Cable, typeId: string): Cable {
  return { ...cable, typeId, ...defaultTails(show, typeById(show, typeId)) }
}

// A trunk with no tail on either end (an NL4 or NL8 run straight, say) is one cable
// with one tail; picking a breakout opens it up to the type's full channel count.
export function hasTails(cable: Cable): boolean {
  return !!(cable.tailATypeId || cable.tailBTypeId)
}

export function channelCount(show: Show, cable: Cable): number {
  const type = typeById(show, cable.typeId)
  if (type?.part === 'Trunk' && !hasTails(cable)) return 1
  return type?.channels ?? 1
}

export function visibleTails(show: Show, cable: Cable): Tail[] {
  return resizeTails(cable.tails, channelCount(show, cable))
}

export type TailField = 'name' | 'patchA' | 'patchB'

// Writes values into particular tails (rows), e.g. every other row when each connector
// on an end covers two circuits.
export function setTailCells(show: Show, cable: Cable, field: TailField, rows: number[], values: string[]): Cable {
  const count = channelCount(show, cable)
  const tails = resizeTails(cable.tails, Math.max(count, cable.tails.length))
  rows.forEach((row, i) => {
    if (row < count && i < values.length) tails[row] = { ...tails[row], [field]: values[i] }
  })
  return { ...cable, tails }
}

export function duplicateCable(cable: Cable): Cable {
  return {
    ...cable,
    // A copy starts outside any linked path.
    linkId: null,
    linkOrder: 0,
    id: newId(),
    name: cable.name ? `${cable.name} copy` : '',
    segments: cable.segments.map((g) => ({ ...g, id: newId() })),
    tails: cable.tails.map((t) => ({ ...t })),
  }
}

// --- Linked cables: one signal path made of several cables ----------------------

// The other cables in this cable's path, plus this one, in path order. Empty when
// it isn't linked to anything.
export function linkedCables(show: Show, cable: Cable): Cable[] {
  if (!cable.linkId) return []
  const members = show.cables.filter((c) => c.linkId === cable.linkId)
  if (members.length < 2) return []
  return [...members].sort((a, b) => a.linkOrder - b.linkOrder)
}

// Adds a cable to the end of this cable's path. It takes this cable's name and color
// (both can still be changed afterwards; the color stays shared).
export function linkCable(show: Show, cableId: string, otherId: string): Show {
  const cable = show.cables.find((c) => c.id === cableId)
  if (!cable || cableId === otherId) return show
  const linkId = cable.linkId ?? newId()
  const order = Math.max(0, ...show.cables.filter((c) => c.linkId === linkId).map((c) => c.linkOrder))
  return {
    ...show,
    cables: show.cables.map((c) => {
      if (c.id === cableId && !c.linkId) return { ...c, linkId, linkOrder: 0 }
      if (c.id === otherId) return { ...c, linkId, linkOrder: order + 1, name: cable.name, color: cable.color }
      return c
    }),
  }
}

export function unlinkCable(show: Show, cableId: string): Show {
  return { ...show, cables: show.cables.map((c) => (c.id === cableId ? { ...c, linkId: null, linkOrder: 0 } : c)) }
}

// Moves a cable one place earlier (-1) or later (+1) in its path.
export function moveInLink(show: Show, cableId: string, step: -1 | 1): Show {
  const cable = show.cables.find((c) => c.id === cableId)
  if (!cable) return show
  const path = linkedCables(show, cable)
  const at = path.findIndex((c) => c.id === cableId)
  const other = path[at + step]
  if (!other) return show
  // Renumber the whole path so equal or missing orders can't get stuck.
  const order = new Map(path.map((c, i) => [c.id, i]))
  order.set(cableId, at + step)
  order.set(other.id, at)
  return { ...show, cables: show.cables.map((c) => (order.has(c.id) ? { ...c, linkOrder: order.get(c.id)! } : c)) }
}

// Color is shared along a path: setting it on one sets it on all.
export function setCableColor(show: Show, cableId: string, color: string | null): Show {
  const cable = show.cables.find((c) => c.id === cableId)
  if (!cable) return show
  const linked = new Set(linkedCables(show, cable).map((c) => c.id))
  return {
    ...show,
    cables: show.cables.map((c) => (c.id === cableId || linked.has(c.id) ? { ...c, color } : c)),
  }
}

export function addExtension(cable: Cable, length: number): Cable {
  const ext: Segment = { id: newId(), length, extension: true }
  return { ...cable, segments: [...cable.segments, ext] }
}

// Puts a cable in a bundle, filling in anything it doesn't have yet from the bundle.
export function joinBundle(cable: Cable, bundle: Bundle): Cable {
  const [main, ...rest] = cable.segments
  const fillLength = main && main.length == null && rest.length === 0 && bundle.length != null
  return {
    ...cable,
    // A flag only means something inside the bundle it was set in.
    flagEnd: cable.bundleId === bundle.id ? cable.flagEnd : null,
    bundleId: bundle.id,
    deployment: 'bundled',
    from: cable.from || bundle.from,
    to: cable.to || bundle.to,
    segments: fillLength ? [{ ...main, length: bundle.length }] : cable.segments,
  }
}

// Null when any piece has no length yet, so a half-entered run never reads as a match.
export function knownLength(cable: Cable): number | null {
  if (cable.segments.some((g) => g.length == null)) return null
  return cable.segments.reduce((sum, g) => sum + (g.length ?? 0), 0)
}

// The bundle a cable disagrees with on length, if any.
export function bundleLengthMismatch(show: Show, cable: Cable): Bundle | null {
  const bundle = bundleById(show, cable.bundleId)
  if (!bundle || bundle.length == null) return null
  return knownLength(cable) === bundle.length ? null : bundle
}

export function bundleLengthMismatchCount(show: Show): number {
  return show.cables.filter((c) => bundleLengthMismatch(show, c)).length
}

export interface FlagReport {
  total: number
  flagged: number
  // Where most of the bundle is flagged: a location, or "End A" / "End B".
  place: string | null
  // Cables flagged at the other end from the rest.
  reversed: Set<string>
  placeOf: (cable: Cable) => string | null
}

// Compares where each cable's flagged end is. By location when every flagged end has
// one (so "Amp Room" ends match even if a cable was entered From/To the other way),
// otherwise by end letter. Whatever most cables agree on is "right"; ties go to the
// first cable flagged in the list.
export function bundleFlags(show: Show, bundleId: string): FlagReport {
  const cables = show.cables.filter((c) => c.bundleId === bundleId)
  const flagged = cables.filter((c) => c.flagEnd)
  const endPlace = (c: Cable) => (c.flagEnd === 'A' ? c.from : c.to).trim()
  const byLocation = flagged.length > 0 && flagged.every((c) => endPlace(c))
  const placeOf = (c: Cable) => (c.flagEnd ? (byLocation ? endPlace(c) : `End ${c.flagEnd}`) : null)

  const votes = new Map<string, { label: string; count: number }>()
  for (const c of flagged) {
    const label = placeOf(c)!
    const key = label.toLowerCase()
    const vote = votes.get(key) ?? { label, count: 0 }
    vote.count += 1
    votes.set(key, vote)
  }
  let winner: { key: string; label: string; count: number } | null = null
  for (const [key, vote] of votes) if (!winner || vote.count > winner.count) winner = { key, ...vote }

  const reversed = new Set(
    flagged.filter((c) => placeOf(c)!.toLowerCase() !== winner?.key).map((c) => c.id),
  )
  return { total: cables.length, flagged: flagged.length, place: winner?.label ?? null, reversed, placeOf }
}

export function flagReversedCount(show: Show): number {
  return show.bundles.reduce((n, b) => n + bundleFlags(show, b.id).reversed.size, 0)
}

export function totalLength(cable: Cable): number | null {
  const known = cable.segments.filter((g) => g.length != null)
  if (!known.length) return null
  return known.reduce((sum, g) => sum + (g.length ?? 0), 0)
}

export function describeLength(cable: Cable): string {
  const parts = cable.segments.map((g) => (g.length == null ? "?'" : `${g.length}'`))
  if (parts.length === 1) return parts[0] === "?'" ? '' : parts[0]
  const total = totalLength(cable)
  return `${parts.join(' + ')}${total != null ? ` = ${total}'` : ''}`
}

export function locations(show: Show): string[] {
  const all = new Set<string>()
  for (const c of show.cables) {
    if (c.from) all.add(c.from)
    if (c.to) all.add(c.to)
  }
  for (const b of show.bundles) {
    if (b.from) all.add(b.from)
    if (b.to) all.add(b.to)
  }
  return [...all].sort((a, b) => a.localeCompare(b))
}

export function rackById(show: Show, id: string | null): Rack | undefined {
  return id ? show.racks.find((r) => r.id === id) : undefined
}

// The interconnects patched inside a rack.
export function rackCables(show: Show, rackId: string): Cable[] {
  return show.cables.filter((c) => c.deployment === 'interconnect' && c.rackId === rackId)
}

// The rack a cable is in right now (only interconnects are "in" a rack).
export function cableRack(show: Show, cable: Cable): Rack | undefined {
  return cable.deployment === 'interconnect' ? rackById(show, cable.rackId) : undefined
}

// Looks a rack up by name (any case), adding it if it's new.
export function ensureRack(show: Show, name: string): { show: Show; rackId: string | null } {
  const trimmed = name.trim()
  if (!trimmed) return { show, rackId: null }
  const existing = show.racks.find((r) => r.name.trim().toLowerCase() === trimmed.toLowerCase())
  if (existing) return { show, rackId: existing.id }
  const rack: Rack = { id: newId(), name: trimmed, location: '', notes: '' }
  return { show: { ...show, racks: [...show.racks, rack] }, rackId: rack.id }
}

// Makes a cable an interconnect in a rack.
export function joinRack(cable: Cable, rackId: string | null): Cable {
  return { ...cable, deployment: 'interconnect', rackId, bundleId: null, flagEnd: null }
}

export interface CableGroup {
  key: string
  title: string
  bundle: Bundle | null
  rack: Rack | null
  cables: Cable[]
}

// Print and checklist order: each bundle, then each rack's interconnects, then the rest.
export function cableGroups(show: Show): CableGroup[] {
  const groups: CableGroup[] = []
  for (const bundle of show.bundles) {
    const cables = show.cables.filter((c) => c.bundleId === bundle.id)
    if (cables.length) groups.push({ key: bundle.id, title: bundle.name || 'Unnamed bundle', bundle, rack: null, cables })
  }
  for (const rack of show.racks) {
    const cables = rackCables(show, rack.id)
    if (cables.length) groups.push({ key: rack.id, title: rack.name || 'Unnamed rack', bundle: null, rack, cables })
  }
  const grouped = new Set(groups.flatMap((g) => g.cables.map((c) => c.id)))
  const rest = show.cables.filter((c) => !grouped.has(c.id))
  if (rest.length) groups.push({ key: 'rest', title: 'Not in a bundle or rack', bundle: null, rack: null, cables: rest })
  return groups
}

export function typeUsage(show: Show, typeId: string): number {
  return show.cables.filter(
    (c) => c.typeId === typeId || c.tailATypeId === typeId || c.tailBTypeId === typeId,
  ).length
}

export interface PullLine {
  length: number | null
  quantity: number
  extensions: number
}

// One cable or tail type on the list, with a line per length.
export interface PullGroup {
  type: CableType
  lines: PullLine[]
  quantity: number
  footage: number
}

// The list is split by part, so cables, trunks, tails and adapters each get their own section.
export interface PullSection {
  part: Part
  groups: PullGroup[]
}

// Every cable or trunk piece (extensions included) is one physical piece at its
// length; every trunk end with a tail on it needs that fan or box.
export function pullList(show: Show): PullSection[] {
  const groups = new Map<string, PullGroup>()
  const bump = (type: CableType | undefined, length: number | null, extension: boolean) => {
    if (!type) return
    const group = groups.get(type.id) ?? { type, lines: [], quantity: 0, footage: 0 }
    let line = group.lines.find((l) => l.length === length)
    if (!line) {
      line = { length, quantity: 0, extensions: 0 }
      group.lines.push(line)
    }
    line.quantity += 1
    if (extension) line.extensions += 1
    group.quantity += 1
    group.footage += length ?? 0
    groups.set(type.id, group)
  }
  for (const cable of show.cables) {
    const type = typeById(show, cable.typeId)
    for (const g of cable.segments) bump(type, g.length, g.extension)
    if (type?.part === 'Trunk') {
      bump(typeById(show, cable.tailATypeId), null, false)
      bump(typeById(show, cable.tailBTypeId), null, false)
    }
  }
  const sorted = [...groups.values()]
    .map((g) => ({ ...g, lines: [...g.lines].sort((a, b) => (a.length ?? -1) - (b.length ?? -1)) }))
    .sort((a, b) => a.type.name.localeCompare(b.type.name, undefined, { numeric: true }))
  return PARTS.map((part) => ({ part, groups: sorted.filter((g) => g.type.part === part) })).filter(
    (section) => section.groups.length > 0,
  )
}
