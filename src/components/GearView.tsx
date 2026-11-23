import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Update } from '../App'
import { downloadText, pickTextFile, safeFilename } from '../files'
import {
  categoryById,
  defaultListId,
  gearLabel,
  gearListById,
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
import type { Gear, GearCategory, GearList, Rack, Show } from '../types'
import { GearBatchBar } from './GearBatchBar'
import { GearCategoriesDialog } from './GearCategoriesDialog'
import { GearListsDialog } from './GearListsDialog'
import { GearModelsView } from './GearModelsView'
import { GearPane } from './GearPane'
import { SortHeaders, type SortColumn } from './SortHeaders'

interface Props {
  show: Show
  patches: PatchReport
  update: Update
  selectedId: string | null
  onSelect: (id: string | null) => void
  onOpenCable: (id: string) => void
  onOpenRack: (id: string) => void
  onOpenSwitch: (id: string) => void
  onOpenPrint: () => void
}

type SortKey = 'name' | 'qty' | 'manufacturer' | 'model' | 'category' | 'list' | 'rack' | 'ru' | 'patched' | 'notes'

const COLUMNS: SortColumn<SortKey>[] = [
  { key: 'name', label: 'Name' },
  { key: 'qty', label: 'Qty', num: true },
  { key: 'manufacturer', label: 'Manufacturer' },
  { key: 'model', label: 'Model' },
  { key: 'category', label: 'Category' },
  { key: 'list', label: 'List' },
  { key: 'rack', label: 'Rack' },
  { key: 'ru', label: 'RU', num: true },
  { key: 'patched', label: 'Patched', num: true },
  { key: 'notes', label: 'Notes' },
]

type Mode = 'units' | 'models'
type Grouping = 'category' | 'list' | 'rack' | 'none'

interface View {
  mode: Mode
  group: Grouping
  sort: SortState<SortKey>
}

const VIEW_KEY = 'proto-database:gear-view'

// Connections counted by plug: a From and a Patch A cell on one connector are one.
const plugs = (points: PatchPoint[]) => new Set(points.map((p) => p.slot)).size

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

interface Group {
  key: string
  title: string
  category?: GearCategory | null
  list?: GearList | null
  rack?: Rack | null
  gear: Gear[]
}

// A checkbox that can show "some of these" (a group, or the whole table, partly ticked).
function TriCheckbox({ checked, some, label, onToggle }: { checked: boolean; some: boolean; label: string; onToggle: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some && !checked
  }, [some, checked])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
      onChange={onToggle}
    />
  )
}

