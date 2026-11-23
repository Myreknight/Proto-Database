import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore'

// The Firebase project that holds shared shows and sign-in. This isn't a secret: every
// page that uses Firebase sends it to the browser. What keeps shows private is sign-in
// and the database rules (firestore.rules), which only let a show's members in.
const firebaseConfig = {
  apiKey: 'AIzaSyA-adMJYEKbjDAU1px5dthBfeR2mrR-RfQ',
  authDomain: 'proto-database-be0eb.firebaseapp.com',
  projectId: 'proto-database-be0eb',
  storageBucket: 'proto-database-be0eb.firebasestorage.app',
  messagingSenderId: '11607285870',
  appId: '1:11607285870:web:2f98dece2d322527b9867f',
}

// Sharing needs a web address: Google sign-in won't run from a file opened off the disk,
// so the single-file app stays solo and never touches Firebase.
export const cloudAvailable = () => location.protocol === 'https:' || location.protocol === 'http:'

let cached: { app: FirebaseApp; auth: Auth; db: Firestore } | null = null

// Firebase, started the first time it's needed. Shared shows are kept on this device too
// (in the browser's database), so they open and take edits offline and catch up later.
export function cloud() {
  if (!cached) {
    const app = initializeApp(firebaseConfig)
    cached = {
      app,
      auth: getAuth(app),
      db: initializeFirestore(app, {
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
        ignoreUndefinedProperties: true,
      }),
    }
  }
  return cached
}

// Firestore can't hold a list inside a list (a steck rail's quarters of connectors), so an
// inner list is wrapped in a map on the way in and unwrapped on the way out.
const LIST = '_list'

export function encode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => (Array.isArray(v) ? { [LIST]: encode(v) } : encode(v)))
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)]))
  }
  return value
}

export function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode)
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const keys = Object.keys(value)
    if (keys.length === 1 && keys[0] === LIST) return decode((value as Record<string, unknown>)[LIST])
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decode(v)]))
  }
  return value
}
