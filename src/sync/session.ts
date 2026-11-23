import { normalizeShow } from '../show'
import type { Show, ShowInfo } from '../types'
import { getIn, merge3, type Path } from './merge'
import {
  applyFields,
  applyPatch,
  composePatch,
  isEmptyPatch,
  ITEM_KINDS,
  LISTS,
  sameValue,
  type Fields,
  type ItemKind,
  type ListKind,
  type Patch,
} from './patch'

// Keeping a shared show in step: your changes go up a few at a time, other people's come
// down as they happen, and the show you see is the shared one with your changes on top.
// Storage is behind `Backend`, so the same session runs on Firebase or on a stand-in.
//
// Changes wait here until the server can be reached, and each field you change remembers
// what it was when you changed it. If someone else changes it meanwhile, the two are put
// together (you changed one tail, they changed another: both stay), and where you both
// changed the same spot it's a conflict: theirs shows, and you pick which to keep.

// A change to one stored item: its fields, or all of it, or taken out.
export type WriteOp =
  | { target: 'show'; set: { name?: string; info?: ShowInfo } }
  | { target: 'order'; set: Partial<Record<ListKind, string[]>> }
  | { target: 'item'; kind: ItemKind; id: string; data: Fields; whole: boolean }
  | { target: 'item'; kind: ItemKind; id: string; removed: true }

export interface ItemDoc {
  id: string
  // null when it was taken out.
  data: Fields | null
}

// Each watcher also says whether what it has is up to date with the server (`fresh`), or
// only this device's copy (offline, or still connecting).
export interface Backend {
  watchShow(cb: (data: { name: string; info: ShowInfo } | null, fresh: boolean) => void, onError: (e: Error) => void): () => void
  watchOrder(cb: (order: Partial<Record<ListKind, string[]>>, fresh: boolean) => void, onError: (e: Error) => void): () => void
  watchItems(kind: ItemKind, cb: (changes: ItemDoc[], fresh: boolean) => void, onError: (e: Error) => void): () => void
  // Resolves once the server has the change.
  commit(ops: WriteOp[]): Promise<void>
}

export interface SyncStatus {
  // connecting: showing this device's copy while it reaches the server for the first time.
  state: 'loading' | 'connecting' | 'synced' | 'saving' | 'offline'
  // Changes sent but not yet confirmed.
  waiting: number
  // Changes made here that haven't reached the server yet.
  unsent: boolean
}

// Something you and someone else both changed before either saw the other's change.
export interface Conflict {
  key: string
  kind: ListKind | 'show'
  id: string
  // both: you both changed this spot. deleted: they took out something you'd changed.
  // edited: they changed something you'd taken out.
  type: 'both' | 'deleted' | 'edited'
  // The field, and the spot inside it ("tails", [3, "patchA"]); the show's own are
  // "name" and "info".
  field: string
  path: Path
  // both: your value there, and theirs. deleted: the item as you had it (theirs null).
  // edited: the item as you had it when you took it out, and as they have it now.
  mine: unknown
  theirs: unknown
  // Whose change it was (their account), when it's known.
  by: string | null
  // deleted: the item it came after in its list (null when it was first), to put it back.
  after?: string | null
}

// What each changed field was before you changed it, keyed "kind/id/field" (the show's
// own: "show//name"), and each changed item as it was ("kind/id"). Wrapped, so a field
// that wasn't there yet still counts.
export type Bases = Record<string, { v?: unknown }>

// Changes kept on this device until the server has them, so closing the page while
// offline loses nothing; the next copy of the show to open takes them over.
export interface Held {
  pending: Patch
  bases: Bases
  conflicts: Conflict[]
}

export interface HeldStore {
  // What copies of this show that have since closed left behind, each taken over once.
  adopt(): Promise<Held[]>
  // What this copy has waiting (null: nothing). False when it couldn't be kept.
  save(held: Held | null): boolean
  close(): void
}

export interface SessionOptions {
  // The account making changes, written on each item so others can see whose change it was.
  by?: string
  isOnline?: () => boolean
  store?: HeldStore
}

// An item written whole is marked, so a field change that lands after someone took the
// item out (and so brings back only that field) is ignored instead of showing up as a
// near-empty cable.
const WHOLE = '_whole'
// Who last wrote to an item.
const BY = '_by'

