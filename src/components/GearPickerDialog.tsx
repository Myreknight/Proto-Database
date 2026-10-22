import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { categoryById, gearLabel, gearRu } from '../gear'
import { isHalfWidth } from '../racking'
import type { Gear, Rack, Show } from '../types'

interface Props {
  show: Show
  rack: Rack
  onAdd: (gearIds: string[]) => void
  onCancel: () => void
}

// Picks several pieces of gear to put in a rack: click to pick one, Shift-click to pick
// everything between, or click and drag down the list.
export function GearPickerDialog({ show, rack, onAdd, onCancel }: Props) {
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const anchor = useRef<number | null>(null)
  // While dragging: whether rows passed over get picked or unpicked.
  const painting = useRef<boolean | null>(null)

  useEffect(() => {
    const stop = () => (painting.current = null)
    window.addEventListener('pointerup', stop)
    return () => window.removeEventListener('pointerup', stop)
  }, [])

  const order = (g: Gear) => {
    const i = show.gearCategories.findIndex((c) => c.id === g.categoryId)
    return i < 0 ? show.gearCategories.length : i
  }
  const q = query.trim().toLowerCase()
  const rows = show.gear
    .filter((g) => g.rackId !== rack.id)
    .filter((g) => {
      if (!q) return true
      const where = show.racks.find((r) => r.id === g.rackId)?.name ?? ''
      return [g.name, g.manufacturer, g.model, categoryById(show, g.categoryId)?.name ?? '', where].some((v) =>
        v.toLowerCase().includes(q),
      )
    })
    .sort((a, b) => order(a) - order(b) || gearLabel(a).localeCompare(gearLabel(b), undefined, { numeric: true }))

  const set = (ids: string[], on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })

  const down = (e: PointerEvent, i: number) => {
    if (e.button !== 0) return
    e.preventDefault()
    const id = rows[i].id
    if (e.shiftKey && anchor.current != null) {
      const [lo, hi] = [Math.min(anchor.current, i), Math.max(anchor.current, i)]
      set(rows.slice(lo, hi + 1).map((g) => g.id), true)
      return
    }
    const on = !picked.has(id)
    anchor.current = i
    painting.current = on
    set([id], on)
  }

  const enter = (i: number) => {
    if (painting.current == null) return
    set([rows[i].id], painting.current)
  }

  const chosen = rows.filter((g) => picked.has(g.id)).map((g) => g.id)
  const name = rack.name || 'this rack'

  return (
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <form
        className="dialog picker-dialog"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        onSubmit={(e) => {
          e.preventDefault()
          if (chosen.length) onAdd(chosen)
        }}
      >
        <h2>Add gear to {name}</h2>
        <p className="muted small">Click to pick, Shift-click to pick everything between, or click and drag down the list.</p>
        <input
          type="search"
          autoFocus
          className="picker-search"
          placeholder="Search names, models, categories, racks…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ul className="picker-list" role="listbox" aria-multiselectable="true">
          {rows.map((g, i) => {
            const ru = gearRu(show, g)
            const where = show.racks.find((r) => r.id === g.rackId)
            const model = g.name.trim() ? [g.manufacturer, g.model].map((v) => v.trim()).filter(Boolean).join(' ') : ''
            const showCategory = i === 0 || rows[i - 1].categoryId !== g.categoryId
            return (
              <li key={g.id} className="picker-group-wrap">
                {showCategory && <div className="picker-group">{categoryById(show, g.categoryId)?.name ?? 'Uncategorized'}</div>}
                <div
                  role="option"
                  aria-selected={picked.has(g.id)}
                  className={picked.has(g.id) ? 'picker-row picked' : 'picker-row'}
                  onPointerDown={(e) => down(e, i)}
                  onPointerEnter={() => enter(i)}
                >
                  <input type="checkbox" readOnly tabIndex={-1} checked={picked.has(g.id)} aria-hidden="true" />
                  <span className="picker-name">
                    {gearLabel(g)}
                    {g.qty > 1 && ` ×${g.qty}`}
                  </span>
                  <span className="muted small picker-detail">
                    {[model, ru ? `${ru * g.qty}U${isHalfWidth(show, g) ? ' half' : ''}` : 'no rack size', where ? `in ${where.name || 'another rack'}` : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
        {rows.length === 0 && (
          <p className="muted small">{q ? `Nothing matches “${query}”.` : 'All the gear in the show is already in this rack.'}</p>
        )}
        <div className="dialog-actions picker-actions">
          <button type="button" onClick={() => set(rows.map((g) => g.id), true)} disabled={!rows.length}>
            Pick all{q ? ' shown' : ''}
          </button>
          <button type="button" onClick={() => setPicked(new Set())} disabled={!picked.size}>
            Clear
          </button>
          <span className="spacer" />
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!chosen.length}>
            Add {chosen.length || ''} to {name}
          </button>
        </div>
      </form>
    </div>
  )
}
