// Card slots. Consoles and I/O racks take cards that add ports: a DiGiCo SD-Rack's input
// and output slots take 8-channel cards, a Yamaha RPio622's RY slots take 16-channel ones,
// its HY slots network cards. Slots belong to a model ("SD In 1-7, SD Out 1-7"); which
// card is in each is up to each unit. Cards are gear in their own right (the rental shop
// needs them on the gear list), filed in a unit's slot with Gear.host, and their ports
// become the unit's ports, named the way the maker does: within the slot ("RY3 In 1") or
// counting on through the slots of a kind (an SD-Rack's third input card is In 17–24).

import { gearModelOf } from './models'
import { expandPorts, portKey } from './ports'
import { newId } from './ids'
import type { Gear, GearModel, Show } from './types'

// A slot's kind, from its name: "SD In 3" is an "SD In" slot, "RY 2" an "RY" slot.
export const slotKind = (slot: string) => slot.replace(/\s*\d+$/, '').trim()

// Which slot of its kind it is, from 0.
const slotIndex = (slot: string) => Math.max(0, Number(/(\d+)$/.exec(slot.trim())?.[1] ?? 1) - 1)

// "RY 3" → "RY3", to go in front of a card's ports.
const slotTag = (slot: string) => slot.trim().replace(/\s+(\d+)$/, '$1')

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

// Whether a card fits a slot: its kind is the slot's, or the slot takes a broader kind
// (an "SD" slot takes "SD In" and "SD Out" cards).
export function fits(card: string, slot: string): boolean {
  const kind = slotKind(slot).toLowerCase()
  const fit = card.trim().toLowerCase()
  return !!fit && (fit === kind || fit.startsWith(`${kind} `))
}

export const isCardModel = (m: GearModel | undefined) => !!m?.card.trim()

export function slotsOf(show: Show, g: Gear): string[] {
  return g.steck ? [] : expandPorts(gearModelOf(show, g)?.slots ?? '')
}

export function cardsIn(show: Show, hostId: string): Gear[] {
  return show.gear.filter((c) => c.host?.gearId === hostId)
}

export function cardIn(show: Show, hostId: string, slot: string): Gear | undefined {
  return show.gear.find((c) => c.host?.gearId === hostId && same(c.host.slot, slot))
}

// A card's ports as they're named in this slot.
export function portsInSlot(card: GearModel, slot: string): string[] {
  const ports = expandPorts(card.ports)
  if (card.cardNumbering !== 'continue') return ports.map((p) => `${slotTag(slot)} ${p}`)
  // Counting on: how many of each numbered kind the card has ("In": 8), so its slot's
  // place sets where it starts. Anything not numbered gets the slot in front, to stay apart.
  const counts = new Map<string, number>()
  for (const p of ports) {
    const m = /^(.*?)(\d+)$/.exec(p)
    if (m) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
  }
  const at = slotIndex(slot)
  return ports.map((p) => {
    const m = /^(.*?)(\d+)$/.exec(p)
    if (!m) return `${slotTag(slot)} ${p}`
    const width = m[2].length > 1 && m[2].startsWith('0') ? m[2].length : 0
    return `${m[1]}${String(Number(m[2]) + at * counts.get(m[1])!).padStart(width, '0')}`
  })
}

// The ports a unit's cards add, slot by slot.
export function cardPorts(show: Show, g: Gear): string[] {
  const out: string[] = []
  for (const slot of slotsOf(show, g)) {
    const card = cardIn(show, g.id, slot)
    const model = card && gearModelOf(show, card)
    if (model && isCardModel(model)) out.push(...portsInSlot(model, slot))
  }
  return out
}

// One list of ports, keeping the first of any that share a name.
export function uniquePorts(ports: string[]): string[] {
  const seen = new Set<string>()
  return ports.filter((p) => {
    const key = portKey(p)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Cards that fit a slot: the models, and spare cards (in no unit) of those models.
export function cardChoices(show: Show, slot: string): { models: GearModel[]; spares: Gear[] } {
  const models = show.gearModels
    .filter((m) => isCardModel(m) && fits(m.card, slot))
    .sort((a, b) => `${a.manufacturer} ${a.model}`.localeCompare(`${b.manufacturer} ${b.model}`, undefined, { numeric: true }))
  const spares = show.gear.filter((g) => {
    if (g.host || g.steck) return false
    const m = gearModelOf(show, g)
    return isCardModel(m) && fits(m!.card, slot)
  })
  return { models, spares }
}

// A card with nothing about it worth keeping (no name or notes): taken out of its slot, it
// just goes. A named one stays on the gear list as a spare.
export const plainCard = (c: Gear) => !c.name.trim() && !c.notes.trim()

// Takes a card out of its slot: a plain one goes, a named one becomes a spare.
export function removeCard(show: Show, cardId: string): Show {
  const card = show.gear.find((g) => g.id === cardId)
  if (!card) return show
  return {
    ...show,
    gear: plainCard(card)
      ? show.gear.filter((g) => g.id !== cardId)
      : show.gear.map((g) => (g.id === cardId ? { ...g, host: null } : g)),
  }
}

// Fills a slot: with a new card of a model (or, if a card's already there, that card
// becomes the model), or with a spare card. Placed right after its unit in the list.
export function setCard(show: Show, host: Gear, slot: string, choice: { model: GearModel } | { spareId: string }): Show {
  const current = cardIn(show, host.id, slot)
  if ('spareId' in choice) {
    const cleared = current ? removeCard(show, current.id) : show
    return {
      ...cleared,
      gear: cleared.gear.map((g) => (g.id === choice.spareId ? { ...g, host: { gearId: host.id, slot } } : g)),
    }
  }
  const { model } = choice
  if (current) {
    return {
      ...show,
      gear: show.gear.map((g) =>
        g.id === current.id ? { ...g, manufacturer: model.manufacturer, model: model.model, categoryId: model.categoryId } : g,
      ),
    }
  }
  const card: Gear = {
    id: newId(),
    name: '',
    categoryId: model.categoryId,
    manufacturer: model.manufacturer,
    model: model.model,
    qty: 1,
    rackId: null,
    rackU: null,
    rackSide: 'front',
    rackSlot: null,
    notes: '',
    steck: null,
    host: { gearId: host.id, slot },
    // A card goes on the list its unit is on.
    listId: host.listId,
  }
  // After the unit and the cards already in it, so the gear list reads in order.
  const at = Math.max(...[host.id, ...cardsIn(show, host.id).map((c) => c.id)].map((id) => show.gear.findIndex((g) => g.id === id)))
  const gear = [...show.gear]
  gear.splice(at + 1, 0, card)
  return { ...show, gear }
}

// Deleting a unit: its plain cards go with it; named ones stay as spares.
export function deleteWithCards(show: Show, hostId: string): Show {
  const cards = cardsIn(show, hostId)
  const next = cards.reduce((s, c) => removeCard(s, c.id), show)
  return { ...next, gear: next.gear.filter((g) => g.id !== hostId) }
}
