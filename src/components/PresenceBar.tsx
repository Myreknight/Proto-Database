import { initials, personColor, type Presence } from '../cloud/presence'

// Who else has the shared show open, as a row of initials by the Shared chip. Hovering
// one says who it is and which tab they're on; clicking opens Members.
export function PresenceBar({ people, onOpen }: { people: Presence[]; onOpen: () => void }) {
  if (!people.length) return null
  const shown = people.slice(0, 5)
  const more = people.length - shown.length
  const names = people.map((p) => `${p.name || p.email}${p.tab ? ` · on ${p.tab}` : ''}`).join('\n')
  return (
    <button
      className="presence-bar"
      onClick={onOpen}
      title={`Here now:\n${names}`}
      aria-label={`${people.length} other ${people.length === 1 ? 'person' : 'people'} here now: ${people.map((p) => p.name || p.email).join(', ')}`}
    >
      {shown.map((p) => (
        <span key={p.uid} className="presence-face" style={{ background: personColor(p.uid) }}>
          {initials(p)}
        </span>
      ))}
      {more > 0 && <span className="presence-face more">+{more}</span>}
    </button>
  )
}
