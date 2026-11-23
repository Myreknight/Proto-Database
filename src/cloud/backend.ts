import {
  collection,
  deleteField,
  doc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import type { ItemKind } from '../sync/patch'
import type { Backend, WriteOp } from '../sync/session'
import type { ShowInfo } from '../types'
import { decode, encode } from './firebase'

// Where a shared show lives in Firestore:
//   shows/{id}                 its name and info, and who's in it (see shows.ts)
//   shows/{id}/meta/order      each list's order
//   shows/{id}/{kind}/{itemId} each cable, bundle, rack… and checklist entry
// Field changes are written as just those fields, so two people editing different fields
// of one cable both land. Watchers hear about the connection too (includeMetadataChanges),
// so the session knows when what it has is up to date with the server.

// Firestore takes up to 500 writes at once; a whole show goes up in several.
const BATCH = 450

export function firestoreBackend(db: Firestore, showId: string): Backend {
  const showRef = doc(db, 'shows', showId)
  const orderRef = doc(db, 'shows', showId, 'meta', 'order')
  const itemRef = (kind: ItemKind, id: string) => doc(db, 'shows', showId, kind, id)

  return {
    watchShow(cb, onError) {
      return onSnapshot(
        showRef,
        { includeMetadataChanges: true },
        (snap) => {
          const data = snap.data()
          cb(data ? { name: String(data.name ?? ''), info: decode(data.info) as ShowInfo } : null, !snap.metadata.fromCache)
        },
        onError,
      )
    },
    watchOrder(cb, onError) {
      return onSnapshot(
        orderRef,
        { includeMetadataChanges: true },
        (snap) => cb((decode(snap.data() ?? {}) ?? {}) as Record<string, string[]>, !snap.metadata.fromCache),
        onError,
      )
    },
    watchItems(kind, cb, onError) {
      return onSnapshot(
        collection(db, 'shows', showId, kind),
        { includeMetadataChanges: true },
        (snap) =>
          cb(
            // Only real changes; a write being confirmed changes nothing here.
            snap.docChanges().map((change) => ({
              id: change.doc.id,
              data: change.type === 'removed' ? null : (decode(change.doc.data()) as Record<string, unknown>),
            })),
            !snap.metadata.fromCache,
          ),
        onError,
      )
    },
    async commit(ops: WriteOp[]) {
      const batches = []
      for (let i = 0; i < ops.length; i += BATCH) {
        const batch = writeBatch(db)
        for (const op of ops.slice(i, i + BATCH)) {
          if (op.target === 'show') {
            batch.update(showRef, { ...(encode(op.set) as object), updatedAt: serverTimestamp() })
          } else if (op.target === 'order') {
            batch.set(orderRef, encode(op.set) as object, { merge: true })
          } else if ('removed' in op) {
            batch.delete(itemRef(op.kind, op.id))
          } else if (op.whole) {
            batch.set(itemRef(op.kind, op.id), encode(op.data) as object)
          } else {
            // Just these fields; one set to undefined is taken off.
            const fields = Object.fromEntries(
              Object.entries(op.data).map(([k, v]) => [k, v === undefined ? deleteField() : encode(v)]),
            )
            batch.set(itemRef(op.kind, op.id), fields, { mergeFields: Object.keys(fields) })
          }
        }
        batches.push(batch.commit())
      }
      await Promise.all(batches)
    },
  }
}
