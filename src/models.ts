import type { Gear, GearModel, Show } from './types'

// Units share a model, and its ports and rack size, when manufacturer and model match.
// No model, no ports.
export function modelKey(manufacturer: string, model: string): string | null {
  const m = model.trim().toLowerCase()
  return m ? `${manufacturer.trim().toLowerCase()}|${m}` : null
}

export function gearModelOf(show: Show, g: Pick<Gear, 'manufacturer' | 'model'>): GearModel | undefined {
  const key = modelKey(g.manufacturer, g.model)
  return key ? show.gearModels.find((m) => modelKey(m.manufacturer, m.model) === key) : undefined
}

// Rack units for one of the unit (from its model), or null if it doesn't rack-mount.
export function gearRu(show: Show, g: Gear): number | null {
  return gearModelOf(show, g)?.ru ?? null
}
