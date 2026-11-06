import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { Update } from '../App'
import { gearPorts, steckFaces, type PatchReport } from '../gear'
import {
  cellIsHere,
  endIsHere,
  endNow,
  fanEnds,
  leavesRack,
  plugCells,
  plugEnd,
  targetLabel,
  targetText,
  unplugPoint,
  type End,
  type FanCell,
  type FanEnd,
  type PatchTarget,
} from '../patching'
import { portKey } from '../ports'
import { bundleById, rackById, typeById } from '../show'
import type { Cable, Show } from '../types'
import { PointLink } from './PortMap'

interface Props {
  show: Show
  report: PatchReport
  target: PatchTarget
  update: Update
  onClose: () => void
  onOpenCable: (id: string) => void
}

const ENDS: End[] = ['A', 'B']

// A cable picked by its ends (each end whole, or connector by connector when it has a
// fan), or one tail of a trunk, pair by pair.
type Row =
  | { key: string; kind: 'cable'; cable: Cable; ends: { end: End; fan?: FanEnd }[] }
  | { key: string; kind: 'fan'; fan: FanEnd }

interface Group {
  title: string
  rows: Row[]
  // Listed only while searching, so they don't bury the rack's own.
  searchOnly?: boolean
}

const byName = (a: Cable, b: Cable) => a.name.localeCompare(b.name, undefined, { numeric: true })

// "#3 to Amp 2 · In A, #4 to Amp 2 · In B and 2 more"
function listOf(items: string[]): string {
  const shown = items.length > 4 ? [...items.slice(0, 3), `${items.length - 3} more`] : items
  return shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : (shown[0] ?? '')
}

// "#3", or "Connector 3"
const cellShort = (c: FanCell) => (c.label.startsWith('#') ? `#${c.index + 1}` : `Connector ${c.index + 1}`)

// "#1–#8", or "Connectors 1–4"
const cellRange = (cells: FanCell[]) => {
  if (cells.length === 1) return cells[0].label
  const n = (c: FanCell) => c.index + 1
  const [a, b] = [cells[0], cells[cells.length - 1]]
  return a.label.startsWith('#') ? `#${n(a)}–#${n(b)}` : `Connectors ${n(a)}–${n(b)}`
}

