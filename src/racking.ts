import { gearModelOf, gearRu } from './models'
import type { Gear, Rack, RackSide, RackSlot, Show } from './types'

// One rack unit, per EIA-310.
export const INCHES_PER_U = 1.75

export function isHalfWidth(show: Show, g: Gear): boolean {
  return gearModelOf(show, g)?.halfWidth ?? false
}

// Rack units a unit takes up (a bulk line stacks its pieces), or null if its model has
// no rack size.
export function stackHeight(show: Show, g: Gear): number | null {
  const ru = gearRu(show, g)
  return ru ? ru * g.qty : null
}

// A unit as it sits in its rack. Rows run from bottom (inclusive) for height rack units;
// slot is null for full-width gear.
export interface Placed {
  gear: Gear
  bottom: number
  height: number
  side: RackSide
  slot: RackSlot | null
}

export const topOf = (p: Pick<Placed, 'bottom' | 'height'>) => p.bottom + p.height - 1

export function placedIn(show: Show, rackId: string): Placed[] {
  return show.gear.flatMap((g) => {
    if (g.rackId !== rackId || g.rackU == null) return []
    const height = stackHeight(show, g)
    if (!height) return []
    const slot = isHalfWidth(show, g) ? (g.rackSlot ?? 'left') : null
    return [{ gear: g, bottom: g.rackU, height, side: g.rackSide, slot }]
  })
}

type Footprint = Pick<Placed, 'bottom' | 'height' | 'side' | 'slot'>

const overlaps = (a: Footprint, b: Footprint) =>
  a.side === b.side &&
  a.bottom < b.bottom + b.height &&
  b.bottom < a.bottom + a.height &&
  (a.slot == null || b.slot == null || a.slot === b.slot)

// Where a unit fits on one side: the highest free spot from the top of the rack down,
// left half before right for half-width gear. With no room, or no rack size, it goes on
// top of what's there, so it still shows (as over the top, if the rack has a size).
export function findSpot(show: Show, rack: Rack, g: Gear, side: RackSide): { u: number; slot: RackSlot | null } | null {
  const height = stackHeight(show, g)
  if (!height) return null
  const slots: (RackSlot | null)[] = isHalfWidth(show, g) ? ['left', 'right'] : [null]
  const others = placedIn(show, rack.id).filter((p) => p.gear.id !== g.id)
  const fits = (u: number, slot: RackSlot | null) => !others.some((o) => overlaps({ bottom: u, height, side, slot }, o))
  if (rack.size) {
    for (let u = rack.size - height + 1; u >= 1; u--) {
      for (const slot of slots) if (fits(u, slot)) return { u, slot }
    }
  }
  const highest = Math.max(rack.size ?? 0, ...others.filter((o) => o.side === side).map(topOf))
  return { u: highest + 1, slot: slots[0] }
}

// Gives a unit in a rack a spot if it has a rack size and none yet.
export function placeGear(show: Show, gearId: string): Show {
  const g = show.gear.find((u) => u.id === gearId)
  const rack = g?.rackId ? show.racks.find((r) => r.id === g.rackId) : undefined
  if (!g || !rack || g.rackU != null) return show
  const spot = findSpot(show, rack, g, g.rackSide)
  if (!spot) return show
  return { ...show, gear: show.gear.map((u) => (u.id === gearId ? { ...u, rackU: spot.u, rackSlot: spot.slot } : u)) }
}

// Places every unit in a rack (or all racks) that has a size but no spot, in list order,
// so a rack listed top to bottom fills from the top down.
export function placeUnplaced(show: Show, rackId?: string): Show {
  let next = show
  for (const g of show.gear) {
    if (g.rackId && (!rackId || g.rackId === rackId) && g.rackU == null) next = placeGear(next, g.id)
  }
  return next
}

// Puts a unit in a rack (or takes it out, with null) and finds it a spot.
export function setGearRack(show: Show, gearId: string, rackId: string | null): Show {
  const next = {
    ...show,
    gear: show.gear.map((g) => (g.id === gearId ? { ...g, rackId, rackU: null, rackSlot: null } : g)),
  }
  return rackId ? placeGear(next, gearId) : next
}

export function setRackPosition(
  show: Show,
  gearId: string,
  changes: Partial<Pick<Gear, 'rackU' | 'rackSide' | 'rackSlot'>>,
): Show {
  return { ...show, gear: show.gear.map((g) => (g.id === gearId ? { ...g, ...changes } : g)) }
}

// Moves a unit up or down one rack unit (not below U1).
export function nudgeGear(show: Show, gearId: string, step: 1 | -1): Show {
  const g = show.gear.find((u) => u.id === gearId)
  if (!g || g.rackU == null) return show
  return setRackPosition(show, gearId, { rackU: Math.max(1, g.rackU + step) })
}

// What's wrong with where each unit sits: overlapping another, or above the top of the rack.
export function rackProblems(show: Show, rack: Rack): Map<string, string> {
  const problems = new Map<string, string>()
  const placed = placedIn(show, rack.id)
  for (const p of placed) {
    const clash = placed.find((o) => o !== p && overlaps(p, o))
    if (clash) {
      problems.set(p.gear.id, `Overlaps ${clash.gear.name.trim() || clash.gear.model.trim() || 'another unit'}`)
    } else if (rack.size && topOf(p) > rack.size) {
      problems.set(p.gear.id, `Above the top of the ${rack.size}U rack`)
    }
  }
  return problems
}

// Rack units with something on the front rails, counting each row once.
export function frontRowsUsed(show: Show, rackId: string): number {
  const rows = new Set<number>()
  for (const p of placedIn(show, rackId)) {
    if (p.side !== 'front') continue
    for (let u = p.bottom; u < p.bottom + p.height; u++) rows.add(u)
  }
  return rows.size
}
