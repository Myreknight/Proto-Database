import type { User } from 'firebase/auth'
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { newId } from '../ids'
import { cloud } from './firebase'

// Who has a shared show open. Firestore can't tell when someone drops off, so each open
// copy checks in now and then (shows/{id}/presence/{uid}_{session}), saying which tab
// it's on; anyone who's checked in lately counts as here. Closing the page takes you off
// at once; losing the connection takes you off once your check-ins stop.

export const CHECK_IN_MS = 2 * 60_000
// A little over two check-ins, so one late check-in doesn't drop someone.
export const HERE_MS = 5 * 60_000

export interface Presence {
  id: string
  uid: string
  name: string
  email: string
  // What they're looking at ("Cables", "Racks"…).
  tab: string
  seen: Date | null
}

const presenceRef = (showId: string) => collection(cloud().db, 'shows', showId, 'presence')

// One open copy of the app. Each window gets its own, so someone with two windows open
// still shows as here when they close one.
export const sessionId = (user: User) => `${user.uid}_${newId()}`

export function watchPresence(showId: string, cb: (list: Presence[]) => void, onError: (e: Error) => void) {
  return onSnapshot(
    presenceRef(showId),
    (snap) =>
      cb(
        snap.docs.map((d) => {
          // A check-in still on its way counts as now.
          const data = d.data({ serverTimestamps: 'estimate' })
          const seen = data.seen as { toDate?: () => Date } | undefined
          return {
            id: d.id,
            uid: String(data.uid ?? ''),
            name: String(data.name ?? ''),
            email: String(data.email ?? ''),
            tab: String(data.tab ?? ''),
            seen: seen?.toDate ? seen.toDate() : null,
          }
        }),
      ),
    onError,
  )
}

export async function checkIn(showId: string, session: string, user: User, tab: string): Promise<void> {
  await setDoc(doc(presenceRef(showId), session), {
    uid: user.uid,
    name: user.displayName ?? '',
    email: user.email ?? '',
    tab,
    seen: serverTimestamp(),
  })
}

export async function checkOut(showId: string, session: string): Promise<void> {
  await deleteDoc(doc(presenceRef(showId), session))
}

export const isHere = (p: Presence, now: number) => !!p.seen && now - p.seen.getTime() < HERE_MS

// One entry per person who's here, from their most recent window.
export function peopleHere(list: Presence[], now: number): Presence[] {
  const latest = new Map<string, Presence>()
  for (const p of list) {
    if (!isHere(p, now)) continue
    const had = latest.get(p.uid)
    if (!had || (p.seen?.getTime() ?? 0) > (had.seen?.getTime() ?? 0)) latest.set(p.uid, p)
  }
  return [...latest.values()]
}

// The same color for someone everywhere, from their account.
export function personColor(uid: string): string {
  let h = 0
  for (const ch of uid) h = (h * 31 + ch.charCodeAt(0)) % 360
  return `hsl(${h} 55% 55%)`
}

export function initials(p: { name: string; email: string }): string {
  const words = (p.name || p.email.split('@')[0]).split(/[\s._-]+/).filter(Boolean)
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? '?').slice(0, 2)).toUpperCase()
}
