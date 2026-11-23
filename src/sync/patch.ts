import type { Show, ShowInfo } from '../types'

// A change to a show, field by field: what's different about each cable, bundle, rack,
// gear unit, model, cable type and checklist entry, plus the show's name and info and the
// order of its lists. Undo, and syncing a shared show, both work in these, so a change
// only ever touches the fields it changed and leaves everyone else's edits alone.

export const LISTS = ['cableTypes', 'cables', 'bundles', 'racks', 'gearCategories', 'gear', 'gearModels'] as const
export type ListKind = (typeof LISTS)[number]
// Checklist entries are keyed, not listed; everything else has an id and a place in a list.
export type ItemKind = ListKind | 'checks'
export const ITEM_KINDS: ItemKind[] = [...LISTS, 'checks']

export type Fields = Record<string, unknown>

export interface ItemChange {
  // Fields to set; a field set to undefined is taken off (a checklist step unticked).
  set?: Fields
  // `set` is the whole item: a new one, or one brought back by undo.
  whole?: boolean
  removed?: boolean
}

export interface Patch {
  name?: string
  info?: ShowInfo
  // A list's ids in order, when items were added or moved.
  order?: Partial<Record<ListKind, string[]>>
  items?: Partial<Record<ItemKind, Record<string, ItemChange>>>
}

// Deep equality for plain data, ignoring key order.
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    const bb = b as unknown[]
    return a.length === bb.length && a.every((v, i) => sameValue(v, bb[i]))
  }
  const ao = a as Fields
  const bo = b as Fields
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)])
  for (const k of keys) if (!sameValue(ao[k], bo[k])) return false
  return true
}

// An item's fields without its id (the id is its key).
function fieldsOf(item: object): Fields {
  const { id: _id, ...rest } = item as Fields
  return rest
}

// The fields that differ between two versions of an item, or null.
function fieldChanges(before: object, after: object): Fields | null {
  const a = before as Fields
  const b = after as Fields
  let set: Fields | null = null
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (key === 'id' || sameValue(a[key], b[key])) continue
    set ??= {}
    set[key] = b[key]
  }
  return set
}

// Items of a kind, by id.
function itemsOf(show: Show, kind: ItemKind): Map<string, object> {
  if (kind === 'checks') return new Map(Object.entries(show.checks))
  return new Map((show[kind] as { id: string }[]).map((item) => [item.id, item]))
}

export function isEmptyPatch(p: Patch): boolean {
  return (
    p.name === undefined &&
    p.info === undefined &&
    !Object.values(p.order ?? {}).some(Boolean) &&
    !Object.values(p.items ?? {}).some((c) => c && Object.keys(c).length > 0)
  )
}

// What changed from one version of a show to the next. Items that are the same object
// in both are skipped, so a change to one cable compares one cable.
export function diffShows(a: Show, b: Show): Patch {
  const patch: Patch = {}
  if (a.name !== b.name) patch.name = b.name
  if (a.info !== b.info && !sameValue(a.info, b.info)) patch.info = b.info
  for (const kind of ITEM_KINDS) {
    const listed = kind !== 'checks'
    if (listed ? a[kind] === b[kind] : a.checks === b.checks) continue
    const before = itemsOf(a, kind)
    const after = itemsOf(b, kind)
    const changes: Record<string, ItemChange> = {}
    let added = false
    for (const [id, item] of after) {
      const prev = before.get(id)
      if (prev === item) continue
      if (!prev) {
        changes[id] = { set: fieldsOf(item), whole: true }
        added = true
        continue
      }
      const set = fieldChanges(prev, item)
      if (set) changes[id] = { set }
    }
    for (const id of before.keys()) if (!after.has(id)) changes[id] = { removed: true }
    if (Object.keys(changes).length) (patch.items ??= {})[kind] = changes
    // The order only needs saying when items were added or moved; one taken out just goes.
    if (listed) {
      const ids = [...after.keys()]
      const kept = [...before.keys()].filter((id) => after.has(id))
      const moved = ids.filter((id) => before.has(id)).some((id, i) => id !== kept[i])
      if (added || moved) (patch.order ??= {})[kind as ListKind] = ids
    }
  }
  return patch
}

