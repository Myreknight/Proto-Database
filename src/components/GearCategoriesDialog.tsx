import { useState } from 'react'
import type { Update } from '../App'
import { newId } from '../ids'
import type { GearCategory, Show } from '../types'

interface Props {
  show: Show
  update: Update
  onClose: () => void
}

// Rename, reorder, add and delete the show's gear categories. The gear list prints
// categories in this order.
export function GearCategoriesDialog({ show, update, onClose }: Props) {
  const [draft, setDraft] = useState('')
  const used = (id: string) => show.gear.filter((g) => g.categoryId === id).length

  const setCategories = (fn: (list: GearCategory[]) => GearCategory[]) =>
    update((s) => ({ ...s, gearCategories: fn(s.gearCategories) }))

  const rename = (id: string, name: string) => setCategories((list) => list.map((c) => (c.id === id ? { ...c, name } : c)))

  const move = (index: number, step: -1 | 1) =>
    setCategories((list) => {
      const next = [...list]
      const other = index + step
      if (other < 0 || other >= next.length) return list
      ;[next[index], next[other]] = [next[other], next[index]]
      return next
    })

  const remove = (category: GearCategory) => {
    const n = used(category.id)
    const name = category.name || 'this category'
    if (n && !confirm(`Delete ${name}? Its ${n} gear entr${n === 1 ? 'y becomes' : 'ies become'} Uncategorized.`)) return
    update((s) => ({
      ...s,
      gearCategories: s.gearCategories.filter((c) => c.id !== category.id),
      gear: s.gear.map((g) => (g.categoryId === category.id ? { ...g, categoryId: null } : g)),
    }))
  }

  const add = () => {
    const name = draft.trim()
    if (!name) return
    setCategories((list) => [...list, { id: newId(), name }])
    setDraft('')
  }

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog categories-dialog"
        role="dialog"
        aria-label="Gear categories"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h2>Gear categories</h2>
        <p className="muted">The gear list prints in this order. Renaming a category renames it everywhere.</p>
        <ul className="category-list">
          {show.gearCategories.map((c, i) => {
            const n = used(c.id)
            return (
              <li key={c.id}>
                <input
                  className={c.name.trim() ? undefined : 'invalid'}
                  value={c.name}
                  aria-label="Category name"
                  onChange={(e) => rename(c.id, e.target.value)}
                />
                <span className="muted small num">{n || ''}</span>
                <button className="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                  ↑
                </button>
                <button
                  className="icon"
                  disabled={i === show.gearCategories.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  className="icon"
                  onClick={() => remove(c)}
                  title={n ? `Used by ${n} gear entr${n === 1 ? 'y' : 'ies'}` : 'Delete category'}
                  aria-label={`Delete ${c.name || 'category'}`}
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
        <form
          className="category-add"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <input value={draft} placeholder="New category, e.g. Orchestra" onChange={(e) => setDraft(e.target.value)} />
          <button type="submit" disabled={!draft.trim()}>
            Add
          </button>
        </form>
        <div className="dialog-actions">
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