// Picking what goes on a port (or one side of a steck slot). Interconnects and the tails
// in the unit's rack come first; a slot's outside takes cables from the rest of the world.
// Type to filter, arrows to move, Enter to patch.
export function PortPicker({ show, report, target, update, onClose, onOpenCable }: Props) {
  const [query, setQuery] = useState('')
  // How many pairs in a row to patch onto the ports from this one on.
  const [run, setRun] = useState(1)
  const label = targetLabel(target)
  const outside = target.face === 'outside'
  const rack = rackById(show, target.gear.rackId)
  const rackName = rack?.name || 'this rack'

  // Focus goes back to the port it was opened from, so the arrow keys carry on from there.
  // Noted while rendering, before the search box takes focus.
  const [opener] = useState(() => document.activeElement)
  useEffect(
    () => () => {
      if (opener instanceof HTMLElement) opener.focus()
    },
    [opener],
  )

  // What's on a port now (on this side, for a steck slot), one per plug.
  const on = (t: PatchTarget) =>
    (report.byGear.get(t.gear.id) ?? []).filter(
      (p, i, all) =>
        p.port != null &&
        portKey(p.port) === portKey(t.port) &&
        (!t.face || steckFaces(show, p).includes(t.face)) &&
        all.findIndex((x) => x.slot === p.slot) === i,
    )
  const here = on(target)

  // The rows to pick from, grouped.
  const fans = outside ? [] : fanEnds(show, report)
  const fanOf = (c: Cable, end: End) => fans.find((f) => f.cable.id === c.id && f.end === end)
  const cableRow = (c: Cable): Row => ({
    key: c.id,
    kind: 'cable',
    cable: c,
    ends: ENDS.map((end) => ({ end, fan: fanOf(c, end) })),
  })
  const fanRow = (f: FanEnd): Row => ({ key: `${f.cable.id}-${f.end}`, kind: 'fan', fan: f })
  const interconnects = show.cables.filter((c) => c.deployment === 'interconnect').sort(byName)
  const tails = fans.filter((f) => f.cable.deployment !== 'interconnect').sort((a, b) => byName(a.cable, b.cable))
  const groups: Group[] = outside
    ? [
        {
          title: 'Bundled cables',
          rows: show.cables.filter((c) => c.deployment === 'bundled').sort(byName).map(cableRow),
        },
        { title: 'Loose cables', rows: show.cables.filter((c) => c.deployment === 'loose').sort(byName).map(cableRow) },
      ]
    : rack
      ? [
          { title: `Interconnects in ${rackName}`, rows: interconnects.filter((c) => c.rackId === rack.id).map(cableRow) },
          { title: `Tails in ${rackName}`, rows: tails.filter((f) => f.rackId === rack.id).map(fanRow) },
          { title: 'Other interconnects', rows: interconnects.filter((c) => c.rackId !== rack.id).map(cableRow) },
          { title: 'Tails elsewhere', rows: tails.filter((f) => f.rackId !== rack.id).map(fanRow), searchOnly: true },
        ]
      : [
          { title: 'Interconnects', rows: interconnects.map(cableRow) },
          { title: 'Tails', rows: tails.map(fanRow), searchOnly: true },
        ]

  const q = query.trim().toLowerCase()
  const has = (values: string[]) => !q || values.some((v) => v.toLowerCase().includes(q))
  const matches = (row: Row) => {
    const c = row.kind === 'cable' ? row.cable : row.fan.cable
    const own = [c.name, typeById(show, c.typeId)?.name ?? '']
    if (row.kind === 'cable') return has([...own, c.from, c.to, c.steckAAt, c.steckBAt])
    return has([...own, row.fan.tail?.name ?? '', ...row.fan.cells.flatMap((cell) => [cell.label, cell.text])])
  }
  const shown = groups
    .map((g) => {
      const waiting = g.searchOnly && !q
      return { ...g, hidden: waiting ? g.rows.length : 0, rows: waiting ? [] : g.rows.filter(matches) }
    })
    .filter((g) => g.rows.length > 0 || g.hidden > 0)
  const anyFans = shown.some((g) => g.rows.some((r) => r.kind === 'fan' || r.ends.some((e) => e.fan)))

  // A whole cable end. Moving it off somewhere else, or an interconnect out of another
  // rack, asks first.
  const pickEnd = (c: Cable, end: End) => {
    const name = c.name || 'This cable'
    const where = endNow(report, c, end, target)
    const fromRack = leavesRack(c, target)
    const notes = [
      where && `${name} End ${end} is already patched to ${where}.`,
      fromRack &&
        `${where ? 'It' : name} is an interconnect in ${rackById(show, fromRack)?.name || 'another rack'}, and patching it here moves it to ${rackName}.`,
    ].filter(Boolean)
    if (notes.length && !confirm(`${notes.join(' ')} Do you want to move it to ${label}?`)) return
    update((s) => plugEnd(s, report, c.id, end, target))
    onClose()
  }

  // One connector of a fan, or a run of them onto this port and the ones after it.
  const pickCell = (fan: FanEnd, cell: FanCell) => {
    const ports = gearPorts(show, target.gear)
    const start = ports.findIndex((p) => portKey(p) === portKey(target.port))
    const count = Math.max(1, Math.min(run, fan.cells.length - cell.index, start < 0 ? 1 : ports.length - start))
    const targets = start < 0 ? [target] : ports.slice(start, start + count).map((port) => ({ ...target, port }))
    const cells = fan.cells.slice(cell.index, cell.index + targets.length)
    const what = `${fan.cable.name || 'This cable'} End ${fan.end}`
    const moving = cells.filter((c, k) => c.text.trim() && !cellIsHere(c, targets[k]))
    // The first port's own cables are listed in the dialog already; the cells being
    // written don't count against the ports they're moving onto.
    const writing = new Set(cells.map((c) => `${fan.cable.id}|patch${fan.end}-${c.index}`))
    const busy = targets.slice(1).filter((t) => on(t).some((p) => !writing.has(`${p.cable.id}|${p.field}`)))
    const fromRack = leavesRack(fan.cable, target)
    const notes =
      targets.length === 1
        ? [moving.length > 0 && `${what} ${cells[0].label} is already patched to ${moving[0].text.trim()}.`]
        : [
            moving.length > 0 &&
              `${listOf(moving.map((c) => `${cellShort(c)} to ${c.text.trim()}`))} ${moving.length === 1 ? 'is' : 'are'} already patched.`,
            busy.length > 0 &&
              `${listOf(busy.map((t) => t.port))} already ${busy.length === 1 ? 'has' : 'have'} something patched, so ${busy.length === 1 ? 'it becomes a Y' : 'they become Ys'}.`,
          ]
    if (fromRack) {
      notes.push(
        `${fan.cable.name || 'It'} is an interconnect in ${rackById(show, fromRack)?.name || 'another rack'}, and patching it here moves it to ${rackName}.`,
      )
    }
    const said = notes.filter(Boolean)
    const question =
      targets.length === 1
        ? `Do you want to move it to ${label}?`
        : `Do you want to patch ${what} ${cellRange(cells)} onto ${targetText(targets[0])} to ${targets[targets.length - 1].port}?`
    if (said.length && !confirm(`${said.join(' ')} ${question}`)) return
    update((s) => plugCells(s, fan, cell.index, targets))
    onClose()
  }

  const options = (from: HTMLElement) => [
    ...(from.closest('.dialog')?.querySelectorAll<HTMLButtonElement>('.pp-option:not(:disabled)') ?? []),
  ]

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      options(e.currentTarget)[0]?.focus()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      options(e.currentTarget)[0]?.click()
    }
  }

  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const list = options(e.currentTarget)
    const from = list.indexOf(e.target as HTMLButtonElement)
    if (from < 0) return
    e.preventDefault()
    const next = from + (e.key === 'ArrowDown' ? 1 : -1)
    if (next < 0) e.currentTarget.closest('.dialog')?.querySelector<HTMLInputElement>('.pp-search')?.focus()
    else list[Math.min(next, list.length - 1)].focus()
  }

  const option = (key: string, title: string, now: string, already: boolean, onPick: () => void) => (
    <button key={key} type="button" className={now ? 'pp-option' : 'pp-option free'} disabled={already} onClick={onPick}>
      <span className="pp-option-label">{title}</span>
      <span className="pp-option-now">{already ? 'Here' : now || 'Free'}</span>
    </button>
  )

  const cellGrid = (fan: FanEnd) => (
    <div className="pp-cells">
      {fan.cells.map((cell) =>
        option(String(cell.index), cell.label, cell.text.trim(), cellIsHere(cell, target), () => pickCell(fan, cell)),
      )}
    </div>
  )

  // What a whole end is plugged into now, as the picker shows it.
  const endAt = (c: Cable, end: End) => {
    const steck = end === 'A' ? c.steckA : c.steckB
    const at = (end === 'A' ? c.steckAAt : c.steckBAt).trim()
    if (steck) return at ? `Steck ${at}` : 'Steck, no slot yet'
    return (end === 'A' ? c.from : c.to).trim()
  }

  const rowView = (row: Row): ReactNode => {
    const c = row.kind === 'cable' ? row.cable : row.fan.cable
    const bundle = c.deployment === 'bundled' ? bundleById(show, c.bundleId)?.name : undefined
    const detail =
      row.kind === 'fan'
        ? [`End ${row.fan.end}`, row.fan.tail?.name ?? typeById(show, c.typeId)?.name, bundle]
        : [typeById(show, c.typeId)?.name, bundle]
    return (
      <div key={row.key} className="pp-row">
        <div className="pp-cable-name">
          {c.color && <span className="dot" style={{ background: c.color }} />}
          <strong>{c.name || 'Unnamed'}</strong>
          <span className="muted small">{detail.filter(Boolean).join(' · ')}</span>
        </div>
        {row.kind === 'fan' ? (
          cellGrid(row.fan)
        ) : (
          <div className="pp-ends">
            {row.ends.map(({ end, fan }) =>
              fan ? (
                <div key={end} className="pp-fan">
                  <span className="pp-option-label">End {end}</span>
                  {cellGrid(fan)}
                </div>
              ) : (
                option(end, `End ${end}`, endAt(c, end), endIsHere(c, end, target), () => pickEnd(c, end))
              ),
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog port-picker"
        role="dialog"
        aria-label={`Patch to ${label}`}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h2>Patch to {label}</h2>
        {target.face && (
          <p className="muted small">
            {outside
              ? "The slot's outside, where cables run out of the rack to the rest of the world."
              : "The slot's inside, where interconnects and tails from the rack's gear plug in."}
          </p>
        )}

        {here.length > 0 && (
          <div className="pp-here">
            <span className="small strong">Here now</span>
            {here.map((p) => (
              <div key={p.slot} className="pp-here-row">
                <PointLink point={p} onOpenCable={onOpenCable} />
                {p.issue && <span className="warn small">⚠ {p.issue}</span>}
                <button className="small" onClick={() => update((s) => unplugPoint(s, p))}>
                  Unplug
                </button>
              </div>
            ))}
            <p className="muted small">Patching another end here too makes it a Y, which warns but is allowed.</p>
          </div>
        )}

        <div className="pp-search-row">
          <input
            className="pp-search"
            type="search"
            autoFocus
            placeholder={outside ? 'Search cables…' : 'Search interconnects and tails…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
          />
          {anyFans && (
            <label className="pp-run" title="Patch the pair you pick and the next ones onto this port and the next ones">
              Patch
              <input
                type="number"
                min={1}
                max={99}
                value={run}
                onChange={(e) => setRun(Math.max(1, Math.min(99, Math.floor(Number(e.target.value) || 1))))}
              />
              in a row
            </label>
          )}
        </div>
        {anyFans && run > 1 && (
          <p className="muted small pp-run-hint">
            The pair you pick and the {run - 1} after it go onto {targetText(target)} and the {run - 1} ports after it.
          </p>
        )}

        <div className="pp-list" onKeyDown={onListKey}>
          {shown.length === 0 ? (
            <p className="muted small pad">
              {q
                ? `Nothing matches “${query}”.`
                : outside
                  ? 'No bundled or loose cables yet.'
                  : 'No interconnects or tails yet. Set a cable’s deployment to Interconnect to patch it from here.'}
            </p>
          ) : (
            shown.map((g) => (
              <section key={g.title}>
                <h3>{g.title}</h3>
                {g.hidden > 0 ? (
                  <p className="muted small pad">
                    {g.hidden} tail end{g.hidden === 1 ? '' : 's'} elsewhere. Type to search them.
                  </p>
                ) : (
                  g.rows.map(rowView)
                )}
              </section>
            ))
          )}
        </div>

        <div className="dialog-actions">
          <button onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
