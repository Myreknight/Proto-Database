import { useEffect, useMemo, useState } from 'react'
import type { Update } from '../App'
import {
  bundleById,
  bundleLengthMismatch,
  cableRack,
  linkedCables,
  describeLength,
  newCable,
  totalLength,
  typeById,
  visibleTails,
} from '../show'
import {
  compareValues,
  loadViewSetting,
  nextSort,
  sortItems,
  storeViewSetting,
  type SortState,
  type SortValue,
} from '../sorting'
import type { Bundle, Rack, Show } from '../types'
import { CableEditor } from './CableEditor'
import { SortHeaders, type SortColumn } from './SortHeaders'

interface Props {
  show: Show
  update: Update
  selectedId: string | null
  onSelect: (id: string | null) => void
  onOpenBundle: (id: string) => void
  onOpenRack: (id: string) => void
}

type SortKey = 'name' | 'type' | 'tails' | 'deployment' | 'bundle' | 'from' | 'to' | 'length' | 'named'

interface ViewState {
  sort: SortState<SortKey>
  grouped: boolean
}

const COLUMNS: SortColumn<SortKey>[] = [
  { key: 'name', label: 'Name' },
  { key: 'type', label: 'Type' },
  { key: 'tails', label: 'Tails A / B' },
  { key: 'deployment', label: 'Deployment' },
  { key: 'bundle', label: 'Bundle / Rack' },
  { key: 'from', label: 'From' },
  { key: 'to', label: 'To' },
  { key: 'length', label: 'Length' },
  { key: 'named', label: 'Named', num: true },
]

const VIEW_KEY = 'proto-database:cable-view'

