import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { useEffect, useState } from 'react'
import { cloud, cloudAvailable } from './firebase'

// Signing in: with Google, or an email and password. Firebase keeps the account (and the
// password); the app only ever sees who's signed in.

export interface Account {
  // undefined while it's still finding out, null when signed out.
  user: User | null | undefined
  // Whether the account's email is confirmed: Google accounts always are; an email and
  // password account is once its link is clicked. Invitations need it.
  verified: boolean
}

export function useAccount(): Account & { recheck: () => Promise<void> } {
  const [user, setUser] = useState<User | null | undefined>(cloudAvailable() ? undefined : null)
  const [verified, setVerified] = useState(false)
  useEffect(() => {
    if (!cloudAvailable()) return
    return onAuthStateChanged(cloud().auth, (u) => {
      setUser(u)
      setVerified(!!u?.emailVerified)
    })
  }, [])
  return {
    user,
    verified,
    // After the link in the email is clicked elsewhere: picks it up, and gets a fresh pass
    // so the database sees it too.
    async recheck() {
      const u = cloud().auth.currentUser
      if (!u) return
      await u.reload()
      await u.getIdToken(true)
      setVerified(u.emailVerified)
    },
  }
}

// Calls back whenever no one is signed in (signed out here, or in another tab).
export function onSignedOut(cb: () => void): () => void {
  return onAuthStateChanged(cloud().auth, (u) => {
    if (!u) cb()
  })
}

export async function signInWithGoogle(): Promise<void> {
  await signInWithPopup(cloud().auth, new GoogleAuthProvider())
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(cloud().auth, email.trim(), password)
}

// A new account, and the email that confirms its address.
export async function createAccount(name: string, email: string, password: string): Promise<void> {
  const { user } = await createUserWithEmailAndPassword(cloud().auth, email.trim(), password)
  if (name.trim()) await updateProfile(user, { displayName: name.trim() })
  await sendEmailVerification(user)
}

export async function resendVerification(): Promise<void> {
  const u = cloud().auth.currentUser
  if (u) await sendEmailVerification(u)
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(cloud().auth, email.trim())
}

export async function signOutAccount(): Promise<void> {
  await signOut(cloud().auth)
}

// What went wrong, in words, from Firebase's error codes.
export function accountError(err: unknown): string | null {
  const code = (err as { code?: string })?.code ?? ''
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return "That email and password don't match an account."
    case 'auth/email-already-in-use':
      return 'There’s already an account with that email. Sign in instead.'
    case 'auth/weak-password':
      return 'Use a password of at least 6 characters.'
    case 'auth/invalid-email':
      return 'That isn’t an email address.'
    case 'auth/missing-password':
      return 'Type your password.'
    case 'auth/network-request-failed':
      return 'No internet connection.'
    case 'auth/too-many-requests':
      return 'Too many tries. Wait a few minutes and try again.'
    case 'auth/popup-blocked':
      return 'The browser blocked the sign-in window. Allow pop-ups for this site and try again.'
    case 'auth/unauthorized-domain':
      return 'Sign-in isn’t set up for this web address yet. Add it under Authorized domains in Firebase.'
    case 'auth/operation-not-allowed':
      return 'That way of signing in isn’t turned on yet in Firebase.'
  }
  return err instanceof Error ? err.message : 'Something went wrong.'
}
