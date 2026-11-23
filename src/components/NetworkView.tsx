import { useState } from 'react'
import type { Update } from '../App'
import { defaultListId, gearLabel, newGear, type PatchReport } from '../gear'
import { gearModelOf } from '../models'
import { addVlan, isSwitchModel, removeVlan, setVlan, switchesOf, switchPortList, vlanUse } from '../network'
import { rackById } from '../show'
import type { Show } from '../types'
import { SwitchPage } from './SwitchPage'

interface Props {
  show: Show
  patches: PatchReport
  update: Update
  selectedId: string | null
  onSelect: (id: string | null) => void
  onOpenGear: (id: string) => void
  onPrint: (switchId: string | null) => void
}

// A VLAN's number, changed when you leave the box (so typing 2 on the way to 20 doesn't
// renumber anything), and only to a number no other VLAN has.
function VlanNumber({ id, taken, onSet }: { id: number; taken: (n: number) => boolean; onSet: (n: number) => void }) {
  const [draft, setDraft] = useState(String(id))
  const [was, setWas] = useState(id)
  if (was !== id) {
    setWas(id)
    setDraft(String(id))
  }
  const n = Number(draft)
  const ok = Number.isInteger(n) && n >= 1 && n <= 4094 && (n === id || !taken(n))
  const commit = () => {
    if (ok && n !== id) onSet(n)
    else setDraft(String(id))
  }
  return (
    <input
      className={ok ? 'vlan-id' : 'vlan-id invalid'}
      type="number"
      min="1"
      max="4094"
      value={draft}
      disabled={id === 1}
      title={id === 1 ? 'VLAN 1 is the default; it keeps its number' : ok ? undefined : 'A number from 1 to 4094 that no other VLAN has'}
      aria-label={`VLAN ${id} number`}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  )
}

