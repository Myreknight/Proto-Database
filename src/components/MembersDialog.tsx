import type { User } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { accountError } from '../cloud/account'
import { isHere, personColor, type Presence } from '../cloud/presence'
import { deleteShared, invite, removeMember, revokeInvite, watchShared, type SharedShow } from '../cloud/shows'

interface Props {
  user: User
  showId: string
  // Everyone's check-ins, and the time to judge them by.
  presence: Presence[]
  now: number
  // Left the show, or deleted it: back to this device's show.
  onGone: () => void
  onClose: () => void
}

// Who's in a shared show. The owner invites people by email and can take them out again;
// anyone else can leave. Invited people join from File → Shows once they sign in with
// that email.
export function MembersDialog({ user, showId, presence, now, onGone, onClose }: Props) {
  const [shared, setShared] = useState<SharedShow | null | undefined>(undefined)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => watchShared(showId, setShared, (e) => setError(accountError(e))), [showId])

  const act = async (action: () => Promise<void>, after?: () => void) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      after?.()
    } catch (err) {
      setError(accountError(err))
    } finally {
      setBusy(false)
    }
  }

  const owner = shared?.members[user.uid]?.role === 'owner'
  const members = Object.entries(shared?.members ?? {}).sort(([, a], [, b]) =>
    a.role === b.role ? (a.name || a.email).localeCompare(b.name || b.email) : a.role === 'owner' ? -1 : 1,
  )
  const invited = Object.entries(shared?.invites ?? {})
  // Each member's latest check-in: here now (and on which tab), or when they were last here.
  const lastOf = (uid: string) =>
    presence.filter((p) => p.uid === uid).sort((a, b) => (b.seen?.getTime() ?? 0) - (a.seen?.getTime() ?? 0))[0]
  const whereabouts = (uid: string) => {
    const last = lastOf(uid)
    if (last && isHere(last, now)) return { here: true, text: `online now${last.tab ? ` · on ${last.tab}` : ''}` }
    if (last?.seen) {
      const when = last.seen.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      return { here: false, text: `last here ${when}` }
    }
    return { here: false, text: '' }
  }
  const address = email.trim().toLowerCase()
  const already = !!address && (invited.some(([e]) => e === address) || members.some(([, m]) => m.email === address))

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog shows-dialog"
        role="dialog"
        aria-label="Members"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h2>Members{shared?.name ? ` · ${shared.name}` : ''}</h2>
        {shared === undefined ? (
          <p className="muted small">Loading…</p>
        ) : shared === null ? (
          <p className="muted small">This show is gone, or you're no longer in it.</p>
        ) : (
          <>
            {members.map(([uid, m]) => {
              const where = whereabouts(uid)
              return (
                <div key={uid} className="shows-row">
                  <span
                    className={where.here ? 'presence-dot here' : 'presence-dot'}
                    style={where.here ? { background: personColor(uid) } : undefined}
                    aria-hidden
                  />
                  <span className="grow">
                    <strong>{m.name || m.email}</strong>
                    <span className="muted small">
                      {m.name ? ` · ${m.email}` : ''} · {m.role === 'owner' ? 'owner' : 'editor'}
                      {uid === user.uid ? ' · you' : ''}
                    </span>
                    {where.text && <span className={where.here ? 'small presence-text here' : 'muted small presence-text'}>{where.text}</span>}
                  </span>
                  {owner && uid !== user.uid && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        if (confirm(`Take ${m.name || m.email} out of this show?`)) void act(() => removeMember(showId, uid))
                      }}
                    >
                      Remove
                    </button>
                  )}
                  {!owner && uid === user.uid && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        if (confirm('Leave this show? You’ll need a new invitation to come back.')) {
                          void act(() => removeMember(showId, uid), onGone)
                        }
                      }}
                    >
                      Leave
                    </button>
                  )}
                </div>
              )
            })}

            {invited.length > 0 && <h3>Invited</h3>}
            {invited.map(([address, inv]) => (
              <div key={address} className="shows-row">
                <span className="grow">
                  {address}
                  <span className="muted small"> · not joined yet</span>
                </span>
                {owner && (
                  <button disabled={busy} onClick={() => void act(() => revokeInvite(showId, address))}>
                    Cancel invitation
                  </button>
                )}
                {!owner && <span className="muted small">from {inv.by}</span>}
              </div>
            ))}

            {owner && (
              <form
                className="shows-row invite-row"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!address || already) return
                  void act(() => invite(showId, address, user), () => setEmail(''))
                }}
              >
                <input
                  type="email"
                  className="grow"
                  placeholder="Invite by email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-label="Email to invite"
                />
                <button type="submit" className="primary" disabled={busy || !address || already}>
                  Invite
                </button>
              </form>
            )}
            {owner && (
              <p className="muted small">
                They'll find it under File → Shows → Invitations, once they sign in with that email (and confirm it, for
                an email and password account). {already && 'That email is already here.'}
              </p>
            )}

            {owner && (
              <div className="shows-row danger-row">
                <span className="grow muted small">Deleting the show takes it away for everyone. Save a file first to keep a copy.</span>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => {
                    const typed = prompt(`Type the show's name to delete it for everyone:\n${shared.name}`)
                    if (typed == null) return
                    if (typed.trim() !== shared.name.trim()) {
                      setError("That's not the show's name, so nothing was deleted.")
                      return
                    }
                    void act(() => deleteShared(showId), onGone)
                  }}
                >
                  Delete show…
                </button>
              </div>
            )}
          </>
        )}
        {error && <p className="warn small">⚠ {error}</p>}
        <div className="dialog-actions">
          <button onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
