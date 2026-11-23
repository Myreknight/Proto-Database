import { useEffect, useState } from 'react'
import type { Update } from '../App'
import { batchEditGear, type GearBatch } from '../gear'
import { loadViewSetting, storeViewSetting } from '../sorting'
import type { Gear, Show } from '../types'

interface Props {
  show: Show
  // The units ticked on the Gear tab.
  units: Gear[]
  // How many of them the search is hiding.
  hidden: number
  update: Update
  onClear: () => void
}

type Field = 'list' | 'manufacturer' | 'model' | 'category' | 'rack' | 'qty' | 'notes'

const FIELDS: { id: Field; label: string }[] = [
  { id: 'list', label: 'List' },
  { id: 'manufacturer', label: 'Manufacturer' },
  { id: 'model', label: 'Model' },
  { id: 'category', label: 'Category' },
  { id: 'rack', label: 'Rack' },
  { id: 'qty', label: 'Qty' },
  { id: 'notes', label: 'Add to notes' },
]

const FIELDS_KEY = 'proto-database:gear-batch-fields'
const SHOWN: Field[] = ['list', 'manufacturer', 'category', 'rack']
const MIXED = '__mixed'

// The value every unit shares, or MIXED.
function common<T>(units: Gear[], get: (g: Gear) => T): T | typeof MIXED {
  const first = get(units[0])
  return units.every((g) => get(g) === first) ? first : MIXED
}

// A text box that changes every ticked unit when you press Enter (or click Set).
function BatchText({
  label,
  value,
  list,
  type = 'text',
  clearAfter,
  placeholder,
  onSet,
}: {
  label: string
  value: string | typeof MIXED
  list?: string
  type?: 'text' | 'number'
  clearAfter?: boolean
  placeholder?: string
  onSet: (value: string) => void
}) {
  const start = value === MIXED ? '' : value
  const [draft, setDraft] = useState(start)
  // A new selection (or someone else's change) starts the box over.
  const [was, setWas] = useState(start)
  if (was !== start) {
    setWas(start)
    setDraft(start)
  }
  const dirty = clearAfter ? draft.trim() !== '' : draft !== start
  const set = () => {
    if (!dirty) return
    onSet(draft)
    if (clearAfter) setDraft('')
  }
  return (
    <label className="batch-field">
      <span className="muted small">{label}</span>
      <span className="batch-input">
        <input
          type={type}
          min={type === 'number' ? 1 : undefined}
          list={list}
          value={draft}
          placeholder={value === MIXED ? 'Mixed' : placeholder}
          aria-label={`${label} for the selected gear`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              e.stopPropagation()
              set()
            }
          }}
        />
        {dirty && (
          <button type="button" className="small" onClick={set}>
            Set
          </button>
        )}
      </span>
    </label>
  )
}

