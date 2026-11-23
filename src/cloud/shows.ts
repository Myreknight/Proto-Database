import type { User } from 'firebase/auth'
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  FieldPath,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { ITEM_KINDS } from '../sync/patch'
import { showOps } from '../sync/session'
import type { Show } from '../types'
import { firestoreBackend } from './backend'
import { cloud, encode } from './firebase'

// Shared shows and who's in them. A show's document lists its members (by account) and
// the emails invited to it; the database rules (firestore.rules) check every read and
// write against those lists, so only members get in and only the owner manages members.

export type Role = 'owner' | 'editor'

export interface Member {
  role: Role
  email: string
  name: string
}

export interface SharedShow {
  id: string
  name: string
  ownerId: string
  members: Record<string, Member>
  invites: Record<string, { role: Role; by: string }>
  updatedAt: Date | null
}

const showsRef = () => collection(cloud().db, 'shows')
const showRef = (id: string) => doc(cloud().db, 'shows', id)

const emailOf = (user: User) => (user.email ?? '').trim().toLowerCase()

function asShared(id: string, data: Record<string, unknown>): SharedShow {
  const updated = data.updatedAt as { toDate?: () => Date } | undefined
  return {
    id,
    name: String(data.name ?? ''),
    ownerId: String(data.ownerId ?? ''),
    members: (data.members ?? {}) as Record<string, Member>,
    invites: (data.invites ?? {}) as Record<string, { role: Role; by: string }>,
    updatedAt: updated?.toDate ? updated.toDate() : null,
  }
}

// The shows you're in, kept up to date.
export function watchMyShows(user: User, cb: (shows: SharedShow[]) => void, onError: (e: Error) => void) {
  return onSnapshot(
    query(showsRef(), where('memberIds', 'array-contains', user.uid)),
    (snap) => cb(snap.docs.map((d) => asShared(d.id, d.data()))),
    onError,
  )
}

// Shows you've been invited to. Only for a verified email, since that's what proves it's yours.
export function watchInvites(user: User, cb: (shows: SharedShow[]) => void, onError: (e: Error) => void) {
  return onSnapshot(
    query(showsRef(), where('inviteEmails', 'array-contains', emailOf(user))),
    (snap) => cb(snap.docs.map((d) => asShared(d.id, d.data()))),
    onError,
  )
}

export function watchShared(id: string, cb: (show: SharedShow | null) => void, onError: (e: Error) => void) {
  return onSnapshot(showRef(id), (snap) => cb(snap.exists() ? asShared(snap.id, snap.data()) : null), onError)
}

// Puts a show online with you as its owner, and returns its id. Needs a connection: the
// show has to exist on the server before its cables can go in.
export async function shareShow(show: Show, user: User): Promise<string> {
  if (!navigator.onLine) throw new Error('Sharing a show needs an internet connection.')
  const ref = doc(showsRef())
  await setDoc(ref, {
    format: show.format,
    formatVersion: show.formatVersion,
    name: show.name,
    info: encode(show.info),
    ownerId: user.uid,
    members: { [user.uid]: { role: 'owner', email: emailOf(user), name: user.displayName ?? '' } },
    memberIds: [user.uid],
    invites: {},
    inviteEmails: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  const ops = showOps(show).filter((op) => op.target !== 'show')
  await firestoreBackend(cloud().db, ref.id).commit(ops)
  return ref.id
}

export async function invite(id: string, email: string, user: User): Promise<void> {
  const address = email.trim().toLowerCase()
  await updateDoc(
    showRef(id),
    new FieldPath('invites', address),
    { role: 'editor', by: emailOf(user) },
    'inviteEmails',
    arrayUnion(address),
  )
}

export async function revokeInvite(id: string, email: string): Promise<void> {
  await updateDoc(showRef(id), new FieldPath('invites', email), deleteField(), 'inviteEmails', arrayRemove(email))
}

// Joins a show you're invited to, with the role you were invited with.
export async function acceptInvite(id: string, user: User): Promise<void> {
  const email = emailOf(user)
  await runTransaction(cloud().db, async (tx) => {
    const snap = await tx.get(showRef(id))
    const invite = (snap.data()?.invites ?? {})[email] as { role: Role } | undefined
    if (!invite) throw new Error('That invitation is gone.')
    tx.update(
      showRef(id),
      new FieldPath('members', user.uid),
      { role: invite.role, email, name: user.displayName ?? '' },
      'memberIds',
      arrayUnion(user.uid),
      new FieldPath('invites', email),
      deleteField(),
      'inviteEmails',
      arrayRemove(email),
    )
  })
}

export async function declineInvite(id: string, user: User): Promise<void> {
  await revokeInvite(id, emailOf(user))
}

// Takes someone out of a show (the owner), or yourself (leaving).
export async function removeMember(id: string, uid: string): Promise<void> {
  await updateDoc(showRef(id), new FieldPath('members', uid), deleteField(), 'memberIds', arrayRemove(uid))
}

// Deletes a show and everything in it, for everyone.
export async function deleteShared(id: string): Promise<void> {
  const { db } = cloud()
  const refs = []
  for (const kind of [...ITEM_KINDS, 'meta']) {
    const snap = await getDocs(collection(db, 'shows', id, kind))
    refs.push(...snap.docs.map((d) => d.ref))
  }
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db)
    for (const ref of refs.slice(i, i + 450)) batch.delete(ref)
    await batch.commit()
  }
  const batch = writeBatch(db)
  batch.delete(showRef(id))
  await batch.commit()
}
