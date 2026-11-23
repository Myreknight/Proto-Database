import { useState } from 'react'
import type { Update } from '../App'
import { newId } from '../ids'
import type { GearList, Show } from '../types'

interface Props {
  show: Show
  update: Update
  onClose: () => void
}

// Rename, reorder, add and delete the show's gear lists (Main, Production…). Each unit is
// on one; the gear list prints them in this order, and new gear goes on the first.
export function GearListsDialog({ show, update, onClose }: Props) {
  const [draft, setDraft] = useState('')
  const lists = show.info.gearLists
  const used = (id: string) => show.gear.filter((g) => g.listId === id && !g.steck).length

  const setLists = (fn: (list: GearList[]) => GearList[]) =>
    update((s) => ({ ...s, info: { ...s.info, gearLists: fn(s.info.gearLists) } }))

  const rename = (id: string, name: string) => setLists((list) => list.map((l) => (l.id === id ? { ...l, name } : l)))

  const move = (index: number, step: -1 | 1) =>
    setLists((list) => {
      const next = [...list]
      const other = index + step
      if (other < 0 || other >= next.length) return list
      ;[next[index], next[other]] = [next[other], next[index]]
      return next
    })

  const remove = (gl: GearList) => {
    const n = used(gl.id)
    const name = gl.name || 'this list'
    if (n && !confirm(`Delete ${name}? Its ${n} unit${n === 1 ? '' : 's'} won't be on any list.`)) return
    update((s) => ({
      ...s,
      info: { ...s.info, gearLists: s.info.gearLists.filter((l) => l.id !== gl.id) },
      gear: s.gear.map((g) => (g.listId === gl.id ? { ...g, listId: null } : g)),
    }))
  }

  const add = () => {
    const name = draft.trim()
    if (!name) return
    setLists((list) => [...list, { id: newId(), name }])
    setDraft('')
  }

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog categories-dialog"
        role="dialog"
        aria-label="Gear lists"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h2>Gear lists</h2>
        <p className="muted">
          Each unit is on one list. The gear list prints them in this order, and new gear goes on the first, along
          with the racks and steck rails.
        </p>
        <ul className="category-list">
          {lists.map((l, i) => {
            const n = used(l.id)
            return (
              <li key={l.id}>
                <input
                  className={l.name.trim() ? undefined : 'invalid'}
                  value={l.name}
                  aria-label="List name"
                  onChange={(e) => rename(l.id, e.target.value)}
                />
                <span className="muted small num">{n || ''}</span>
                <button className="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                  ↑
                </button>
                <button className="icon" disabled={i === lists.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                  ↓
                </button>
                <button
                  className="icon"
                  onClick={() => remove(l)}
                  title={n ? `${n} unit${n === 1 ? '' : 's'} on it` : 'Delete list'}
                  aria-label={`Delete ${l.name || 'list'}`}
                >
                  ×
                </button>
              </li>
            )
          })}
        </ul>
        {lists.length === 0 && <p className="muted small">No lists: all gear prints as one gear list.</p>}
        <form
          className="category-add"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <input value={draft} placeholder="New list, e.g. House" onChange={(e) => setDraft(e.target.value)} />
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