// A menu that changes every ticked unit as soon as you pick.
function BatchSelect({
  label,
  value,
  options,
  onSet,
}: {
  label: string
  value: string | typeof MIXED
  options: { value: string; label: string }[]
  onSet: (value: string) => void
}) {
  return (
    <label className="batch-field">
      <span className="muted small">{label}</span>
      <select value={value} aria-label={`${label} for the selected gear`} onChange={(e) => onSet(e.target.value)}>
        {value === MIXED && (
          <option value={MIXED} disabled>
            Mixed
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

// The bar over the gear table while units are ticked: each field shows what they share
// ("Mixed" if they differ), and changing it changes them all, as one undo step. Which
// fields it offers is up to you (Fields).
export function GearBatchBar({ show, units, hidden, update, onClear }: Props) {
  const [shown, setShown] = useState<Field[]>(() => {
    const stored = loadViewSetting<{ fields: Field[] }>(FIELDS_KEY, { fields: SHOWN }).fields
    return Array.isArray(stored) ? FIELDS.map((f) => f.id).filter((id) => stored.includes(id)) : SHOWN
  })
  useEffect(() => storeViewSetting(FIELDS_KEY, { fields: shown }), [shown])

  const ids = units.map((g) => g.id)
  const apply = (change: GearBatch) => update((s) => batchEditGear(s, ids, change))
  const pieces = units.reduce((n, g) => n + g.qty, 0)
  const cards = units.filter((g) => g.host).length
  const makers = [...new Set([...show.gearModels, ...show.gear].map((g) => g.manufacturer.trim()).filter(Boolean))].sort()
  const models = [...new Set(show.gearModels.map((m) => m.model.trim()).filter(Boolean))].sort()

  const field = (id: Field) => {
    switch (id) {
      case 'list':
        return (
          <BatchSelect
            key={id}
            label="List"
            value={common(units, (g) => g.listId ?? '')}
            options={[
              ...show.info.gearLists.map((l) => ({ value: l.id, label: l.name || 'Unnamed list' })),
              { value: '', label: 'No list' },
            ]}
            onSet={(v) => apply({ listId: v || null })}
          />
        )
      case 'manufacturer':
        return (
          <BatchText
            key={id}
            label="Manufacturer"
            list="batch-makers"
            value={common(units, (g) => g.manufacturer)}
            onSet={(v) => apply({ manufacturer: v })}
          />
        )
      case 'model':
        return (
          <BatchText
            key={id}
            label="Model"
            list="batch-models"
            value={common(units, (g) => g.model)}
            onSet={(v) => apply({ model: v })}
          />
        )
      case 'category':
        return (
          <BatchSelect
            key={id}
            label="Category"
            value={common(units, (g) => g.categoryId ?? '')}
            options={[
              ...show.gearCategories.map((c) => ({ value: c.id, label: c.name || 'Unnamed category' })),
              { value: '', label: 'Uncategorized' },
            ]}
            onSet={(v) => apply({ categoryId: v || null })}
          />
        )
      case 'rack': {
        const rackable = units.filter((g) => !g.host)
        return (
          <BatchSelect
            key={id}
            label={cards ? `Rack (not the ${cards} card${cards === 1 ? '' : 's'})` : 'Rack'}
            value={rackable.length ? common(rackable, (g) => g.rackId ?? '') : MIXED}
            options={[
              ...show.racks.map((r) => ({ value: r.id, label: r.name || 'Unnamed rack' })),
              { value: '', label: 'Not in a rack' },
            ]}
            onSet={(v) => apply({ rackId: v || null })}
          />
        )
      }
      case 'qty':
        return (
          <BatchText
            key={id}
            label="Qty"
            type="number"
            value={(() => {
              const q = common(units, (g) => g.qty)
              return q === MIXED ? MIXED : String(q)
            })()}
            onSet={(v) => apply({ qty: Number(v) })}
          />
        )
      case 'notes':
        return (
          <BatchText
            key={id}
            label="Add to notes"
            value=""
            placeholder="A line for each one's notes"
            clearAfter
            onSet={(v) => apply({ addNote: v })}
          />
        )
    }
  }

  return (
    <div className="batch-bar" role="region" aria-label="Change the selected gear">
      <div className="batch-count">
        <strong>{units.length} selected</strong>
        <span className="muted small">
          {pieces !== units.length && `${pieces} pieces`}
          {hidden > 0 && `${pieces !== units.length ? ' · ' : ''}${hidden} hidden by the search`}
        </span>
      </div>
      {shown.map(field)}
      <span className="spacer" />
      <details className="batch-fields">
        <summary title="Choose which fields this bar shows">Fields</summary>
        <div className="batch-fields-menu">
          {FIELDS.map((f) => (
            <label key={f.id}>
              <input
                type="checkbox"
                checked={shown.includes(f.id)}
                onChange={(e) =>
                  setShown((list) =>
                    e.target.checked ? FIELDS.map((x) => x.id).filter((x) => x === f.id || list.includes(x)) : list.filter((x) => x !== f.id),
                  )
                }
              />
              {f.label}
            </label>
          ))}
        </div>
      </details>
      <button onClick={onClear} title="Untick everything (Esc)">
        Clear
      </button>
      <datalist id="batch-makers">
        {makers.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <datalist id="batch-models">
        {models.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </div>
  )
}
