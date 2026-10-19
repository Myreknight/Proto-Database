import type { Update } from '../App'
import { parseRu } from '../csv'
import { rackDrawing } from '../drawing'
import { gearLabel, gearModelOf, gearRu, newGear, patchReport, rackGear, rackRu } from '../gear'
import {
  isHalfWidth,
  nudgeGear,
  placedIn,
  placeGear,
  rackProblems,
  setGearRack,
  setRackPosition,
  topOf,
} from '../racking'
import {
  deleteRack,
  describeLength,
  joinRack,
  rackById,
  rackCables,
  rackDeleteMessage,
  rackOfCase,
  typeById,
  updateRack,
  visibleTails,
} from '../show'
import type { Rack, RackSide, RackSlot, Show } from '../types'
import { RackDrawing } from './RackDrawing'

interface Props {
  show: Show
  rack: Rack
  update: Update
  onClose: () => void
  onOpenCable: (id: string) => void
  onOpenGear: (id: string) => void
}

export function RackPane({ show, rack, update, onClose, onOpenCable, onOpenGear }: Props) {
  const cables = rackCables(show, rack.id)
  const others = show.cables.filter((c) => !cables.includes(c))
  const gear = rackGear(show, rack.id)
  // Rack cases don't mount in racks.
  const otherGear = show.gear.filter((g) => g.rackId !== rack.id && !rackOfCase(show, g.id))
  const used = rackRu(show, rack.id)
  const placed = placedIn(show, rack.id)
  const problems = rackProblems(show, rack)
  const over = rack.size != null && placed.some((p) => topOf(p) > rack.size!)
  // Cable ends mounted on this rack's steck rails (tails' G-blocks, etherCONs…), slot by slot.
  const steckRails = gear.filter((g) => gearModelOf(show, g)?.steck)
  const report = steckRails.length ? patchReport(show) : null
  const tails = steckRails.flatMap((rail) =>
    (report?.byGear.get(rail.id) ?? []).filter((p) => p.field.startsWith('steck')).map((point) => ({ rail, point })),
  )
  // Listed top to bottom by where they sit; gear with no spot yet comes last.
  const listed = [...gear].sort((a, b) => {
    const pa = placed.find((p) => p.gear.id === a.id)
    const pb = placed.find((p) => p.gear.id === b.id)
    if (!pa || !pb) return (pa ? 0 : 1) - (pb ? 0 : 1)
    return topOf(pb) - topOf(pa) || (pa.side === 'front' ? 0 : 1) - (pb.side === 'front' ? 0 : 1)
  })

  const patchRack = (changes: Partial<Omit<Rack, 'id' | 'gearId'>>) => update((s) => updateRack(s, rack.id, changes))

  // Adding makes the cable an interconnect in this rack; removing leaves it an
  // interconnect with no rack, so it still shows up as needing one.
  const setCableRack = (cableId: string, join: boolean) =>
    update((s) => ({
      ...s,
      cables: s.cables.map((c) => (c.id !== cableId ? c : join ? joinRack(c, rack.id) : { ...c, rackId: null })),
    }))

  // A new unit in this rack, opened in the Gear tab to fill in.
  const addNewGear = () => {
    const unit = newGear({ rackId: rack.id })
    update((s) => ({ ...s, gear: [...s.gear, unit] }))
    onOpenGear(unit.id)
  }

  const remove = () => {
    if (!confirm(rackDeleteMessage(show, rack))) return
    update((s) => deleteRack(s, rack.id))
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
        <div className="row2 rack-row">
          <label className="field">
            <span>Location</span>
            <input
              list="locations"
              value={rack.location}
              placeholder="e.g. Amp Room"
              onChange={(e) => patchRack({ location: e.target.value })}
            />
          </label>
          <label className="field">
            <span title="Rack units. 1U is 1.75 in.">Size (RU)</span>
            <input
              type="number"
              min="1"
              step="1"
              className={over ? 'invalid' : undefined}
              value={rack.size ?? ''}
              placeholder="e.g. 12"
              onChange={(e) => patchRack({ size: parseRu(e.target.value) })}
            />
          </label>
        </div>
        {rack.gearId && (
          <p className="muted small">
            Its case is on the gear list under Racks.{' '}
            <button type="button" className="link small" onClick={() => onOpenGear(rack.gearId!)}>
              Set its make and model
            </button>
          </p>
        )}

        <h3>
          Gear{' '}
          <span className={over || problems.size ? 'warn' : 'muted'}>
            ({gear.reduce((n, g) => n + g.qty, 0)}
            {(used > 0 || rack.size) && ` · ${used}${rack.size ? ` of ${rack.size}` : ''}U front`})
          </span>
        </h3>
        {gear.length === 0 ? (
          <p className="muted small">No gear in this rack yet.</p>
        ) : (
          <ol className="rack-units">
            {listed.map((g) => {
              const p = placed.find((x) => x.gear.id === g.id)
              const ru = gearRu(show, g)
              const half = isHalfWidth(show, g)
              const problem = problems.get(g.id)
              const detail = [
                g.name.trim() ? [g.manufacturer, g.model].map((v) => v.trim()).filter(Boolean).join(' ') : '',
                ru ? `${ru * g.qty}U${half ? ' half' : ''}` : '',
              ]
                .filter(Boolean)
                .join(' · ')
              const label = `${gearLabel(g)}${g.qty > 1 ? ` ×${g.qty}` : ''}`
              const move = (changes: Parameters<typeof setRackPosition>[2]) =>
                update((s) => setRackPosition(s, g.id, changes))
              return (
                <li key={g.id} className={problem ? 'rack-unit problem' : 'rack-unit'}>
                  <div className="ru-head">
                    <span className="ru-pos">{p ? (p.height > 1 ? `U${topOf(p)}–${p.bottom}` : `U${p.bottom}`) : '—'}</span>
                    <span className="link-name">
                      <button className="link" onClick={() => onOpenGear(g.id)} title="Open in Gear">
                        {label}
                      </button>
                      {detail && <span className="muted small"> · {detail}</span>}
                    </span>
                    <button
                      className="icon"
                      title="Take out of this rack"
                      onClick={() => update((s) => setGearRack(s, g.id, null))}
                      aria-label={`Take ${label} out of rack`}
                    >
                      ×
                    </button>
                  </div>
                  {ru ? (
                    <div className="ru-controls">
                      <label className="ru-u">
                        <span className="muted small">Bottom U</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={g.rackU ?? ''}
                          aria-label={`Bottom rack unit for ${label}`}
                          onChange={(e) => {
                            const u = Math.floor(Number(e.target.value))
                            move({ rackU: u >= 1 ? u : null })
                          }}
                        />
                      </label>
                      <button
                        className="icon"
                        disabled={g.rackU == null}
                        onClick={() => update((s) => nudgeGear(s, g.id, 1))}
                        aria-label={`Move ${label} up`}
                      >
                        ↑
                      </button>
                      <button
                        className="icon"
                        disabled={g.rackU == null || g.rackU <= 1}
                        onClick={() => update((s) => nudgeGear(s, g.id, -1))}
                        aria-label={`Move ${label} down`}
                      >
                        ↓
                      </button>
                      <select
                        value={g.rackSide}
                        aria-label={`Rails for ${label}`}
                        onChange={(e) => move({ rackSide: e.target.value as RackSide })}
                      >
                        <option value="front">Front</option>
                        <option value="rear">Rear</option>
                      </select>
                      {half && (
                        <select
                          value={g.rackSlot ?? 'left'}
                          aria-label={`Which half for ${label}`}
                          onChange={(e) => move({ rackSlot: e.target.value as RackSlot })}
                        >
                          <option value="left">Left half</option>
                          <option value="right">Right half</option>
                        </select>
                      )}
                      {g.rackU == null && (
                        <button className="small" onClick={() => update((s) => placeGear(s, g.id))}>
                          Place
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="muted small ru-note">No rack size yet, so it isn't drawn. Set its RU on the unit.</p>
                  )}
                  {problem && <p className="warn small ru-note">⚠ {problem}</p>}
                </li>
              )
            })}
          </ol>
        )}
        <div className="link-controls">
          <select
            value=""
            onChange={(e) => e.target.value && update((s) => setGearRack(s, e.target.value, rack.id))}
            disabled={otherGear.length === 0}
          >
            <option value="">Add gear to rack…</option>
            {otherGear.map((g) => {
              const current = rackById(show, g.rackId)
              return (
                <option key={g.id} value={g.id}>
                  {gearLabel(g)}
                  {current ? ` (moves from ${current.name || 'another rack'})` : ''}
                </option>
              )
            })}
          </select>
          <button onClick={addNewGear}>+ New gear</button>
        </div>

        <h3>
          On steck rails <span className="muted">({tails.length})</span>
        </h3>
        {tails.length === 0 ? (
          <p className="muted small">
            {steckRails.length
              ? "Nothing mounted yet. On a cable, check Steck for an end and pick a slot on one of this rack's steck rails."
              : 'Tails (and etherCONs, opticalCONs…) mount on steck rails. Add a steck rail (a model marked Steck in Gear → Models) to this rack.'}
          </p>
        ) : (
          <ul className="gear-connections">
            {tails.map(({ rail, point }) => (
              <li key={`${point.cable.id}-${point.field}`}>
                <button className="link" onClick={() => onOpenCable(point.cable.id)} title="Open in Cables">
                  {point.cable.color && <span className="dot" style={{ background: point.cable.color }} />}
                  {point.cable.name || 'Unnamed'}
                </button>
                <span className="muted small">{point.place.replace(' steck', '')}</span>
                <span className="small">
                  {rail.name.trim() || 'Steck rail'} · {point.port ?? '?'}
                </span>
                {point.issue && <span className="warn small">⚠ {point.issue}</span>}
              </li>
            ))}
          </ul>
        )}

        <details className="elev-details" open>
          <summary>Elevation</summary>
          {placed.length > 0 || rack.size ? (
            <div className="elev-views">
              <RackDrawing drawing={rackDrawing(show, rack, { views: ['front'] })} label={`${rack.name} front`} onOpenGear={onOpenGear} />
              <RackDrawing drawing={rackDrawing(show, rack, { views: ['rear'] })} label={`${rack.name} rear`} onOpenGear={onOpenGear} />
            </div>
          ) : (
            <p className="muted small">Set the rack's size and add gear with rack sizes to draw it.</p>
          )}
          <p className="muted small">
            U1 is at the bottom. From the rear, front-mounted gear shows as dashed backs and half-width gear swaps
            sides. The Drawings view puts front and rear side by side to print or export.
          </p>
        </details>

        <h3>
          Interconnects <span className="muted">({cables.length})</span>
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
