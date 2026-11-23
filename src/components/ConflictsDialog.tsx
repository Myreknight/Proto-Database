import { useEffect, useState } from 'react'
import { watchShared, type SharedShow } from '../cloud/shows'
import { recordLabel, spotLabel, theirChanges, valueText } from '../sync/conflicts'
import type { Conflict } from '../sync/session'
import type { Show } from '../types'

interface Props {
  show: Show
  showId: string
  // Your account, to tell your other windows apart from other people.
  me: string
  conflicts: Conflict[]
  onKeep: (list: Conflict[], keep: 'mine' | 'theirs') => void
  // Opens the record a conflict is about, if it has a place to open.
  onOpen?: (c: Conflict) => void
  onClose: () => void
}

// Changes to decide: things you and someone else both changed before either of you saw
// the other's change. Theirs is showing; each one keeps yours or theirs.
export function ConflictsDialog({ show, showId, me, conflicts, onKeep, onOpen, onClose }: Props) {
  const [shared, setShared] = useState<SharedShow | null>(null)
  useEffect(() => watchShared(showId, setShared, () => {}), [showId])

  const who = (c: Conflict) => {
    if (c.by === me) return 'You, in another window,'
    const m = c.by ? shared?.members[c.by] : undefined
    return m ? m.name || m.email : 'Someone else'
  }
  const whose = (c: Conflict) => {
    if (c.by === me) return 'Your other window'
    const m = c.by ? shared?.members[c.by] : undefined
    return m ? `${(m.name || m.email).split(' ')[0]}’s` : 'Theirs'
  }

  // Grouped by record, in the order they came up.
  const groups = new Map<string, Conflict[]>()
  for (const c of conflicts) {
    const k = `${c.kind}/${c.id}`
    groups.set(k, [...(groups.get(k) ?? []), c])
  }

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog conflicts-dialog"
        role="dialog"
        aria-label="Changes to decide"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h2>Changes to decide</h2>
        {conflicts.length === 0 ? (
          <p className="muted">Nothing left to decide. Everyone has the same show.</p>
        ) : (
          <>
            <p className="muted small">
              You and someone else changed the same things before either of you saw the other’s change. Theirs is
              what’s showing now; everything that didn’t overlap is already in. Pick which to keep.
            </p>
            <div className="conflict-all">
              <button onClick={() => onKeep(conflicts, 'mine')}>Keep all mine</button>
              <button onClick={() => onKeep(conflicts, 'theirs')}>Keep all theirs</button>
            </div>
            <ul className="conflict-list">
              {[...groups.values()].map((list) => {
                const head = list[0]
                return (
                  <li key={`${head.kind}/${head.id}`} className="conflict-record">
                    <div className="conflict-record-head">
                      <span className="strong">{recordLabel(show, head)}</span>
                      {onOpen && head.type !== 'deleted' && (
                        <button className="link small" onClick={() => onOpen(head)}>
                          Show me
                        </button>
                      )}
                    </div>
                    {list.map((c) =>
                      c.type === 'deleted' ? (
                        <div key={c.key} className="conflict-row">
                          <p className="small">{who(c)} took this out while you were changing it.</p>
                          <div className="conflict-sides">
                            <button onClick={() => onKeep([c], 'mine')}>Put it back, with my changes</button>
                            <button onClick={() => onKeep([c], 'theirs')}>Leave it out</button>
                          </div>
                        </div>
                      ) : c.type === 'edited' ? (
                        <div key={c.key} className="conflict-row">
                          <p className="small">
                            You took this out, but {who(c).replace(/,$/, '')} changed it meanwhile
                            {theirChanges(show, c).length ? ':' : '.'}
                          </p>
                          {theirChanges(show, c).length > 0 && (
                            <ul className="conflict-changes small">
                              {theirChanges(show, c).map((line) => (
                                <li key={line}>{line}</li>
                              ))}
                            </ul>
                          )}
                          <div className="conflict-sides">
                            <button onClick={() => onKeep([c], 'mine')}>Take it out anyway</button>
                            <button onClick={() => onKeep([c], 'theirs')}>Keep it, with their changes</button>
                          </div>
                        </div>
                      ) : (
                        <div key={c.key} className="conflict-row">
                          <div className="conflict-spot small">{spotLabel(c)}</div>
                          <div className="conflict-sides">
                            <button className="conflict-side" onClick={() => onKeep([c], 'mine')} title="Keep yours">
                              <span className="muted small">Yours</span>
                              <span className="conflict-value">{valueText(show, c, c.mine)}</span>
                            </button>
                            <button className="conflict-side theirs" onClick={() => onKeep([c], 'theirs')} title="Keep theirs">
                              <span className="muted small">{whose(c)} · showing now</span>
                              <span className="conflict-value">{valueText(show, c, c.theirs)}</span>
                            </button>
                          </div>
                        </div>
                      ),
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}
        <div className="dialog-actions">
          <span className="grow" />
          <button onClick={onClose} autoFocus={conflicts.length === 0}>
            {conflicts.length ? 'Decide later' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  )
}