export function GearView({ show, patches, update, selectedId, onSelect, onOpenCable, onOpenRack, onOpenSwitch, onOpenPrint }: Props) {
  const [query, setQuery] = useState('')
  const [view, setView] = useState<View>(() => {
    const stored = loadViewSetting<View>(VIEW_KEY, { mode: 'units', group: 'category', sort: null })
    // The gear list moved to the Print tab, so an old "list" mode opens on Units.
    return stored.mode === 'models' ? stored : { ...stored, mode: 'units' }
  })
  const [notice, setNotice] = useState<string | null>(null)
  const [editingCategories, setEditingCategories] = useState(false)
  const [editingLists, setEditingLists] = useState(false)
  // Units ticked for changing several at once, and the last one ticked (for Shift-click).
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set())
  const anchor = useRef<string | null>(null)
  // The toolbar grows with the batch bar in it; the table's headers stick just below it.
  const toolbar = useRef<HTMLDivElement>(null)
  const [toolbarHeight, setToolbarHeight] = useState(57)
  useEffect(() => {
    const el = toolbar.current
    if (!el) return
    const watch = new ResizeObserver(() => setToolbarHeight(el.offsetHeight))
    watch.observe(el)
    return () => watch.disconnect()
  }, [view.mode])
  const selected = view.mode === 'units' ? (show.gear.find((g) => g.id === selectedId) ?? null) : null

  useEffect(() => storeViewSetting(VIEW_KEY, view), [view])

  const addGear = () => {
    const gear = newGear({ listId: defaultListId(show) })
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
        result.newLists.length ? `New lists: ${result.newLists.join(', ')}.` : '',
        ...warnings,
        ...result.warnings,
      ]
        .filter(Boolean)
        .join(' '),
    )
  }

  const exportCsv = () => downloadText(`${safeFilename(show.name)} Gear.csv`, gearToCsv(show), 'text/csv')

  const modeSwitch = (
    <div className="segmented">
      <button className={view.mode === 'units' ? 'active' : ''} onClick={() => setView((v) => ({ ...v, mode: 'units' }))}>
        Units
      </button>
      <button className={view.mode === 'models' ? 'active' : ''} onClick={() => setView((v) => ({ ...v, mode: 'models' }))}>
        Models
      </button>
    </div>
  )

  if (view.mode === 'models') {
    return (
      <GearModelsView
        show={show}
        update={update}
        toolbar={modeSwitch}
        onAdded={(id) => {
          setView((v) => ({ ...v, mode: 'units' }))
          onSelect(id)
        }}
      />
    )
  }

  // Where a unit is: its rack, or for a card, the unit and slot it's in.
  const whereIs = (g: Gear) => {
    if (!g.host) return rackById(show, g.rackId)?.name ?? ''
    const host = show.gear.find((h) => h.id === g.host!.gearId)
    return host ? `in ${gearLabel(host)} · ${g.host.slot}` : ''
  }

  const q = query.trim().toLowerCase()
  // Stecks are built on their rack's page, not listed as gear.
  const units = show.gear.filter((g) => !g.steck)
  const matches = units.filter(
    (g) =>
      !q ||
      [
        g.name,
        g.manufacturer,
        g.model,
        g.notes,
        categoryById(show, g.categoryId)?.name ?? '',
        gearListById(show, g.listId)?.name ?? '',
        rackById(show, g.rackId)?.name ?? '',
      ]
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
      case 'list':
        return gearListById(show, g.listId)?.name ?? ''
      case 'rack':
        return whereIs(g)
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
      : view.group === 'list'
        ? [
            ...show.info.gearLists.map((list) => ({
              key: list.id,
              title: list.name || 'Unnamed list',
              list,
              gear: sorted(matches.filter((g) => g.listId === list.id)),
            })),
            { key: 'none', title: 'No list', list: null, gear: sorted(matches.filter((g) => !gearListById(show, g.listId))) },
          ].filter((g) => g.gear.length > 0)
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

  // Ticking units: in the order they're showing, so Shift-click takes a run.
  const shownIds = groups.flatMap((g) => g.gear.map((u) => u.id))
  const pickedUnits = units.filter((g) => picked.has(g.id))
  const hiddenPicked = pickedUnits.filter((g) => !shownIds.includes(g.id)).length
  const allShown = shownIds.length > 0 && shownIds.every((id) => picked.has(id))
  const setMany = (ids: string[], on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  const pick = (id: string, shift: boolean) => {
    const from = anchor.current ? shownIds.indexOf(anchor.current) : -1
    const to = shownIds.indexOf(id)
    const run = shift && from >= 0 && to >= 0 ? shownIds.slice(Math.min(from, to), Math.max(from, to) + 1) : [id]
    setMany(run, !picked.has(id))
    anchor.current = id
  }
  const clearPicked = () => {
    setPicked(new Set())
    anchor.current = null
  }

  return (
    <div className={selected ? 'split' : 'split no-editor'}>
      <section
        className="pane"
        style={{ '--toolbar-h': `${toolbarHeight}px` } as CSSProperties}
        onKeyDown={(e) => {
          // Esc unticks everything, unless it's leaving a field you're typing in.
          if (e.key !== 'Escape' || !picked.size) return
          const t = e.target
          if ((t instanceof HTMLInputElement && t.type !== 'checkbox') || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return
          clearPicked()
        }}
      >
        <div className="toolbar" ref={toolbar}>
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
              <option value="list">List</option>
              <option value="rack">Rack</option>
              <option value="none">Nothing</option>
            </select>
          </label>
          <span className="spacer" />
          <button onClick={() => setEditingCategories(true)}>Categories…</button>
          <button onClick={() => setEditingLists(true)} title="Main, Production… the lists gear is split into for paperwork">
            Lists…
          </button>
          <button onClick={importCsv}>Import CSV…</button>
          <button onClick={exportCsv} disabled={units.length === 0}>
            Export CSV
          </button>
          <button onClick={onOpenPrint} title="Opens the gear list on the Print tab">
            Print gear list…
          </button>
          {pickedUnits.length > 0 && (
            <GearBatchBar show={show} units={pickedUnits} hidden={hiddenPicked} update={update} onClear={clearPicked} />
          )}
        </div>

        {notice && (
          <div className="notice">
            <span>{notice}</span>
            <button className="icon" onClick={() => setNotice(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        {units.length === 0 ? (
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
                  lead={
                    <th className="pick">
                      <TriCheckbox
                        checked={allShown}
                        some={shownIds.some((id) => picked.has(id))}
                        label="Select all the gear showing"
                        onToggle={() => setMany(shownIds, !allShown)}
                      />
                    </th>
                  }
                />
              </thead>
              {groups.map((group) => {
                const pieces = group.gear.reduce((n, g) => n + g.qty, 0)
                const rack = group.rack
                const ids = group.gear.map((g) => g.id)
                const allIn = ids.every((id) => picked.has(id))
                return (
                  <tbody key={group.key}>
                    {view.group !== 'none' && (
                      <tr
                        className={rack ? 'group-row clickable' : 'group-row'}
                        onClick={rack ? () => onOpenRack(rack.id) : undefined}
                        title={rack ? 'Open rack' : undefined}
                      >
                        <td className="pick">
                          <TriCheckbox
                            checked={allIn}
                            some={ids.some((id) => picked.has(id))}
                            label={`Select all of ${group.title}`}
                            onToggle={() => setMany(ids, !allIn)}
                          />
                        </td>
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
                          className={[g.id === selectedId && 'selected', picked.has(g.id) && 'picked'].filter(Boolean).join(' ') || undefined}
                          onClick={() => onSelect(g.id)}
                        >
                          <td
                            className="pick"
                            onClick={(e) => {
                              e.stopPropagation()
                              pick(g.id, e.shiftKey)
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={picked.has(g.id)}
                              aria-label={`Select ${gearLabel(g)}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                pick(g.id, e.shiftKey)
                              }}
                              onChange={() => {}}
                            />
                          </td>
                          <td className="strong nowrap">
                            {g.name || <span className="muted">{g.qty > 1 ? 'Bulk' : 'No name'}</span>}
                          </td>
                          <td className="num">{g.qty}</td>
                          <td className="nowrap">{g.manufacturer}</td>
                          <td className="nowrap">{g.model}</td>
                          <td className="nowrap">{categoryById(show, g.categoryId)?.name ?? ''}</td>
                          <td className="nowrap">{gearListById(show, g.listId)?.name ?? ''}</td>
                          <td className="nowrap">{whereIs(g)}</td>
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
          report={patches}
          update={update}
          onClose={() => onSelect(null)}
          onOpenCable={onOpenCable}
          onOpenRack={onOpenRack}
          onOpenGear={onSelect}
          onOpenSwitch={onOpenSwitch}
        />
      )}

      {editingCategories && (
        <GearCategoriesDialog show={show} update={update} onClose={() => setEditingCategories(false)} />
      )}
      {editingLists && <GearListsDialog show={show} update={update} onClose={() => setEditingLists(false)} />}
    </div>
  )
}
