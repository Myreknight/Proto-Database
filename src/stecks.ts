// Steck rails: rails the shop builds into a rack, where cables from the rack's gear meet
// the cables that run out to the rest of the world. A rail is so many rack units tall
// with four quarters across it, and the quarters work like ports: cable ends marked Steck
// are placed in them ("SR 1 · 3"), and what's placed says what the quarter holds. A tail's
// G-block fills a quarter; panel connectors (XLR, etherCON…) share one, more on a taller
// rail. Rails live in racks like gear does, as gear entries with a build (Gear.steck), so
// placing, drawing and patching work the same; they just aren't gear models, and stay off
// the Gear tab.

import { newId } from './ids'
import { gearMatcher } from './match'
import { modelKey } from './models'
import type { Cable, Gear, GearModel, Show, SteckBuild } from './types'

export const STECK_QUARTERS = ['1', '2', '3', '4']
export const STECK_RU = [1, 2, 3, 4]

// Panel connectors a quarter takes, and how much of it each one uses: a quarter has room
// for two D-size connectors per rack unit of rail (2 on 1RU, 4 on 2RU); an NL8 chassis is
// bigger and takes two of those spaces. `match` finds one from a cable's connector name.
const CONNECTORS: { label: string; short: string; size: number; match: RegExp }[] = [
  { label: 'NL8', short: 'NL8', size: 2, match: /\bnl8\b/i },
  { label: 'XLR', short: 'XLR', size: 1, match: /xlr/i },
  { label: 'NL4', short: 'NL4', size: 1, match: /\bnl[24]\b|speakon/i },
  { label: 'etherCON', short: 'etherCON', size: 1, match: /ethercon|rj45|cat ?[56]/i },
  { label: 'RG6 (BNC)', short: 'BNC', size: 1, match: /rg6|bnc|coax|sdi|madi/i },
  { label: 'powerCON', short: 'powerCON', size: 1, match: /powercon|true1/i },
  { label: 'opticalCON DUO', short: 'DUO', size: 1, match: /(opticalcon|optocon).*duo/i },
  { label: 'opticalCON QUAD', short: 'QUAD', size: 1, match: /(opticalcon|optocon).*quad/i },
  { label: 'LC fiber', short: 'LC', size: 1, match: /\blc\b/i },
]

export const isSteck = (g: Gear) => g.steck != null

// What a connector is on a rail, by its name ("etherCON", "XLR3-F"…). Anything not listed
// counts as one D-size space.
export function connectorInfo(connector: string): { label: string; short: string; size: number } {
  const known = CONNECTORS.find((c) => c.match.test(connector))
  return known ?? { label: connector.trim() || 'Connector', short: connector.trim() || '?', size: 1 }
}

// D-size spaces in one quarter of a rail this tall.
export const quarterRoom = (ru: number) => 2 * ru

// The biggest G-block a rail this tall takes: 6pr on 1RU, 19pr on 2RU and up.
export const tailRoom = (ru: number) => (ru <= 1 ? 6 : 19)

export function steckPorts(): string[] {
  return STECK_QUARTERS
}

// "1RU steck rail"
export const steckSummary = (build: SteckBuild) => `${build.ru}RU steck rail`

// A new rail for a rack, named on from the show's others ("SR 3").
export function newSteckGear(show: Show, rackId: string): Gear {
  const used = show.gear.map((g) => /^SR\s*(\d+)$/i.exec(g.name.trim())?.[1]).filter(Boolean).map(Number)
  return {
    id: newId(),
    name: `SR ${Math.max(0, ...used) + 1}`,
    categoryId: null,
    manufacturer: '',
    model: '',
    qty: 1,
    rackId,
    rackU: null,
    rackSide: 'front',
    rackSlot: null,
    notes: '',
    steck: { ru: 1 },
  }
}

// Reads a rail from a saved show, or null for a unit of gear.
export function normalizeSteck(raw: unknown): SteckBuild | null {
  if (!raw || typeof raw !== 'object') return null
  const ru = (raw as { ru?: unknown }).ru
  return { ru: typeof ru === 'number' ? Math.max(1, Math.min(8, Math.floor(ru))) : 1 }
}

export function setSteckRu(show: Show, gearId: string, ru: number): Show {
  return { ...show, gear: show.gear.map((g) => (g.id === gearId && g.steck ? { ...g, steck: { ru } } : g)) }
}

// Shows from 0.7.8–0.7.9 had steck rails as gear models flagged Steck; each racked unit of
// one becomes a rail of that model's height, and the flagged models leave the library.
// Ends already placed in quarters ("SR 1 · 3") stay where they are. A quarter named with
// a letter ("SR 1 · 3A", from a build that set connectors per quarter) goes back to "3".
export function migrateSteckRails(
  gear: Gear[],
  models: GearModel[],
  cables: Cable[],
  rawModels: unknown[],
): { gear: Gear[]; cables: Cable[]; gearModels: GearModel[] } {
  const flagged = new Map<string, number>()
  const keyOf = (g: { manufacturer?: string; model?: string }) => modelKey(g.manufacturer ?? '', g.model ?? '') ?? ''
  for (const m of rawModels as { manufacturer?: string; model?: string; steck?: unknown; ru?: unknown }[]) {
    if (m?.steck === true && keyOf(m)) flagged.set(keyOf(m), typeof m.ru === 'number' ? m.ru : 1)
  }
  const gearModels = flagged.size ? models.filter((m) => !flagged.has(keyOf(m))) : models
  const railed = gear.map((g) =>
    !g.steck && flagged.has(keyOf(g))
      ? { ...g, manufacturer: '', model: '', categoryId: null, steck: { ru: Math.max(1, flagged.get(keyOf(g)) ?? 1) } }
      : g,
  )

  const match = gearMatcher(railed.filter(isSteck))
  const quarter = (text: string) => {
    const hit = match(text)
    const lettered = hit && /^(\d+)[a-h]$/i.exec(hit.rest)
    return lettered ? `${hit.gear.name.trim()} · ${lettered[1]}` : text
  }
  const fixed = cables.map((c) => {
    const steckAAt = c.steckA ? quarter(c.steckAAt) : c.steckAAt
    const steckBAt = c.steckB ? quarter(c.steckBAt) : c.steckBAt
    return steckAAt === c.steckAAt && steckBAt === c.steckBAt ? c : { ...c, steckAAt, steckBAt }
  })
  return { gear: railed, cables: fixed, gearModels }
}
