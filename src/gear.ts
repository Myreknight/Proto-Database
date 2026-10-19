import { GEAR_MODEL_HEADERS, parseCsv, parseHalfWidth, parseRu, parseYes, RU_HEADERS, toCsv, type GearModelRow } from './csv'
import { newId } from './ids'
import { endConnectors } from './labels'
import { gearMatcher, type GearHit } from './match'
import { gearModelOf, gearRu, modelKey } from './models'
import { expandPorts, findPort, portKey, portsAfter, textSeries } from './ports'
import { frontRowsUsed, placeUnplaced } from './racking'
import { ensureRack, fillsSteckSlot, rackById, starterModelRows, steckMount, visibleTails } from './show'
import type { Cable, Gear, GearCategory, GearModel, Show } from './types'

export { gearMatcher, gearModelOf, gearRu, modelKey, type GearHit }

export function newGear(overrides: Partial<Gear> = {}): Gear {
  return {
    id: newId(),
    name: '',
    categoryId: null,
    manufacturer: '',
    model: '',
    qty: 1,
    rackId: null,
    rackU: null,
    rackSide: 'front',
    rackSlot: null,
    notes: '',
    ...overrides,
  }
}

// "Amp 1", or "d&b D80" for a bulk line with no name.
export function gearLabel(g: Gear): string {
  return (
    g.name.trim() ||
    [g.manufacturer, g.model]
      .map((v) => v.trim())
      .filter(Boolean)
      .join(' ') ||
    'Unnamed gear'
  )
}

export function categoryById(show: Show, id: string | null): GearCategory | undefined {
  return id ? show.gearCategories.find((c) => c.id === id) : undefined
}

// Suggestions for patch cells, so typing "Amp" offers Amp 1, Amp 2….
export function gearNames(show: Show): string[] {
  const names = new Set(show.gear.map((g) => g.name.trim()).filter(Boolean))
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
}

export function rackGear(show: Show, rackId: string): Gear[] {
  return show.gear.filter((g) => g.rackId === rackId)
}



// Rack units the gear in a rack takes up, counting a bulk line's quantity.
export function rackRu(show: Show, rackId: string): number {
  return frontRowsUsed(show, rackId)
}

export function gearPorts(show: Show, g: Gear): string[] {
  return expandPorts(gearModelOf(show, g)?.ports ?? '')
}

// Units that share this one's model (and so its ports), including itself.
export function sameModel(show: Show, g: Gear): Gear[] {
  const key = modelKey(g.manufacturer, g.model)
  return key ? show.gear.filter((u) => modelKey(u.manufacturer, u.model) === key) : [g]
}

// Changes a unit's model in the library, adding the model the first time (filed under
// the unit's category).
export function setModelField(
  show: Show,
  g: Pick<Gear, 'manufacturer' | 'model' | 'categoryId'>,
  changes: Partial<Omit<GearModel, 'id'>>,
): Show {
  const key = modelKey(g.manufacturer, g.model)
  if (!key) return show
  const exists = show.gearModels.some((m) => modelKey(m.manufacturer, m.model) === key)
  return {
    ...show,
    gearModels: exists
      ? show.gearModels.map((m) => (modelKey(m.manufacturer, m.model) === key ? { ...m, ...changes } : m))
      : [
          ...show.gearModels,
          {
            id: newId(),
            manufacturer: g.manufacturer.trim(),
            model: g.model.trim(),
            categoryId: g.categoryId,
            ru: null,
            halfWidth: false,
            steck: false,
            ports: '',
            notes: '',
            ...changes,
          },
        ],
  }
}

export function setModelPorts(show: Show, g: Pick<Gear, 'manufacturer' | 'model' | 'categoryId'>, ports: string): Show {
  return setModelField(show, g, { ports })
}

