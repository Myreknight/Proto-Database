import { genderOf } from './labels'
import { bundleById, cableGroups, rackById, rackCables, typeById } from './show'
import type { Bundle, Cable, CheckStep, Show } from './types'

export type ChecklistKind = 'cables' | 'bundles' | 'tails'

export const STEPS: Record<ChecklistKind, CheckStep[]> = {
  cables: ['pulled', 'labeled', 'tested'],
  bundles: ['pulled', 'labeled', 'bundled', 'tested'],
  tails: ['pulled', 'labeled', 'tested'],
}

export const STEP_LABELS: Record<CheckStep, string> = {
  pulled: 'Pulled',
  labeled: 'Labeled',
  bundled: 'Bundled',
  tested: 'Tested',
}

// One physical thing to prep: a piece of cable (main or extension) or a tail (fan or box).
export interface CheckItem {
  key: string
  cable: Cable
  piece: string
  type: string
  detail: string
  location: string
}

export interface CheckGroup {
  key: string
  title: string
  bundle: Bundle | null
  items: CheckItem[]
}

// Each piece of a run is pulled, labeled and tested on its own, so extensions get rows too.
// Keys follow the piece's id, so a duplicated cable or new extension starts unchecked.
function pieceItems(show: Show, cable: Cable): CheckItem[] {
  const type = typeById(show, cable.typeId)
  const route = [cable.from, cable.to].filter(Boolean).join(' → ')
  return cable.segments.map((g, i) => ({
    key: `piece:${g.id}`,
    cable,
    piece: cable.segments.length > 1 ? (g.extension ? `Ext ${i}` : 'Main') : '',
    type: type?.name ?? 'Missing type',
    detail: g.length != null ? `${g.length}'` : '',
    location: route,
  }))
}

// Cables that aren't in a bundle: loose runs, then interconnects rack by rack.
export function cableChecklist(show: Show): CheckGroup[] {
  const unbundled = show.cables.filter((c) => !bundleById(show, c.bundleId))
  const interconnects = unbundled.filter((c) => c.deployment === 'interconnect')
  const rackless = interconnects.filter((c) => !rackById(show, c.rackId))
  const groups: CheckGroup[] = [
    {
      key: 'loose',
      title: 'Loose',
      bundle: null,
      items: unbundled.filter((c) => c.deployment !== 'interconnect').flatMap((c) => pieceItems(show, c)),
    },
    ...show.racks.map((rack) => ({
      key: `rack:${rack.id}`,
      title: `Interconnects · ${rack.name || 'Unnamed rack'}`,
      bundle: null,
      items: rackCables(show, rack.id).flatMap((c) => pieceItems(show, c)),
    })),
    { key: 'rack:none', title: 'Interconnects · No rack', bundle: null, items: rackless.flatMap((c) => pieceItems(show, c)) },
  ]
  return groups.filter((g) => g.items.length > 0)
}

export function bundleChecklist(show: Show): CheckGroup[] {
  return show.bundles
    .map((bundle) => ({
      key: bundle.id,
      title: bundle.name || 'Unnamed bundle',
      bundle,
      items: show.cables.filter((c) => c.bundleId === bundle.id).flatMap((c) => pieceItems(show, c)),
    }))
    .filter((g) => g.items.length > 0)
}

// One row per fan or box, not per pair. The key includes the tail type, so swapping
// a cable's tail for a different one starts that tail's checklist over.
function tailItems(show: Show, cable: Cable): CheckItem[] {
  const type = typeById(show, cable.typeId)
  if (type?.part !== 'Trunk') return []
  return (['A', 'B'] as const).flatMap((end) => {
    const tail = typeById(show, end === 'A' ? cable.tailATypeId : cable.tailBTypeId)
    if (!tail) return []
    return [
      {
        key: `tail:${cable.id}:${end}:${tail.id}`,
        cable,
        piece: `End ${end}`,
        type: tail.name,
        detail: genderOf(tail.endB) ?? '',
        location: (end === 'A' ? cable.from : cable.to) || '',
      },
    ]
  })
}

// Tails grouped the same way the labels print: bundles, then racks, then everything else.
export function tailChecklist(show: Show): CheckGroup[] {
  return cableGroups(show)
    .map((g) => ({
      key: g.key,
      title: g.title,
      bundle: g.bundle,
      items: g.cables.flatMap((c) => tailItems(show, c)),
    }))
    .filter((g) => g.items.length > 0)
}

export function checklist(show: Show, kind: ChecklistKind): CheckGroup[] {
  if (kind === 'cables') return cableChecklist(show)
  if (kind === 'bundles') return bundleChecklist(show)
  return tailChecklist(show)
}

export function isDone(show: Show, key: string, step: CheckStep): boolean {
  return !!show.checks[key]?.[step]
}

// Sets one step on many items at once (a whole bundle, or a single row).
export function setChecks(show: Show, keys: string[], step: CheckStep, done: boolean, at: string): Show {
  const checks = { ...show.checks }
  for (const key of keys) {
    const next = { ...checks[key] }
    if (done) next[step] = next[step] ?? at
    else delete next[step]
    if (Object.keys(next).length) checks[key] = next
    else delete checks[key]
  }
  return { ...show, checks }
}
