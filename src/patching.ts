// Patching from the gear's side: picking a cable end for a port, or placing an end marked
// Steck on a steck rail. Links are the text in the cable, so this writes that text, and
// the cable and the gear stay in step both ways.

import { fieldKey, type PatchPoint, type PatchReport } from './gear'
import { endConnectors } from './labels'
import { linkedCables, setTailCells, typeById, visibleTails } from './show'
import { isSteck } from './stecks'
import type { Cable, CableType, Gear, Show } from './types'

export type End = 'A' | 'B'

// A port on a unit.
export type PatchTarget = { gear: Gear; port: string }

// "Amp 1 · In A", the way a cable end names it.
export const targetText = (t: PatchTarget) => `${t.gear.name.trim()} · ${t.port}`

const endField = (end: End) => (end === 'A' ? 'from' : 'to')

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

// Where a cable end is plugged now, if picking it would move it: its steck, the gear its
// From/To names, or other text in its From/To that patching to a port would replace.
// Null when it's free, or already right here.
export function endNow(report: PatchReport, cable: Cable, end: End, target: PatchTarget): string | null {
  const steck = end === 'A' ? cable.steckA : cable.steckB
  const steckAt = (end === 'A' ? cable.steckAAt : cable.steckBAt).trim()
  const text = (end === 'A' ? cable.from : cable.to).trim()
  const linked = report.byField.get(fieldKey(cable.id, endField(end)))
  if (steck) return steckAt ? `steck ${steckAt}` : 'a steck'
  if (text && !sameText(text, targetText(target))) return linked ? text : `“${text}”`
  return null
}

// Whether a cable end is already on this target.
export function endIsHere(cable: Cable, end: End, target: PatchTarget): boolean {
  return sameText(end === 'A' ? cable.from : cable.to, targetText(target))
}

// The rack an interconnect would move out of by patching it here, when it's in another one.
export function leavesRack(cable: Cable, target: PatchTarget): string | null {
  const rackId = target.gear.rackId
  return cable.deployment === 'interconnect' && rackId && cable.rackId && cable.rackId !== rackId ? cable.rackId : null
}

// Plugs a cable end into a port: its From/To names the port, and it comes out of any
// steck. An interconnect patched to a racked unit belongs to that unit's rack.
export function plugEnd(show: Show, cableId: string, end: End, target: PatchTarget): Show {
  const text = targetText(target)
  return {
    ...show,
    cables: show.cables.map((cable) => {
      if (cable.id !== cableId) return cable
      const rackId = cable.deployment === 'interconnect' && target.gear.rackId ? target.gear.rackId : cable.rackId
      const c = { ...cable, rackId }
      return end === 'A' ? { ...c, from: text, steckA: false, steckAAt: '' } : { ...c, to: text, steckB: false, steckBAt: '' }
    }),
  }
}

// Takes whatever a patch point is out of its port: clears the From/To, the steck, or the
// tail's patch cell that names it.
export function unplugPoint(show: Show, point: PatchPoint): Show {
  return {
    ...show,
    cables: show.cables.map((c) => {
      if (c.id !== point.cable.id) return c
      switch (point.field) {
        case 'from':
          return { ...c, from: '' }
        case 'to':
          return { ...c, to: '' }
        case 'steckA':
          return { ...c, steckA: false, steckAAt: '' }
        case 'steckB':
          return { ...c, steckB: false, steckBAt: '' }
      }
      const [field, row] = point.field.split('-')
      return field === 'patchA' || field === 'patchB' ? setTailCells(show, c, field, [Number(row)], ['']) : c
    }),
  }
}

// One connector on a cable end with several: a pair on a trunk's tail, or a jack on a
// built-in fan. Each has its own Patch A/B cell.
export interface FanCell {
  index: number
  label: string
  text: string
}

// A cable end with several connectors, and the rack it sits in.
export interface FanEnd {
  cable: Cable
  end: End
  tail?: CableType
  cells: FanCell[]
  rackId: string | null
}

const patchField = (end: End) => (end === 'A' ? 'patchA' : 'patchB')

// The rack a fan end lives in: an interconnect's own rack; for anything else, the rack of
// the steck rail its end is mounted on, else of the gear its pairs or its From/To already
// patch to. A trunk with End A on one rack's steck and End B on another's has a tail in each.
function fanRack(report: PatchReport, cable: Cable, end: End, count: number): string | null {
  if (cable.deployment === 'interconnect') return cable.rackId
  const at = (field: string) => report.byField.get(fieldKey(cable.id, field))?.gear.rackId ?? null
  if (end === 'A' ? cable.steckA : cable.steckB) {
    const rack = at(`steck${end}`)
    if (rack) return rack
  }
  for (let i = 0; i < count; i++) {
    const rack = at(`${patchField(end)}-${i}`)
    if (rack) return rack
  }
  return at(endField(end))
}