// After a unit's make or model is edited, its old model's ports come along if the new
// model isn't in the library yet, so fixing a typo doesn't lose them.
export function carryModelPorts(show: Show, gearId: string, before: Pick<Gear, 'manufacturer' | 'model'>): Show {
  const unit = show.gear.find((g) => g.id === gearId)
  const old = gearModelOf(show, before)
  if (!unit || !old || modelKey(before.manufacturer, before.model) === modelKey(unit.manufacturer, unit.model)) return show
  if (gearModelOf(show, unit)) return show
  return setModelField(show, unit, {
    ports: old.ports,
    ru: old.ru,
    halfWidth: old.halfWidth,
    steck: old.steck,
    categoryId: old.categoryId,
    notes: old.notes,
  })
}

// What a unit's model already knows: the manufacturer, when only one library model has
// that name, and the category, when the unit has none.
export function fromLibrary(show: Show, unit: Gear): Gear {
  let next = unit
  const model = next.model.trim().toLowerCase()
  if (model && !next.manufacturer.trim()) {
    const named = show.gearModels.filter((m) => m.model.trim().toLowerCase() === model && m.manufacturer.trim())
    if (named.length === 1) next = { ...next, manufacturer: named[0].manufacturer.trim() }
  }
  const record = gearModelOf(show, next)
  if (!record) return next
  // Matched ignoring case, so "ad4q" takes the library's spelling.
  if (record.manufacturer.trim() !== next.manufacturer || record.model.trim() !== next.model) {
    next = { ...next, manufacturer: record.manufacturer.trim(), model: record.model.trim() }
  }
  if (!next.categoryId && record.categoryId) next = { ...next, categoryId: record.categoryId }
  return next
}

export function applyLibrary(show: Show, gearId: string): Show {
  const unit = show.gear.find((g) => g.id === gearId)
  if (!unit) return show
  const next = fromLibrary(show, unit)
  return next === unit ? show : { ...show, gear: show.gear.map((g) => (g.id === gearId ? next : g)) }
}

// Renames a library model, and the units of that model with it, so they keep its ports.
export function renameGearModel(show: Show, modelId: string, manufacturer: string, model: string): Show {
  const record = show.gearModels.find((m) => m.id === modelId)
  if (!record) return show
  const oldKey = modelKey(record.manufacturer, record.model)
  return {
    ...show,
    gearModels: show.gearModels.map((m) => (m.id === modelId ? { ...m, manufacturer, model } : m)),
    gear: oldKey
      ? show.gear.map((g) =>
          modelKey(g.manufacturer, g.model) === oldKey ? { ...g, manufacturer: manufacturer.trim(), model: model.trim() } : g,
        )
      : show.gear,
  }
}

export interface ModelImport {
  show: Show
  updated: number
  added: number
  newCategories: string[]
}

// Merges model rows into the library by manufacturer and model. "replace" (an import)
// overwrites models already there; "fill" (the starter list) only fills their blank rack
// size, ports and category. Models not in the library yet are added either way.
export function mergeGearModels(show: Show, rows: GearModelRow[], mode: 'replace' | 'fill'): ModelImport {
  const gearCategories = [...show.gearCategories]
  const gearModels = [...show.gearModels]
  const newCategories: string[] = []
  let updated = 0
  let added = 0
  const categoryFor = (name: string): string | null => {
    if (!name) return null
    const found = gearCategories.find((c) => c.name.trim().toLowerCase() === name.toLowerCase())
    if (found) return found.id
    const category = { id: newId(), name }
    gearCategories.push(category)
    newCategories.push(name)
    return category.id
  }
  for (const row of rows) {
    const key = modelKey(row.manufacturer, row.model)
    const i = gearModels.findIndex((m) => modelKey(m.manufacturer, m.model) === key)
    if (i >= 0 && mode === 'fill') {
      const m = gearModels[i]
      const ru = parseRu(row.ru)
      const changes: Partial<GearModel> = {}
      if (m.ru == null && ru != null) changes.ru = ru
      if (!m.ports.trim() && row.ports) {
        changes.ports = row.ports
        if (!m.notes.trim()) changes.notes = row.notes
      }
      if (!m.categoryId && row.category) changes.categoryId = categoryFor(row.category)
      if (Object.keys(changes).length) {
        gearModels[i] = { ...m, ...changes }
        updated++
      }
      continue
    }
    const fields = {
      manufacturer: row.manufacturer,
      model: row.model,
      categoryId: categoryFor(row.category),
      ru: parseRu(row.ru),
      halfWidth: parseHalfWidth(row.width),
      steck: parseYes(row.steck),
      ports: row.ports,
      notes: row.notes,
    }
    if (i >= 0) {
      gearModels[i] = { ...gearModels[i], ...fields }
      updated++
    } else {
      gearModels.push({ id: newId(), ...fields })
      added++
    }
  }
  return { show: { ...show, gearCategories, gearModels }, updated, added, newCategories }
}

