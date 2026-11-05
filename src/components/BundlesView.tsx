import { useEffect, useState } from 'react'
import type { Update } from '../App'
import { newId } from '../ids'
import { bundleContents, bundleFlags, bundleLengthMismatch } from '../show'
import { loadViewSetting, nextSort, sortItems, storeViewSetting, type SortState, type SortValue } from '../sorting'
import type { Bundle, Show } from '../types'
import { BundlePane } from './BundlePane'
import { BundleSheetsView } from './BundleSheetsView'
import { SortHeaders, type SortColumn } from './SortHeaders'

interface Props {
  show: Show
  update: Update
  selectedId: string | null
  onSelect: (id: string | null) => void
  onOpenCable: (id: string) => void
}

type SortKey = 'name' | 'from' | 'to' | 'length' | 'cables' | 'flag' | 'contents'

const COLUMNS: SortColumn<SortKey>[] = [
  { key: 'name', label: 'Name' },
  { key: 'from', label: 'From' },
  { key: 'to', label: 'To' },
  { key: 'length', label: 'Length' },
  { key: 'cables', label: 'Cables', num: true },
  { key: 'flag', label: 'Flag' },
  { key: 'contents', label: 'Contents' },
]

const VIEW_KEY = 'proto-database:bundle-view'

export function BundlesView({ show, update, selectedId, onSelect, onOpenCable }: Props) {
  const [query, setQuery] = useState('')
  const [view, setView] = useState<{ sort: SortState<SortKey>; mode: 'bundles' | 'sheets' }>(() =>
    loadViewSetting(VIEW_KEY, { sort: null, mode: 'bundles' }),
  )
  const selected = show.bundles.find((b) => b.id === selectedId) ?? null

  useEffect(() => storeViewSetting(VIEW_KEY, view), [view])

  const addBundle = () => {
    const bundle: Bundle = { id: newId(), name: '', from: '', to: '', length: null, notes: '' }
    update((s) => ({ ...s, bundles: [...s.bundles, bundle] }))
    onSelect(bundle.id)
  }

  const q = query.trim().toLowerCase()
  const allRows = show.bundles
    .map((bundle) => {
      const cables = show.cables.filter((c) => c.bundleId === bundle.id)
      return {
        bundle,
        cables,
        contents: bundleContents(show, bundle),
        flagged: cables.filter((c) => bundleLengthMismatch(show, c)).length,
        flags: bundleFlags(show, bundle.id),
      }
    })
    .filter(
      ({ bundle, cables }) =>
        !q ||
        [bundle.name, bundle.from, bundle.to, ...cables.map((c) => c.name)].some((v) => v.toLowerCase().includes(q)),
    )

  type Row = (typeof allRows)[number]
  const sortValue = (row: Row, key: SortKey): SortValue => {
    switch (key) {
      case 'name':
        return row.bundle.name
      case 'from':
        return row.bundle.from
      case 'to':
        return row.bundle.to
      case 'length':
        return row.bundle.length
      case 'cables':
        return row.cables.length
      case 'flag':
        return row.flags.place ?? ''
      case 'contents':
        return row.contents
    }
  }
  const rows = sortItems(allRows, view.sort, sortValue)

  const modeSwitch = (
    <div className="segmented">
      <button className={view.mode === 'bundles' ? 'active' : ''} onClick={() => setView((v) => ({ ...v, mode: 'bundles' }))}>
        Bundles
      </button>
      <button className={view.mode === 'sheets' ? 'active' : ''} onClick={() => setView((v) => ({ ...v, mode: 'sheets' }))}>
        Sheets
      </button>
    </div>
  )

  if (view.mode === 'sheets') {
    return (
      <BundleSheetsView
        show={show}
        toolbar={modeSwitch}
        onOpenBundle={(id) => {
          setView((v) => ({ ...v, mode: 'bundles' }))
          onSelect(id)
        }}
      />
    )
  }

  return (
    <div className={selected ? 'split' : 'split no-editor'}>
      <section className="pane">
        <div className="toolbar">
          {modeSwitch}
          <button className="primary" onClick={addBundle}>
            Add bundle
          </button>
          <input
            className="search"
            type="search"
            placeholder="Search bundles and their cables…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {show.bundles.length === 0 ? (
          <div className="empty">
            <p>No bundles yet.</p>
            <p className="muted">A bundle groups cables that run together along the same path.</p>
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
                {rows.map(({ bundle, cables, contents: summary, flagged, flags }) => (
                  <tr
                    key={bundle.id}
                    className={bundle.id === selectedId ? 'selected' : undefined}
                    onClick={() => onSelect(bundle.id)}
                  >
                    <td className="strong nowrap">{bundle.name || <span className="muted">Unnamed</span>}</td>
                    <td>{bundle.from}</td>
                    <td>{bundle.to}</td>
                    <td className="nowrap">
                      {bundle.length != null ? `${bundle.length}'` : ''}
                      {flagged > 0 && (
                        <span className="warn" title={`${flagged} cable length(s) don't match`}>
                          {' '}
                          ⚠ {flagged}
                        </span>
                      )}
                    </td>
                    <td className="num">{cables.length}</td>
                    <td className="nowrap">
                      {flags.flagged > 0 && (
                        <>
                          ⚑ {flags.place}{' '}
                          <span className="muted">
                            {flags.flagged}/{flags.total}
                          </span>
                        </>
                      )}
                      {flags.reversed.size > 0 && (
                        <span className="warn" title={`${flags.reversed.size} flagged at the opposite end`}>
                          {' '}
                          ⚠ {flags.reversed.size}
                        </span>
                      )}
                    </td>
                    <td className="muted clip wide-clip" title={summary}>
                      {summary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className="muted pad">No bundles match “{query}”.</p>}
          </div>
        )}
      </section>

      {selected && (
        <BundlePane
          key={selected.id}
          show={show}
          bundle={selected}
          update={update}
          onClose={() => onSelect(null)}
          onOpenCable={onOpenCable}
        />
      )}
    </div>
  )
}
