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
  // Ends mounted in a steck: the rack panel where internal wiring meets a bundle. For a
  // trunk with a tail at that end, it's the tail's multipin side that mounts. Each one
  // prints a steck label.
  steckA: boolean
  steckB: boolean
  // Where each steck end mounts: a slot on a steck rail, typed like a patch point
  // ("SR 1 · 3") so it links to the rail and its slot.
  steckAAt: string
  steckBAt: string
  // Cables that make up one signal path (interconnect → steck → bundled cable → steck →
  // interconnect) share a link id; linkOrder is this cable's place in that path.
  linkId: string | null
  linkOrder: number
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

// A rack that interconnects patch inside of and gear mounts in.
export interface Rack {
  id: string
  name: string
  location: string
  // Height in rack units, or null until it's set. The gear list counts racks by size.
  size: number | null
  notes: string
}

// What gear is filed under on the gear list. Shows can rename, reorder and add to these.
export interface GearCategory {
  id: string
  name: string
}

export const GEAR_CATEGORY_NAMES = [
  'Consoles',
  'Playback & Computers',
  'Processing',
  'Amplifiers',
  'Speakers',
  'Wireless',
  'Microphones',
  'Monitors & IEM',
  'Comms',
  'Video',
  'Networking',
  'Power',
  'Racks',
  'Hardware',
  'Misc',
]

// One unit of gear (Amp 1), or a bulk line with a quantity (20 mic clips). A cable end
// or patch point links to a unit when its text starts with the unit's name ("Amp 1-A").
export interface Gear {
  id: string
  name: string
  categoryId: string | null
  manufacturer: string
  model: string
  qty: number
  // The rack it's mounted in, and where: the bottom rack unit it sits on (U1 is the
  // bottom of the rack), front or rear rails, and which half for half-width gear. A bulk
  // line stacks its pieces upward from there.
  rackId: string | null
  rackU: number | null
  rackSide: RackSide
  rackSlot: RackSlot | null
  notes: string
}

export type RackSide = 'front' | 'rear'
export type RackSlot = 'left' | 'right'

// The show's model library. Ports are set once per model, so every D80 shares one list,
// typed as ranges: "In A-D, Out 1-4, Net Pri, Net Sec" or "1-48". Matched to gear by
// manufacturer and model; the category is what a new unit of that model gets.
export interface GearModel {
  id: string
  manufacturer: string
  model: string
  categoryId: string | null
  // Height in rack units (1U = 1.75 in, per EIA-310); null for gear that doesn't rack-mount.
  ru: number | null
  // Half the rack's width, so two can sit side by side in the same rack units.
  halfWidth: boolean
  // A steck rail or panel: its ports are slots that tail connectors (G-blocks) mount in.
  steck: boolean
  ports: string
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
  gearCategories: GearCategory[]
  gear: Gear[]
  gearModels: GearModel[]
  // Prep checklist progress, keyed by checklist item (see checklists.ts).
  checks: Record<string, Checks>
}
