// Patching from the gear's side: picking a cable end for a port (or one side of a steck
// slot). Links are the text in the cable, so this writes that text, and the cable and the
// gear stay in step both ways.

import { fieldKey, gearModelOf, type PatchPoint, type PatchReport, type SteckFace } from './gear'
import { endConnectors } from './labels'
import { setTailCells, typeById, visibleTails } from './show'
import type { Cable, CableType, Gear, Show } from './types'

export type End = 'A' | 'B'

// A port on a unit, or one side of a slot on a steck rail.
export type PatchTarget = { gear: Gear; port: string; face?: SteckFace }

// "Amp 1 · In A", the way a cable end names it.
export const targetText = (t: PatchTarget) => `${t.gear.name.trim()} · ${t.port}`

export const targetLabel = (t: PatchTarget) => (t.face ? `${targetText(t)}, ${t.face}` : targetText(t))

const endField = (end: End) => (end === 'A' ? 'from' : 'to')

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

// Where a cable end is plugged now, if picking it would move it: its steck slot, the
// gear its From/To names, or other text in its From/To that patching to a port would
// replace. Null when it's free, or already right here.
export function endNow(report: PatchReport, cable: Cable, end: End, target: PatchTarget): string | null {
  const steck = end === 'A' ? cable.steckA : cable.steckB
  const steckAt = (end === 'A' ? cable.steckAAt : cable.steckBAt).trim()
  const text = (end === 'A' ? cable.from : cable.to).trim()
  const linked = report.byField.get(fieldKey(cable.id, endField(end)))
  if (target.face) {
    if (steck && steckAt && !sameText(steckAt, targetText(target))) return `steck ${steckAt}`
    // A From/To on other gear moves off it; a place name stays put.
    if (linked && linked.gear.id !== target.gear.id) return linked.text.trim()
    return null
  }
  if (steck) return steckAt ? `steck ${steckAt}` : 'a steck'
  if (text && !sameText(text, targetText(target))) return linked ? text : `“${text}”`
  return null
}

// Whether a cable end is already on this target.
export function endIsHere(cable: Cable, end: End, target: PatchTarget): boolean {
  if (target.face) {
    const steck = end === 'A' ? cable.steckA : cable.steckB
    return steck && sameText(end === 'A' ? cable.steckAAt : cable.steckBAt, targetText(target))
  }
  return sameText(end === 'A' ? cable.from : cable.to, targetText(target))
}

// The rack an interconnect would move out of by patching it here, when it's in another one.
export function leavesRack(cable: Cable, target: PatchTarget): string | null {
  const rackId = target.gear.rackId
  return cable.deployment === 'interconnect' && rackId && cable.rackId && cable.rackId !== rackId ? cable.rackId : null
}

// Plugs a cable end into the target. A port gets the end's From/To and takes it out of
// any steck; a steck side ticks the end's Steck and sets its slot, and takes its From/To
// off any gear it named (a place name stays). An interconnect patched to a racked unit
// belongs to that unit's rack.
export function plugEnd(show: Show, report: PatchReport, cableId: string, end: End, target: PatchTarget): Show {
  const text = targetText(target)
  return {
    ...show,
    cables: show.cables.map((cable) => {
      if (cable.id !== cableId) return cable
      const rackId = cable.deployment === 'interconnect' && target.gear.rackId ? target.gear.rackId : cable.rackId
      const c = { ...cable, rackId }
      if (!target.face) {
        return end === 'A'
          ? { ...c, from: text, steckA: false, steckAAt: '' }
          : { ...c, to: text, steckB: false, steckBAt: '' }
      }
      const linked = report.byField.get(fieldKey(c.id, endField(end)))
      const offGear = linked && !gearModelOf(show, linked.gear)?.steck
      return end === 'A'
        ? { ...c, steckA: true, steckAAt: text, from: offGear ? '' : c.from }
        : { ...c, steckB: true, steckBAt: text, to: offGear ? '' : c.to }
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
