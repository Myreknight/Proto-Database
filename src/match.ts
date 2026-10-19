import type { Gear } from './types'

// What a cable end or patch cell names: the unit, the text up to its port, and the port
// as typed ("Switch 1 · 24" → Switch 1, "Switch 1 · ", "24").
export interface GearHit {
  gear: Gear
  prefix: string
  rest: string
}

// The unit a cable end or patch point plugs into: the one whose name the text starts
// with ("Amp 1-A" is Amp 1). The longest name wins, and the name has to end at a break,
// so "Amp 10" isn't Amp 1. What follows the name, past any separator, is the port.
export function gearMatcher(gear: Gear[]): (text: string) => GearHit | undefined {
  const names = gear
    .map((g) => ({ g, name: g.name.trim().toLowerCase() }))
    .filter((n) => n.name)
    // Longest first; equal names keep show order, so the first unit wins a tie.
    .sort((a, b) => b.name.length - a.name.length)
  return (text) => {
    const t = text.trim()
    const lower = t.toLowerCase()
    if (!lower) return undefined
    const hit = names.find(({ name }) => lower.startsWith(name) && !/[a-z0-9]/i.test(lower.charAt(name.length)))
    if (!hit) return undefined
    const after = t.slice(hit.name.length)
    const sep = after.match(/^[\s\-–—·•:/#.,]*(?:port\b\s*)?/i)?.[0] ?? ''
    return { gear: hit.g, prefix: t.slice(0, hit.name.length + sep.length), rest: after.slice(sep.length).trim() }
  }
}
