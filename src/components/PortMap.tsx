import { useState, type KeyboardEvent } from 'react'
import { gearModelOf, gearPorts, steckFaces, type PatchPoint, type SteckFace } from '../gear'
import type { PatchTarget } from '../patching'
import { portKey } from '../ports'
import type { Gear, Show } from '../types'

interface Props {
  show: Show
  gear: Gear
  points: PatchPoint[]
  onPick: (target: PatchTarget) => void
  onOpenCable: (id: string) => void
}

const FACES: SteckFace[] = ['inside', 'outside']

// One cable end or patch cell landing here, opening its cable.
export function PointLink({ point, onOpenCable }: { point: PatchPoint; onOpenCable: (id: string) => void }) {
  return (
    <span className="point">
      <button className="link" onClick={() => onOpenCable(point.cable.id)} title="Open in Cables">
        {point.cable.color && <span className="dot" style={{ background: point.cable.color }} />}
        {point.cable.name || 'Unnamed'}
      </button>
      <span className="muted small"> {point.place}</span>
    </span>
  )
}

// A unit's ports and what's patched to each. Clicking a port (or Enter on it) patches an
// interconnect there. A steck rail's ports are its slots, each with an inside and an
// outside. The list is one Tab stop; the arrow keys move through it.
export function PortMap({ show, gear, points, onPick, onOpenCable }: Props) {
  const [at, setAt] = useState(0)
  const ports = gearPorts(show, gear)
  const steck = gearModelOf(show, gear)?.steck ?? false
  const onPort = new Map<string, PatchPoint[]>()
  for (const p of points) {
    if (!p.port) continue
    const key = portKey(p.port)
    const here = onPort.get(key) ?? []
    // A From and Patch A cell on the same connector are one plug, listed once.
    if (!here.some((h) => h.slot === p.slot)) onPort.set(key, [...here, p])
  }

  const onKey = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const picks = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-pick]')]
    const from = picks.indexOf(e.target as HTMLElement)
    if (from < 0) return
    e.preventDefault()
    const next = Math.max(0, Math.min(picks.length - 1, from + (e.key === 'ArrowDown' ? 1 : -1)))
    picks[next].focus()
  }

  let n = 0
  // Every port (or slot side) is a button; only the last one used takes the Tab stop.
  const pick = (target: PatchTarget, label: string, className: string, title: string) => {
    const i = n++
    return (
      <button
        type="button"
        className={`port-pick ${className}`}
        data-pick
        tabIndex={i === at ? 0 : -1}
        onFocus={() => setAt(i)}
        onClick={() => onPick(target)}
        title={title}
      >
        {label}
      </button>
    )
  }

  const uses = (here: PatchPoint[]) =>
    here.length === 0 ? (
      <span className="muted">—</span>
    ) : (
      here.map((p, i) => <PointLink key={`${p.cable.id}-${p.field}-${i}`} point={p} onOpenCable={onOpenCable} />)
    )

  return (
    <ul className={steck ? 'port-map steck-map' : 'port-map'} onKeyDown={onKey}>
      {ports.map((port) => {
        const here = onPort.get(portKey(port)) ?? []
        if (!steck) {
          return (
            <li key={port} className={here.length > 1 ? 'clash' : here.length ? undefined : 'free'}>
              {pick({ gear, port }, port, 'port-name', `Patch an interconnect to ${port}`)}
              <span className="port-use">{uses(here)}</span>
            </li>
          )
        }
        return (
          <li key={port} className={here.some((p) => p.issue) ? 'clash' : here.length ? undefined : 'free'}>
            <span className="port-name">{port}</span>
            <div className="slot-faces">
              {FACES.map((face) => {
                const side = here.filter((p) => steckFaces(show, p).includes(face))
                return (
                  <div key={face} className={side.length ? 'slot-face' : 'slot-face free'}>
                    {pick(
                      { gear, port, face },
                      face === 'inside' ? 'Inside' : 'Outside',
                      'face-name',
                      face === 'inside'
                        ? `Patch an interconnect to the inside of ${port}`
                        : `Patch a cable from outside the rack to ${port}`,
                    )}
                    <span className="port-use">{uses(side)}</span>
                  </div>
                )
              })}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
