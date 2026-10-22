import { useState } from 'react'
import { categoryById, nextUnitName } from '../gear'
import { expandPorts } from '../ports'
import type { GearModel, Show } from '../types'

interface Props {
  show: Show
  model: GearModel
  onAdd: (opts: { name: string; count: number; rackId: string | null }) => void
  onCancel: () => void
}

// Adds gear of a library model: a name (the next in its series, to start), how many, and
// optionally a rack. Named units number on from the name; with no name, it's one bulk
// line of that many (blank panels, say).
export function AddFromModelDialog({ show, model, onAdd, onCancel }: Props) {
  const [name, setName] = useState(() => nextUnitName(show, model))
  const [count, setCount] = useState('1')
  const [rackId, setRackId] = useState('')
  const n = Math.max(1, Math.min(200, Math.floor(Number(count)) || 1))
  const title = [model.manufacturer, model.model].map((v) => v.trim()).filter(Boolean).join(' ')
  const ports = expandPorts(model.ports).length
  const facts = [
    categoryById(show, model.categoryId)?.name,
    model.ru ? `${model.ru}U${model.halfWidth ? ' half width' : ''}` : '',
    ports ? `${ports} port${ports === 1 ? '' : 's'}` : '',
  ].filter(Boolean)
  const taken = !!name.trim() && show.gear.some((g) => g.name.trim().toLowerCase() === name.trim().toLowerCase())
  const result = name.trim()
    ? n > 1
      ? `${n} units, ${name.trim()} and on`
      : `One unit, ${name.trim()}`
    : n > 1
      ? `One bulk line of ${n}, with no name`
      : 'One unit with no name'

  return (
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <form
        className="dialog"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        onSubmit={(e) => {
          e.preventDefault()
          onAdd({ name, count: n, rackId: rackId || null })
        }}
      >
        <h2>Add {title}</h2>
        {facts.length > 0 && <p className="muted">{facts.join(' · ')}</p>}
        <div className="row2">
          <label className="field">
            <span>Name</span>
            <input
              autoFocus
              className={taken ? 'invalid' : undefined}
              value={name}
              placeholder="e.g. Amp 1"
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="field">
            <span>How many</span>
            <input type="number" min="1" max="200" value={count} onChange={(e) => setCount(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Rack</span>
          <select value={rackId} onChange={(e) => setRackId(e.target.value)}>
            <option value="">Not in a rack</option>
            {show.racks.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name || 'Unnamed rack'}
              </option>
            ))}
          </select>
        </label>
        <p className={taken ? 'flag small' : 'muted small'}>
          {taken ? `⚠ ${name.trim()} is already in the show. ` : ''}
          {result}
          {rackId ? `, placed in ${show.racks.find((r) => r.id === rackId)?.name || 'the rack'}.` : '.'}
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Add
          </button>
        </div>
      </form>
    </div>
  )
}
