import { gearLabel } from '../gear'
import { ROLES, SCHEDULE, type Gear, type Show, type ShowInfo } from '../types'
import { setIn } from './merge'
import { sameValue } from './patch'
import type { Conflict } from './session'

// Conflicts in words, and what keeping your side of one does to the show. Keeping theirs
// does nothing: theirs is what's showing already.

// Your side of a conflict, put back: the spot set to yours, the item you'd changed put
// back where it was, or the item you'd taken out taken out again.
export function keepMine(show: Show, c: Conflict): Show {
  if (c.kind === 'show') {
    if (c.field === 'name') return { ...show, name: String(c.mine ?? '') }
    return { ...show, info: setIn(show.info, c.path, c.mine) as ShowInfo }
  }
  const list = show[c.kind] as { id: string }[]
  if (c.type === 'edited') return { ...show, [c.kind]: list.filter((x) => x.id !== c.id) }
  if (c.type === 'deleted') {
    if (list.some((x) => x.id === c.id)) return show
    const after = c.after === undefined ? -1 : c.after === null ? 0 : list.findIndex((x) => x.id === c.after) + 1
    const at = after <= 0 && c.after !== null ? list.length : after
    const next = [...list]
    next.splice(at, 0, { ...(c.mine as object), id: c.id })
    return { ...show, [c.kind]: next }
  }
  return {
    ...show,
    [c.kind]: list.map((x) =>
      x.id === c.id ? { ...x, [c.field]: setIn((x as Record<string, unknown>)[c.field], c.path, c.mine) } : x,
    ),
  }
}

const KINDS: Record<string, string> = {
  cables: 'Cable',
  bundles: 'Bundle',
  racks: 'Rack',
  gear: 'Gear',
  gearModels: 'Model',
  cableTypes: 'Cable type',
  gearCategories: 'Gear category',
  show: 'Show',
}

const FIELDS: Record<string, string> = {
  name: 'Name',
  typeId: 'Cable type',
  tailATypeId: 'Tail A type',
  tailBTypeId: 'Tail B type',
  deployment: 'Use',
  bundleId: 'Bundle',
  rackId: 'Rack',
  from: 'From',
  to: 'To',
  segments: 'Pieces',
  tails: 'Tails',
  color: 'Color',
  flagEnd: 'Flagged end',
  steckA: 'Steck at A',
  steckB: 'Steck at B',
  steckAAt: 'Steck A at',
  steckBAt: 'Steck B at',
  linkId: 'Linked cables',
  linkOrder: 'Place in the link',
  notes: 'Notes',
  length: 'Length',
  extension: 'Extension',
  number: 'Number',
  patchA: 'Patch A',
  patchB: 'Patch B',
  location: 'Location',
  size: 'Size',
  categoryId: 'Category',
  manufacturer: 'Manufacturer',
  model: 'Model',
  qty: 'Quantity',
  rackU: 'Rack unit',
  rackSide: 'Rails',
  rackSlot: 'Side',
  steck: 'Steck rail',
  generic: 'Generic connectors',
  ru: 'Height (RU)',
  host: 'Card slot',
  halfWidth: 'Half width',
  slots: 'Card slots',
  card: 'Is a card for',
  cardNumbering: 'Card numbering',
  ports: 'Ports',
  part: 'Part',
  channels: 'Channels',
  endA: 'End A',
  endB: 'End B',
  lengths: 'Lengths',
  venue: 'Venue',
  dates: 'Schedule',
  start: 'Start',
  end: 'End',
  logo: 'Logo',
  team: 'Audio team',
  hiddenRoles: 'Roles turned off',
  customRoles: 'Added roles',
  label: 'Role',
  names: 'Names',
  listId: 'List',
  gearLists: 'Gear lists',
  ...Object.fromEntries(ROLES.map((r) => [r.id, r.label])),
  ...Object.fromEntries(SCHEDULE.map((d) => [d.id, d.label])),
}

