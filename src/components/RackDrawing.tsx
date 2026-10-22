import { useRef, useState, type PointerEvent } from 'react'
import { RACK_WIDTH_IN, type DragInfo, type Drawing, type DrawView } from '../drawing'
import { INCHES_PER_U } from '../racking'
import type { RackSide, RackSlot } from '../types'

// Where a dragged unit would land: its bottom rack unit, rails and half.
export interface RackSpot {
  rackU: number
  rackSide: RackSide
  rackSlot: RackSlot | null
}

interface Props {
  drawing: Drawing
  label: string
  onOpenGear?: (id: string) => void
  // With these, units can be dragged to a new spot; checkDrop says what's wrong with one.
  onMove?: (gearId: string, spot: RackSpot) => void
  checkDrop?: (gearId: string, spot: RackSpot) => string | null
  // Pixels per drawing unit, to draw at a fixed, readable size (scrolling if it's wide)
  // instead of fitting the width.
  scale?: number
}

interface Drag {
  gearId: string
  info: DragInfo
  // Which of the unit's rack units was grabbed, counting down from its top.
  grabRow: number
  startX: number
  startY: number
  moved: boolean
  spot: RackSpot | null
  view: DrawView | null
}

const U = INCHES_PER_U

// A rack drawing on screen, themed with the app's colors. Clicking a unit opens it;
// dragging one (when onMove is given) moves it, snapping to rack units, to the other
// rails when dropped in the other view, and to whichever half for half-width gear.
export function RackDrawing({ drawing, label, onOpenGear, onMove, checkDrop, scale }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)

  const toDrawing = (e: { clientX: number; clientY: number }) => {
    const ctm = svgRef.current?.getScreenCTM()
    if (!ctm) return null
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y }
  }

  const viewAt = (x: number) => drawing.views.find((v) => x >= v.x - 0.5 && x <= v.x + RACK_WIDTH_IN + 0.5) ?? null

  // The spot under the pointer, keeping the grabbed row under it.
  const spotAt = (pt: { x: number; y: number }, d: Pick<Drag, 'info' | 'grabRow'>): { spot: RackSpot; view: DrawView } | null => {
    const view = viewAt(pt.x)
    if (!view) return null
    const pointerU = view.rows - Math.floor((pt.y - view.top) / U)
    const top = Math.min(view.rows, pointerU + d.grabRow)
    const bottom = Math.max(1, top - d.info.heightU + 1)
    const rightHalf = pt.x > view.x + RACK_WIDTH_IN / 2
    // From the rear, the right half of the picture is the rack's left half.
    const slot = d.info.half ? ((view.side === 'front') === rightHalf ? 'right' : 'left') : null
    return { spot: { rackU: bottom, rackSide: view.side, rackSlot: slot }, view }
  }

  const start = (e: PointerEvent<SVGRectElement>, gearId: string, info: DragInfo) => {
    if (!onMove || e.button !== 0) return
    const pt = toDrawing(e)
    const view = pt && viewAt(pt.x)
    if (!pt || !view) return
    const pointerU = view.rows - Math.floor((pt.y - view.top) / U)
    const grabRow = Math.max(0, Math.min(info.heightU - 1, info.bottom + info.heightU - 1 - pointerU))
    // Keeps the drag going if the pointer leaves the drawing; fine to go without.
    try {
      svgRef.current?.setPointerCapture(e.pointerId)
    } catch {
      // Not a capturable pointer.
    }
    setDrag({ gearId, info, grabRow, startX: e.clientX, startY: e.clientY, moved: false, spot: null, view: null })
  }

  const move = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag) return
    const moved = drag.moved || Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 4
    const pt = toDrawing(e)
    const hit = moved && pt ? spotAt(pt, drag) : null
    setDrag({ ...drag, moved, spot: hit?.spot ?? null, view: hit?.view ?? null })
  }

  const end = () => {
    if (!drag) return
    if (!drag.moved) onOpenGear?.(drag.gearId)
    else if (drag.spot) onMove?.(drag.gearId, drag.spot)
    setDrag(null)
  }

  // The outline of where the dragged unit would land.
  const ghost = (() => {
    if (!drag?.spot || !drag.view) return null
    const { spot, view, info } = drag
    const drawnRight = info.half && (view.side === 'front' ? spot.rackSlot === 'right' : spot.rackSlot === 'left')
    const top = spot.rackU + info.heightU - 1
    return {
      x: view.x + (drawnRight ? RACK_WIDTH_IN / 2 : 0),
      y: view.top + (view.rows - top) * U,
      w: info.half ? RACK_WIDTH_IN / 2 : RACK_WIDTH_IN,
      h: info.heightU * U,
      problem: checkDrop?.(drag.gearId, spot) ?? null,
      text: `U${info.heightU > 1 ? `${top}–${spot.rackU}` : spot.rackU} · ${spot.rackSide}${spot.rackSlot ? ` ${spot.rackSlot}` : ''}`,
    }
  })()

  const clickable = !!onOpenGear || !!onMove
  return (
    <svg
      ref={svgRef}
      className={['rack-drawing', onMove ? 'rd-draggable' : '', drag?.moved ? 'rd-dragging-on' : ''].filter(Boolean).join(' ')}
      viewBox={`0 0 ${drawing.width} ${drawing.height}`}
      style={scale ? { width: drawing.width * scale, maxWidth: 'none', maxHeight: 'none' } : undefined}
      role="img"
      aria-label={label}
      onPointerMove={drag ? move : undefined}
      onPointerUp={drag ? end : undefined}
      onPointerCancel={drag ? () => setDrag(null) : undefined}
    >
      {drawing.lines.map((l, i) => (
        <line
          key={`l${i}`}
          className={`rd-${l.kind}`}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          style={l.color ? { stroke: l.color } : undefined}
        />
      ))}
      {drawing.boxes.map((b, i) => (
        <rect
          key={`b${i}`}
          className={[
            'rd-box',
            `rd-${b.kind}`,
            b.problem ? 'rd-problem' : '',
            clickable ? 'rd-click' : '',
            onMove && b.drag ? 'rd-grab' : '',
            drag?.moved && drag.gearId === b.gearId ? 'rd-lifted' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          onPointerDown={onMove && b.drag ? (e) => start(e, b.gearId, b.drag!) : undefined}
          // Units that can't be dragged (backs seen from the rear) still open on click.
          onClick={onOpenGear && !(onMove && b.drag) ? () => onOpenGear(b.gearId) : undefined}
        >
          {b.problem && <title>{b.problem}</title>}
        </rect>
      ))}
      {drawing.texts.map((t, i) => (
        <text
          key={`t${i}`}
          className={['rd-text', t.muted ? 'rd-muted' : '', t.problem ? 'rd-problem-text' : ''].filter(Boolean).join(' ')}
          x={t.x}
          y={t.y}
          fontSize={t.size}
          textAnchor={t.anchor}
          fontWeight={t.bold ? 700 : undefined}
        >
          {t.text}
        </text>
      ))}
      {ghost && (
        <g className={ghost.problem ? 'rd-ghost bad' : 'rd-ghost'}>
          <rect x={ghost.x + 0.05} y={ghost.y + 0.04} width={ghost.w - 0.1} height={ghost.h - 0.08} />
          <text x={ghost.x + ghost.w / 2} y={ghost.y + ghost.h / 2 + 0.25} fontSize={0.7} textAnchor="middle">
            {ghost.problem ?? ghost.text}
          </text>
        </g>
      )}
    </svg>
  )
}
