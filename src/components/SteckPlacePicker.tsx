import { useEffect, useState, type KeyboardEvent } from 'react'
import type { Update } from '../App'
import type { PatchReport } from '../gear'
import { placeEnd, steckEnds, steckPartner, type End } from '../patching'
import { portKey } from '../ports'
import { bundleById, rackById, steckMount, typeById } from '../show'
import { loadViewSetting, storeViewSetting } from '../sorting'
import { connectorInfo, GENERIC_CONNECTORS, genericIn, setGeneric } from '../stecks'
import type { Cable, Gear, Show } from '../types'

interface Props {
  show: Show
  report: PatchReport
  rail: Gear
  quarter: string
  update: Update
  onClose: () => void
}

interface Option {
  key: string
  cable: Cable
  end: End
  // Where it's placed now, if it is.
  at?: string
  here: boolean
}

// Whether placing an end brings the interconnect it's linked to there, remembered per viewer.
const PARTNER_KEY = 'proto-database:steck-bring-interconnect'

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const byName = (a: Option, b: Option) =>
  a.cable.name.localeCompare(b.cable.name, undefined, { numeric: true }) || a.end.localeCompare(b.end)

// Picking what goes in a rail's quarter: a generic connector (stays open, to add a few),
// or a cable end marked Steck. Ends not on a rail yet come first, this rack's own at the
// top (its interconnects, and cables whose end is at the rack's location); ends on other
// rails show up when you search, to move them.
export function SteckPlacePicker({ show, report, rail, quarter, update, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [bring, setBring] = useState(() => loadViewSetting(PARTNER_KEY, { bring: true }).bring)
  useEffect(() => storeViewSetting(PARTNER_KEY, { bring }), [bring])
  const generic = genericIn(rail.steck!, quarter)
  const label = `${rail.name.trim()} · ${quarter}`
  const rack = rackById(show, rail.rackId)

  // Focus goes back to the Place button it was opened from.
  const [opener] = useState(() => document.activeElement)
  useEffect(
    () => () => {
      if (opener instanceof HTMLElement) opener.focus()
    },
    [opener],
  )

  const options: Option[] = steckEnds(show, report).map(({ cable, end, on }) => ({
    key: `${cable.id}|${end}`,
    cable,
    end,
    at: on ? `${on.gear.name.trim()} · ${on.port ?? '?'}` : undefined,
    here: !!on && on.gear.id === rail.id && portKey(on.port ?? '') === portKey(quarter),
  }))
  const atRack = (o: Option) => {
    if (!rack) return false
    if (o.cable.deployment === 'interconnect') return o.cable.rackId === rack.id
    const place = o.end === 'A' ? o.cable.from : o.cable.to
    return [rack.location, rack.name].some((r) => r.trim() && sameText(place, r))
  }
  const waiting = options.filter((o) => !o.at)
  const groups = [
    { title: `For ${rack?.name || 'this rack'}`, list: waiting.filter(atRack) },
    { title: 'Not on a rail yet', list: waiting.filter((o) => !atRack(o)) },
    { title: 'On a rail', list: options.filter((o) => o.at), searchOnly: true },
  ]

  const q = query.trim().toLowerCase()
  const matches = (o: Option) => {
    const c = o.cable
    const mount = steckMount(show, c, o.end)
    return [c.name, typeById(show, c.typeId)?.name ?? '', mount.tail?.name ?? '', mount.connector, c.from, c.to, o.at ?? '', bundleById(show, c.bundleId)?.name ?? ''].some(
      (v) => v.toLowerCase().includes(q),
    )
  }
  const shown = groups
    .map((g) => {
      const held = g.searchOnly && !q
      return { ...g, hidden: held ? g.list.length : 0, list: held ? [] : g.list.filter((o) => !q || matches(o)).sort(byName) }
    })
    .filter((g) => g.list.length > 0 || g.hidden > 0)

  const pick = (o: Option) => {
    if (o.at && !o.here) {
      if (!confirm(`${o.cable.name || 'This cable'} End ${o.end} is already on ${o.at}. Do you want to move it to ${label}?`)) return
    }
    update((s) => placeEnd(s, o.cable.id, o.end, rail, quarter, bring))
    onClose()
  }

  const buttons = (from: HTMLElement) => [
    ...(from.closest('.dialog')?.querySelectorAll<HTMLButtonElement>('.pp-list .pp-option:not(:disabled)') ?? []),
  ]
  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      buttons(e.currentTarget)[0]?.focus()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      buttons(e.currentTarget)[0]?.click()
    }
  }
  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const list = buttons(e.currentTarget)
    const from = list.indexOf(e.target as HTMLButtonElement)
    if (from < 0) return
    e.preventDefault()
    const next = from + (e.key === 'ArrowDown' ? 1 : -1)
    if (next < 0) e.currentTarget.closest('.dialog')?.querySelector<HTMLInputElement>('.pp-search')?.focus()
    else list[Math.min(next, list.length - 1)].focus()
  }

  // What it is, its bundle, and the linked cable that comes along to the same quarter (a
  // different cable, often with the same name).
  const detail = (o: Option) => {
    const mount = steckMount(show, o.cable, o.end)
    const partner = bring ? steckPartner(show, o.cable, o.end) : null
    const other = partner && (partner.cable.deployment === 'interconnect' ? 'its interconnect' : 'its linked cable')
    return [
      `End ${o.end}`,
      mount.tail?.name ?? connectorInfo(mount.connector).label,
      bundleById(show, o.cable.bundleId)?.name,
      partner && `+ ${other} (End ${partner.end})`,
    ]
      .filter(Boolean)
      .join(' · ')
  }

  // Generic connectors and the cable ends already here, for the line at the top.
  const inHere = [
    ...generic.list,
    ...options.filter((o) => o.here).map((o) => `${o.cable.name || 'Unnamed'} End ${o.end}`),
  ]

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog port-picker"
        role="dialog"
        aria-label={`Place in ${label}`}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h2>Place in {label}</h2>
        <p className="muted small">In it now: {inHere.length ? inHere.join(', ') : 'nothing yet'}</p>

        <h3>Generic connector</h3>
        <div className="pp-generic">
          {GENERIC_CONNECTORS.map((c) => (
            <button
              key={c}
              type="button"
              className="pp-option"
              onClick={() => update((s) => setGeneric(s, rail.id, quarter, (list) => [...list, c]))}
              title={`Add a ${c} with no cable on it yet`}
            >
              <span className="pp-option-now">{c}</span>
            </button>
          ))}
        </div>

        <h3>Cable ends marked Steck</h3>
        <label className="check inline small">
          <input type="checkbox" checked={bring} onChange={(e) => setBring(e.target.checked)} />
          Bring the interconnect it's linked to along, inside the same quarter
        </label>
        <div className="pp-search-row">
          <input
            className="pp-search"
            type="search"
            autoFocus
            placeholder="Search cables, tails, connectors…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
          />
        </div>
        <div className="pp-list" onKeyDown={onListKey}>
          {shown.length === 0 ? (
            <p className="muted small pad">
              {q
                ? `Nothing matches “${query}”.`
                : 'No cable ends are marked Steck yet. Tick Steck on an end in the cable editor, under From and To.'}
            </p>
          ) : (
            shown.map((g) => (
              <section key={g.title}>
                <h3>{g.title}</h3>
                {g.hidden > 0 ? (
                  <p className="muted small pad">
                    {g.hidden} end{g.hidden === 1 ? '' : 's'} already on a rail. Type to search them, to move one here.
                  </p>
                ) : (
                  <div className="pp-cells pp-place">
                    {g.list.map((o) => (
                      <button key={o.key} type="button" className="pp-option" disabled={o.here} onClick={() => pick(o)}>
                        <span className="pp-option-now">
                          {o.cable.color && <span className="dot" style={{ background: o.cable.color }} />}
                          <strong>{o.cable.name || 'Unnamed'}</strong>
                        </span>
                        <span className="pp-option-label">{o.here ? `End ${o.end} · here` : o.at ? `End ${o.end} · on ${o.at}` : detail(o)}</span>
                      </button>
                    ))}
                  </div>
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
