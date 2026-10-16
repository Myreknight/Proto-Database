import { useEffect, useState } from 'react'
import type { Update } from '../App'
import { newId } from '../ids'
import { rackCables, typeById } from '../show'
import { loadViewSetting, nextSort, sortItems, storeViewSetting, type SortState, type SortValue } from '../sorting'
import type { Rack, Show } from '../types'
import { RackPane } from './RackPane'
import { SortHeaders, type SortColumn } from './SortHeaders'

interface Props {
  show: Show
  update: Update
  selectedId: string | null
  onSelect: (id: string | null) => void
  onOpenCable: (id: string) => void
}

type SortKey = 'name' | 'location' | 'cables' | 'contents'

const COLUMNS: SortColumn<SortKey>[] = [
  { key: 'name', label: 'Rack' },
  { key: 'location', label: 'Location' },
  { key: 'cables', label: 'Interconnects', num: true },
  { key: 'contents', label: 'Contents' },
]

const VIEW_KEY = 'proto-database:rack-view'

// "3× IEC C14-C13 Jumper, Cat6 RJ45 Patch" — what's in a rack at a glance.
function contents(show: Show, rack: Rack): string {
  const counts = new Map<string, number>()
  for (const c of rackCables(show, rack.id)) {
    const name = typeById(show, c.typeId)?.name ?? 'Missing type'
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return [...counts].map(([name, n]) => (n > 1 ? `${n}× ${name}` : name)).join(', ')
}

export function RacksView({ show, update, selectedId, onSelect, onOpenCable }: Props) {
  const [query, setQuery] = useState('')
  const [view, setView] = useState<{ sort: SortState<SortKey> }>(() => loadViewSetting(VIEW_KEY, { sort: null }))
  const selected = show.racks.find((r) => r.id === selectedId) ?? null
  const unracked = show.cables.filter((c) => c.deployment === 'interconnect' && !show.racks.some((r) => r.id === c.rackId))

  useEffect(() => storeViewSetting(VIEW_KEY, view), [view])

  const addRack = () => {
    const rack: Rack = { id: newId(), name: '', location: '', notes: '' }
    update((s) => ({ ...s, racks: [...s.racks, rack] }))
    onSelect(rack.id)
  }

  const q = query.trim().toLowerCase()
  const allRows = show.racks
    .map((rack) => ({ rack, cables: rackCables(show, rack.id), contents: contents(show, rack) }))
    .filter(
      ({ rack, cables }) =>
        !q || [rack.name, rack.location, ...cables.map((c) => c.name)].some((v) => v.toLowerCase().includes(q)),
    )

  type Row = (typeof allRows)[number]
  const sortValue = (row: Row, key: SortKey): SortValue => {
    switch (key) {
      case 'name':
        return row.rack.name
      case 'location':
        return row.rack.location
      case 'cables':
        return row.cables.length
      case 'contents':
        return row.contents
    }
  }
  const rows = sortItems(allRows, view.sort, sortValue)

  return (
    <div className={selected ? 'split' : 'split no-editor'}>
      <section className="pane">
        <div className="toolbar">
          <button className="primary" onClick={addRack}>
            Add rack
          </button>
          <input
            className="search"
            type="search"
            placeholder="Search racks and their interconnects…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {unracked.length > 0 && (
            <span className="warn small">
              ⚠ {unracked.length} interconnect{unracked.length === 1 ? " isn't" : "s aren't"} in a rack
            </span>
          )}
        </div>

        {show.racks.length === 0 ? (
          <div className="empty">
            <p>No racks yet.</p>
            <p className="muted">
              Add a rack here, or set a cable's deployment to Interconnect and name its rack when asked.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <SortHeaders
                  columns={COLUMNS}
                  sort={view.sort}
                  onSort={(key) => setView((v) => ({ sort: nextSort(v.sort, key) }))}
                />
              </thead>
              <tbody>
                {rows.map(({ rack, cables, contents: summary }) => (
                  <tr
                    key={rack.id}
                    className={rack.id === selectedId ? 'selected' : undefined}
                    onClick={() => onSelect(rack.id)}
                  >
                    <td className="strong nowrap">{rack.name || <span className="muted">Unnamed</span>}</td>
                    <td>{rack.location}</td>
                    <td className="num">{cables.length}</td>
                    <td className="muted clip wide-clip" title={summary}>
                      {summary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className="muted pad">No racks match “{query}”.</p>}
          </div>
        )}
      </section>

      {selected && (
        <RackPane
          key={selected.id}
          show={show}
          rack={selected}
          update={update}
          onClose={() => onSelect(null)}
          onOpenCable={onOpenCable}
        />
      )}
    </div>
  )
}
