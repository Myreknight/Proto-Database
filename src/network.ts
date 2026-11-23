// Network switches. A gear model marked as a switch has a layout (one or two rows of
// ports, which are SFP cages, gaps between groups); each unit of it sets its own ports:
// access or trunk, which VLANs, and a colour. That's for printing port labels that sit
// over the switch's ports (switchLabels.ts), not for configuring the switch itself.

import { gearModelOf } from './models'
import { expandPorts, portKey } from './ports'
import type { Gear, GearModel, Show, SwitchLayout, SwitchPort, Vlan } from './types'

// Colours new VLANs take in turn (VLAN 1 is the grey).
export const VLAN_PALETTE = ['#2f7ed8', '#e0702d', '#2fa36b', '#c23b6e', '#8a5bd6', '#c9a227', '#1fa3a3', '#d6453d', '#5a6fd6', '#7c9a2a', '#b05ab5']
const DEFAULT_GREY = '#7a8394'

export const defaultVlans = (): Vlan[] => [{ id: 1, name: 'Default', color: DEFAULT_GREY }]

export const isHex = (s: unknown): s is string => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s)

export const isSwitchModel = (m: GearModel | undefined) => !!m?.switchLayout
export const isSwitch = (show: Show, g: Gear) => !g.steck && !g.host && isSwitchModel(gearModelOf(show, g))
export const switchesOf = (show: Show) => show.gear.filter((g) => isSwitch(show, g))

// A switch's ports, as its model lists them, in order.
export function switchPortList(show: Show, g: Gear): string[] {
  return expandPorts(gearModelOf(show, g)?.ports ?? '')
}

// "10,20-22" → [10, 20, 21, 22]; null if it doesn't read as VLAN numbers.
export function parseVlanList(text: string): number[] | null {
  const out = new Set<number>()
  const s = text.trim().replace(/\s*(?:\.\.|\bto\b|–|-)\s*/gi, '-').replace(/[;\s]+/g, ',')
  if (!s) return []
  for (const part of s.split(',')) {
    if (!part) continue
    const m = /^(\d+)(?:-(\d+))?$/.exec(part)
    if (!m) return null
    const a = Number(m[1])
    const b = m[2] ? Number(m[2]) : a
    if (a < 1 || b > 4094 || b < a) return null
    for (let i = a; i <= b; i++) out.add(i)
  }
  return [...out].sort((x, y) => x - y)
}

// [10, 20, 21, 22] → "10, 20-22"
export function vlanListText(ids: number[]): string {
  const n = [...new Set(ids)].sort((a, b) => a - b)
  const parts: string[] = []
  for (let i = 0; i < n.length; i++) {
    let j = i
    while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++
    parts.push(j > i ? `${n[i]}-${n[j]}` : `${n[i]}`)
    i = j
  }
  return parts.join(', ')
}

export const vlanById = (show: Show, id: number) => show.info.vlans.find((v) => v.id === id)

export function vlanColor(show: Show, id: number): string {
  return vlanById(show, id)?.color ?? DEFAULT_GREY
}

const freshPort = (): SwitchPort => ({ mode: 'access', vlan: 1, tagged: [], color: null, desc: '' })

// A port's setup (a port that's never been set is an access port on VLAN 1).
export function portSetup(g: Gear, port: string): SwitchPort {
  return g.switchPorts[port] ?? freshPort()
}

// The colour a port prints in: its own, or its VLAN's.
export const portFill = (show: Show, p: SwitchPort) => p.color ?? vlanColor(show, p.vlan)

// Changes some of a switch's ports. A port set back to plain access on VLAN 1, with no
// colour or description, is dropped, so untouched ports stay out of the show file.
export function setSwitchPorts(show: Show, gearId: string, ports: string[], change: Partial<SwitchPort>): Show {
  return {
    ...show,
    gear: show.gear.map((g) => {
      if (g.id !== gearId) return g
      const next = { ...g.switchPorts }
      for (const port of ports) {
        const p = { ...portSetup(g, port), ...change }
        if (p.mode === 'access') p.tagged = []
        p.tagged = p.tagged.filter((t) => t !== p.vlan)
        const plain = p.mode === 'access' && p.vlan === 1 && !p.color && !p.desc.trim()
        if (plain) delete next[port]
        else next[port] = p
      }
      return { ...g, switchPorts: next }
    }),
  }
}

// The next VLAN number after the show's highest, and the next colour in turn.
export function addVlan(show: Show): { show: Show; id: number } {
  const used = new Set(show.info.vlans.map((v) => v.id))
  // The next ten up (10, 20, 30…), or the first free number if that's taken or too high.
  const tens = (Math.floor(Math.max(1, ...used) / 10) + 1) * 10
  let free = tens <= 4094 && !used.has(tens) ? tens : 2
  while (used.has(free) && free < 4094) free++
  const color = VLAN_PALETTE[(show.info.vlans.length - 1 + VLAN_PALETTE.length) % VLAN_PALETTE.length]
  return { show: { ...show, info: { ...show.info, vlans: [...show.info.vlans, { id: free, name: '', color }] } }, id: free }
}

// Renames or recolours a VLAN, or renumbers it (every port using it follows).
export function setVlan(show: Show, id: number, changes: Partial<Vlan>): Show {
  const newId = changes.id
  const renumber = newId !== undefined && newId !== id
  if (renumber && (newId < 1 || newId > 4094 || show.info.vlans.some((v) => v.id === newId))) return show
  const map = (n: number) => (renumber && n === id ? newId : n)
  return {
    ...show,
    info: { ...show.info, vlans: show.info.vlans.map((v) => (v.id === id ? { ...v, ...changes } : v)) },
    gear: renumber ? show.gear.map((g) => remapPorts(g, map)) : show.gear,
  }
}

