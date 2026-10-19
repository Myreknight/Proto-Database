import { useRef, useState } from 'react'
import type { Update } from '../App'
import {
  applyLibrary,
  carryModelPorts,
  copyGear,
  gearLabel,
  gearModelOf,
  gearPorts,
  renameGearLinks,
  sameModel,
  setModelField,
  setModelPorts,
  type PatchPoint,
} from '../gear'
import { parseRu } from '../csv'
import { portKey } from '../ports'
import { placedIn, placeUnplaced, setGearRack, topOf } from '../racking'
import { deleteRack, ensureRack, rackById, rackDeleteMessage, rackOfCase, updateRack } from '../show'
import type { Gear, Show } from '../types'
import { PromptDialog } from './PromptDialog'

interface Props {
  show: Show
  gear: Gear
  points: PatchPoint[]
  update: Update
  onClose: () => void
  onOpenCable: (id: string) => void
  onOpenRack: (id: string) => void
}

const NEW_RACK = '__new-rack__'

// One cable end or patch cell landing here, opening its cable.
function PointLink({ point, onOpenCable }: { point: PatchPoint; onOpenCable: (id: string) => void }) {
  return (
    <span className="point">
      <button className="link" onClick={() => onOpenCable(point.cable.id)} title="Open in Cables">
        {point.cable.color && <span className="dot" style={{ background: point.cable.color }} />}
        {point.cable.name || 'Unnamed'}
      </button>
      <span className="muted small"> {point.place}</span>
    </span>
  )
}