export function CablesView({ show, update, selectedId, onSelect, onOpenBundle, onOpenRack }: Props) {
  const [query, setQuery] = useState('')
  const [view, setView] = useState<ViewState>(() => loadViewSetting(VIEW_KEY, { sort: null, grouped: true }))
  const selected = show.cables.find((c) => c.id === selectedId) ?? null

  useEffect(() => storeViewSetting(VIEW_KEY, view), [view])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return show.cables
      .map((cable) => {
        const type = typeById(show, cable.typeId)
        const tails = visibleTails(show, cable)
        const tailA = typeById(show, cable.tailATypeId)
        const tailB = typeById(show, cable.tailBTypeId)
        return {
          cable,
          type,
          tails,
          named: tails.filter((t) => t.name.trim()).length,
          bundle: bundleById(show, cable.bundleId),
          rack: cableRack(show, cable),
          path: linkedCables(show, cable),
          tailA,
          tailB,
          tailsText: type?.part === 'Trunk' ? `${tailA?.name ?? '—'} / ${tailB?.name ?? '—'}` : '',
        }
      })
      .filter(({ cable, type, tails, bundle, rack }) => {
        if (!q) return true
        return [
          cable.name,
          type?.name,
          cable.from,
          cable.to,
          cable.deployment,
          rack?.name,
          bundle?.name,
          ...tails.map((t) => t.name),
        ].some((v) => v?.toLowerCase().includes(q))
      })
  }, [show, query])

  type Row = (typeof rows)[number]

  const sortValue = (row: Row, key: SortKey): SortValue => {
    switch (key) {
      case 'name':
        return row.cable.name
      case 'type':
        return row.type?.name ?? ''
      case 'tails':
        return row.tailsText
      case 'deployment':
        return row.cable.deployment
      case 'bundle':
        return row.bundle?.name ?? row.rack?.name ?? ''
      case 'from':
        return row.cable.from
      case 'to':
        return row.cable.to
      case 'length':
        return totalLength(row.cable)
      case 'named':
        return row.named
    }
  }

  const sortRows = (list: Row[]) => sortItems(list, view.sort, sortValue)

  // Bundles, then racks (each in their own order, or by name when sorting on that
  // column), then everything that's in neither.
  type Group = { key: string; bundle: Bundle | null; rack: Rack | null; rows: Row[] }
  const buildGroups = (): Group[] => {
    if (!view.grouped) return [{ key: 'all', bundle: null, rack: null, rows: sortRows(rows) }]
    const byName = <T extends { name: string }>(list: T[]) => {
      if (view.sort?.key !== 'bundle') return list
      const dir = view.sort.dir
      return [...list].sort((a, b) => compareValues(a.name, b.name, dir))
    }
    const bundles = byName(show.bundles.filter((b) => rows.some((r) => r.bundle?.id === b.id)))
    const racks = byName(show.racks.filter((k) => rows.some((r) => r.rack?.id === k.id)))
    const list: Group[] = [
      ...bundles.map((bundle) => ({
        key: bundle.id,
        bundle,
        rack: null,
        rows: sortRows(rows.filter((r) => r.bundle?.id === bundle.id)),
      })),
      ...racks.map((rack) => ({
        key: rack.id,
        bundle: null,
        rack,
        rows: sortRows(rows.filter((r) => r.rack?.id === rack.id)),
      })),
    ]
    const rest = rows.filter((r) => !r.bundle && !r.rack)
    if (rest.length) list.push({ key: 'rest', bundle: null, rack: null, rows: sortRows(rest) })
    return list
  }
  const groups = buildGroups()

  // Group rows only help once at least one bundle or rack is in use.
  const showGroupRows = view.grouped && groups.some((g) => g.bundle || g.rack)

  const toggleSort = (key: SortKey) => setView((v) => ({ ...v, sort: nextSort(v.sort, key) }))

  const addCable = () => {
    const cable = newCable(show)
    update((s) => ({ ...s, cables: [...s.cables, cable] }))
    onSelect(cable.id)
  }

  return (
    <div className={selected ? 'split' : 'split no-editor'}>
      <section className="pane">
        <div className="toolbar">
          <button className="primary" onClick={addCable}>
            Add cable
          </button>
          <input
            className="search"
            type="search"
            placeholder="Search names, tails, types, locations…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="check inline">
            <input
              type="checkbox"
              checked={view.grouped}
              onChange={(e) => setView((v) => ({ ...v, grouped: e.target.checked }))}
            />
            Group by bundle &amp; rack
          </label>
        </div>

        {show.cables.length === 0 ? (
          <div className="empty">
            <p>No cables yet.</p>
            <p className="muted">
              Add a cable, give it a name and type, then name its tails. Multipair trunks get a fan-out
              tail on each end.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="grid">
              <thead>
                <SortHeaders columns={COLUMNS} sort={view.sort} onSort={toggleSort} />
              </thead>
              {groups.map(({ key, bundle, rack, rows: groupRows }) => {
                const flagged = groupRows.filter((r) => bundleLengthMismatch(show, r.cable)).length
                const open = bundle ? () => onOpenBundle(bundle.id) : rack ? () => onOpenRack(rack.id) : undefined
                const count = groupRows.length
                return (
                  <tbody key={key}>
                    {showGroupRows && (
                      <tr
                        className={open ? 'group-row clickable' : 'group-row'}
                        onClick={open}
                        title={bundle ? 'Open bundle' : rack ? 'Open rack' : undefined}
                      >
                        <td colSpan={COLUMNS.length}>
                          <strong>
                            {bundle
                              ? bundle.name || 'Unnamed bundle'
                              : rack
                                ? `Rack · ${rack.name || 'Unnamed rack'}`
                                : 'Not in a bundle or rack'}
                          </strong>
                          <span className="muted">
                            {' · '}
                            {count} {rack ? 'interconnect' : 'cable'}
                            {count === 1 ? '' : 's'}
                            {bundle?.length != null && ` · ${bundle.length}'`}
                            {bundle && (bundle.from || bundle.to) && ` · ${[bundle.from, bundle.to].filter(Boolean).join(' → ')}`}
                            {rack?.location && ` · ${rack.location}`}
                          </span>
                          {flagged > 0 && <span className="warn"> · ⚠ {flagged} length{flagged === 1 ? '' : 's'} off</span>}
                        </td>
                      </tr>
                    )}
                    {groupRows.map(({ cable, type, tails, named, bundle: cableBundle, rack: cableRackRow, path, tailA, tailB, tailsText }) => {
                      const mismatch = bundleLengthMismatch(show, cable)
                      return (
                        <tr
                          key={cable.id}
                          className={cable.id === selectedId ? 'selected' : undefined}
                          onClick={() => onSelect(cable.id)}
                        >
                          <td className="strong nowrap">
                            {cable.color && <span className="dot" style={{ background: cable.color }} />}
                            {cable.name || <span className="muted">Unnamed</span>}
                            {path.length > 0 && (
                              <span
                                className="link-mark"
                                title={`Linked path: ${path.map((c) => c.name || 'Unnamed').join(' → ')}`}
                              >
                                🔗
                              </span>
                            )}
                          </td>
                          <td className="nowrap">{type?.name ?? <span className="warn">Missing type</span>}</td>
                          <td
                            className="muted clip"
                            title={type?.part === 'Trunk' ? `${tailA?.name ?? 'None'} / ${tailB?.name ?? 'None'}` : undefined}
                          >
                            {tailsText}
                          </td>
                          <td>
                            <span className={`pill ${cable.deployment}`}>{cable.deployment}</span>
                          </td>
                          <td>{cableBundle?.name ?? cableRackRow?.name ?? ''}</td>
                          <td>{cable.from}</td>
                          <td>{cable.to}</td>
                          <td
                            className={mismatch ? 'nowrap warn' : 'nowrap'}
                            title={mismatch ? `Bundle ${mismatch.name} is ${mismatch.length}'` : undefined}
                          >
                            {mismatch && '⚠ '}
                            {describeLength(cable)}
                          </td>
                          <td className="num muted">
                            {named}/{tails.length}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                )
              })}
            </table>
            {rows.length === 0 && <p className="muted pad">No cables match “{query}”.</p>}
          </div>
        )}
      </section>

      {selected && (
        <CableEditor
          key={selected.id}
          show={show}
          cable={selected}
          update={update}
          onClose={() => onSelect(null)}
          onSelect={onSelect}
        />
      )}
    </div>
  )
}
