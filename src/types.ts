// Cable = one hard-wired piece. Trunk = the long run (a "mult") that takes tails.
// Tail = the fan-out that clips onto a trunk end. Adapter = barrels, turnarounds, couplers.
export type Part = 'Cable' | 'Trunk' | 'Tail' | 'Adapter'

export const PARTS: Part[] = ['Cable', 'Trunk', 'Tail', 'Adapter']

export interface CableType {
  id: string
  name: string
  part: Part
  channels: number
  endA: string
  endB: string
  lengths: number[]
  notes: string
}

export type Deployment = 'loose' | 'bundled' | 'interconnect'

export const DEPLOYMENTS: Deployment[] = ['loose', 'bundled', 'interconnect']

// A piece of trunk in the run. The first is the main piece; any after it are Extensions.
export interface Segment {
  id: string
  length: number | null
  extension: boolean
}

// A numbered tail. Its label also carries the cable's name. Patch A/B are where
// that tail plugs in at each end (e.g. "AR133-1 - out").
export interface Tail {
  number: number
  name: string
  patchA: string
  patchB: string
}

export interface Cable {
  id: string
  name: string
  typeId: string
  tailATypeId: string | null
  tailBTypeId: string | null
  deployment: Deployment
  bundleId: string | null
  // Which rack an interconnect patches inside of. Kept if the cable is switched away
  // from interconnect, so switching back doesn't lose it.
  rackId: string | null
  from: string
  to: string
  segments: Segment[]
  tails: Tail[]
  color: string | null
  // Which end got the flag when bundling, so every cable's same end lands together.
  flagEnd: 'A' | 'B' | null
  notes: string
}

export interface Bundle {
  id: string
  name: string
  from: string
  to: string
  length: number | null
  notes: string
}

// A rack that interconnects patch inside of.
export interface Rack {
  id: string
  name: string
  location: string
  notes: string
}

export type RoleId = 'designer' | 'associate' | 'assistant' | 'productionAudio' | 'a1' | 'a2'

// The audio team, in the order they're credited on paperwork.
export const ROLES: { id: RoleId; label: string; add: string; credit: string }[] = [
  { id: 'designer', label: 'Sound Designer', add: 'designer', credit: 'Sound Design' },
  { id: 'associate', label: 'Associate Sound Designer', add: 'associate', credit: 'Associate' },
  { id: 'assistant', label: 'Assistant Sound Designer', add: 'assistant', credit: 'Assistant' },
  { id: 'productionAudio', label: 'Production Audio', add: 'production audio', credit: 'Production Audio' },
  { id: 'a1', label: 'A1', add: 'A1', credit: 'A1' },
  { id: 'a2', label: 'A2', add: 'A2', credit: 'A2' },
]

export type DateId = 'prep' | 'loadIn' | 'tech' | 'previews' | 'open' | 'close' | 'extension'

// Key dates for the production. Ranges have a start and end; the rest are a single day.
export const SCHEDULE: { id: DateId; label: string; range: boolean }[] = [
  { id: 'prep', label: 'Prep', range: true },
  { id: 'loadIn', label: 'Load in', range: true },
  { id: 'tech', label: 'Tech', range: true },
  { id: 'previews', label: 'Previews', range: true },
  { id: 'open', label: 'Open', range: false },
  { id: 'close', label: 'Close', range: false },
  { id: 'extension', label: 'Possible extension', range: false },
]

// Dates are YYYY-MM-DD, or '' when not set. Single-day entries only use start.
export interface DateSpan {
  start: string
  end: string
}

export interface ShowInfo {
  venue: string
  dates: Record<DateId, DateSpan>
  // Small PNG data URL, so the logo travels inside the show file.
  logo: string | null
  team: Record<RoleId, string[]>
}

export type CheckStep = 'pulled' | 'labeled' | 'bundled' | 'tested'

// When each prep step was checked off (ISO time); a missing step isn't done yet.
export type Checks = Partial<Record<CheckStep, string>>

export interface Show {
  format: 'proto-database-show'
  formatVersion: 1
  name: string
  info: ShowInfo
  cableTypes: CableType[]
  cables: Cable[]
  bundles: Bundle[]
  racks: Rack[]
  // Prep checklist progress, keyed by checklist item (see checklists.ts).
  checks: Record<string, Checks>
}
