import type { Update } from '../App'
import { cardChoices, cardIn, fits, isCardModel, plainCard, portsInSlot, removeCard, setCard, slotsOf } from '../cards'
import { gearLabel, type PatchPoint } from '../gear'
import { gearModelOf } from '../models'
import { portKey } from '../ports'
import type { Gear, Show } from '../types'

interface Props {
  show: Show
  gear: Gear
  points: PatchPoint[]
  update: Update
  onOpenGear: (id: string) => void
}

// "In 17–24" for a run of ports, or the first few.
function portSummary(ports: string[]): string {
  if (!ports.length) return 'no ports listed'
  if (ports.length <= 3) return ports.join(', ')
  return `${ports[0]} – ${ports[ports.length - 1]} (${ports.length})`
}

// A unit's card slots, each with the card in it: pick a new card of a model that fits, a
// spare card, or empty. A card's own panel says which unit and slot it's in.
export function CardSlots({ show, gear, points, update, onOpenGear }: Props) {
  // A card: where it is.
  if (isCardModel(gearModelOf(show, gear))) {
    const host = gear.host ? show.gear.find((g) => g.id === gear.host!.gearId) : undefined
    return (
      <div className="card-where">
        {host ? (
          <p className="small">
            In{' '}
            <button type="button" className="link" onClick={() => onOpenGear(host.id)}>
              {gearLabel(host)}
            </button>
            , slot {gear.host!.slot}.{' '}
            <button
              type="button"
              className="link"
              onClick={() => update((s) => ({ ...s, gear: s.gear.map((g) => (g.id === gear.id ? { ...g, host: null } : g)) }))}
            >
              Take it out
            </button>
          </p>
        ) : (
          <p className="muted small">A spare card, not in any unit. Put it in one from that unit's Card slots.</p>
        )}
      </div>
    )
  }

  const slots = slotsOf(show, gear)
  if (!slots.length) return null

  const patchedIn = (slot: string, card: Gear) => {
    const model = gearModelOf(show, card)
    const keys = new Set(model ? portsInSlot(model, slot).map(portKey) : [])
    return points.filter((p) => p.port && keys.has(portKey(p.port))).length
  }

  const choose = (slot: string, value: string) => {
    const current = cardIn(show, gear.id, slot)
    const patched = current ? patchedIn(slot, current) : 0
    if (patched && !confirm(`${patched} cable end(s) are patched to this card's ports; they'll show ⚠ until a card with those ports is back. Change it?`)) return
    if (!value) update((s) => (current ? removeCard(s, current.id) : s))
    else if (value.startsWith('model:')) {
      const model = show.gearModels.find((m) => m.id === value.slice(6))
      if (model) update((s) => setCard(s, gear, slot, { model }))
    } else if (value.startsWith('spare:')) update((s) => setCard(s, gear, slot, { spareId: value.slice(6) }))
  }

  return (
    <>
      <h3>
        Card slots <span className="muted">({slots.filter((s) => cardIn(show, gear.id, s)).length} of {slots.length} filled)</span>
      </h3>
      <ul className="card-slots">
        {slots.map((slot) => {
          const card = cardIn(show, gear.id, slot)
          const model = card && gearModelOf(show, card)
          const { models, spares } = cardChoices(show, slot)
          const wrong = model && !fits(model.card, slot)
          return (
            <li key={slot} className={wrong ? 'clash' : undefined}>
              <span className="card-slot-name">{slot}</span>
              <div className="card-slot-body">
                <select
                  value={card ? `card:${card.id}` : ''}
                  aria-label={`Card in ${slot}`}
                  onChange={(e) => choose(slot, e.target.value)}
                >
                  <option value="">Empty</option>
                  {card && (
                    <option value={`card:${card.id}`}>
                      {[card.manufacturer, card.model].filter(Boolean).join(' ') || 'Card'}
                      {card.name.trim() ? ` · ${card.name.trim()}` : ''}
                    </option>
                  )}
                  {models.length > 0 && (
                    <optgroup label={card ? 'Change to' : 'New card'}>
                      {models.map((m) => (
                        <option key={m.id} value={`model:${m.id}`}>
                          {[m.manufacturer, m.model].filter(Boolean).join(' ')}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {spares.length > 0 && (
                    <optgroup label="Spare cards">
                      {spares.map((c) => (
                        <option key={c.id} value={`spare:${c.id}`}>
                          {[c.manufacturer, c.model].filter(Boolean).join(' ')}
                          {c.name.trim() ? ` · ${c.name.trim()}` : ''}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                {card && model && (
                  <span className="muted small">
                    {portSummary(portsInSlot(model, slot))}
                    {!plainCard(card) && (
                      <>
                        {' · '}
                        <button type="button" className="link" onClick={() => onOpenGear(card.id)}>
                          {card.name.trim() || 'card'}
                        </button>
                      </>
                    )}
                  </span>
                )}
                {!card && !models.length && !spares.length && (
                  <span className="muted small">No card models fit “{slot}” yet. Add one in Gear → Models.</span>
                )}
                {wrong && <span className="warn small">⚠ This card is for {model.card} slots.</span>}
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}