export function GearPane({ show, gear, points, update, onClose, onOpenCable, onOpenRack }: Props) {
  const [askingRack, setAskingRack] = useState(false)
  const [copying, setCopying] = useState(false)
  // The name when the field was focused, so links can follow a rename once typing is done.
  const nameAtFocus = useRef<string | null>(null)
  // Make and model when one of them was focused, so ports can follow a model rename.
  const modelAtFocus = useRef<{ manufacturer: string; model: string } | null>(null)
  const hasModel = !!gear.model.trim()
  const portSpec = gearModelOf(show, gear)?.ports ?? ''
  const ru = gearModelOf(show, gear)?.ru ?? null
  const half = gearModelOf(show, gear)?.halfWidth ?? false
  const steck = gearModelOf(show, gear)?.steck ?? false
  const spot = gear.rackId ? placedIn(show, gear.rackId).find((p) => p.gear.id === gear.id) : undefined
  const ports = gearPorts(show, gear)
  const sharing = sameModel(show, gear).length
  const modelName = [gear.manufacturer, gear.model].map((v) => v.trim()).filter(Boolean).join(' ')
  const onPort = new Map<string, PatchPoint[]>()
  for (const p of points) {
    if (!p.port) continue
    const key = portKey(p.port)
    const here = onPort.get(key) ?? []
    // A From and Patch A cell on the same connector are one plug, listed once.
    if (!here.some((h) => h.slot === p.slot)) onPort.set(key, [...here, p])
  }
  // With a port list, what names a port it doesn't list, or no port at all.
  const offList = ports.length ? points.filter((p) => !p.port) : []
  const used = ports.filter((port) => onPort.has(portKey(port))).length
  const name = gear.name.trim()
  const label = gearLabel(gear)
  // The case of a rack: its name and size are the rack's.
  const caseOf = rackOfCase(show, gear.id)
  const rack = rackById(show, gear.rackId)
  const duplicate = !!name && show.gear.some((g) => g.id !== gear.id && g.name.trim().toLowerCase() === name.toLowerCase())
  // Suggestions come from the model library first, then whatever other units use.
  const makers = [
    ...new Set([...show.gearModels, ...show.gear].map((g) => g.manufacturer.trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b))
  const maker = gear.manufacturer.trim().toLowerCase()
  const library = show.gearModels
    .filter((m) => m.model.trim() && (!maker || m.manufacturer.trim().toLowerCase() === maker))
    .map((m) => ({
      value: m.model.trim(),
      label: [m.manufacturer.trim(), show.gearCategories.find((c) => c.id === m.categoryId)?.name].filter(Boolean).join(' · '),
    }))
  const known = new Set(library.map((m) => m.value.toLowerCase()))
  const models = [
    ...library,
    ...[...new Set(show.gear.map((g) => g.model.trim()).filter(Boolean))]
      .filter((m) => !known.has(m.toLowerCase()))
      .map((value) => ({ value, label: '' })),
  ].sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true }))
  const modelNotes = gearModelOf(show, gear)?.notes.trim() ?? ''

  const patchGear = (changes: Partial<Gear>) =>
    update((s) => ({ ...s, gear: s.gear.map((g) => (g.id === gear.id ? { ...g, ...changes } : g)) }))

  const commitName = () => {
    const old = nameAtFocus.current
    nameAtFocus.current = null
    if (old != null && old.trim() !== name) update((s) => renameGearLinks(s, gear.id, old))
  }

  const setRackByName = (rackName: string) =>
    update((s) => {
      const { show: next, rackId } = ensureRack(s, rackName)
      return setGearRack(next, gear.id, rackId)
    })

  const focusModel = () => {
    modelAtFocus.current = { manufacturer: gear.manufacturer, model: gear.model }
  }

  const commitModel = () => {
    const before = modelAtFocus.current
    modelAtFocus.current = null
    // A model the library knows fills in the maker and category.
    if (before) update((s) => applyLibrary(carryModelPorts(s, gear.id, before), gear.id))
  }

  const remove = () => {
    if (caseOf) {
      if (!confirm(rackDeleteMessage(show, caseOf))) return
      update((s) => deleteRack(s, caseOf.id))
      onClose()
      return
    }
    const linked = points.length
      ? ` ${points.length} cable end(s) or patch point(s) name it; they keep their text but won't link to gear.`
      : ''
    if (!confirm(`Delete ${label}?${linked}`)) return
    update((s) => ({ ...s, gear: s.gear.filter((g) => g.id !== gear.id) }))
    onClose()
  }

  return (
    <aside className="editor">
      <div className="editor-head">
        <h2>{label}</h2>
        <button className="icon" onClick={onClose} aria-label="Close gear">
          ×
        </button>
      </div>

      <div className="editor-body">
        <label className="field">
          <span>Name</span>
          <input
            autoFocus={!gear.name}
            className={duplicate ? 'invalid' : undefined}
            value={gear.name}
            placeholder="e.g. Amp 1"
            onFocus={() => (nameAtFocus.current = gear.name)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            onChange={(e) =>
              caseOf
                ? update((s) => updateRack(s, caseOf.id, { name: e.target.value }))
                : patchGear({ name: e.target.value })
            }
          />
        </label>
        <p className={duplicate ? 'flag small' : 'muted small'}>
          {duplicate
            ? '⚠ Another piece of gear has this name, so cables only link to the first one.'
            : caseOf
              ? 'This is the case for a rack, so it shares the rack’s name and size. Give it a make and model for the gear list.'
              : 'Cable ends and patch cells that start with this name link here, like “Amp 1-A”. Leave it blank for bulk items counted by Qty.'}
        </p>

        <div className="row2">
          <label className="field">
            <span>Category</span>
            <select
              value={gear.categoryId ?? ''}
              onChange={(e) => patchGear({ categoryId: e.target.value || null })}
            >
              <option value="">Uncategorized</option>
              {show.gearCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || 'Unnamed category'}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Qty</span>
            <input
              type="number"
              min="1"
              value={gear.qty}
              onChange={(e) => patchGear({ qty: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
            />
          </label>
        </div>

        <div className="row2">
          <label className="field">
            <span>Manufacturer</span>
            <input
              list="gear-makers"
              value={gear.manufacturer}
              placeholder="e.g. d&b"
              onFocus={focusModel}
              onBlur={commitModel}
              onChange={(e) => patchGear({ manufacturer: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Model</span>
            <input
              list="gear-models"
              value={gear.model}
              placeholder="e.g. D80"
              onFocus={focusModel}
              onBlur={commitModel}
              onChange={(e) => patchGear({ model: e.target.value })}
            />
          </label>
        </div>
        <datalist id="gear-makers">
          {makers.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <datalist id="gear-models">
          {models.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </datalist>

        {!caseOf && (
          <label className="field">
            <span>
              Ports
              {hasModel && (
                <span className="muted">
                  {' · '}
                  {sharing > 1 ? `shared by all ${sharing} ${modelName}` : `for every ${modelName}`}
                </span>
              )}
            </span>
            <input
              value={portSpec}
              disabled={!hasModel}
              placeholder={hasModel ? 'e.g. In A-D, Out 1-4, Net Pri, Net Sec' : 'Add a model to give it ports'}
              onChange={(e) => update((s) => setModelPorts(s, gear, e.target.value))}
            />
          </label>
        )}
        {(ports.length > 0 || modelNotes) && (
          <p className="muted small">
            {ports.length > 0 && (
              <>
                {ports.length} port{ports.length === 1 ? '' : 's'}: {ports.slice(0, 12).join(', ')}
                {ports.length > 12 && ', …'}
              </>
            )}
            {modelNotes && (
              <span className="model-notes">
                {ports.length > 0 && ' · '}
                {modelNotes}
              </span>
            )}
          </p>
        )}
        {!caseOf && hasModel && (
          <label className="check inline small" title="Shared by every unit of this model">
            <input
              type="checkbox"
              checked={steck}
              onChange={(e) => update((s) => setModelField(s, gear, { steck: e.target.checked }))}
            />
            Steck rail or panel: its ports are slots that tail connectors mount in
          </label>
        )}

        {caseOf ? (
          <div className="row2 rack-row">
            <div className="field">
              <span>Rack</span>
              <button type="button" className="link case-link" onClick={() => onOpenRack(caseOf.id)}>
                Open {caseOf.name || 'the rack'}
              </button>
            </div>
            <label className="field">
              <span title="Rack units. 1U is 1.75 in.">Size (RU)</span>
              <input
                type="number"
                min="1"
                step="1"
                value={caseOf.size ?? ''}
                placeholder="e.g. 12"
                onChange={(e) => update((s) => updateRack(s, caseOf.id, { size: parseRu(e.target.value) }))}
              />
            </label>
          </div>
        ) : (
          <div className="row2 rack-row">
            <label className="field">
              <span>
                Rack
                {rack && (
                  <>
                    {' · '}
                    <button type="button" className="link small" onClick={() => onOpenRack(rack.id)}>
                      Open rack
                    </button>
                  </>
                )}
              </span>
              <select
                value={gear.rackId ?? ''}
                onChange={(e) =>
                  e.target.value === NEW_RACK
                    ? setAskingRack(true)
                    : update((s) => setGearRack(s, gear.id, e.target.value || null))
                }
              >
                <option value="">Not in a rack</option>
                {show.racks.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name || 'Unnamed rack'}
                  </option>
                ))}
                <option value={NEW_RACK}>+ New rack…</option>
              </select>
            </label>
            <label className="field">
              <span title="Rack units, shared by every unit of this model. 1U is 1.75 in.">RU</span>
              <input
                type="number"
                min="0"
                step="1"
                value={ru ?? ''}
                disabled={!hasModel}
                placeholder={hasModel ? 'Not racked' : 'Needs a model'}
                // Units of this model waiting in a rack for a size get a spot once it has one.
                onChange={(e) => update((s) => placeUnplaced(setModelField(s, gear, { ru: parseRu(e.target.value) })))}
              />
            </label>
            <label className="field half-field" title="Half the rack's width, shared by every unit of this model">
              <span>Half</span>
              <input
                type="checkbox"
                checked={half}
                disabled={!hasModel}
                onChange={(e) => update((s) => setModelField(s, gear, { halfWidth: e.target.checked }))}
              />
            </label>
          </div>
        )}
        {!caseOf && rack && (
          <p className="muted small">
            {spot
              ? `Sits at ${spot.height > 1 ? `U${topOf(spot)}–${spot.bottom}` : `U${spot.bottom}`}, ${spot.side} rails${spot.slot ? `, ${spot.slot} half` : ''}. Move it in the rack.`
              : ru
                ? 'Not placed in the rack yet.'
                : 'Give it a rack size to place it in the rack.'}
          </p>
        )}

        <label className="field">
          <span>Notes</span>
          <textarea rows={3} value={gear.notes} onChange={(e) => patchGear({ notes: e.target.value })} />
        </label>

        {ports.length > 0 ? (
          <>
            <h3>
              Ports <span className="muted">({used} of {ports.length} used)</span>
            </h3>
            <ul className="port-map">
              {ports.map((port) => {
                const here = onPort.get(portKey(port)) ?? []
                return (
                  <li key={port} className={here.length > 1 ? 'clash' : here.length ? undefined : 'free'}>
                    <span className="port-name">{port}</span>
                    <span className="port-use">
                      {here.length === 0
                        ? '—'
                        : here.map((p, i) => <PointLink key={`${p.cable.id}-${p.field}-${i}`} point={p} onOpenCable={onOpenCable} />)}
                    </span>
                  </li>
                )
              })}
            </ul>
            {offList.length > 0 && (
              <>
                <h4 className="port-off-head">Not on a listed port</h4>
                <ul className="gear-connections">
                  {offList.map((p, i) => (
                    <li key={`${p.cable.id}-${p.field}-${i}`}>
                      <PointLink point={p} onOpenCable={onOpenCable} />
                      <span className="small">{p.text}</span>
                      <span className={p.issue ? 'warn small' : 'muted small'}>{p.issue ?? 'No port given'}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : (
          <>
            <h3>
              Patched here <span className="muted">({points.length})</span>
            </h3>
            {points.length === 0 ? (
              <p className="muted small">
                {name
                  ? `Nothing links to ${name} yet. Start a cable's From or To, or a patch cell, with “${name}”.`
                  : 'Give this gear a name to patch cables to it.'}
              </p>
            ) : (
              <ul className="gear-connections">
                {points.map((p, i) => (
                  <li key={`${p.cable.id}-${p.field}-${i}`}>
                    <PointLink point={p} onOpenCable={onOpenCable} />
                    <span className="small">{p.text}</span>
                    {p.issue && <span className="warn small">⚠ {p.issue}</span>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <div className="editor-actions">
          <button
            onClick={() => setCopying(true)}
            disabled={!name || !!caseOf}
            title={
              caseOf
                ? 'Add another rack from the Interconnects tab'
                : name
                  ? `Add more units numbered after ${name}`
                  : 'Name it first, or use Qty for bulk items'
            }
          >
            Make copies…
          </button>
          <button className="danger" onClick={remove}>
            {caseOf ? 'Delete rack' : 'Delete gear'}
          </button>
        </div>
      </div>

      {askingRack && (
        <PromptDialog
          title="New rack"
          detail={`Which rack is ${label} mounted in?`}
          label="Rack"
          initial=""
          suggestions={[]}
          confirmLabel="Set rack"
          cancelLabel="Cancel"
          onCancel={() => setAskingRack(false)}
          onConfirm={(rackName) => {
            setRackByName(rackName)
            setAskingRack(false)
          }}
        />
      )}

      {copying && (
        <PromptDialog
          title="Make copies"
          detail={`Copies of ${name} keep its category, model, rack and notes, and are numbered on from the highest one already in the show.`}
          label="How many copies"
          initial="1"
          suggestions={[]}
          inputMode="numeric"
          confirmLabel="Make copies"
          cancelLabel="Cancel"
          onCancel={() => setCopying(false)}
          onConfirm={(value) => {
            const count = Math.min(200, Math.floor(Number(value)))
            if (count >= 1) update((s) => copyGear(s, gear.id, count))
            setCopying(false)
          }}
        />
      )}
    </aside>
  )
}
