import seedCsv from '../cable_types.csv?raw'
import seedModelsCsv from '../gear_models.csv?raw'
import { softenColor } from './colors'
import { cableTypesFromCsv, gearModelsFromCsv, parseHalfWidth, parseNumbering, parseRu, type GearModelRow } from './csv'
import { newId } from './ids'
import { gearMatcher } from './match'
import { placeUnplaced } from './racking'
import { migrateSteckRails, normalizeSteck } from './stecks'
import {
  DEPLOYMENTS,
  GEAR_CATEGORY_NAMES,
  PARTS,
  ROLES,
  SCHEDULE,
  type Bundle,
  type Cable,
  type CableType,
  type Gear,
  type GearCategory,
  type GearList,
  type GearModel,
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

export function seedGearCategories(): GearCategory[] {
  return GEAR_CATEGORY_NAMES.map((name) => ({ id: newId(), name }))
}

export function starterModelRows(): GearModelRow[] {
  return gearModelsFromCsv(seedModelsCsv).rows
}

// The starter model library (gear_models.csv), filed under the show's categories by name.
export function seedGearModels(categories: GearCategory[]): GearModel[] {
  return starterModelRows().map((r) => ({
    id: newId(),
    manufacturer: r.manufacturer,
    model: r.model,
    categoryId: categories.find((c) => c.name.trim().toLowerCase() === r.category.toLowerCase())?.id ?? null,
    ru: parseRu(r.ru),
    halfWidth: parseHalfWidth(r.width),
    slots: r.slots,
    card: r.card,
    cardNumbering: parseNumbering(r.numbering),
    ports: r.ports,
    notes: r.notes,
  }))
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
    hiddenRoles: [],
    customRoles: [],
    gearLists: defaultGearLists(),
  }
}

// The lists a show starts with. Fixed ids, so every copy of a shared show agrees on them.
export const defaultGearLists = (): GearList[] => [
  { id: 'main', name: 'Main' },
  { id: 'production', name: 'Production' },
]

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
  if (Array.isArray(raw.hiddenRoles)) info.hiddenRoles = ROLES.map((r) => r.id).filter((id) => raw.hiddenRoles!.includes(id))
  if (Array.isArray(raw.customRoles)) {
    info.customRoles = raw.customRoles
      .filter((r) => r && typeof r === 'object')
      .map((r) => ({
        id: typeof r.id === 'string' ? r.id : newId(),
        label: typeof r.label === 'string' ? r.label : '',
        names: Array.isArray(r.names) ? r.names.filter((n) => typeof n === 'string') : [],
      }))
  }
  if (Array.isArray(raw.gearLists)) {
    const seen = new Set<string>()
    info.gearLists = raw.gearLists
      .filter((l) => l && typeof l === 'object' && typeof l.id === 'string' && !seen.has(l.id) && seen.add(l.id))
      .map((l) => ({ id: l.id, name: typeof l.name === 'string' ? l.name : '' }))
  }
  return info
}

// The roles a show credits, in order: the built-in ones it uses, then its own.
export function teamRoles(info: ShowInfo): { label: string; credit: string; names: string[] }[] {
  return [
    ...ROLES.filter((r) => !info.hiddenRoles.includes(r.id)).map((r) => ({ label: r.label, credit: r.credit, names: info.team[r.id] })),
    ...info.customRoles.map((r) => ({ label: r.label, credit: r.label, names: r.names })),
  ]
}