// The writes for a change.
export function patchOps(patch: Patch, by?: string): WriteOp[] {
  const ops: WriteOp[] = []
  if (patch.name !== undefined || patch.info !== undefined) {
    ops.push({
      target: 'show',
      set: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.info !== undefined ? { info: patch.info } : {}),
      },
    })
  }
  if (patch.order && Object.values(patch.order).some(Boolean)) ops.push({ target: 'order', set: patch.order })
  for (const kind of ITEM_KINDS) {
    const stamp = kind !== 'checks' && by ? { [BY]: by } : {}
    for (const [id, c] of Object.entries(patch.items?.[kind] ?? {})) {
      if (c.removed) ops.push({ target: 'item', kind, id, removed: true })
      else if (c.whole) ops.push({ target: 'item', kind, id, data: { ...c.set, ...(kind === 'checks' ? {} : { [WHOLE]: true }), ...stamp }, whole: true })
      else if (c.set && Object.keys(c.set).length) ops.push({ target: 'item', kind, id, data: { ...c.set, ...stamp }, whole: false })
    }
  }
  return ops
}

// The writes that put a whole show into empty storage.
export function showOps(show: Show): WriteOp[] {
  const items: Patch['items'] = {}
  for (const kind of LISTS) {
    items[kind] = Object.fromEntries((show[kind] as { id: string }[]).map(({ id, ...set }) => [id, { set, whole: true }]))
  }
  items.checks = Object.fromEntries(Object.entries(show.checks).map(([key, set]) => [key, { set, whole: true }]))
  const order = Object.fromEntries(LISTS.map((kind) => [kind, (show[kind] as { id: string }[]).map((x) => x.id)]))
  return patchOps({ name: show.name, info: show.info, order, items })
}

export interface Session {
  // A change made here, to send.
  push(patch: Patch): void
  // Sends what's waiting now (before the page closes, say), if the server can be reached.
  flush(): void
  // Conflicts decided: they go from the list. Keeping yours is a change of its own,
  // pushed like any other.
  resolve(keys: string[]): void
  close(): void
}

const SEND_AFTER_MS = 400
const SEND_AT_LEAST_EVERY_MS = 2000

const fieldKey = (kind: string, id: string, field: string) => `${kind}/${id}/${field}`
const itemKey = (kind: string, id: string) => `${kind}/${id}`
const conflictKey = (kind: string, id: string, field: string, path: Path) => `${kind}/${id}/${field}/${path.join('.')}`
const isList = (kind: ItemKind): kind is ListKind => kind !== 'checks'