// Every cable end with more than one connector, the same cells the patch report reads.
export function fanEnds(show: Show, report: PatchReport): FanEnd[] {
  const fans: FanEnd[] = []
  for (const cable of show.cables) {
    const tails = visibleTails(show, cable)
    const trunk = typeById(show, cable.typeId)?.part === 'Trunk'
    for (const end of ['A', 'B'] as const) {
      const count = Math.min(tails.length, endConnectors(show, cable, end))
      if (count < 2) continue
      const cells = tails.slice(0, count).map((t, index) => ({
        index,
        label: count === tails.length ? `#${index + 1}${t.name.trim() ? ` ${t.name.trim()}` : ''}` : `Connector ${index + 1}`,
        text: t[patchField(end)],
      }))
      fans.push({
        cable,
        end,
        tail: trunk ? typeById(show, end === 'A' ? cable.tailATypeId : cable.tailBTypeId) : undefined,
        cells,
        rackId: fanRack(report, cable, end, count),
      })
    }
  }
  return fans
}

// Whether a fan's cell already names this target.
export const cellIsHere = (cell: FanCell, target: PatchTarget) => sameText(cell.text, targetText(target))

// Patches a run of a fan end's cells, from one cell on, to a run of targets (one each).
// An interconnect patched into a racked unit moves to that rack, as with plugEnd.
export function plugCells(show: Show, fan: FanEnd, from: number, targets: PatchTarget[]): Show {
  const rackId = targets[0]?.gear.rackId
  return {
    ...show,
    cables: show.cables.map((cable) => {
      if (cable.id !== fan.cable.id) return cable
      const rows = targets.map((_, k) => from + k)
      const next = setTailCells(show, cable, patchField(fan.end), rows, targets.map(targetText))
      return cable.deployment === 'interconnect' && rackId ? { ...next, rackId } : next
    }),
  }
}

// Where a cable end marked Steck is placed ("SR 1 · 3"), or '' when it isn't marked or
// hasn't been placed yet.
export const steckPlace = (c: Cable, end: End) =>
  (end === 'A' ? c.steckA : c.steckB) ? (end === 'A' ? c.steckAAt : c.steckBAt).trim() : ''

// The cable end on the other side of a steck from this one: its neighbor in a linked path
// (the cable before it meets its End A, the one after it its End B), when one of the two
// is an interconnect and the other isn't, so one is inside the rack and the other out.
export function steckPartner(show: Show, cable: Cable, end: End): { cable: Cable; end: End } | null {
  const path = linkedCables(show, cable)
  const at = path.findIndex((c) => c.id === cable.id)
  const other = at < 0 ? undefined : path[end === 'A' ? at - 1 : at + 1]
  if (!other || (other.deployment === 'interconnect') === (cable.deployment === 'interconnect')) return null
  return { cable: other, end: end === 'A' ? 'B' : 'A' }
}

// Places a cable end in a steck rail's quarter (marking it Steck if it isn't), and, unless
// told not to, the end it meets there (steckPartner) too, when that isn't already placed
// somewhere else. An interconnect placed on a racked rail belongs to that rack.
export function placeEnd(show: Show, cableId: string, end: End, rail: Gear, quarter: string, withPartner = true): Show {
  const text = `${rail.name.trim()} · ${quarter}`
  const cable = show.cables.find((c) => c.id === cableId)
  if (!cable) return show
  const partner = withPartner ? steckPartner(show, cable, end) : null
  const put = (c: Cable, e: End): Cable => {
    const rackId = c.deployment === 'interconnect' && rail.rackId ? rail.rackId : c.rackId
    return e === 'A' ? { ...c, steckA: true, steckAAt: text, rackId } : { ...c, steckB: true, steckBAt: text, rackId }
  }
  return {
    ...show,
    cables: show.cables.map((c) => {
      if (c.id === cableId) return put(c, end)
      if (partner && c.id === partner.cable.id) {
        const now = steckPlace(c, partner.end)
        if (!now || sameText(now, text)) return put(c, partner.end)
      }
      return c
    }),
  }
}

// Takes a cable end off its rail, still marked Steck, to be placed again.
export function unplaceEnd(show: Show, cableId: string, end: End): Show {
  return {
    ...show,
    cables: show.cables.map((c) =>
      c.id !== cableId ? c : end === 'A' ? { ...c, steckAAt: '' } : { ...c, steckBAt: '' },
    ),
  }
}

// Takes whatever a point on a rail is off it: a placed end goes back to waiting (still
// marked Steck); typed text naming the quarter is cleared.
export function unplacePoint(show: Show, point: PatchPoint): Show {
  if (point.field === 'steckA' || point.field === 'steckB') {
    return unplaceEnd(show, point.cable.id, point.field === 'steckA' ? 'A' : 'B')
  }
  return unplugPoint(show, point)
}

// Every cable end marked Steck, and the rail quarter it's on (its patch point), if any.
export function steckEnds(show: Show, report: PatchReport): { cable: Cable; end: End; on?: PatchPoint }[] {
  return show.cables.flatMap((cable) =>
    (['A', 'B'] as const)
      .filter((end) => (end === 'A' ? cable.steckA : cable.steckB))
      .map((end) => {
        const on = report.byField.get(fieldKey(cable.id, `steck${end}`))
        return { cable, end, on: on && isSteck(on.gear) ? on : undefined }
      }),
  )
}
