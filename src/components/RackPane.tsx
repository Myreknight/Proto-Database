import type { Update } from '../App'
import { describeLength, joinRack, rackById, rackCables, typeById, visibleTails } from '../show'
import type { Rack, Show } from '../types'

interface Props {
  show: Show
  rack: Rack
  update: Update
  onClose: () => void
  onOpenCable: (id: string) => void
}

export function RackPane({ show, rack, update, onClose, onOpenCable }: Props) {
  const cables = rackCables(show, rack.id)
  const others = show.cables.filter((c) => !cables.includes(c))

  const patchRack = (changes: Partial<Rack>) =>
    update((s) => ({ ...s, racks: s.racks.map((r) => (r.id === rack.id ? { ...r, ...changes } : r)) }))

  // Adding makes the cable an interconnect in this rack; removing leaves it an
  // interconnect with no rack, so it still shows up as needing one.
  const setCableRack = (cableId: string, join: boolean) =>
    update((s) => ({
      ...s,
      cables: s.cables.map((c) => (c.id !== cableId ? c : join ? joinRack(c, rack.id) : { ...c, rackId: null })),
    }))

  const remove = () => {
    const msg = cables.length
      ? `Delete ${rack.name || 'this rack'}? Its ${cables.length} interconnect(s) stay interconnects with no rack.`
      : `Delete ${rack.name || 'this rack'}?`
    if (!confirm(msg)) return
    update((s) => ({
      ...s,
      racks: s.racks.filter((r) => r.id !== rack.id),
      cables: s.cables.map((c) => (c.rackId === rack.id ? { ...c, rackId: null } : c)),
    }))
    onClose()
  }

  return (
    <aside className="editor">
      <div className="editor-head">
        <h2>{rack.name || 'Unnamed rack'}</h2>
        <button className="icon" onClick={onClose} aria-label="Close rack">
          ×
        </button>
      </div>

      <div className="editor-body">
        <label className="field">
          <span>Rack name</span>
          <input
            autoFocus={!rack.name}
            value={rack.name}
            placeholder="e.g. Amp Rack 1"
            onChange={(e) => patchRack({ name: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Location</span>
          <input
            list="locations"
            value={rack.location}
            placeholder="e.g. Amp Room"
            onChange={(e) => patchRack({ location: e.target.value })}
          />
        </label>

        <h3>
          In this rack{' '}
          <span className="muted">
            ({cables.length} interconnect{cables.length === 1 ? '' : 's'})
          </span>
        </h3>

        {cables.length === 0 ? (
          <p className="muted">No interconnects in this rack yet.</p>
        ) : (
          <div className="bundle-cables">
            {cables.map((cable) => {
              const type = typeById(show, cable.typeId)
              const tails = visibleTails(show, cable)
              const named = tails.filter((t) => t.name.trim()).length
              const route = [cable.from, cable.to].filter(Boolean).join(' → ')
              return (
                <div key={cable.id} className="bundle-cable">
                  <div className="bc-head">
                    <button className="link" onClick={() => onOpenCable(cable.id)} title="Open in Cables">
                      {cable.color && <span className="dot" style={{ background: cable.color }} />}
                      {cable.name || 'Unnamed'}
                    </button>
                    <span className="spacer" />
                    <span className="nowrap">{describeLength(cable) || 'No length'}</span>
                    <button
                      className="icon"
                      title="Remove from rack"
                      aria-label={`Remove ${cable.name || 'cable'} from rack`}
                      onClick={() => setCableRack(cable.id, false)}
                    >
                      ×
                    </button>
                  </div>
                  <div className="muted small">
                    {type?.name ?? 'Missing type'}
                    {route && ` · ${route}`}
                    {tails.length > 1 && ` · ${named}/${tails.length} tails named`}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <select
          className="add-to-bundle"
          value=""
          onChange={(e) => e.target.value && setCableRack(e.target.value, true)}
          disabled={others.length === 0}
        >
          <option value="">Add interconnect to rack…</option>
          {others.map((c) => {
            const current = c.deployment === 'interconnect' ? rackById(show, c.rackId) : undefined
            const note =
              c.deployment !== 'interconnect'
                ? ' (becomes an interconnect)'
                : current
                  ? ` (moves from ${current.name || 'another rack'})`
                  : ' (no rack yet)'
            return (
              <option key={c.id} value={c.id}>
                {c.name || 'Unnamed'}
                {note}
              </option>
            )
          })}
        </select>

        <label className="field">
          <span>Notes</span>
          <textarea rows={3} value={rack.notes} onChange={(e) => patchRack({ notes: e.target.value })} />
        </label>

        <div className="editor-actions">
          <span />
          <button className="danger" onClick={remove}>
            Delete rack
          </button>
        </div>
      </div>
    </aside>
  )
}
