import type { User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { accountError, resendVerification } from '../cloud/account'
import { acceptInvite, declineInvite, watchInvites, watchMyShows, type SharedShow } from '../cloud/shows'

interface Props {
  user: User | null
  verified: boolean
  recheck: () => Promise<void>
  // The show open now: this device's, or a shared one's id.
  openId: string | null
  deviceName: string
  onOpenDevice: () => void
  onOpenShared: (id: string) => void
  onShareDevice: () => Promise<void>
  onSignIn: () => void
  onSignOut: () => void
  onClose: () => void
}

const when = (d: Date | null) =>
  d ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''

// Which show to work on: the one kept on this device, or one shared with you. Invitations
// wait here until you join; sharing puts this device's show online for others.
export function ShowsDialog(props: Props) {
  const { user, verified, recheck, openId, deviceName, onOpenDevice, onOpenShared, onShareDevice, onSignIn, onSignOut, onClose } =
    props
  const [shows, setShows] = useState<SharedShow[] | null>(null)
  const [invites, setInvites] = useState<SharedShow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Sharing asks first, right here (a pop-up confirm can be blocked).
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    if (!user) return
    const fail = (e: Error) => setError(accountError(e))
    const off = [watchMyShows(user, setShows, fail)]
    if (verified) off.push(watchInvites(user, setInvites, fail))
    return () => off.forEach((u) => u())
  }, [user, verified])

  const act = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(accountError(err))
    } finally {
      setBusy(false)
    }
  }

  const sorted = [...(shows ?? [])].sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog shows-dialog"
        role="dialog"
        aria-label="Shows"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h2>Shows</h2>

        <h3>On this device</h3>
        <div className="shows-row">
          <span className="grow">
            <strong>{deviceName || 'Untitled Show'}</strong>
            <span className="muted small"> · only here, saved as files</span>
          </span>
          {openId == null ? (
            <span className="muted small">Open</span>
          ) : (
            <button onClick={onOpenDevice}>Open</button>
          )}
        </div>

        <h3>Shared</h3>
        {!user ? (
          <div className="shows-row">
            <span className="grow muted small">Sign in to work on shows with other people.</span>
            <button className="primary" onClick={onSignIn}>
              Sign in
            </button>
          </div>
        ) : shows == null ? (
          <p className="muted small">Loading…</p>
        ) : (
          <>
            {sorted.length === 0 && <p className="muted small">No shared shows yet.</p>}
            {sorted.map((s) => {
              const people = Object.keys(s.members).length
              const role = s.members[user.uid]?.role
              return (
                <div key={s.id} className="shows-row">
                  <span className="grow">
                    <strong>{s.name || 'Untitled Show'}</strong>
                    <span className="muted small">
                      {' · '}
                      {role === 'owner' ? 'yours' : 'editor'} · {people} {people === 1 ? 'person' : 'people'}
                      {s.updatedAt && ` · ${when(s.updatedAt)}`}
                    </span>
                  </span>
                  {openId === s.id ? (
                    <span className="muted small">Open</span>
                  ) : (
                    <button onClick={() => onOpenShared(s.id)}>Open</button>
                  )}
                </div>
              )
            })}
            {sharing ? (
              <div className="shows-row">
                <span className="grow small">
                  Share <strong>{deviceName || 'Untitled Show'}</strong>? It goes online with you as its owner; then
                  invite people from Members. The copy on this device stays as it is.
                </span>
                <button className="primary" disabled={busy} autoFocus onClick={() => void act(onShareDevice)}>
                  {busy ? 'Sharing…' : 'Share it'}
                </button>
                <button disabled={busy} onClick={() => setSharing(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="shows-row">
                <span className="grow muted small">
                  Puts the show on this device online, with you as its owner, so you can invite people to it.
                </span>
                <button disabled={busy} onClick={() => setSharing(true)}>
                  Share this device's show
                </button>
              </div>
            )}
          </>
        )}

        {user && (
          <>
            <h3>Invitations</h3>
            {!verified ? (
              <div className="shows-row">
                <span className="grow muted small">
                  Confirm your email ({user.email}) to see shows you're invited to: open the link we emailed you, then
                  check again.
                </span>
                <button
                  disabled={busy}
                  onClick={() => void act(async () => {
                    await resendVerification()
                    setNote('Sent. Check your inbox (and spam).')
                  })}
                >
                  Resend
                </button>
                <button disabled={busy} onClick={() => void act(recheck)}>
                  Check again
                </button>
              </div>
            ) : invites.length === 0 ? (
              <p className="muted small">None right now.</p>
            ) : (
              invites.map((s) => {
                const by = s.invites[(user.email ?? '').toLowerCase()]?.by
                return (
                  <div key={s.id} className="shows-row">
                    <span className="grow">
                      <strong>{s.name || 'Untitled Show'}</strong>
                      {by && <span className="muted small"> · from {by}</span>}
                    </span>
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => void act(async () => {
                        await acceptInvite(s.id, user)
                        onOpenShared(s.id)
                      })}
                    >
                      Join
                    </button>
                    <button disabled={busy} onClick={() => void act(() => declineInvite(s.id, user))}>
                      Decline
                    </button>
                  </div>
                )
              })
            )}
          </>
        )}

        {error && <p className="warn small">⚠ {error}</p>}
        {note && <p className="small">{note}</p>}
        <div className="dialog-actions">
          {user && (
            <span className="grow muted small">
              Signed in as {user.email}.{' '}
              <button className="link" onClick={onSignOut}>
                Sign out
              </button>
            </span>
          )}
          <button onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