const humanize = (key: string) => {
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const ITEMS_IN: Record<string, string> = { tails: 'Tail', segments: 'Piece', customRoles: 'Role', lengths: 'Length' }

// "Cable “SL Mic 3”"
export function recordLabel(show: Show, c: Conflict): string {
  if (c.kind === 'show') return 'Show'
  const item =
    ((show[c.kind] as { id: string }[]).find((x) => x.id === c.id) as Record<string, unknown> | undefined) ??
    ((c.mine ?? c.theirs) as Record<string, unknown> | null) ??
    {}
  const name =
    c.kind === 'gear'
      ? gearLabel(item as unknown as Gear)
      : c.kind === 'gearModels'
        ? [item.manufacturer, item.model].filter(Boolean).join(' ')
        : String(item.name ?? '')
  return `${KINDS[c.kind] ?? humanize(c.kind)} “${name.trim() || 'unnamed'}”`
}

// "Tail 4 · Patch A", "Venue"
export function spotLabel(c: Conflict): string {
  if (c.type !== 'both') return ''
  const keys = c.kind === 'show' && c.field === 'info' ? c.path : [c.field, ...c.path]
  const parts: string[] = []
  keys.forEach((key, i) => {
    if (typeof key === 'number') {
      const parent = String(keys[i - 1] ?? '')
      const name = `${ITEMS_IN[parent] ?? '#'}${ITEMS_IN[parent] ? ' ' : ''}${key + 1}`
      // "Tails · Tail 4" reads twice; the item says it.
      if (ITEMS_IN[parent] && parts.length) parts[parts.length - 1] = name
      else parts.push(name)
    } else parts.push(FIELDS[key] ?? humanize(key))
  })
  return parts.join(' · ') || (c.kind === 'show' ? 'Show info' : '')
}

const idNames: Record<string, keyof Show> = {
  typeId: 'cableTypes',
  tailATypeId: 'cableTypes',
  tailBTypeId: 'cableTypes',
  bundleId: 'bundles',
  rackId: 'racks',
  categoryId: 'gearCategories',
  gearId: 'gear',
}

function nameOf(show: Show, kind: keyof Show, id: string): string {
  const item = (show[kind] as { id: string; name?: string }[]).find((x) => x.id === id)
  if (!item) return '(one that’s gone)'
  return kind === 'gear' ? gearLabel(item as Gear) : item.name?.trim() || 'unnamed'
}

const clip = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

// What they changed in something you'd taken out: "Notes: moved".
export function theirChanges(show: Show, c: Conflict): string[] {
  if (c.type !== 'edited' || !c.mine || !c.theirs) return []
  const mine = c.mine as Record<string, unknown>
  const theirs = c.theirs as Record<string, unknown>
  return Object.keys(theirs)
    .filter((k) => k !== 'id' && !sameValue(mine[k], theirs[k]))
    .map((k) => `${FIELDS[k] ?? humanize(k)}: ${describe(show, theirs[k], k)}`)
}

// One side of a conflict, in words.
export function valueText(show: Show, c: Conflict, v: unknown): string {
  const keys = [c.field, ...c.path].filter((k): k is string => typeof k === 'string')
  return describe(show, v, keys[keys.length - 1] ?? '')
}

function describe(show: Show, v: unknown, key: string): string {
  if (v === undefined || v === null || v === '') return '(blank)'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'number') return key === 'length' ? `${v}'` : String(v)
  if (typeof v === 'string') {
    if (key === 'listId') return show.info.gearLists.find((l) => l.id === v)?.name.trim() || '(a list that’s gone)'
    if (idNames[key]) return nameOf(show, idNames[key], v)
    if (v.startsWith('data:image')) return 'a logo image'
    return clip(v)
  }
  if (Array.isArray(v)) {
    if (!v.length) return '(none)'
    if (key === 'tails') {
      const list = v as { number?: number; name?: string }[]
      const named = list.map((t, i) => `${t.number ?? i + 1}${t.name ? ` ${t.name}` : ''}`)
      return clip(`${list.length} tail${list.length === 1 ? '' : 's'}: ${named.join(', ')}`)
    }
    if (key === 'segments') return (v as { length?: number | null }[]).map((p) => (p.length != null ? `${p.length}'` : '?')).join(' + ')
    if (v.every((x) => typeof x !== 'object' || x === null)) return clip(v.map((x) => describe(show, x, key)).join(', '))
    return clip(v.map((x) => describe(show, x, key)).join('; '))
  }
  if (typeof v === 'object') {
    const parts = Object.entries(v as Record<string, unknown>)
      .filter(([k, x]) => k !== 'id' && x !== null && x !== undefined && x !== '' && !(Array.isArray(x) && !x.length))
      .map(([k, x]) => `${FIELDS[k] ?? humanize(k)}: ${describe(show, x, k)}`)
    return clip(parts.join(' · ') || '(blank)')
  }
  return clip(String(v))
}
