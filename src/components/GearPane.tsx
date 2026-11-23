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
  type PatchReport,
} from '../gear'
import type { PatchTarget } from '../patching'
import { parseRu } from '../csv'
import { expandPorts, portKey } from '../ports'
import { defaultLayout } from '../network'
import { placedIn, placeUnplaced, setGearRack, topOf } from '../racking'
import { ensureRack, rackById } from '../show'
import type { Gear, Show } from '../types'
import { PointLink, PortMap } from './PortMap'
import { PortPicker } from './PortPicker'
import { PromptDialog } from './PromptDialog'
import { CardSlots } from './CardSlots'
import { cardsIn, deleteWithCards, isCardModel, plainCard } from '../cards'

interface Props {
  show: Show
  gear: Gear
  points: PatchPoint[]
  report: PatchReport
  update: Update
  onClose: () => void
  onOpenCable: (id: string) => void
  onOpenRack: (id: string) => void
  onOpenGear: (id: string) => void
  onOpenSwitch: (id: string) => void
}

const NEW_RACK = '__new-rack__'

export function GearPane({ show, gear, points, report, update, onClose, onOpenCable, onOpenRack, onOpenGear, onOpenSwitch }: Props) {
  const [askingRack, setAskingRack] = useState(false)
  const [patching, setPatching] = useState<PatchTarget | null>(null)
  const [copying, setCopying] = useState(false)
  // The name when the field was focused, so links can follow a rename once typing is done.
  const nameAtFocus = useRef<string | null>(null)
  // Make and model when one of them was focused, so ports can follow a model rename.
  const modelAtFocus = useRef<{ manufacturer: string; model: string } | null>(null)
  const hasModel = !!gear.model.trim()
  const portSpec = gearModelOf(show, gear)?.ports ?? ''
  const ownModel = gearModelOf(show, gear)
  // A card isn't racked; it goes in another unit's slot.
  const isCard = isCardModel(ownModel)
  const ru = gearModelOf(show, gear)?.ru ?? null
  const half = gearModelOf(show, gear)?.halfWidth ?? false
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
    const linked = points.length
      ? ` ${points.length} cable end(s) or patch point(s) name it; they keep their text but won't link to gear.`
      : ''
    const cards = cardsIn(show, gear.id)
    const kept = cards.filter((c) => !plainCard(c)).length
    const cardNote = cards.length
      ? ` Its ${cards.length} card(s) go with it${kept ? ` (the ${kept} with a name or notes stay on the gear list as spares)` : ''}.`
      : ''
    if (!confirm(`Delete ${label}?${linked}${cardNote}`)) return
    update((s) => deleteWithCards(s, gear.id))
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
            onChange={(e) => patchGear({ name: e.target.value })}
          />
        </label>
        <p className={duplicate ? 'flag small' : 'muted small'}>
          {duplicate
            ? '⚠ Another piece of gear has this name, so cables only link to the first one.'
            : 'Cable ends and patch cells that start with this name link here, like “Amp 1-A”. Leave it blank for bulk items counted by Qty.'}
        </p>

        <div className="row2 file-row">
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
            <span title="Which gear list it's on. Gear → Lists… renames and adds lists.">List</span>
            <select value={gear.listId ?? ''} onChange={(e) => patchGear({ listId: e.target.value || null })}>
              {show.info.gearLists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name || 'Unnamed list'}
                </option>
              ))}
              <option value="">No list</option>
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
        <div className="row2 card-row">
          <label className="field" title="Card slots, shared by every unit of this model">
            <span>Card slots</span>
            <input
              value={ownModel?.slots ?? ''}
              disabled={!hasModel || isCard}
              placeholder={hasModel ? (isCard ? '—' : 'e.g. SD In 1-7, SD Out 1-7') : 'Needs a model'}
              onChange={(e) => update((s) => setModelField(s, gear, { slots: e.target.value }))}
            />
          </label>
          <label className="field" title="If this is a card: the kind of slot it fits, shared by every card of this model">
            <span>Is a card for</span>
            <input
              value={ownModel?.card ?? ''}
              disabled={!hasModel}
              placeholder={hasModel ? 'Slot kind, e.g. SD In, RY, HY' : 'Needs a model'}
              onChange={(e) => update((s) => setModelField(s, gear, { card: e.target.value }))}
            />
          </label>
        </div>
        {isCard && (
          <label className="field" title="How this card's ports are named in a unit">
            <span>Its ports in a unit</span>
            <select
              value={ownModel?.cardNumbering ?? 'slot'}
              onChange={(e) => update((s) => setModelField(s, gear, { cardNumbering: e.target.value as 'slot' | 'continue' }))}
            >
              <option value="slot">Named by slot (RY3 In 1…)</option>
              <option value="continue">Count on through the slots (3rd card: In 17…)</option>
            </select>
          </label>
        )}

        {!isCard && (
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
        {!isCard && rack && (
          <p className="muted small">
            {spot
              ? `Sits at ${spot.height > 1 ? `U${topOf(spot)}–${spot.bottom}` : `U${spot.bottom}`}, ${spot.side} rails${spot.slot ? `, ${spot.slot} half` : ''}. Move it in the rack.`
              : ru
                ? 'Not placed in the rack yet.'
                : 'Give it a rack size to place it in the rack.'}
          </p>
        )}

        {!isCard && (
          <div className="switch-check">
            <label className="check" title="Shared by every unit of this model. A switch gets a page on the Network tab, to set each port's VLANs and colour for its port labels.">
              <input
                type="checkbox"
                checked={!!ownModel?.switchLayout}
                disabled={!hasModel}
                onChange={(e) =>
                  update((s) =>
                    setModelField(s, gear, { switchLayout: e.target.checked ? defaultLayout(expandPorts(ownModel?.ports ?? '')) : null }),
                  )
                }
              />
              Network switch
            </label>
            {ownModel?.switchLayout && (
              <button type="button" className="link small" onClick={() => onOpenSwitch(gear.id)}>
                Ports and labels →
              </button>
            )}
          </div>
        )}

        <CardSlots show={show} gear={gear} points={points} update={update} onOpenGear={onOpenGear} />

        <label className="field">
          <span>Notes</span>
          <textarea rows={3} value={gear.notes} onChange={(e) => patchGear({ notes: e.target.value })} />
        </label>

        {ports.length > 0 ? (
          <>
            <h3>
              Ports <span className="muted">({used} of {ports.length} used)</span>
            </h3>
            <p className="muted small">Click a port (or Enter on it) to patch an interconnect or a tail to it.</p>
            <PortMap show={show} gear={gear} points={points} onPick={setPatching} onOpenCable={onOpenCable} />
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
            disabled={!name}
            title={name ? `Add more units numbered after ${name}` : 'Name it first, or use Qty for bulk items'}
          >
            Make copies…
          </button>
          <button className="danger" onClick={remove}>
            Delete gear
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

      {patching && (
        <PortPicker
          show={show}
          report={report}
          target={patching}
          update={update}
          onClose={() => setPatching(null)}
          onOpenCable={onOpenCable}
        />
      )}
    </aside>
  )
}