export function applyFields<T extends object>(item: T, set: Fields): T {
  const next = { ...(item as Fields) }
  for (const [key, value] of Object.entries(set)) {
    if (value === undefined) delete next[key]
    else next[key] = value
  }
  return next as T
}

// Puts a list in the given order; anything the order doesn't name goes after, as it was.
function reorder<T extends { id: string }>(list: T[], order: string[]): T[] {
  const at = new Map(order.map((id, i) => [id, i]))
  return list
    .map((item, i) => ({ item, key: at.get(item.id) ?? order.length + i }))
    .sort((x, y) => x.key - y.key)
    .map((x) => x.item)
}

// A show with a change applied. A field change for an item that isn't there (someone
// else took it out) is skipped; a whole item is added at the end of its list.
export function applyPatch(show: Show, patch: Patch): Show {
  if (isEmptyPatch(patch)) return show
  const next: Show = { ...show }
  if (patch.name !== undefined) next.name = patch.name
  if (patch.info !== undefined) next.info = patch.info
  for (const kind of LISTS) {
    const changes = patch.items?.[kind]
    const order = patch.order?.[kind]
    if (!changes && !order) continue
    let list = show[kind] as { id: string }[]
    if (changes) {
      const seen = new Set<string>()
      list = list.flatMap((item) => {
        const c = changes[item.id]
        if (!c) return [item]
        seen.add(item.id)
        if (c.removed) return []
        if (c.whole) return [{ ...(c.set ?? {}), id: item.id }]
        return [applyFields(item, c.set ?? {})]
      })
      for (const [id, c] of Object.entries(changes)) {
        if (!seen.has(id) && c.whole && !c.removed) list = [...list, { ...(c.set ?? {}), id }]
      }
    }
    if (order) list = reorder(list, order)
    ;(next as unknown as Record<string, unknown>)[kind] = list
  }
  const checks = patch.items?.checks
  if (checks) {
    const map = { ...show.checks }
    for (const [key, c] of Object.entries(checks)) {
      if (c.removed) delete map[key]
      else if (c.whole) map[key] = { ...(c.set ?? {}) }
      else map[key] = applyFields(map[key] ?? {}, c.set ?? {})
    }
    next.checks = map
  }
  return next
}

// The change that undoes `patch`, given the show it was applied to.
export function invertPatch(before: Show, patch: Patch): Patch {
  const inv: Patch = {}
  if (patch.name !== undefined) inv.name = before.name
  if (patch.info !== undefined) inv.info = before.info
  // Putting items back (undoing a removal) needs the old order, so they land where they were.
  for (const kind of LISTS) {
    const removes = Object.values(patch.items?.[kind] ?? {}).some((c) => c.removed)
    if (patch.order?.[kind] || removes) (inv.order ??= {})[kind] = (before[kind] as { id: string }[]).map((x) => x.id)
  }
  for (const kind of ITEM_KINDS) {
    const changes = patch.items?.[kind]
    if (!changes) continue
    const items = itemsOf(before, kind)
    const out: Record<string, ItemChange> = {}
    for (const [id, c] of Object.entries(changes)) {
      const prev = items.get(id)
      if (c.removed || c.whole) {
        out[id] = prev ? { set: fieldsOf(prev), whole: true } : { removed: true }
      } else if (prev) {
        const set: Fields = {}
        for (const key of Object.keys(c.set ?? {})) set[key] = (prev as Fields)[key]
        out[id] = { set }
      }
    }
    if (Object.keys(out).length) (inv.items ??= {})[kind] = out
  }
  return inv
}

// One change that does `first`, then `second`.
export function composePatch(first: Patch, second: Patch): Patch {
  const out: Patch = { ...first }
  if (second.name !== undefined) out.name = second.name
  if (second.info !== undefined) out.info = second.info
  if (second.order) out.order = { ...first.order, ...second.order }
  for (const kind of ITEM_KINDS) {
    const b = second.items?.[kind]
    if (!b) continue
    const merged: Record<string, ItemChange> = { ...first.items?.[kind] }
    for (const [id, c2] of Object.entries(b)) {
      const c1 = merged[id]
      if (!c1 || c2.removed || c2.whole) merged[id] = c2
      else if (c1.removed) continue
      else merged[id] = { ...c1, set: { ...c1.set, ...c2.set } }
    }
    out.items = { ...out.items, [kind]: merged }
  }
  return out
}
