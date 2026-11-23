import { useState } from 'react'
import { accountError, createAccount, resetPassword, signInWithEmail, signInWithGoogle } from '../cloud/account'

type Mode = 'signin' | 'create' | 'reset'

// Signing in to work on shared shows: with Google, or an email and password. A new email
// account gets a link to confirm its address, which invitations need.
export function SignInDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<void>, after?: () => void) => {
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      await action()
      after?.()
    } catch (err) {
      setError(accountError(err))
    } finally {
      setBusy(false)
    }
  }

  const submit = () => {
    if (mode === 'signin') return run(() => signInWithEmail(email, password), onClose)
    if (mode === 'create') return run(() => createAccount(name, email, password), onClose)
    return run(
      () => resetPassword(email),
      () => setNote(`If there's an account for ${email.trim()}, a link to reset its password is on its way.`),
    )
  }

  const switchTo = (next: Mode) => {
    setMode(next)
    setError(null)
    setNote(null)
  }

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <form
        className="dialog signin-dialog"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <h2>{mode === 'create' ? 'Create an account' : mode === 'reset' ? 'Reset your password' : 'Sign in'}</h2>
        <p className="muted small">
          Signing in lets you work on shared shows with others. Shows on this device keep working without an account.
        </p>

        {mode !== 'reset' && (
          <>
            <button type="button" className="signin-google" disabled={busy} onClick={() => void run(signInWithGoogle, onClose)}>
              Continue with Google
            </button>
            <div className="signin-or">
              <span>or with an email</span>
            </div>
          </>
        )}

        {mode === 'create' && (
          <label className="field">
            <span>Your name</span>
            <input value={name} autoComplete="name" onChange={(e) => setName(e.target.value)} placeholder="Shown to people you share with" />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input type="email" required value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode !== 'reset' && (
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}

        {error && <p className="warn small">⚠ {error}</p>}
        {note && <p className="small">{note}</p>}

        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {mode === 'create' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}
          </button>
        </div>

        <p className="small signin-switch">
          {mode === 'signin' ? (
            <>
              <button type="button" className="link" onClick={() => switchTo('create')}>
                Create an account
              </button>
              {' · '}
              <button type="button" className="link" onClick={() => switchTo('reset')}>
                Forgot your password?
              </button>
            </>
          ) : (
            <button type="button" className="link" onClick={() => switchTo('signin')}>
              Back to sign in
            </button>
          )}
        </p>
      </form>
    </div>
  )
}
