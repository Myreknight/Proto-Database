import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Update } from '../App'
import { downloadText, pickTextFile, safeFilename } from '../files'
import {
  categoryById,
  gearList,
  gearListToCsv,
  gearRu,
  gearRowsFromCsv,
  gearSections,
  gearToCsv,
  importGear,
  newGear,
  type PatchPoint,
  type PatchReport,
} from '../gear'
import { rackById } from '../show'
import { loadViewSetting, nextSort, sortItems, storeViewSetting, type SortState, type SortValue } from '../sorting'
import type { Gear, GearCategory, Rack, Show } from '../types'
import { GearCategoriesDialog } from './GearCategoriesDialog'
import { GearModelsView } from './GearModelsView'
import { GearPane } from './GearPane'
import { PrintHeader } from './PrintHeader'
import { SortHeaders, type SortColumn } from './SortHeaders'

interface Props {
  show: Show
  patches: PatchReport
  update: Update
  selectedId: string | null
  onSelect: (id: string | null) => void
  onOpenCable: (id: string) => void
  onOpenRack: (id: string) => void
}

type SortKey = 'name' | 'qty' | 'manufacturer' | 'model' | 'category' | 'rack' | 'ru' | 'patched' | 'notes'

const COLUMNS: SortColumn<SortKey>[] = [
  { key: 'name', label: 'Name' },
  { key: 'qty', label: 'Qty', num: true },
  { key: 'manufacturer', label: 'Manufacturer' },
  { key: 'model', label: 'Model' },
  { key: 'category', label: 'Category' },
  { key: 'rack', label: 'Rack' },
  { key: 'ru', label: 'RU', num: true },
  { key: 'patched', label: 'Patched', num: true },
  { key: 'notes', label: 'Notes' },
]

type Mode = 'units' | 'list' | 'models'
type Grouping = 'category' | 'rack' | 'none'

interface View {
  mode: Mode
  group: Grouping
  sort: SortState<SortKey>
}

const VIEW_KEY = 'proto-database:gear-view'

// Printed on letter paper with normal margins, like the cable list.
const PRINT_PAGE = '@media print { @page { size: letter; margin: 0.5in; } }'

const today = () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

// Connections counted by plug: a From and a Patch A cell on one connector are one.
const plugs = (points: PatchPoint[]) => new Set(points.map((p) => p.slot)).size

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

interface Group {
  key: string
  title: string
  category?: GearCategory | null
  rack?: Rack | null
  gear: Gear[]
}

