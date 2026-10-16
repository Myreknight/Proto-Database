// Color codes for cables. Shown as a shade behind the cable name on labels, so they're
// soft enough for black text to read clearly and to print as a light tint.
export const CABLE_COLORS: { name: string; hex: string }[] = [
  { name: 'Red', hex: '#ec9a92' },
  { name: 'Orange', hex: '#f6c193' },
  { name: 'Yellow', hex: '#f3df86' },
  { name: 'Green', hex: '#a6d3a0' },
  { name: 'Blue', hex: '#a3c4ea' },
  { name: 'Purple', hex: '#c7b1df' },
  { name: 'Pink', hex: '#f2b3d2' },
  { name: 'Brown', hex: '#cdb199' },
  { name: 'Gray', hex: '#c6c6c6' },
  { name: 'Black', hex: '#555555' },
]

// The original, fully saturated presets, so older shows move to the soft set.
const VIVID_TO_SOFT: Record<string, string> = {
  '#e53935': '#ec9a92',
  '#fb8c00': '#f6c193',
  '#fdd835': '#f3df86',
  '#43a047': '#a6d3a0',
  '#1e88e5': '#a3c4ea',
  '#8e24aa': '#c7b1df',
  '#f06292': '#f2b3d2',
  '#8d6e63': '#cdb199',
  '#9e9e9e': '#c6c6c6',
  '#212121': '#555555',
}

export function softenColor(hex: string | null): string | null {
  return hex ? (VIVID_TO_SOFT[hex.toLowerCase()] ?? hex) : null
}

export function colorName(hex: string | null): string {
  if (!hex) return 'None'
  return CABLE_COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase())?.name ?? hex
}

// Black or white, whichever reads better on the shade.
export function textOn(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16)
  if (Number.isNaN(n)) return '#000'
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.55 ? '#fff' : '#000'
}
