import { normalizeShow } from '../show'
import type { Show, ShowInfo } from '../types'
import {
  applyPatch,
  composePatch,
  isEmptyPatch,
  ITEM_KINDS,
  LISTS,
  type Fields,
  type ItemKind,
  type ListKind,
  type Patch,
} from './patch'

// Keeping a shared show in step: your changes go up a few at a time, other people's come
// down as they happen, and the show you see is the shared one with your changes on top.
// Storage is behind `Backend`, so the same session runs on Firebase or on a stand-in.

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

export interface Backend {
  watchShow(cb: (data: { name: string; info: ShowInfo } | null) => void, onError: (e: Error) => void): () => void
  watchOrder(cb: (order: Partial<Record<ListKind, string[]>>) => void, onError: (e: Error) => void): () => void
  watchItems(kind: ItemKind, cb: (changes: ItemDoc[]) => void, onError: (e: Error) => void): () => void
  // Resolves once the server has the change (stays waiting while offline).
  commit(ops: WriteOp[]): Promise<void>
}

export interface SyncStatus {
  state: 'loading' | 'synced' | 'saving' | 'offline'
  // Changes sent but not yet confirmed.
  waiting: number
}

// An item written whole is marked, so a field change that lands after someone took the
// item out (and so brings back only that field) is ignored instead of showing up as a
// near-empty cable.
const WHOLE = '_whole'

// The writes for a change.
export function patchOps(patch: Patch): WriteOp[] {
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
    for (const [id, c] of Object.entries(patch.items?.[kind] ?? {})) {
      if (c.removed) ops.push({ target: 'item', kind, id, removed: true })
      else if (c.whole) ops.push({ target: 'item', kind, id, data: { ...c.set, ...(kind === 'checks' ? {} : { [WHOLE]: true }) }, whole: true })
      else if (c.set && Object.keys(c.set).length) ops.push({ target: 'item', kind, id, data: c.set, whole: false })
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
  // Sends what's waiting now (before the page closes, say).
  flush(): void
  close(): void
}

const SEND_AFTER_MS = 400
const SEND_AT_LEAST_EVERY_MS = 2000

export function openSession(
  backend: Backend,
  on: {
    // The show to display: the first time it's loaded, then whenever someone else changes it.
    show: (show: Show, first: boolean) => void
    status: (status: SyncStatus) => void
    // Lost access, the show was deleted, or a change was refused.
    error: (message: string) => void
  },
  isOnline: () => boolean = () => navigator.onLine,
): Session {
  let meta: { name: string; info: ShowInfo } | null = null
  let order: Partial<Record<ListKind, string[]>> | null = null
  const items = new Map<ItemKind, Map<string, Fields>>(ITEM_KINDS.map((k) => [k, new Map()]))
  const loaded = new Set<ItemKind>()
  let pending: Patch = {}
  // Sent, but not yet confirmed: still shown on top, so nothing flickers back meanwhile.
  const sent: Patch[] = []
  let first = true
  let closed = false
  // Something came in while changes were out; once they're confirmed, redraw without them.
  let cameIn = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let since = 0

  const ready = () => !!meta && !!order && ITEM_KINDS.every((k) => loaded.has(k))

  const status = () => {
    if (closed) return
    const busy = sent.length > 0 || !isEmptyPatch(pending)
    on.status({
      state: !ready() ? 'loading' : busy ? (isOnline() ? 'saving' : 'offline') : 'synced',
      waiting: sent.length,
    })
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
    for (const p of sent) show = applyPatch(show, p)
    show = applyPatch(show, pending)
    on.show(show, first)
    first = false
    status()
  }

  const fail = (e: Error) => {
    if (closed) return
    on.error(/permission/i.test(e.message) ? "You don't have access to this show anymore." : e.message)
  }

  const flush = () => {
    clearTimeout(timer)
    timer = undefined
    since = 0
    if (closed || isEmptyPatch(pending)) return
    const patch = pending
    pending = {}
    sent.push(patch)
    status()
    const done = () => {
      sent.splice(sent.indexOf(patch), 1)
      if (!sent.length && cameIn) {
        cameIn = false
        emit()
      }
      status()
    }
    backend.commit(patchOps(patch)).then(done, (e: Error) => {
      done()
      fail(e)
      // The refused change is gone from storage; show what's really there.
      emit()
    })
  }

  const unsubscribe = [
    backend.watchShow((data) => {
      if (!data) return on.error('This show was deleted, or you no longer have access to it.')
      meta = data
      emit()
    }, fail),
    backend.watchOrder((data) => {
      order = data
      emit()
    }, fail),
    ...ITEM_KINDS.map((kind) =>
      backend.watchItems(
        kind,
        (changes) => {
          const map = items.get(kind)!
          for (const { id, data } of changes) {
            // A field written after the item was taken out brings back a fragment; skip it.
            if (!data || (kind !== 'checks' && !data[WHOLE])) map.delete(id)
            else {
              const { [WHOLE]: _whole, ...fields } = data
              map.set(id, fields)
            }
          }
          loaded.add(kind)
          emit()
        },
        fail,
      ),
    ),
  ]
  status()

  const online = () => status()
  window.addEventListener('online', online)
  window.addEventListener('offline', online)

  return {
    push(patch) {
      if (closed || isEmptyPatch(patch)) return
      pending = composePatch(pending, patch)
      const now = Date.now()
      since ||= now
      clearTimeout(timer)
      // Sends after a pause in typing, and at least every couple of seconds during it.
      timer = setTimeout(flush, now - since > SEND_AT_LEAST_EVERY_MS ? 0 : SEND_AFTER_MS)
      status()
    },
    flush,
    close() {
      flush()
      closed = true
      for (const u of unsubscribe) u()
      window.removeEventListener('online', online)
      window.removeEventListener('offline', online)
    },
  }
}
