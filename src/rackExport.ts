import { drawingToDxf, drawingToSvg, rackDrawing } from './drawing'
import { downloadText, safeFilename } from './files'
import { frontRowsUsed } from './racking'
import type { Rack, Show } from './types'

const today = () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

// "Amp Room · 12U rack, 11U used"
export function rackSummary(show: Show, rack: Rack): string {
  const used = frontRowsUsed(show, rack.id)
  return [rack.location, rack.size ? `${rack.size}U rack, ${used}U used` : `${used}U used`].filter(Boolean).join(' · ')
}

// A rack's front and rear drawing with the show and rack named on top, for export.
function titled(show: Show, rack: Rack, date?: string) {
  const name = rack.name || 'Unnamed rack'
  return rackDrawing(show, rack, { title: [`${show.name} · ${name}`, [rackSummary(show, rack), date || today()].filter(Boolean).join(' · ')] })
}

const fileName = (show: Show, rack: Rack) => `${safeFilename(show.name)} ${safeFilename(rack.name || 'Unnamed rack')} Rack`

export function downloadRackSvg(show: Show, rack: Rack, date?: string): void {
  downloadText(`${fileName(show, rack)}.svg`, drawingToSvg(titled(show, rack, date)), 'image/svg+xml')
}

export function downloadRackDxf(show: Show, rack: Rack, date?: string): void {
  downloadText(`${fileName(show, rack)}.dxf`, drawingToDxf(titled(show, rack, date)), 'application/dxf')
}
