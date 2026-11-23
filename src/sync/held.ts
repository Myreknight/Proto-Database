import { newId } from '../ids'
import type { Held, HeldStore } from './session'

// Where a shared show's waiting changes are kept on this device: one entry per open copy
// (each window, for each account), so two windows don't overwrite each other's. A copy
// holds a lock on its entry while it's open; once it's closed (or crashed) the lock's
// free, and the next copy of the show to open takes the entry over.

const PREFIX = 'proto-database:held:'
// Without locks, an entry this old counts as left behind.
const LEFT_AFTER_MS = 2 * 60_000

// A field set to undefined means "take it off" (a checklist step unticked); JSON would
// drop it, so it's written as a marker.
const GONE = '__gone__'

const encode = (v: unknown) => JSON.stringify(v, (_k, x) => (x === undefined ? { [GONE]: 1 } : x))

function revive(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(revive)
  if (v && typeof v === 'object') {
    const keys = Object.keys(v)
    if (keys.length === 1 && keys[0] === GONE) return undefined
    const out: Record<string, unknown> = {}
    for (const k of keys) out[k] = revive((v as Record<string, unknown>)[k])
    return out
  }
  return v
}

function take(key: string): Held | null {
  try {
    const raw = localStorage.getItem(key)
    localStorage.removeItem(key)
    return raw ? ((revive(JSON.parse(raw)) as { held: Held }).held ?? null) : null
  } catch {
    return null
  }
}

function ageOf(key: string): number {
  try {
    const at = (JSON.parse(localStorage.getItem(key) ?? '{}') as { at?: number }).at
    return typeof at === 'number' ? Date.now() - at : Infinity
  } catch {
    return Infinity
  }
}

export function heldStore(showId: string, uid: string): HeldStore {
  const prefix = `${PREFIX}${showId}:${uid}:`
  const mine = `${prefix}${newId()}`
  const locks = typeof navigator !== 'undefined' && navigator.locks ? navigator.locks : null
  let release: (() => void) | null = null
  void locks?.request(mine, () => new Promise<void>((r) => (release = r))).catch(() => {})
  let last: string | null = null

  return {
    async adopt() {
      const keys: string[] = []
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)
          if (k && k.startsWith(prefix) && k !== mine) keys.push(k)
        }
      } catch {
        return []
      }
      const out: Held[] = []
      for (const k of keys) {
        const held = locks
          ? await locks.request(k, { ifAvailable: true }, (lock) => (lock ? take(k) : null)).catch(() => null)
          : ageOf(k) > LEFT_AFTER_MS
            ? take(k)
            : null
        if (held) out.push(held)
      }
      return out
    },
    save(held) {
      const text = held ? encode({ at: Date.now(), held }) : null
      // Saving the same thing again only moves the time on; skip it.
      if (text !== null && last !== null && text.slice(text.indexOf(',')) === last.slice(last.indexOf(','))) return true
      try {
        if (text === null) {
          if (last !== null) localStorage.removeItem(mine)
        } else localStorage.setItem(mine, text)
        last = text
        return true
      } catch {
        return false
      }
    },
    close() {
      release?.()
    },
  }
}
