import { useRef, useState } from 'react'
import type { Update } from '../App'
import { renameGearLinks, steckFaces, type PatchPoint, type PatchReport } from '../gear'
import { unplacePoint } from '../patching'
import { portKey } from '../ports'
import { placedIn, placeGear, rackProblems, topOf } from '../racking'
import { rackById, steckMount } from '../show'
import { connectorInfo, quarterRoom, setSteckRu, STECK_QUARTERS, STECK_RU } from '../stecks'
import type { Gear, Show } from '../types'
import { PointLink } from './PortMap'
import { SteckPlacePicker } from './SteckPlacePicker'

interface Props {
  show: Show
  steck: Gear
  report: PatchReport
  update: Update
  onOpenCable: (id: string) => void
}

const endOf = (p: PatchPoint) => (p.field === 'steckA' || p.field === 'from' ? 'A' : 'B')

// One steck rail on the rack page: its name and size, and its four quarters, each filled
// with the cable ends marked Steck that are placed in it. A tail fills a quarter; panel
// connectors share one, outside cables and the interconnects they meet inside.
export function SteckRail({ show, steck, report, update, onOpenCable }: Props) {
  const [placing, setPlacing] = useState<string | null>(null)
  const nameAtFocus = useRef<string | null>(null)
  const ru = steck.steck!.ru
  const name = steck.name.trim()
  const points = report.byGear.get(steck.id) ?? []
  const on = (quarter: string) =>
    points.filter(
      (p, i) => p.port && portKey(p.port) === portKey(quarter) && points.findIndex((x) => x.slot === p.slot) === i,
    )
  const spot = steck.rackId ? placedIn(show, steck.rackId).find((p) => p.gear.id === steck.id) : undefined

  // A taller rail that runs into what's above it moves to the next free space instead.
  const setRu = (next: number) =>
    update((s) => {
      const built = setSteckRu(s, steck.id, next)
      const rack = rackById(built, steck.rackId)
      if (next <= ru || !rack || !rackProblems(built, rack).get(steck.id)) return built
      return placeGear({ ...built, gear: built.gear.map((g) => (g.id === steck.id ? { ...g, rackU: null } : g)) }, steck.id)
    })

  // Deleting a rail leaves its cable ends marked Steck, waiting to be placed again.
  const remove = () => {
    const who = [...new Set(points.map((p) => p.cable.name || 'Unnamed'))]
    const msg = who.length
      ? `Delete ${name || 'this steck rail'}? ${who.join(', ')} come${who.length === 1 ? 's' : ''} off it, still marked Steck.`
      : `Delete ${name || 'this steck rail'}?`
    if (!confirm(msg)) return
    update((s) => {
      const off = points.reduce((acc, p) => unplacePoint(acc, p), s)
      return { ...off, gear: off.gear.filter((g) => g.id !== steck.id) }
    })
  }

  return (
    <section className="steck-build" id={`steck-${steck.id}`}>
      <div className="sb-head">
        <input
          className="sb-name"
          value={steck.name}
          aria-label="Steck rail name"
          placeholder="Name"
          onFocus={() => (nameAtFocus.current = steck.name)}
          onBlur={() => {
            const old = nameAtFocus.current
            nameAtFocus.current = null
            if (old != null && old.trim() !== steck.name.trim()) update((s) => renameGearLinks(s, steck.id, old))
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          onChange={(e) =>
            update((s) => ({ ...s, gear: s.gear.map((g) => (g.id === steck.id ? { ...g, name: e.target.value } : g)) }))
          }
        />
        <label className="inline-select">
          <span className="muted small">Size</span>
          <select value={ru} aria-label={`Size of ${name || 'steck rail'}`} onChange={(e) => setRu(Number(e.target.value))}>
            {STECK_RU.map((n) => (
              <option key={n} value={n}>
                {n}RU
              </option>
            ))}
          </select>
        </label>
        <span className="muted small">
          {spot ? `${spot.height > 1 ? `U${topOf(spot)}–${spot.bottom}` : `U${spot.bottom}`} · ${spot.side}` : 'Not placed'}
        </span>
        <span className="spacer" />
        <button className="icon" onClick={remove} title="Delete steck rail" aria-label={`Delete ${name || 'steck rail'}`}>
          ×
        </button>
      </div>

      <div className="sb-slots">
        {STECK_QUARTERS.map((quarter) => {
          const here = on(quarter)
          const tail = here.find((p) => p.field.startsWith('steck') && steckMount(show, p.cable, endOf(p)).tail)
          const use = (face: 'inside' | 'outside') =>
            here
              .filter((p) => steckFaces(show, p).includes(face))
              .reduce((n, p) => n + connectorInfo(steckMount(show, p.cable, endOf(p)).connector).size, 0)
          const used = Math.max(use('inside'), use('outside'))
          const room = quarterRoom(ru)
          const issue = here.find((p) => p.issue)?.issue
          // Outside first (what runs out of the rack), then the interconnects inside.
          const listed = [...here].sort((a, b) => Number(a.cable.deployment === 'interconnect') - Number(b.cable.deployment === 'interconnect'))
          return (
            <div key={quarter} className={[here.length ? 'sb-slot' : 'sb-slot empty', issue ? 'clash' : ''].filter(Boolean).join(' ')}>
              <div className="sb-slot-head">
                <span className="sb-num">{quarter}</span>
                <span className="muted small">{tail ? 'Tail' : here.length ? `${used} of ${room}` : 'Empty'}</span>
                <span className="spacer" />
                <button
                  className="small"
                  onClick={() => setPlacing(quarter)}
                  title={`Place a cable end marked Steck in quarter ${quarter}`}
                >
                  Place…
                </button>
              </div>
              {listed.length > 0 && (
                <ul className="sb-placed">
                  {listed.map((p) => {
                    const mount = steckMount(show, p.cable, endOf(p))
                    const inside = p.cable.deployment === 'interconnect'
                    return (
                      <li key={p.slot}>
                        <span className="sb-placed-name">
                          <PointLink point={p} onOpenCable={onOpenCable} />
                          <span className="muted small">
                            {[mount.tail?.name ?? connectorInfo(mount.connector).label, inside ? 'inside' : ''].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <button
                          className="icon"
                          onClick={() => update((s) => unplacePoint(s, p))}
                          title="Take it off the rail (it stays marked Steck)"
                          aria-label={`Take ${p.cable.name || 'cable'} off ${name} · ${quarter}`}
                        >
                          ×
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              {issue && <p className="warn small sb-issue">⚠ {issue}</p>}
            </div>
          )
        })}
      </div>

      {placing && (
        <SteckPlacePicker
          show={show}
          report={report}
          rail={steck}
          quarter={placing}
          update={update}
          onClose={() => setPlacing(null)}
        />
      )}
    </section>
  )
}