// What the starter list would add to this show's library, or fill into blanks.
export function starterChanges(show: Show): { missing: number; fills: number } {
  let missing = 0
  let fills = 0
  for (const r of starterModelRows()) {
    const m = gearModelOf(show, r)
    if (!m) missing++
    else if ((m.ru == null && parseRu(r.ru) != null) || (!m.ports.trim() && r.ports) || (!m.categoryId && r.category)) fills++
  }
  return { missing, fills }
}

export function applyStarterModels(show: Show): ModelImport {
  return mergeGearModels(show, starterModelRows(), 'fill')
}

export function gearModelsToCsv(show: Show): string {
  return toCsv([
    GEAR_MODEL_HEADERS,
    ...show.gearModels.map((m) => [
      m.manufacturer,
      m.model,
      categoryById(show, m.categoryId)?.name ?? '',
      m.ru == null ? '' : String(m.ru),
      m.halfWidth ? 'Half' : '',
      m.steck ? 'Yes' : '',
      m.ports,
      m.notes,
    ]),
  ])
}

export function linkedGear(gear: Gear[], text: string): Gear | undefined {
  return gearMatcher(gear)(text)?.gear
}

// One cable end or patch cell that names a piece of gear.
export interface PatchPoint {
  cable: Cable
  // Which box: "from", "to", "patchA-0"….
  field: string
  // Which connector. A From and a Patch A cell on a one-connector end are the same plug,
  // so naming the same port in both isn't a clash.
  slot: string
  place: string
  text: string
  gear: Gear
  // The port it names, as the model lists it, or as typed if the model has no port list.
  port: string | null
  issue: string | null
}

export interface PatchReport {
  byGear: Map<string, PatchPoint[]>
  byField: Map<string, PatchPoint>
  issues: number
  // "Switch 1 · 3" for every listed port nothing is patched to yet (steck rails aside).
  freePorts: string[]
  // "SR 1 · 3" for every empty slot on a steck rail.
  freeSteckSlots: string[]
}

export const fieldKey = (cableId: string, field: string) => `${cableId}|${field}`