// The show's network switches, and its VLANs. A switch is any unit of a model marked as
// a network switch; opening one shows its ports, to set their VLANs and colours for the
// port labels.
export function NetworkView({ show, patches, update, selectedId, onSelect, onOpenGear, onPrint }: Props) {
  const switches = switchesOf(show)
  const selected = switches.find((g) => g.id === selectedId) ?? null
  const switchModels = show.gearModels
    .filter(isSwitchModel)
    .sort((a, b) => `${a.manufacturer} ${a.model}`.localeCompare(`${b.manufacturer} ${b.model}`, undefined, { numeric: true }))

  if (selected) {
    return (
      <SwitchPage
        key={selected.id}
        show={show}
        gear={selected}
        points={patches.byGear.get(selected.id) ?? []}
        update={update}
        onClose={() => onSelect(null)}
        onOpenGear={onOpenGear}
        onPrint={onPrint}
      />
    )
  }

  // A new switch of a model, named on from the show's others ("SW 3").
  const addSwitch = (modelId: string) => {
    const model = show.gearModels.find((m) => m.id === modelId)
    if (!model) return
    const used = show.gear.map((g) => /^SW\s*(\d+)$/i.exec(g.name.trim())?.[1]).filter(Boolean).map(Number)
    const name = `SW ${Math.max(0, ...used) + 1}`
    const unit = newGear({
      name,
      manufacturer: model.manufacturer.trim(),
      model: model.model.trim(),
      categoryId: model.categoryId,
      listId: defaultListId(show),
    })
    update((s) => ({ ...s, gear: [...s.gear, unit] }))
    onSelect(unit.id)
  }

  const vlans = show.info.vlans

  return (
    <section className="pane network-view">
      <div className="toolbar">
        <label className="inline-select">
          <span className="muted">Add a switch</span>
          <select value="" onChange={(e) => addSwitch(e.target.value)} disabled={!switchModels.length} aria-label="Add a switch of a model">
            <option value="">{switchModels.length ? 'Pick a model…' : 'No switch models yet'}</option>
            {switchModels.map((m) => (
              <option key={m.id} value={m.id}>
                {[m.manufacturer, m.model].filter(Boolean).join(' ')}
              </option>
            ))}
          </select>
        </label>
        <span className="spacer" />
        <button onClick={() => onPrint(null)} disabled={!switches.length} title="Opens the switch labels on the Print tab">
          Print labels…
        </button>
      </div>

      <div className="network-body">
        <section className="network-card">
          <h3>
            Switches <span className="muted">({switches.length})</span>
          </h3>
          {switches.length === 0 ? (
            <div className="muted">
              <p>No network switches yet.</p>
              <p className="small">
                Add one above, or add gear of a switch model on the Gear tab. A model is a switch when its <strong>Network switch</strong> box is
                ticked (on a unit, or in Gear → Models). The starter library's switches (Generic, Luminex, NETGEAR) already are; an older show
                can pick them up with Gear → Models → <strong>Update from starter list</strong>.
              </p>
            </div>
          ) : (
            <table className="grid">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Model</th>
                  <th className="num">Ports</th>
                  <th className="num">Set up</th>
                  <th>VLANs</th>
                  <th>Rack</th>
                </tr>
              </thead>
              <tbody>
                {switches.map((g) => {
                  const model = gearModelOf(show, g)
                  const ports = switchPortList(show, g)
                  const setups = ports.map((p) => g.switchPorts[p]).filter(Boolean)
                  const ids = [...new Set(setups.flatMap((p) => [p.vlan, ...p.tagged]))].sort((a, b) => a - b)
                  return (
                    <tr key={g.id} className="clickable" onClick={() => onSelect(g.id)}>
                      <td className="strong nowrap">{gearLabel(g)}</td>
                      <td className="nowrap">{[model?.manufacturer, model?.model].filter(Boolean).join(' ')}</td>
                      <td className="num">{ports.length || <span className="warn">none listed</span>}</td>
                      <td className="num">{setups.length || ''}</td>
                      <td>
                        {ids.map((id) => (
                          <span key={id} className="vlan-chip" style={{ background: vlans.find((v) => v.id === id)?.color }}>
                            {id}
                          </span>
                        ))}
                      </td>
                      <td className="nowrap">{rackById(show, g.rackId)?.name ?? ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>

        <section className="network-card vlans-card">
          <h3>
            VLANs <span className="muted">({vlans.length})</span>
          </h3>
          <p className="muted small">Each port prints in its VLAN's colour unless it has its own. Renumbering a VLAN moves every port on it.</p>
          <table className="grid vlans">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Colour</th>
                <th className="num">Ports</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {vlans.map((v) => {
                const n = vlanUse(show, v.id)
                return (
                  <tr key={v.id}>
                    <td>
                      <VlanNumber id={v.id} taken={(x) => vlans.some((o) => o.id === x)} onSet={(x) => update((s) => setVlan(s, v.id, { id: x }))} />
                    </td>
                    <td>
                      <input
                        value={v.name}
                        placeholder={v.id === 1 ? 'Default' : 'Name, e.g. Dante Pri'}
                        aria-label={`VLAN ${v.id} name`}
                        onChange={(e) => update((s) => setVlan(s, v.id, { name: e.target.value }))}
                      />
                    </td>
                    <td>
                      <input
                        type="color"
                        value={v.color}
                        aria-label={`VLAN ${v.id} colour`}
                        onChange={(e) => update((s) => setVlan(s, v.id, { color: e.target.value }))}
                      />
                    </td>
                    <td className="num muted">{n || ''}</td>
                    <td>
                      {v.id !== 1 && (
                        <button
                          className="icon"
                          aria-label={`Delete VLAN ${v.id}`}
                          title={n ? `${n} port${n === 1 ? '' : 's'} use it` : 'Delete VLAN'}
                          onClick={() => {
                            if (n && !confirm(`Delete VLAN ${v.id}${v.name ? ` (${v.name})` : ''}? Its ${n} port${n === 1 ? '' : 's'} go back to VLAN 1, and trunks stop carrying it.`)) return
                            update((s) => removeVlan(s, v.id))
                          }}
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <button className="add-vlan" onClick={() => update((s) => addVlan(s).show)}>
            + Add VLAN
          </button>
        </section>
      </div>
    </section>
  )
}
