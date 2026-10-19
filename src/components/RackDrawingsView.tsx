import { useEffect, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { drawingToDxf, drawingToSvg, rackDrawing } from '../drawing'
import { downloadText, safeFilename } from '../files'
import { gearLabel, gearRu, rackGear } from '../gear'
import { frontRowsUsed, placedIn, rackProblems, topOf } from '../racking'
import type { Rack, Show } from '../types'
import { PrintHeader } from './PrintHeader'
import { RackDrawing } from './RackDrawing'

interface Props {
  show: Show
  toolbar: ReactNode
  onOpenGear: (id: string) => void
}

// Landscape, one rack per page; the drawing scales to fit.
const PRINT_PAGE = '@media print { @page { size: letter landscape; margin: 0.4in; } }'

const today = () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

function rackMeta(show: Show, rack: Rack): string {
  const used = frontRowsUsed(show, rack.id)
  return [rack.location, rack.size ? `${rack.size}U rack, ${used}U used` : `${used}U used`].filter(Boolean).join(' · ')
}

function RackSheet({ show, rack, date, onOpenGear }: { show: Show; rack: Rack; date: string; onOpenGear: (id: string) => void }) {
  const placed = placedIn(show, rack.id).sort((a, b) => topOf(b) - topOf(a) || (a.side === 'front' ? -1 : 1))
  const problems = rackProblems(show, rack)
  const unplaced = rackGear(show, rack.id).filter((g) => !placed.some((p) => p.gear.id === g.id))
  const name = rack.name || 'Unnamed rack'
  const file = `${safeFilename(show.name)} ${safeFilename(name)} Rack`
  const exportDrawing = () =>
    rackDrawing(show, rack, { title: [`${show.name} · ${name}`, [rackMeta(show, rack), date || today()].filter(Boolean).join(' · ')] })

  return (
    <section className="rack-sheet">
      <PrintHeader show={show} title={`Rack Drawing · ${name}`} meta={[rackMeta(show, rack), date, `Proto Database v${__APP_VERSION__}`]} />
      <div className="sheet-head screen-only">
        <h3>
          {name} <span className="muted">· {rackMeta(show, rack)}</span>
        </h3>
        <span className="spacer" />
        <button onClick={() => downloadText(`${file}.svg`, drawingToSvg(exportDrawing()), 'image/svg+xml')}>SVG</button>
        <button onClick={() => downloadText(`${file}.dxf`, drawingToDxf(exportDrawing()), 'application/dxf')}>DXF</button>
      </div>
      <div className="sheet-body">
        <div className="sheet-drawing">
          <RackDrawing drawing={rackDrawing(show, rack)} label={`${name} front and rear`} onOpenGear={onOpenGear} />
        </div>
        <table className="grid pull sheet-parts">
          <thead>
            <tr>
              <th>U</th>
              <th>Side</th>
              <th>Gear</th>
              <th>Make / model</th>
              <th className="num">RU</th>
            </tr>
          </thead>
          <tbody>
            {placed.map((p) => {
              const g = p.gear
              const problem = problems.get(g.id)
              return (
                <tr key={g.id} className={problem ? 'warn' : undefined} title={problem}>
                  <td className="nowrap">{p.height > 1 ? `${topOf(p)}–${p.bottom}` : p.bottom}</td>
                  <td className="nowrap">
                    {p.side === 'front' ? 'Front' : 'Rear'}
                    {p.slot && ` ${p.slot === 'left' ? 'L' : 'R'}`}
                  </td>
                  <td className="strong">
                    {problem && '⚠ '}
                    {g.name.trim() ? `${g.name.trim()}${g.qty > 1 ? ` ×${g.qty}` : ''}` : g.qty > 1 ? `${g.qty} pcs` : '—'}
                  </td>
                  <td>{[g.manufacturer, g.model].map((v) => v.trim()).filter(Boolean).join(' ')}</td>
                  <td className="num">{p.height}</td>
                </tr>
              )
            })}
            {unplaced.map((g) => (
              <tr key={g.id} className="muted">
                <td>—</td>
                <td />
                <td>{gearLabel(g)}</td>
                <td>{[g.manufacturer, g.model].map((v) => v.trim()).filter(Boolean).join(' ')}</td>
                <td className="num">{gearRu(show, g) ? 'not placed' : 'no size'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function RackDrawingsView({ show, toolbar, onOpenGear }: Props) {
  const [printDate, setPrintDate] = useState('')

  // Stamp the date as printing starts, whether from the button or ⌘P.
  useEffect(() => {
    const stamp = () => flushSync(() => setPrintDate(today()))
    window.addEventListener('beforeprint', stamp)
    return () => window.removeEventListener('beforeprint', stamp)
  }, [])

  const print = () => {
    flushSync(() => setPrintDate(today()))
    window.print()
  }

  return (
    <section className="pane pull-view drawings-view">
      <style>{PRINT_PAGE}</style>
      <div className="toolbar">
        {toolbar}
        <button className="primary" onClick={print} disabled={show.racks.length === 0}>
          Print…
        </button>
        <span className="muted">
          One rack per landscape page; choose Save as PDF in the print dialog for a PDF. SVG and DXF export each rack
          at true scale, in inches.
        </span>
      </div>
      {show.racks.length === 0 ? (
        <div className="empty">
          <p>No racks yet.</p>
          <p className="muted">Add a rack and give its gear rack sizes to draw it.</p>
        </div>
      ) : (
        <div className="drawings-body">
          {show.racks.map((rack) => (
            <RackSheet key={rack.id} show={show} rack={rack} date={printDate} onOpenGear={onOpenGear} />
          ))}
        </div>
      )}
    </section>
  )
}