// Every cable end and patch cell that names gear, with its port checked against the
// model's port list and against everything else patched to that port.
export function patchReport(show: Show): PatchReport {
  const match = gearMatcher(show.gear)
  const portLists = new Map<string, string[]>()
  const portsOf = (g: Gear) => {
    let ports = portLists.get(g.id)
    if (!ports) {
      ports = gearPorts(show, g)
      portLists.set(g.id, ports)
    }
    return ports
  }
  const points: PatchPoint[] = []
  const add = (cable: Cable, field: string, slot: string, place: string, text: string) => {
    const hit = match(text)
    if (!hit) return
    const ports = portsOf(hit.gear)
    let port: string | null = null
    let issue: string | null = null
    if (hit.rest && ports.length) {
      const found = findPort(ports, hit.rest)
      if (found.port !== null) port = found.port
      else if (found.candidates.length) issue = `“${hit.rest}” could be ${found.candidates.join(' or ')}`
      else issue = `${gearLabel(hit.gear)} has no port “${hit.rest}”`
    } else if (hit.rest) {
      port = hit.rest
    }
    points.push({ cable, field, slot: `${cable.id}|${slot}`, place, text, gear: hit.gear, port, issue })
  }

  for (const cable of show.cables) {
    const tails = visibleTails(show, cable)
    for (const end of ['A', 'B'] as const) {
      const count = Math.min(tails.length, endConnectors(show, cable, end))
      add(cable, end === 'A' ? 'from' : 'to', count === 1 ? `${end}0` : `${end}`, `End ${end}`, end === 'A' ? cable.from : cable.to)
      // The tail's multipin (or the cable's own connector) in a steck slot is a plug of its own.
      if (end === 'A' ? cable.steckA : cable.steckB) {
        add(cable, `steck${end}`, `${end}steck`, `End ${end} steck`, end === 'A' ? cable.steckAAt : cable.steckBAt)
      }
      const field = end === 'A' ? 'patchA' : 'patchB'
      for (let i = 0; i < count; i++) {
        const name = tails[i].name.trim()
        const row =
          tails.length === 1 ? '' : count === tails.length ? `#${i + 1}${name ? ` ${name}` : ''} · ` : `Connector ${i + 1} · `
        add(cable, `${field}-${i}`, `${end}${i}`, `${row}Patch ${end}`, tails[i][field])
      }
    }
  }

  // Two connections on one port warn on both, naming the other.
  const onPort = new Map<string, PatchPoint[]>()
  for (const p of points) {
    if (!p.port) continue
    const key = `${p.gear.id}|${portKey(p.port)}`
    const list = onPort.get(key)
    if (list) list.push(p)
    else onPort.set(key, [p])
  }
  for (const list of onPort.values()) {
    if (gearModelOf(show, list[0].gear)?.steck) {
      steckSlotIssues(show, list)
      continue
    }
    for (const p of list) {
      const others = list.filter((o, i) => o.slot !== p.slot && list.findIndex((x) => x.slot === o.slot) === i)
      if (others.length && !p.issue) {
        const who = others.map((o) => `${o.cable.name || 'Unnamed'} (${o.place})`).join(', ')
        p.issue = `${gearLabel(p.gear)} · ${p.port} is also used by ${who}`
      }
    }
  }

  const byGear = new Map<string, PatchPoint[]>()
  const byField = new Map<string, PatchPoint>()
  for (const p of points) {
    const list = byGear.get(p.gear.id)
    if (list) list.push(p)
    else byGear.set(p.gear.id, [p])
    byField.set(fieldKey(p.cable.id, p.field), p)
  }

  const freePorts: string[] = []
  const freeSteckSlots: string[] = []
  for (const g of show.gear) {
    const name = g.name.trim()
    if (!name) continue
    const steck = gearModelOf(show, g)?.steck ?? false
    for (const port of portsOf(g)) {
      if (!onPort.has(`${g.id}|${portKey(port)}`)) (steck ? freeSteckSlots : freePorts).push(`${name} · ${port}`)
    }
  }

  // Counted by plug, so a From and Patch A cell on the same connector warn once.
  const issues = new Set(points.filter((p) => p.issue).map((p) => p.slot)).size
  return { byGear, byField, issues, freePorts, freeSteckSlots }
}

// The connector at a steck point: what mounts there, if it's a cable end's steck.
function steckConnector(show: Show, p: PatchPoint): string {
  return p.field.startsWith('steck') ? steckMount(show, p.cable, p.field === 'steckA' ? 'A' : 'B').connector : ''
}

// A steck slot holds one G-block (or other multipin), or D-size connectors two per rack
// unit of rail. Warns on every connector in a slot that's over.
function steckSlotIssues(show: Show, list: PatchPoint[]) {
  const ends = list.filter((p, i) => list.findIndex((x) => x.slot === p.slot) === i)
  const room = 2 * (gearRu(show, list[0].gear) ?? 1)
  const slot = `${gearLabel(list[0].gear)} · ${list[0].port}`
  const big = ends.find((p) => fillsSteckSlot(steckConnector(show, p)))
  let issue: string | null = null
  if (big && ends.length > 1) issue = `${slot}: ${big.cable.name || 'a cable'}'s ${steckConnector(show, big)} takes the whole slot`
  else if (ends.length > room) issue = `${slot} holds ${room} connectors; ${ends.length} are in it`
  if (!issue) return
  for (const p of list) p.issue ??= issue
}

