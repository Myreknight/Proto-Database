import type { Show } from '../types'

// Purely decorative pieces for the 8-bit skin, all original pixel art. Nothing here
// changes the show.

// A 5×7 pixel font: one string per row, # lit.
const GLYPHS: Record<string, string> = {
  A: '.###. #...# #...# ##### #...# #...# #...#',
  B: '####. #...# #...# ####. #...# #...# ####.',
  C: '.###. #...# #.... #.... #.... #...# .###.',
  D: '####. #...# #...# #...# #...# #...# ####.',
  E: '##### #.... #.... ####. #.... #.... #####',
  F: '##### #.... #.... ####. #.... #.... #....',
  G: '.###. #...# #.... #.### #...# #...# .###.',
  H: '#...# #...# #...# ##### #...# #...# #...#',
  I: '.###. ..#.. ..#.. ..#.. ..#.. ..#.. .###.',
  J: '..### ...#. ...#. ...#. #..#. #..#. .##..',
  K: '#...# #..#. #.#.. ##... #.#.. #..#. #...#',
  L: '#.... #.... #.... #.... #.... #.... #####',
  M: '#...# ##.## #.#.# #.#.# #...# #...# #...#',
  N: '#...# #...# ##..# #.#.# #..## #...# #...#',
  O: '.###. #...# #...# #...# #...# #...# .###.',
  P: '####. #...# #...# ####. #.... #.... #....',
  Q: '.###. #...# #...# #...# #.#.# #..#. .##.#',
  R: '####. #...# #...# ####. #.#.. #..#. #...#',
  S: '.#### #.... #.... .###. ....# ....# ####.',
  T: '##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..',
  U: '#...# #...# #...# #...# #...# #...# .###.',
  V: '#...# #...# #...# #...# #...# .#.#. ..#..',
  W: '#...# #...# #...# #.#.# #.#.# #.#.# .#.#.',
  X: '#...# #...# .#.#. ..#.. .#.#. #...# #...#',
  Y: '#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..',
  Z: '##### ....# ...#. ..#.. .#... #.... #####',
  '0': '.###. #...# #..## #.#.# ##..# #...# .###.',
  '1': '..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.',
  '2': '.###. #...# ....# ...#. ..#.. .#... #####',
  '3': '##### ...#. ..#.. ...#. ....# #...# .###.',
  '4': '...#. ..##. .#.#. #..#. ##### ...#. ...#.',
  '5': '##### #.... ####. ....# ....# #...# .###.',
  '6': '..##. .#... #.... ####. #...# #...# .###.',
  '7': '##### ....# ...#. ..#.. .#... .#... .#...',
  '8': '.###. #...# #...# .###. #...# #...# .###.',
  '9': '.###. #...# #...# .#### ....# ...#. .##..',
  '-': '..... ..... ..... ##### ..... ..... .....',
  '×': '..... #...# .#.#. ..#.. .#.#. #...# .....',
  ':': '..... ..#.. ..#.. ..... ..#.. ..#.. .....',
  ' ': '..... ..... ..... ..... ..... ..... .....',
}

// Text in the pixel font, as crisp SVG squares in the current color.
export function PixelText({ text, scale = 2 }: { text: string; scale?: number }) {
  const chars = [...text.toUpperCase()]
  let d = ''
  chars.forEach((ch, i) => {
    const rows = (GLYPHS[ch] ?? GLYPHS[' ']).split(' ')
    rows.forEach((row, y) => {
      for (let x = 0; x < 5; x++) if (row[x] === '#') d += `M${i * 6 + x} ${y}h1v1h-1z`
    })
  })
  const w = chars.length * 6 - 1
  return (
    <svg className="pixel-text" width={w * scale} height={7 * scale} viewBox={`0 0 ${w} 7`} shapeRendering="crispEdges" aria-hidden="true">
      <path d={d} fill="currentColor" />
    </svg>
  )
}

// Small multi-color pixel sprites: one row per string, one letter per pixel.
function Sprite({ rows, colors, scale, className }: { rows: string[]; colors: Record<string, string>; scale: number; className?: string }) {
  const rects = rows.flatMap((row, y) =>
    [...row].flatMap((c, x) => (colors[c] ? [<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={colors[c]} />] : [])),
  )
  return (
    <svg
      className={className}
      width={rows[0].length * scale}
      height={rows.length * scale}
      viewBox={`0 0 ${rows[0].length} ${rows.length}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {rects}
    </svg>
  )
}

const COIN = ['.ooo.', 'oyyyo', 'oywyo', 'oywyo', 'oywyo', 'oyyyo', '.ooo.']
const COIN_COLORS = { o: '#8a4a00', y: '#f8b800', w: '#fff3c0' }

export function PixelCoin({ scale = 2 }: { scale?: number }) {
  return <Sprite rows={COIN} colors={COIN_COLORS} scale={scale} className="pixel-coin" />
}

// A red-capped, white-spotted mushroom on a cream stem. Ours, not a game sprite.
const MUSHROOM = [
  '....kkkk....',
  '..kkrrwwkk..',
  '.krrrwwwwrk.',
  '.krwwrrrwwrk',
  'krrwwrrrrrrk',
  'krrrrrrwwrrk',
  'kwwrrrrwwrwk',
  '.kkkkkkkkkk.',
  '...kccccck..',
  '...kcccssk..',
  '...kcccssk..',
  '....kkkkk...',
]
const MUSHROOM_COLORS = { k: '#2a0e00', r: '#d8282d', w: '#ffffff', c: '#f6dfb0', s: '#d9b47a' }

export function MushroomIcon({ scale = 2 }: { scale?: number }) {
  return <Sprite rows={MUSHROOM} colors={MUSHROOM_COLORS} scale={scale} className="pixel-mushroom" />
}

// Which "world" each tab is, for the top bar.
const WORLDS: Record<string, string> = {
  cables: '1-1',
  bundles: '1-2',
  racks: '1-3',
  gear: '1-4',
  pull: '2-1',
  labels: '2-2',
  checks: '2-3',
  types: '2-4',
  setup: '3-1',
}

const DAY = 24 * 60 * 60 * 1000

// Whole days from today until a YYYY-MM-DD date, or null.
function daysUntil(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const [y, m, d] = date.split('-').map(Number)
  const today = new Date()
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((Date.UTC(y, m - 1, d) - start) / DAY)
}

// The top bar: the score is the show's cables, coins its gear, the world follows the tab,
// and time counts down the days to opening night.
export function PixelHud({ show, tab }: { show: Show; tab: string }) {
  const score = String(Math.min(999999, show.cables.length * 100)).padStart(6, '0')
  const coins = String(Math.min(99, show.gear.length)).padStart(2, '0')
  const days = daysUntil(show.info.dates.open.start)
  const time = days == null ? '---' : String(Math.max(0, Math.min(999, days))).padStart(3, '0')
  return (
    <div className="pixel-hud" aria-hidden="true">
      <div className="hud-cell">
        <PixelText text="PROTO" />
        <PixelText text={score} />
      </div>
      <div className="hud-cell hud-coins">
        <span />
        <span className="hud-coin-line">
          <PixelCoin />
          <PixelText text={`×${coins}`} />
        </span>
      </div>
      <div className="hud-cell">
        <PixelText text="WORLD" />
        <PixelText text={WORLDS[tab] ?? '1-1'} />
      </div>
      <div className="hud-cell">
        <PixelText text="TIME" />
        <PixelText text={time} />
      </div>
    </div>
  )
}