export function newShow(): Show {
  const gearCategories = seedGearCategories()
  return {
    format: 'proto-database-show',
    formatVersion: 1,
    name: 'Untitled Show',
    info: emptyInfo(),
    cableTypes: seedCableTypes(),
    cables: [],
    bundles: [],
    racks: [],
    gearCategories,
    gear: [],
    gearModels: seedGearModels(gearCategories),
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
    size: typeof r.size === 'number' && r.size > 0 ? r.size : null,
    notes: r.notes ?? '',
  }))
  // Shows from before racks were their own records kept a rack name on each cable.
  const rackIdFor = (c: Partial<Cable> & { rack?: unknown }): string | null => {
    if (c.rackId && racks.some((r) => r.id === c.rackId)) return c.rackId
    const legacy = typeof c.rack === 'string' ? c.rack.trim() : ''
    if (!legacy) return null
    let rack = racks.find((r) => r.name.toLowerCase() === legacy.toLowerCase())
    if (!rack) {
      rack = { id: newId(), name: legacy, location: '', size: null, notes: '' }
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
      steckAAt: typeof c.steckAAt === 'string' ? c.steckAAt : '',
      steckBAt: typeof c.steckBAt === 'string' ? c.steckBAt : '',
      linkId: typeof c.linkId === 'string' ? c.linkId : null,
      linkOrder: typeof c.linkOrder === 'number' ? c.linkOrder : 0,
      notes: c.notes ?? '',
    }
  })
  // Shows from before gear existed get the default categories.
  const gearCategories: GearCategory[] = Array.isArray(s.gearCategories)
    ? s.gearCategories.map((g) => ({ id: g.id ?? newId(), name: g.name ?? '' }))
    : seedGearCategories()
  const categoryIds = new Set(gearCategories.map((g) => g.id))
  const rackIds = new Set(racks.map((r) => r.id))
  const info = normalizeInfo(s.info)
  const listIds = new Set(info.gearLists.map((l) => l.id))
  // Gear from before lists goes on the first one.
  const listOf = (raw: unknown): string | null =>
    raw === undefined ? (info.gearLists[0]?.id ?? null) : typeof raw === 'string' && listIds.has(raw) ? raw : null
  // Shows from 0.7.6–0.7.9 kept each rack's case as a gear entry; the gear list now counts
  // racks by size instead, so those entries go.
  const caseIds = new Set((s.racks ?? []).map((r) => (r as { gearId?: unknown }).gearId).filter((id) => typeof id === 'string'))
  const gear: Gear[] = (s.gear ?? []).filter((g) => !caseIds.has(g.id)).map((g) => ({
    id: g.id ?? newId(),
    name: g.name ?? '',
    categoryId: g.categoryId && categoryIds.has(g.categoryId) ? g.categoryId : null,
    manufacturer: g.manufacturer ?? '',
    model: g.model ?? '',
    qty: Math.max(1, Math.floor(Number(g.qty) || 1)),
    rackId: g.rackId && rackIds.has(g.rackId) ? g.rackId : null,
    rackU: typeof g.rackU === 'number' && g.rackU >= 1 ? Math.floor(g.rackU) : null,
    rackSide: g.rackSide === 'rear' ? ('rear' as const) : ('front' as const),
    rackSlot: g.rackSlot === 'left' || g.rackSlot === 'right' ? g.rackSlot : null,
    notes: g.notes ?? '',
    steck: normalizeSteck(g.steck),
    host:
      g.host && typeof g.host.gearId === 'string' && typeof g.host.slot === 'string'
        ? { gearId: g.host.gearId, slot: g.host.slot }
        : null,
    listId: listOf(g.listId),
  }))
  // A card whose unit is gone stays on the list as a spare.
  const gearIds = new Set(gear.map((g) => g.id))
  for (const g of gear) if (g.host && !gearIds.has(g.host.gearId)) g.host = null
  // Shows from before the model library get the starter one.
  const gearModels: GearModel[] = Array.isArray(s.gearModels)
    ? s.gearModels
        .map((m) => ({
          id: m.id ?? newId(),
          manufacturer: m.manufacturer ?? '',
          model: m.model ?? '',
          categoryId: m.categoryId && categoryIds.has(m.categoryId) ? m.categoryId : null,
          ru: typeof m.ru === 'number' && m.ru > 0 ? m.ru : null,
          halfWidth: m.halfWidth === true,
          slots: typeof m.slots === 'string' ? m.slots : '',
          card: typeof m.card === 'string' ? m.card : '',
          cardNumbering: m.cardNumbering === 'continue' ? ('continue' as const) : ('slot' as const),
          ports: m.ports ?? '',
          notes: m.notes ?? '',
        }))
        .filter((m) => m.model.trim())
    : seedGearModels(gearCategories)
  // Steck rails that were gear models become rails built into their racks.
  const stecked = migrateSteckRails(gear, gearModels, cables, Array.isArray(s.gearModels) ? s.gearModels : [])
  // Gear racked before positions existed is placed top down, in the order it was listed.
  return placeUnplaced({
    format: 'proto-database-show',
    formatVersion: 1,
    name: s.name ?? 'Untitled Show',
    info,
    cableTypes,
    cables: stecked.cables,
    bundles,
    racks,
    gearCategories,
    gear: stecked.gear,
    gearModels: stecked.gearModels,
    checks: s.checks && typeof s.checks === 'object' ? s.checks : {},
  })
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

