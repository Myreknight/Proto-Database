import { useEffect, useState } from 'react'
import type { Update } from '../App'
import { newId } from '../ids'
import { rackGear } from '../gear'
import { frontRowsUsed, rackProblems } from '../racking'
import { addRack, rackCables, typeById } from '../show'
import { loadViewSetting, nextSort, sortItems, storeViewSetting, type SortState, type SortValue } from '../sorting'
import type { Rack, Show } from '../types'
import { RackDrawingsView } from './RackDrawingsView'
import { RackPage } from './RackPage'
import { SortHeaders, type SortColumn } from './SortHeaders'

interface Props {
  show: Show
  update: Update
  selectedId: string | null
  onSelect: (id: string | null) => void
  onOpenCable: (id: string) => void
  onOpenGear: (id: string) => void
}

type SortKey = 'name' | 'location' | 'gear' | 'ru' | 'cables' | 'contents'

const COLUMNS: SortColumn<SortKey>[] = [
  { key: 'name', label: 'Rack' },
  { key: 'location', label: 'Location' },
  { key: 'gear', label: 'Gear', num: true },
  { key: 'ru', label: 'RU', num: true },
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

export function RacksView({ show, update, selectedId, onSelect, onOpenCable, onOpenGear }: Props) {
  const [query, setQuery] = useState('')
  const [view, setView] = useState<{ sort: SortState<SortKey>; mode: 'racks' | 'drawings' }>(() =>
    loadViewSetting(VIEW_KEY, { sort: null, mode: 'racks' }),
  )
  const selected = show.racks.find((r) => r.id === selectedId) ?? null
  const unracked = show.cables.filter((c) => c.deployment === 'interconnect' && !show.racks.some((r) => r.id === c.rackId))

  useEffect(() => storeViewSetting(VIEW_KEY, view), [view])

  // The rack's case goes on the gear list with it.
  const addNewRack = () => {
    const id = newId()
    update((s) => addRack(s, { id }).show)
    onSelect(id)
  }

  const q = query.trim().toLowerCase()
  const allRows = show.racks
    .map((rack) => ({
      rack,
      cables: rackCables(show, rack.id),
      gear: rackGear(show, rack.id),
      ru: frontRowsUsed(show, rack.id),
      problems: rackProblems(show, rack).size,
      contents: contents(show, rack),
    }))
    .filter(
      ({ rack, cables, gear }) =>
        !q ||
        [rack.name, rack.location, ...cables.map((c) => c.name), ...gear.flatMap((g) => [g.name, g.model])].some((v) =>
          v.toLowerCase().includes(q),
        ),
    )

  type Row = (typeof allRows)[number]
  const sortValue = (row: Row, key: SortKey): SortValue => {
    switch (key) {
      case 'name':
        return row.rack.name
      case 'location':
        return row.rack.location
      case 'gear':
        return row.gear.reduce((n, g) => n + g.qty, 0)
      case 'ru':
        return row.ru
      case 'cables':
        return row.cables.length
      case 'contents':
        return row.contents
    }
  }
  const rows = sortItems(allRows, view.sort, sortValue)

  const modeSwitch = (
    <div className="segmented">
      <button className={view.mode === 'racks' ? 'active' : ''} onClick={() => setView((v) => ({ ...v, mode: 'racks' }))}>
        Racks
      </button>
      <button
        className={view.mode === 'drawings' ? 'active' : ''}
        onClick={() => setView((v) => ({ ...v, mode: 'drawings' }))}
      >
        Drawings
      </button>
    </div>
  )

  // An open rack gets the whole tab.
  if (selected) {
    return (
      <RackPage
        key={selected.id}
        show={show}
        rack={selected}
        update={update}
        onClose={() => onSelect(null)}
        onOpenCable={onOpenCable}
        onOpenGear={onOpenGear}
      />
    )
  }

  if (view.mode === 'drawings') return <RackDrawingsView show={show} toolbar={modeSwitch} onOpenGear={onOpenGear} />

  return (
    <div className="split no-editor">
      <section className="pane">
        <div className="toolbar">
          {modeSwitch}
          <button className="primary" onClick={addNewRack}>
            Add rack
          </button>
          <input
            className="search"
            type="search"
            placeholder="Search racks, their gear and interconnects…"
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
              Add a rack here, set a cable's deployment to Interconnect and name its rack when asked, or
              pick a rack for gear in the Gear tab.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <SortHeaders
                  columns={COLUMNS}
                  sort={view.sort}
                  onSort={(key) => setView((v) => ({ ...v, sort: nextSort(v.sort, key) }))}
                />
              </thead>
              <tbody>
                {rows.map(({ rack, cables, gear, ru, problems, contents: summary }) => (
                  <tr
                    key={rack.id}
                    className="clickable"
                    onClick={() => onSelect(rack.id)}
                  >
                    <td className="strong nowrap">{rack.name || <span className="muted">Unnamed</span>}</td>
                    <td>{rack.location}</td>
                    <td className="num">{gear.reduce((n, g) => n + g.qty, 0) || ''}</td>
                    <td
                      className={problems ? 'num nowrap warn' : 'num nowrap'}
                      title={problems ? `${problems} unit(s) overlapping or above the top of the rack` : undefined}
                    >
                      {problems > 0 && '⚠ '}
                      {ru || rack.size ? `${ru}${rack.size ? ` / ${rack.size}` : ''}U` : ''}
                    </td>
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
    </div>
  )
}