export function openSession(
  backend: Backend,
  on: {
    // The show to display: the first time it's loaded, then whenever someone else changes it.
    show: (show: Show, first: boolean) => void
    status: (status: SyncStatus) => void
    // What's waiting for you to decide, whenever that changes.
    conflicts?: (list: Conflict[]) => void
    // Lost access, the show was deleted, or a change was refused.
    error: (message: string) => void
  },
  options: SessionOptions = {},
): Session {
  const { by, store } = options
  const isOnline = options.isOnline ?? (() => navigator.onLine)
  let meta: { name: string; info: ShowInfo } | null = null
  let order: Partial<Record<ListKind, string[]>> | null = null
  const items = new Map<ItemKind, Map<string, Fields>>(ITEM_KINDS.map((k) => [k, new Map()]))
  const loaded = new Set<ItemKind>()
  // Which watchers are up to date with the server.
  const fresh = new Set<string>()
  const WATCHERS = ['show', 'order', ...ITEM_KINDS]
  let pending: Patch = {}
  let bases: Bases = {}
  // Sent, but not yet confirmed: still shown on top, so nothing flickers back meanwhile.
  const sent: { patch: Patch; bases: Bases }[] = []
  let conflicts: Conflict[] = []
  let told: Conflict[] = conflicts
  let first = true
  let closed = false
  let everConnected = false
  // Changes left by an earlier copy are still being taken over; nothing goes up till then.
  let adopting = !!store
  // This device couldn't keep changes (storage full): they go to the backend's own queue.
  let cantHold = false
  // Something came in while changes were out; once they're confirmed, redraw without them.
  let cameIn = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let since = 0

  const ready = () => !!meta && !!order && ITEM_KINDS.every((k) => loaded.has(k))
  const connected = () => isOnline() && WATCHERS.every((w) => fresh.has(w))
  const unsent = () => sent.length > 0 || !isEmptyPatch(pending)

  const status = () => {
    if (closed) return
    on.status({
      state: !ready()
        ? 'loading'
        : !connected()
          ? everConnected || !isOnline()
            ? 'offline'
            : 'connecting'
          : unsent()
            ? 'saving'
            : 'synced',
      waiting: sent.length,
      unsent: unsent(),
    })
  }

  const tell = () => {
    if (closed || conflicts === told) return
    told = conflicts
    on.conflicts?.(conflicts)
  }

  // Keeps what's waiting on this device.
  const hold = () => {
    if (!store) return
    const all = [...sent.map((s) => s.patch), pending].reduce((a, p) => composePatch(a, p), {} as Patch)
    // The oldest base for a field is the one to keep.
    const allBases = Object.assign({}, bases, ...[...sent].reverse().map((s) => s.bases)) as Bases
    const nothing = isEmptyPatch(all) && !conflicts.length
    cantHold = !store.save(nothing ? null : { pending: all, bases: allBases, conflicts })
  }

  // The shared show as stored, in list order (anything the order doesn't name yet goes last).
  const assemble = (): Show => {
    const raw: Record<string, unknown> = { format: 'proto-database-show', formatVersion: 1, name: meta!.name, info: meta!.info }
    for (const kind of LISTS) {
      const map = items.get(kind)!
      const named = (order![kind] ?? []).filter((id) => map.has(id))
      const rest = [...map.keys()].filter((id) => !named.includes(id)).sort()
      raw[kind] = [...named, ...rest].map((id) => ({ ...map.get(id), id }))
    }
    raw.checks = Object.fromEntries(items.get('checks')!)
    return normalizeShow(raw)
  }

  const emit = () => {
    if (sent.length) cameIn = true
    if (closed || !ready()) return
    let show = assemble()
    for (const p of sent) show = applyPatch(show, p.patch)
    show = applyPatch(show, pending)
    on.show(show, first)
    first = false
    status()
    tell()
  }

  // An item as stored, with the changes on their way applied: what a change made now starts from.
  const itemNow = (kind: ListKind, id: string): Fields | null => {
    let item: Fields | null = items.get(kind)!.get(id) ?? null
    for (const { patch } of sent) {
      const c = patch.items?.[kind]?.[id]
      if (!c) continue
      if (c.removed) item = null
      else if (c.whole) item = { ...c.set }
      else if (item) item = applyFields(item, c.set ?? {})
    }
    return item
  }

  const showNow = (field: 'name' | 'info'): unknown => {
    let v: unknown = meta?.[field]
    for (const { patch } of sent) if (patch[field] !== undefined) v = patch[field]
    return v
  }

  // Remembers what each field a change touches was before it (the first time only).
  const noteBases = (patch: Patch) => {
    const note = (key: string, v: unknown) => {
      if (!(key in bases)) bases[key] = { v }
    }
    if (patch.name !== undefined) note(fieldKey('show', '', 'name'), showNow('name'))
    if (patch.info !== undefined) note(fieldKey('show', '', 'info'), showNow('info'))
    for (const kind of LISTS) {
      for (const [id, c] of Object.entries(patch.items?.[kind] ?? {})) {
        if (c.whole) continue
        const item = itemNow(kind, id)
        note(itemKey(kind, id), item)
        if (!c.removed) for (const field of Object.keys(c.set ?? {})) note(fieldKey(kind, id, field), item?.[field])
      }
    }
  }

  const raise = (c: Omit<Conflict, 'key'>) => {
    const key = conflictKey(c.kind, c.id, c.field, c.path)
    conflicts = [...conflicts.filter((x) => x.key !== key), { ...c, key }]
  }

  // Takes an item's change out of what's waiting.
  const drop = (kind: ListKind, id: string) => {
    const list = { ...pending.items?.[kind] }
    delete list[id]
    pending = { ...pending, items: { ...pending.items, [kind]: list } }
    const k = itemKey(kind, id)
    for (const key of Object.keys(bases)) if (key === k || key.startsWith(`${k}/`)) delete bases[key]
  }

  // Where an item sits in its list: the one before it that's still there (null: first).
  const placeOf = (kind: ListKind, id: string): string | null | undefined => {
    const ids = order?.[kind] ?? []
    const at = ids.indexOf(id)
    if (at < 0) return undefined
    for (let i = at - 1; i >= 0; i--) if (items.get(kind)!.has(ids[i])) return ids[i]
    return null
  }

  // Conflicts already raised about an item follow what they now have; one that's settled
  // itself (they've come round to yours, or the item's back) goes.
  const follow = (kind: ListKind | 'show', id: string, data: Fields | null, who: string | null) => {
    let changed = false
    const next = conflicts.flatMap((c) => {
      if (c.kind !== kind || c.id !== id) return [c]
      if (c.type === 'deleted') {
        if (!data) return [c]
        changed = true
        return []
      }
      if (c.type === 'edited') {
        if (data && sameValue(data, { ...(c.theirs as Fields), id: undefined })) return [c]
        changed = true
        return data ? [{ ...c, theirs: { ...data, id }, by: who ?? c.by }] : []
      }
      if (!data) {
        changed = true
        return []
      }
      const theirs = getIn(data[c.field], c.path)
      if (sameValue(theirs, c.theirs)) return [c]
      changed = true
      return sameValue(theirs, c.mine) ? [] : [{ ...c, theirs, by: who ?? c.by }]
    })
    if (changed) conflicts = next
  }

  // A field you've changed, now that theirs has come in: the two put together, with what
  // clashed raised. Returns your value to send, or undefined when theirs is all there is.
  const combine = (kind: ListKind | 'show', id: string, field: string, mine: unknown, theirs: unknown, who: string | null) => {
    const k = fieldKey(kind, id, field)
    if (!(k in bases)) return { keep: true, value: mine }
    const base = bases[k].v
    if (sameValue(theirs, base)) return { keep: true, value: mine }
    bases[k] = { v: theirs }
    const m = merge3(base, mine, theirs)
    for (const clash of m.clashes) raise({ type: 'both', kind, id, field, path: clash.path, mine: clash.mine, theirs: clash.theirs, by: who })
    return sameValue(m.value, theirs) ? { keep: false, value: undefined } : { keep: true, value: m.value }
  }

  // Someone else's version of an item has come in (null: they took it out). Checked
  // against what you've changed and not sent yet.
  const incoming = (kind: ListKind, id: string, data: Fields | null, who: string | null) => {
    follow(kind, id, data, who)
    const c = pending.items?.[kind]?.[id]
    if (!c || c.whole) return
    const base = bases[itemKey(kind, id)]
    if (!data) {
      // Both took it out: nothing to send. Otherwise they took out what you'd changed.
      if (!c.removed && base?.v) {
        raise({ type: 'deleted', kind, id, field: '', path: [], mine: { ...applyFields(base.v as Fields, c.set ?? {}), id }, theirs: null, by: null, after: placeOf(kind, id) })
      }
      drop(kind, id)
      return
    }
    if (c.removed) {
      if (base && !sameValue(base.v, data)) {
        raise({ type: 'edited', kind, id, field: '', path: [], mine: { ...(base.v as Fields), id }, theirs: { ...data, id }, by: who })
        drop(kind, id)
      }
      return
    }
    const set: Fields = {}
    for (const [field, mine] of Object.entries(c.set ?? {})) {
      const r = combine(kind, id, field, mine, data[field], who)
      if (r.keep) set[field] = r.value
      else delete bases[fieldKey(kind, id, field)]
    }
    // The item as they have it is what the rest of your change now sits on.
    bases[itemKey(kind, id)] = { v: data }
    if (Object.keys(set).length) pending = { ...pending, items: { ...pending.items, [kind]: { ...pending.items![kind], [id]: { set } } } }
    else drop(kind, id)
  }

  const incomingShow = (data: { name: string; info: ShowInfo }) => {
    follow('show', '', data as unknown as Fields, null)
    for (const field of ['name', 'info'] as const) {
      if (pending[field] === undefined) continue
      const r = combine('show', '', field, pending[field], data[field], null)
      const next: Patch = { ...pending }
      if (r.keep) Object.assign(next, { [field]: r.value })
      else {
        delete next[field]
        delete bases[fieldKey('show', '', field)]
      }
      pending = next
    }
  }

  // Everything waiting, checked against what's stored now (after taking over changes from
  // an earlier copy, or once a list first loads): anything taken out meanwhile shows up here.
  const recheck = (kind: ListKind) => {
    if (!loaded.has(kind)) return
    const map = items.get(kind)!
    for (const id of Object.keys(pending.items?.[kind] ?? {})) incoming(kind, id, map.get(id) ?? null, null)
  }

  const fail = (e: Error) => {
    if (closed) return
    on.error(/permission/i.test(e.message) ? "You don't have access to this show anymore." : e.message)
  }

  const schedule = (ms: number) => {
    clearTimeout(timer)
    timer = setTimeout(flush, ms)
  }

  // A watcher's news about the connection; back in touch, what's waiting goes up.
  const reach = (watcher: string, isFresh: boolean) => {
    const was = connected()
    if (isFresh) fresh.add(watcher)
    else fresh.delete(watcher)
    if (connected()) everConnected = true
    if (!was && connected() && !isEmptyPatch(pending)) schedule(0)
    if (was !== connected()) status()
  }

  function flush() {
    clearTimeout(timer)
    timer = undefined
    since = 0
    if (closed || isEmptyPatch(pending)) return
    // Out of touch: changes stay here until the server's caught up, so they can be checked
    // against what others did meanwhile.
    if (adopting || (!connected() && !cantHold)) {
      hold()
      return status()
    }
    const entry = { patch: pending, bases }
    pending = {}
    bases = {}
    sent.push(entry)
    hold()
    status()
    const done = () => {
      sent.splice(sent.indexOf(entry), 1)
      hold()
      if (!sent.length && cameIn) {
        cameIn = false
        emit()
      }
      status()
    }
    backend.commit(patchOps(entry.patch, by)).then(done, (e: Error) => {
      done()
      fail(e)
      // The refused change is gone from storage; show what's really there.
      emit()
    })
  }

  const unsubscribe = [
    backend.watchShow((data, isFresh) => {
      // Nothing on this device yet: wait for the server before calling it gone.
      if (!data && !isFresh) return reach('show', false)
      if (!data) return on.error('This show was deleted, or you no longer have access to it.')
      if (!sameValue(data, meta)) {
        incomingShow(data)
        meta = data
        emit()
      }
      reach('show', isFresh)
    }, fail),
    backend.watchOrder((data, isFresh) => {
      if (!sameValue(data, order)) {
        order = data
        emit()
      }
      reach('order', isFresh)
    }, fail),
    ...ITEM_KINDS.map((kind) =>
      backend.watchItems(
        kind,
        (changes, isFresh) => {
          const firstLoad = !loaded.has(kind)
          if (changes.length || firstLoad) {
            const map = items.get(kind)!
            for (const { id, data } of changes) {
              // A field written after the item was taken out brings back a fragment; it counts as gone.
              let fields: Fields | null = null
              let who: string | null = null
              if (data && (kind === 'checks' || data[WHOLE])) {
                const { [WHOLE]: _whole, [BY]: writer, ...rest } = data
                fields = rest
                who = typeof writer === 'string' ? writer : null
              }
              if (isList(kind)) incoming(kind, id, fields, who)
              if (fields) map.set(id, fields)
              else map.delete(id)
            }
            loaded.add(kind)
            if (firstLoad && isList(kind)) recheck(kind)
            hold()
            emit()
          }
          reach(kind, isFresh)
        },
        fail,
      ),
    ),
  ]
  status()

  if (store) {
    void store.adopt().then(
      (list) => {
        for (const h of list) {
          pending = composePatch(h.pending, pending)
          // Theirs are older, so they're what those changes started from.
          bases = { ...bases, ...h.bases }
          for (const c of h.conflicts) if (!conflicts.some((x) => x.key === c.key)) conflicts = [...conflicts, c]
        }
        adopting = false
        if (list.length) {
          if (meta) incomingShow(meta)
          for (const kind of LISTS) recheck(kind)
          hold()
          emit()
        }
        if (connected() && !isEmptyPatch(pending)) schedule(0)
      },
      () => {
        adopting = false
      },
    )
  }

  const online = () => {
    status()
    if (connected() && !isEmptyPatch(pending)) schedule(0)
  }
  window.addEventListener('online', online)
  window.addEventListener('offline', online)

  // A change touches a conflict when it sets that spot to something new (you've decided
  // by changing it), or puts back or takes out the item it's about.
  const settles = (patch: Patch, c: Conflict): boolean => {
    if (c.kind === 'show') {
      const v = c.field === 'name' ? patch.name : c.field === 'info' ? patch.info : undefined
      return v !== undefined && !sameValue(getIn(v, c.path), c.theirs)
    }
    const ch = patch.items?.[c.kind]?.[c.id]
    if (!ch) return false
    if (c.type === 'deleted') return !!ch.whole
    if (ch.removed) return true
    if (c.type === 'edited' || !ch.set || !(c.field in ch.set)) return false
    return !sameValue(getIn(ch.set[c.field], c.path), c.theirs)
  }

  return {
    push(patch) {
      if (closed || isEmptyPatch(patch)) return
      noteBases(patch)
      pending = composePatch(pending, patch)
      if (conflicts.some((c) => settles(patch, c))) conflicts = conflicts.filter((c) => !settles(patch, c))
      hold()
      tell()
      const now = Date.now()
      since ||= now
      // Sends after a pause in typing, and at least every couple of seconds during it.
      schedule(now - since > SEND_AT_LEAST_EVERY_MS ? 0 : SEND_AFTER_MS)
      status()
    },
    flush,
    resolve(keys) {
      const drop = new Set(keys)
      if (!conflicts.some((c) => drop.has(c.key))) return
      conflicts = conflicts.filter((c) => !drop.has(c.key))
      hold()
      tell()
    },
    close() {
      flush()
      hold()
      closed = true
      store?.close()
      for (const u of unsubscribe) u()
      window.removeEventListener('online', online)
      window.removeEventListener('offline', online)
    },
  }
}