// What mounts in a steck at a cable end: the tail's multipin side (for a trunk with a tail
// there), or the cable's own connector.
export function steckMount(show: Show, cable: Cable, end: 'A' | 'B'): { tail?: CableType; connector: string } {
  const type = typeById(show, cable.typeId)
  const tail = type?.part === 'Trunk' ? typeById(show, end === 'A' ? cable.tailATypeId : cable.tailBTypeId) : undefined
  if (tail) return { tail, connector: tail.endA }
  return { connector: (end === 'A' ? type?.endA : type?.endB) ?? '' }
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
    steckAAt: '',
    steckBAt: '',
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
    // A copy starts outside any linked path, and not in the original's steck slots.
    linkId: null,
    linkOrder: 0,
    steckAAt: '',
    steckBAt: '',
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

// A bundle's extensions, by place: Ext 1 is each cable's second piece, Ext 2 its third.
// Their length is the one every cable that has it shares (null when they differ).
export interface BundleExtension {
  index: number
  length: number | null
  mixed: boolean
  // How many of the bundle's cables have it, and how many could take it now (they have
  // every piece before it but not this one).
  count: number
  missing: number
}

export function bundleExtensions(show: Show, bundleId: string): BundleExtension[] {
  const cables = show.cables.filter((c) => c.bundleId === bundleId)
  const most = Math.max(0, ...cables.map((c) => c.segments.length - 1))
  return Array.from({ length: most }, (_, i) => {
    const index = i + 1
    const lengths = cables.flatMap((c) => (c.segments[index] ? [c.segments[index].length] : []))
    const first = lengths[0] ?? null
    const mixed = lengths.some((l) => l !== first)
    return {
      index,
      length: mixed ? null : first,
      mixed,
      count: lengths.length,
      missing: cables.filter((c) => c.segments.length === index).length,
    }
  })
}

// Changes one extension's length on every cable in a bundle that has it. The bundle's
// length moves by the same amount when every cable agreed on the old one.
export function setBundleExtensionLength(show: Show, bundleId: string, index: number, length: number | null): Show {
  const ext = bundleExtensions(show, bundleId)[index - 1]
  const delta = ext && !ext.mixed && ext.length != null && length != null ? length - ext.length : null
  return {
    ...show,
    bundles: show.bundles.map((b) => (b.id === bundleId && b.length != null && delta != null ? { ...b, length: b.length + delta } : b)),
    cables: show.cables.map((c) =>
      c.bundleId === bundleId && c.segments[index]
        ? { ...c, segments: c.segments.map((g, i) => (i === index ? { ...g, length } : g)) }
        : c,
    ),
  }
}

// Takes one extension off every cable in a bundle; the ones after it move up. The bundle
// gets shorter by its length when every cable agreed on it.
export function removeBundleExtension(show: Show, bundleId: string, index: number): Show {
  const ext = bundleExtensions(show, bundleId)[index - 1]
  const shorter = ext && !ext.mixed && ext.length != null ? ext.length : null
  return {
    ...show,
    bundles: show.bundles.map((b) =>
      b.id === bundleId && b.length != null && shorter != null ? { ...b, length: Math.max(0, b.length - shorter) } : b,
    ),
    cables: show.cables.map((c) =>
      c.bundleId === bundleId && c.segments[index] ? { ...c, segments: c.segments.filter((_, i) => i !== index) } : c,
    ),
  }
}

// Gives an extension to the bundle's cables that don't have it yet (ones added since).
export function extendRestOfBundle(show: Show, bundleId: string, index: number): Show {
  const ext = bundleExtensions(show, bundleId)[index - 1]
  if (!ext) return show
  return {
    ...show,
    cables: show.cables.map((c) =>
      c.bundleId === bundleId && c.segments.length === index
        ? { ...c, segments: [...c.segments, { id: newId(), length: ext.length, extension: true }] }
        : c,
    ),
  }
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

// "19pr Mult, 2× XLR3": what's in a bundle (or any set of cables) at a glance.
export function cableContents(show: Show, cables: Cable[]): string {
  const counts = new Map<string, number>()
  for (const c of cables) {
    const name = typeById(show, c.typeId)?.name ?? 'Missing type'
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts].map(([name, n]) => (n > 1 ? `${n}× ${name}` : name)).join(', ')
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

// Places in the show, for location fields: where bundles and racks are, and cable ends
// that name a place. Ends that name gear ("Switch 1 · 24") are patch points, not places.
export function locations(show: Show): string[] {
  const isGear = gearMatcher(show.gear)
  const all = new Set<string>()
  const add = (text: string) => {
    const t = text.trim()
    if (t && !isGear(t)) all.add(t)
  }
  for (const c of show.cables) {
    add(c.from)
    add(c.to)
  }
  for (const b of show.bundles) {
    add(b.from)
    add(b.to)
  }
  for (const r of show.racks) add(r.location)
  return [...all].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
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
  const added = addRack(show, { name: trimmed })
  return { show: added.show, rackId: added.rack.id }
}

// Adds a rack.
export function addRack(show: Show, fields: Partial<Rack> = {}): { show: Show; rack: Rack } {
  const rack: Rack = { id: newId(), name: '', location: '', size: null, notes: '', ...fields }
  return { show: { ...show, racks: [...show.racks, rack] }, rack }
}

export function updateRack(show: Show, rackId: string, changes: Partial<Omit<Rack, 'id'>>): Show {
  return { ...show, racks: show.racks.map((r) => (r.id === rackId ? { ...r, ...changes } : r)) }
}

// What deleting a rack takes with it, and what stays behind.
export function rackDeleteMessage(show: Show, rack: Rack): string {
  const cables = rackCables(show, rack.id).length
  const gear = show.gear.filter((g) => g.rackId === rack.id).length
  const kept = [
    cables ? `${cables} interconnect(s) stay interconnects with no rack` : '',
    gear ? `${gear} gear entr${gear === 1 ? 'y stays' : 'ies stay'} in the show with no rack` : '',
  ].filter(Boolean)
  return `Delete ${rack.name || 'this rack'}?${kept.length ? ` Its ${kept.join(', and its ')}.` : ''}`
}

// Deletes a rack. Its interconnects and gear stay in the show, with no rack.
export function deleteRack(show: Show, rackId: string): Show {
  const rack = show.racks.find((r) => r.id === rackId)
  if (!rack) return show
  return {
    ...show,
    racks: show.racks.filter((r) => r.id !== rackId),
    cables: show.cables.map((c) => (c.rackId === rackId ? { ...c, rackId: null } : c)),
    gear: show.gear.map((g) => (g.rackId === rackId ? { ...g, rackId: null, rackU: null, rackSlot: null } : g)),
  }
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