export function GearView({ show, patches, update, selectedId, onSelect, onOpenCable, onOpenRack }: Props) {
  const [query, setQuery] = useState('')
  const [view, setView] = useState<View>(() => loadViewSetting(VIEW_KEY, { mode: 'units', group: 'category', sort: null }))
  const [notice, setNotice] = useState<string | null>(null)
  const [editingCategories, setEditingCategories] = useState(false)
  const [printDate, setPrintDate] = useState('')
  const selected = view.mode === 'units' ? (show.gear.find((g) => g.id === selectedId) ?? null) : null

  useEffect(() => storeViewSetting(VIEW_KEY, view), [view])

  // Stamp the date as printing starts, whether from the button or ⌘P.
  useEffect(() => {
    const stamp = () => flushSync(() => setPrintDate(today()))
    window.addEventListener('beforeprint', stamp)
    return () => window.removeEventListener('beforeprint', stamp)
  }, [])

  const addGear = () => {
    const gear = newGear()
    update((s) => ({ ...s, gear: [...s.gear, gear] }))
    onSelect(gear.id)
    setQuery('')
  }

  const importCsv = async () => {
    const text = await pickTextFile('.csv,text/csv')
    if (text == null) return
    const { rows, warnings } = gearRowsFromCsv(text)
    if (rows.length === 0) {
      setNotice(`Nothing imported. ${warnings.join(' ')}`)
      return
    }
    const result = importGear(show, rows)
    update(() => result.show)
    setNotice(
      [
        `Imported ${plural(rows.length, 'row')}: ${result.updated} updated, ${result.added} added.`,
        result.newCategories.length ? `New categories: ${result.newCategories.join(', ')}.` : '',
        result.newRacks.length ? `New racks: ${result.newRacks.join(', ')}.` : '',
        ...warnings,
        ...result.warnings,
      ]
        .filter(Boolean)
        .join(' '),
    )
  }

  const exportCsv = () => downloadText(`${safeFilename(show.name)} Gear.csv`, gearToCsv(show), 'text/csv')
  const exportListCsv = () => downloadText(`${safeFilename(show.name)} Gear List.csv`, gearListToCsv(show), 'text/csv')

  const print = () => {
    flushSync(() => setPrintDate(today()))
    window.print()
  }

  const modeSwitch = (
    <div className="segmented">
      <button className={view.mode === 'units' ? 'active' : ''} onClick={() => setView((v) => ({ ...v, mode: 'units' }))}>
        Units
      </button>
      <button className={view.mode === 'list' ? 'active' : ''} onClick={() => setView((v) => ({ ...v, mode: 'list' }))}>
        Gear list
      </button>
      <button className={view.mode === 'models' ? 'active' : ''} onClick={() => setView((v) => ({ ...v, mode: 'models' }))}>
        Models
      </button>
    </div>
  )

  if (view.mode === 'models') return <GearModelsView show={show} update={update} toolbar={modeSwitch} />

  if (view.mode === 'list') {
    const sections = gearList(show)
    const total = sections.reduce((n, s) => n + s.qty, 0)
    return (
      <section className="pane pull-view">
        <style>{PRINT_PAGE}</style>
        <div className="toolbar">
          {modeSwitch}
          <button className="primary" onClick={print} disabled={total === 0}>
            Print…
          </button>
          <button onClick={exportListCsv} disabled={total === 0}>
            Export CSV
          </button>
          <span className="muted">{plural(total, 'piece')}, totaled by model within each category.</span>
        </div>
        {total === 0 ? (
          <div className="empty">
            <p>Nothing on the gear list yet.</p>
            <p className="muted">Gear you add under Units shows up here, totaled by category and model.</p>
          </div>
        ) : (
          <div className="pull-body">
            <PrintHeader
              show={show}
              title="Gear List"
              meta={[printDate, plural(total, 'piece'), `Proto Database v${__APP_VERSION__}`]}
            />
            {sections.map(({ category, lines, qty }) => (
              <section key={category?.id ?? 'none'} className="pull-section">
                <h3>
                  {category?.name || (category ? 'Unnamed category' : 'Uncategorized')}{' '}
                  <span className="muted">({plural(qty, 'piece')})</span>
                </h3>
                <table className="grid pull">
                  <colgroup>
                    <col style={{ width: '8%' }} />
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '24%' }} />
                    <col style={{ width: '24%' }} />
                    <col style={{ width: '24%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="num">Qty</th>
                      <th>Manufacturer</th>
                      <th>Model</th>
                      <th>Units</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.key}>
                        <td className="num strong">{l.qty}</td>
                        <td>{l.manufacturer}</td>
                        <td className="strong">{l.model}</td>
                        <td className="muted">{l.units}</td>
                        <td className="muted">{l.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        )}
      </section>
    )
  }

  const q = query.trim().toLowerCase()
  const matches = show.gear.filter(
    (g) =>
      !q ||
      [g.name, g.manufacturer, g.model, g.notes, categoryById(show, g.categoryId)?.name ?? '', rackById(show, g.rackId)?.name ?? '']
        .some((v) => v.toLowerCase().includes(q)),
  )

  const sortValue = (g: Gear, key: SortKey): SortValue => {
    switch (key) {
      case 'name':
        return g.name
      case 'qty':
        return g.qty
      case 'manufacturer':
        return g.manufacturer
      case 'model':
        return g.model
      case 'category':
        return categoryById(show, g.categoryId)?.name ?? ''
      case 'rack':
        return rackById(show, g.rackId)?.name ?? ''
      case 'ru':
        return gearRu(show, g)
      case 'patched':
        return plugs(patches.byGear.get(g.id) ?? [])
      case 'notes':
        return g.notes
    }
  }
  const sorted = (gear: Gear[]) => sortItems(gear, view.sort, sortValue)

  const groups: Group[] =
    view.group === 'category'
      ? gearSections(show, matches).map(({ category, gear }) => ({
          key: category?.id ?? 'none',
          title: category ? category.name || 'Unnamed category' : 'Uncategorized',
          category,
          gear: sorted(gear),
        }))
      : view.group === 'rack'
        ? [
            ...show.racks.map((rack) => ({
              key: rack.id,
              title: `Rack · ${rack.name || 'Unnamed rack'}`,
              rack,
              gear: sorted(matches.filter((g) => g.rackId === rack.id)),
            })),
            {
              key: 'none',
              title: 'Not in a rack',
              rack: null,
              gear: sorted(matches.filter((g) => !rackById(show, g.rackId))),
            },
          ].filter((g) => g.gear.length > 0)
        : [{ key: 'all', title: '', gear: sorted(matches) }]

  return (
    <div className={selected ? 'split' : 'split no-editor'}>
      <section className="pane">
        <div className="toolbar">
          {modeSwitch}
          <button className="primary" onClick={addGear}>
            Add gear
          </button>
          <input
            className="search"
            type="search"
            placeholder="Search names, models, categories, racks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="inline-select">
            <span className="muted">Group by</span>
            <select value={view.group} onChange={(e) => setView((v) => ({ ...v, group: e.target.value as Grouping }))}>
              <option value="category">Category</option>
              <option value="rack">Rack</option>
              <option value="none">Nothing</option>
            </select>
          </label>
          <span className="spacer" />
          <button onClick={() => setEditingCategories(true)}>Categories…</button>
          <button onClick={importCsv}>Import CSV…</button>
          <button onClick={exportCsv} disabled={show.gear.length === 0}>
            Export CSV
          </button>
        </div>

        {notice && (
          <div className="notice">
            <span>{notice}</span>
            <button className="icon" onClick={() => setNotice(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        {show.gear.length === 0 ? (
          <div className="empty">
            <p>No gear yet.</p>
            <p className="muted">
              Add gear one unit at a time, or import a gear list CSV with columns like Category, Name, Qty,
              Manufacturer, Model, Rack and Notes. Name units the way you write them on a patch, like Amp 1: a
              cable end or patch cell that starts with that name links to it.
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
              {groups.map((group) => {
                const pieces = group.gear.reduce((n, g) => n + g.qty, 0)
                const rack = group.rack
                return (
                  <tbody key={group.key}>
                    {view.group !== 'none' && (
                      <tr
                        className={rack ? 'group-row clickable' : 'group-row'}
                        onClick={rack ? () => onOpenRack(rack.id) : undefined}
                        title={rack ? 'Open rack' : undefined}
                      >
                        <td colSpan={COLUMNS.length}>
                          <strong>{group.title}</strong>
                          <span className="muted">
                            {' · '}
                            {plural(pieces, 'piece')}
                            {rack?.location && ` · ${rack.location}`}
                          </span>
                        </td>
                      </tr>
                    )}
                    {group.gear.map((g) => {
                      const points = patches.byGear.get(g.id) ?? []
                      const issues = plugs(points.filter((p) => p.issue))
                      return (
                        <tr
                          key={g.id}
                          className={g.id === selectedId ? 'selected' : undefined}
                          onClick={() => onSelect(g.id)}
                        >
                          <td className="strong nowrap">
                            {g.name || <span className="muted">{g.qty > 1 ? 'Bulk' : 'No name'}</span>}
                          </td>
                          <td className="num">{g.qty}</td>
                          <td className="nowrap">{g.manufacturer}</td>
                          <td className="nowrap">{g.model}</td>
                          <td className="nowrap">{categoryById(show, g.categoryId)?.name ?? ''}</td>
                          <td className="nowrap">{rackById(show, g.rackId)?.name ?? ''}</td>
                          <td className="num">{gearRu(show, g) ?? ''}</td>
                          <td
                            className={issues ? 'num warn' : 'num muted'}
                            title={issues ? `${issues} patch warning(s)` : undefined}
                          >
                            {issues > 0 && '⚠ '}
                            {plugs(points) || ''}
                          </td>
                          <td className="muted clip" title={g.notes}>
                            {g.notes}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                )
              })}
            </table>
            {matches.length === 0 && <p className="muted pad">No gear matches “{query}”.</p>}
          </div>
        )}
      </section>

      {selected && (
        <GearPane
          key={selected.id}
          show={show}
          gear={selected}
          points={patches.byGear.get(selected.id) ?? []}
          update={update}
          onClose={() => onSelect(null)}
          onOpenCable={onOpenCable}
          onOpenRack={onOpenRack}
        />
      )}

      {editingCategories && (
        <GearCategoriesDialog show={show} update={update} onClose={() => setEditingCategories(false)} />
      )}
    </div>
  )
}