// Takes a VLAN out: ports on it go back to VLAN 1, and trunks stop carrying it.
export function removeVlan(show: Show, id: number): Show {
  if (id === 1) return show
  return {
    ...show,
    info: { ...show.info, vlans: show.info.vlans.filter((v) => v.id !== id) },
    gear: show.gear.map((g) =>
      remapPorts(g, (n) => n, (p) => ({ ...p, vlan: p.vlan === id ? 1 : p.vlan, tagged: p.tagged.filter((t) => t !== id) })),
    ),
  }
}

function remapPorts(g: Gear, map: (n: number) => number, fix?: (p: SwitchPort) => SwitchPort): Gear {
  const entries = Object.entries(g.switchPorts)
  if (!entries.length) return g
  return {
    ...g,
    switchPorts: Object.fromEntries(
      entries.map(([port, p]) => {
        const moved = { ...p, vlan: map(p.vlan), tagged: p.tagged.map(map) }
        return [port, fix ? fix(moved) : moved]
      }),
    ),
  }
}

// How many ports, across all switches, use a VLAN (untagged or tagged).
export function vlanUse(show: Show, id: number): number {
  let n = 0
  for (const g of switchesOf(show)) {
    for (const p of Object.values(g.switchPorts)) if (p.vlan === id || p.tagged.includes(id)) n++
  }
  return n
}

// A port list ("25-28", "SFP 1-4") as a test: a port matches by name, or by its number.
export function portMatcher(text: string): (port: string) => boolean {
  const names = new Set<string>()
  const numbers = new Set<string>()
  for (const p of expandPorts(text)) {
    if (/^\d+$/.test(p.trim())) numbers.add(String(Number(p)))
    else names.add(portKey(p))
  }
  // A number only matches a port named just that number, so "3" isn't "SFP 3".
  return (port) => names.has(portKey(port)) || (/^\d+$/.test(port.trim()) && numbers.has(String(Number(port))))
}

export const isSfpName = (port: string) => /\b(q?sfp|sfp\+|sfp28|xfp)/i.test(port)

// A new switch model's layout: two rows past a dozen ports, a gap before the first SFP.
export function defaultLayout(ports: string[], sfp = ''): SwitchLayout {
  const isSfp = portMatcher(sfp)
  const first = ports.find((p) => isSfp(p) || isSfpName(p))
  return { rows: ports.length > 12 ? 2 : 1, sfp, gapBefore: first ?? '', gap: 4, groupCols: 0 }
}

export function normalizeLayout(raw: unknown): SwitchLayout | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<SwitchLayout>
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d)
  return {
    rows: r.rows === 2 ? 2 : 1,
    sfp: typeof r.sfp === 'string' ? r.sfp : '',
    gapBefore: typeof r.gapBefore === 'string' ? r.gapBefore : '',
    gap: num(r.gap, 4),
    groupCols: Math.floor(num(r.groupCols, 0)),
  }
}

export function normalizeSwitchPorts(raw: unknown): Record<string, SwitchPort> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, SwitchPort> = {}
  for (const [port, v] of Object.entries(raw as Record<string, Partial<SwitchPort>>)) {
    if (!v || typeof v !== 'object') continue
    const vlan = Number.isInteger(v.vlan) && v.vlan! >= 1 && v.vlan! <= 4094 ? v.vlan! : 1
    const tagged = Array.isArray(v.tagged) ? v.tagged.filter((t): t is number => Number.isInteger(t) && t >= 1 && t <= 4094 && t !== vlan) : []
    out[port] = {
      mode: v.mode === 'trunk' ? 'trunk' : 'access',
      vlan,
      tagged: v.mode === 'trunk' ? [...new Set(tagged)].sort((a, b) => a - b) : [],
      color: isHex(v.color) ? v.color : null,
      desc: typeof v.desc === 'string' ? v.desc : '',
    }
  }
  return out
}

export function normalizeVlans(raw: unknown): Vlan[] {
  const list: Vlan[] = []
  if (Array.isArray(raw)) {
    for (const v of raw as Partial<Vlan>[]) {
      if (!v || !Number.isInteger(v.id) || v.id! < 1 || v.id! > 4094 || list.some((x) => x.id === v.id)) continue
      list.push({ id: v.id!, name: typeof v.name === 'string' ? v.name : '', color: isHex(v.color) ? v.color : DEFAULT_GREY })
    }
  }
  if (!list.some((v) => v.id === 1)) list.unshift(defaultVlans()[0])
  return list.sort((a, b) => a.id - b.id)
}

// "1 row" / "2 rows" in a model CSV's Switch column; blank isn't a switch.
export function parseSwitchRows(text: string): 1 | 2 | null {
  const t = text.trim()
  if (!t || /^(no|false|0|-)$/i.test(t)) return null
  return /2|two|double/i.test(t) ? 2 : 1
}

// A model's layout from a model CSV's Switch and SFP columns.
export function layoutFromCsv(row: { switch: string; sfp: string; ports: string }): SwitchLayout | null {
  const rows = parseSwitchRows(row.switch)
  return rows ? { ...defaultLayout(expandPorts(row.ports), row.sfp), rows } : null
}

// And back: ["2 rows", "25-28"].
export function layoutToCsv(layout: SwitchLayout | null): [string, string] {
  return layout ? [layout.rows === 2 ? '2 rows' : '1 row', layout.sfp] : ['', '']
}