// Filling a patch column down from one cell: the next ports on the same unit when it has
// a port list ("SB-SL · In 1" → In 2, In 3…), otherwise the next number or letter.
export function patchSeries(show: Show, text: string, count: number): string[] {
  const hit = gearMatcher(show.gear)(text)
  if (hit?.rest) {
    const ports = gearPorts(show, hit.gear)
    const found = ports.length ? findPort(ports, hit.rest) : null
    if (found?.port) {
      const next = portsAfter(ports, found).slice(0, count - 1)
      const lead = text.slice(0, text.length - text.trimStart().length)
      return [text, ...next.map((p) => `${lead}${hit.prefix}${p}`)]
    }
  }
  return textSeries(text, count)
}

// After a unit is renamed, rewrites the ends and patch points that linked to its old
// name ("Amp 1-A" becomes "Amp 1A-A") so they stay linked.
export function renameGearLinks(show: Show, gearId: string, oldName: string): Show {
  const unit = show.gear.find((g) => g.id === gearId)
  const name = unit?.name.trim() ?? ''
  const old = oldName.trim()
  if (!unit || !name || !old || name === old) return show
  const match = gearMatcher(show.gear.map((g) => (g.id === gearId ? { ...g, name: old } : g)))
  const swap = (text: string) => {
    if (match(text)?.gear.id !== gearId) return text
    const lead = text.length - text.trimStart().length
    return text.slice(0, lead) + name + text.slice(lead + old.length)
  }
  let changed = false
  const cables = show.cables.map((c) => {
    const from = swap(c.from)
    const to = swap(c.to)
    const tails = c.tails.map((t) => {
      const patchA = swap(t.patchA)
      const patchB = swap(t.patchB)
      return patchA === t.patchA && patchB === t.patchB ? t : { ...t, patchA, patchB }
    })
    if (from === c.from && to === c.to && tails.every((t, i) => t === c.tails[i])) return c
    changed = true
    return { ...c, from, to, tails }
  })
  return changed ? { ...show, cables } : show
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Copies of a unit, numbered on from the highest one already in the show: copying
// Amp 1 when Amp 2 exists makes Amp 3, Amp 4…. A name without a number gets " 2", " 3"….
export function copyGear(show: Show, gearId: string, count: number): Show {
  const index = show.gear.findIndex((g) => g.id === gearId)
  const unit = show.gear[index]
  const name = unit?.name.trim() ?? ''
  if (!unit || !name || count < 1) return show
  const match = name.match(/^(.*?)(\d+)$/)
  const prefix = match ? match[1] : `${name} `
  const width = match && match[2].startsWith('0') ? match[2].length : 0
  const series = new RegExp(`^${escapeRegExp(prefix.toLowerCase())}(\\d+)$`)
  let highest = match ? 0 : 1
  let last = index
  show.gear.forEach((g, i) => {
    const m = g.name.trim().toLowerCase().match(series)
    if (m) {
      highest = Math.max(highest, Number(m[1]))
      last = Math.max(last, i)
    }
  })
  const copies = Array.from({ length: count }, (_, i) => ({
    ...unit,
    id: newId(),
    name: `${prefix}${String(highest + i + 1).padStart(width, '0')}`,
    // Copies in a rack each get their own spot.
    rackU: null,
  }))
  const gear = [...show.gear]
  gear.splice(last + 1, 0, ...copies)
  return placeUnplaced({ ...show, gear }, unit.rackId ?? undefined)
}


// Gear in category order, with uncategorized gear last.
export function gearSections(show: Show, gear: Gear[] = show.gear): { category: GearCategory | null; gear: Gear[] }[] {
  const sections = show.gearCategories.map((category) => ({
    category: category as GearCategory | null,
    gear: gear.filter((g) => g.categoryId === category.id),
  }))
  sections.push({ category: null, gear: gear.filter((g) => !categoryById(show, g.categoryId)) })
  return sections.filter((s) => s.gear.length > 0)
}

// "Amp 1, Amp 2, Amp 3, Amp 5" → "Amp 1–3, Amp 5".
export function nameRuns(names: string[]): string {
  const sorted = [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
  const out: string[] = []
  let run: { prefix: string; first: string; end: number; endText: string } | null = null
  const flush = () => {
    if (run) out.push(run.first === `${run.prefix}${run.endText}` ? run.first : `${run.first}–${run.endText}`)
    run = null
  }
  for (const name of sorted) {
    const m = name.match(/^(.*?)(\d+)$/)
    if (run && m && m[1] === run.prefix && Number(m[2]) === run.end + 1) {
      run.end++
      run.endText = m[2]
      continue
    }
    flush()
    if (m) run = { prefix: m[1], first: name, end: Number(m[2]), endText: m[2] }
    else out.push(name)
  }
  flush()
  return out.join(', ')
}

export interface GearLine {
  key: string
  manufacturer: string
  model: string
  qty: number
  units: string
  notes: string
}

export interface GearListSection {
  category: GearCategory | null
  lines: GearLine[]
  qty: number
}

// The gear list: each category's gear totaled by manufacturer and model, in the order
// it was entered. Gear with no make or model is totaled by name.
// The racks themselves, counted by size: "2 × 12U rack". Which rack is which doesn't
// matter for the gear list.
function rackLines(show: Show): GearLine[] {
  const bySize = new Map<string, GearLine>()
  for (const rack of show.racks) {
    const key = `rack:${rack.size ?? ''}`
    const line = bySize.get(key) ?? {
      key,
      manufacturer: '',
      model: rack.size ? `${rack.size}U rack` : 'Rack, size not set',
      qty: 0,
      units: '',
      notes: '',
    }
    line.qty++
    bySize.set(key, line)
  }
  return [...bySize.values()].sort((a, b) => a.model.localeCompare(b.model, undefined, { numeric: true }))
}

export function gearList(show: Show): GearListSection[] {
  const sections = gearSectionLines(show)
  const racks = rackLines(show)
  if (!racks.length) return sections
  // Racks go under the Racks category (wherever it sits in the order), or last.
  const racksCategory = show.gearCategories.find((c) => c.name.trim().toLowerCase() === 'racks')
  const qty = racks.reduce((n, l) => n + l.qty, 0)
  const existing = racksCategory && sections.find((s) => s.category?.id === racksCategory.id)
  if (existing) {
    existing.lines = [...racks, ...existing.lines]
    existing.qty += qty
    return sections
  }
  const section = { category: racksCategory ?? { id: 'racks', name: 'Racks' }, lines: racks, qty }
  const at = racksCategory ? show.gearCategories.indexOf(racksCategory) : -1
  const index = at < 0 ? sections.length : sections.findIndex((s) => !s.category || show.gearCategories.indexOf(s.category) > at)
  sections.splice(index < 0 ? sections.length : index, 0, section)
  return sections
}

function gearSectionLines(show: Show): GearListSection[] {
  return gearSections(show).map(({ category, gear }) => {
    const lines = new Map<string, { line: GearLine; names: string[]; notes: Set<string> }>()
    for (const g of gear) {
      const manufacturer = g.manufacturer.trim()
      const model = g.model.trim()
      const key = manufacturer || model ? `${manufacturer}|${model}`.toLowerCase() : `name:${g.name.trim().toLowerCase()}`
      let entry = lines.get(key)
      if (!entry) {
        entry = {
          line: { key, manufacturer, model: model || (manufacturer ? '' : g.name.trim()), qty: 0, units: '', notes: '' },
          names: [],
          notes: new Set(),
        }
        lines.set(key, entry)
      }
      entry.line.qty += g.qty
      if (g.name.trim() && (manufacturer || model)) entry.names.push(g.name.trim())
      if (g.notes.trim()) entry.notes.add(g.notes.trim())
    }
    const done = [...lines.values()].map(({ line, names, notes }) => ({
      ...line,
      units: nameRuns(names),
      notes: [...notes].join('; '),
    }))
    return { category, lines: done, qty: done.reduce((n, l) => n + l.qty, 0) }
  })
}

export function gearListToCsv(show: Show): string {
  return toCsv([
    ['Category', 'Qty', 'Manufacturer', 'Model', 'Units', 'Notes'],
    ...gearList(show).flatMap(({ category, lines }) =>
      lines.map((l) => [category?.name ?? 'Uncategorized', String(l.qty), l.manufacturer, l.model, l.units, l.notes]),
    ),
  ])
}

// "Front", "Rear", "Front Left", "Rear R"… for the Side column.
function sideText(g: Gear): string {
  const side = g.rackSide === 'rear' ? 'Rear' : 'Front'
  return g.rackSlot ? `${side} ${g.rackSlot === 'left' ? 'Left' : 'Right'}` : side
}

function parseSide(text: string): Pick<Gear, 'rackSide' | 'rackSlot'> {
  const words = text.toLowerCase().split(/[\s,/-]+/)
  const has = (...w: string[]) => w.some((x) => words.includes(x))
  return {
    rackSide: has('rear', 'back') ? 'rear' : 'front',
    rackSlot: has('left', 'l') ? 'left' : has('right', 'r') ? 'right' : null,
  }
}

export const GEAR_HEADERS = ['Category', 'Name', 'Qty', 'Manufacturer', 'Model', 'Rack', 'Rack U', 'Side', 'Notes', 'Ports', 'RU']

// One row per entry, in the same columns import reads, so a list can go out to a
// spreadsheet and come back.
export function gearToCsv(show: Show): string {
  return toCsv([
    GEAR_HEADERS,
    ...gearSections(show).flatMap(({ category, gear }) =>
      gear.map((g) => [
        category?.name ?? '',
        g.name,
        String(g.qty),
        g.manufacturer,
        g.model,
        rackById(show, g.rackId)?.name ?? '',
        g.rackId && g.rackU != null ? String(g.rackU) : '',
        g.rackId ? sideText(g) : '',
        g.notes,
        gearModelOf(show, g)?.ports ?? '',
        String(gearRu(show, g) ?? ''),
      ]),
    ),
  ])
}

type GearField = 'category' | 'name' | 'qty' | 'manufacturer' | 'model' | 'rack' | 'rackU' | 'side' | 'notes' | 'ports' | 'ru'

// Header names other gear lists use for the same columns.
const HEADER_ALIASES: Record<GearField, string[]> = {
  category: ['category', 'categories', 'department', 'dept', 'section', 'group'],
  name: ['name', 'unit', 'unit name', 'label', 'id'],
  qty: ['qty', 'quantity', 'count', 'amount', '#'],
  manufacturer: ['manufacturer', 'make', 'brand', 'mfr', 'mfg', 'maker'],
  model: ['model', 'item', 'description', 'product', 'equipment', 'gear'],
  rack: ['rack', 'rack name'],
  rackU: ['rack u', 'u position', 'position', 'bottom u'],
  side: ['side', 'mount', 'rails'],
  notes: ['notes', 'note', 'comments', 'comment', 'remarks'],
  ports: ['ports', 'port list', 'i/o', 'io', 'connections'],
  ru: RU_HEADERS,
}

// A row from a gear CSV. A field is undefined when the file has no column for it, so
// importing a list without a Rack column doesn't clear racks.
export type GearRow = { [K in GearField]?: string }

export function gearRowsFromCsv(text: string): { rows: GearRow[]; warnings: string[] } {
  const all = parseCsv(text)
  if (all.length === 0) return { rows: [], warnings: ['The file is empty.'] }
  const header = all[0].map((h) => h.trim().toLowerCase())
  const columns = Object.fromEntries(
    (Object.keys(HEADER_ALIASES) as GearField[]).map((f) => [f, header.findIndex((h) => HEADER_ALIASES[f].includes(h))]),
  ) as Record<GearField, number>
  if (columns.name < 0 && columns.model < 0) {
    return { rows: [], warnings: ['No "Name" or "Model" column found.'] }
  }
  const warnings: string[] = []
  const rows: GearRow[] = []
  all.slice(1).forEach((r, i) => {
    const row: GearRow = {}
    for (const f of Object.keys(columns) as GearField[]) {
      if (columns[f] >= 0) row[f] = (r[columns[f]] ?? '').trim()
    }
    if (!row.name && !row.model && !row.manufacturer) {
      warnings.push(`Row ${i + 2}: no name or model, skipped.`)
      return
    }
    rows.push(row)
  })
  return { rows, warnings }
}

export interface GearImport {
  show: Show
  updated: number
  added: number
  newCategories: string[]
  newRacks: string[]
  warnings: string[]
}

// Merges a gear list into the show. A named row updates the unit with that name (so
// cables stay linked); an unnamed row updates the bulk line with the same make, model
// and category. Anything else is added. New categories and racks are created.
export function importGear(show: Show, rows: GearRow[]): GearImport {
  let next: Show = { ...show, gearCategories: [...show.gearCategories], gear: [...show.gear] }
  const newCategories: string[] = []
  const racksBefore = show.racks.length
  const warnings: string[] = []
  const seenNames = new Set<string>()
  let updated = 0
  let added = 0

  const categoryFor = (name: string): string | null => {
    if (!name) return null
    const found = next.gearCategories.find((c) => c.name.trim().toLowerCase() === name.toLowerCase())
    if (found) return found.id
    const category = { id: newId(), name }
    next.gearCategories.push(category)
    newCategories.push(name)
    return category.id
  }
  const rackFor = (name: string): string | null => {
    const result = ensureRack(next, name)
    next = result.show
    return result.rackId
  }

  rows.forEach((row, i) => {
    const name = row.name ?? ''
    if (name) {
      if (seenNames.has(name.toLowerCase())) {
        warnings.push(`"${name}" is in the file more than once; only the first was used.`)
        return
      }
      seenNames.add(name.toLowerCase())
    }
    const changes: Partial<Gear> = {}
    if (row.category !== undefined) changes.categoryId = categoryFor(row.category)
    if (row.manufacturer !== undefined) changes.manufacturer = row.manufacturer
    if (row.model !== undefined) changes.model = row.model
    if (row.rack !== undefined) changes.rackId = rackFor(row.rack)
    if (row.rackU !== undefined) {
      const u = Math.floor(Number(row.rackU))
      changes.rackU = u >= 1 ? u : null
    }
    if (row.side) Object.assign(changes, parseSide(row.side))
    if (row.notes !== undefined) changes.notes = row.notes
    if (row.qty !== undefined) {
      const qty = Math.floor(Number(row.qty))
      if (row.qty && !(qty >= 1)) warnings.push(`Row ${i + 2}: "${row.qty}" isn't a quantity, used 1.`)
      changes.qty = qty >= 1 ? qty : 1
    }
    const same = (a: string, b: string | undefined) => a.trim().toLowerCase() === (b ?? '').toLowerCase()
    const existing = name
      ? next.gear.findIndex((g) => same(g.name, name))
      : next.gear.findIndex(
          (g) =>
            !g.name.trim() &&
            same(g.manufacturer, row.manufacturer) &&
            same(g.model, row.model) &&
            (row.category === undefined || g.categoryId === changes.categoryId),
        )
    // A model the library knows fills in a missing manufacturer and category.
    let unit: Gear
    if (existing >= 0) {
      unit = fromLibrary(next, { ...next.gear[existing], ...changes })
      next.gear[existing] = unit
      updated++
    } else {
      unit = fromLibrary(next, newGear({ name, ...changes }))
      next.gear.push(unit)
      added++
    }
    // Blank Ports and RU cells leave the model's alone; lists often repeat a model.
    const ru = row.ru ? parseRu(row.ru) : null
    if (row.ru && ru == null) warnings.push(`Row ${i + 2}: "${row.ru}" isn't a rack size, skipped.`)
    if (row.ports || ru != null) {
      if (modelKey(unit.manufacturer, unit.model)) {
        next = setModelField(next, unit, { ...(row.ports ? { ports: row.ports } : {}), ...(ru != null ? { ru } : {}) })
      } else {
        warnings.push(`Row ${i + 2}: ports and rack size need a model to belong to, skipped.`)
      }
    }
  })

  return {
    // Racked gear without a spot from the file gets one.
    show: placeUnplaced(next),
    updated,
    added,
    newCategories,
    newRacks: next.racks.slice(racksBefore).map((r) => r.name),
    warnings,
  }
}
