import { useEffect, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { rackDrawing } from '../drawing'
import { rackFlow } from '../flow'
import { downloadRackDxf, downloadRackPdf, downloadRacksPdf, downloadRackSvg, rackParts, rackSummary } from '../rackExport'
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

function RackSheet({ show, rack, date, onOpenGear }: { show: Show; rack: Rack; date: string; onOpenGear: (id: string) => void }) {
  const name = rack.name || 'Unnamed rack'
  const flow = rackFlow(show, rack)
  return (
    <section className="rack-sheet">
      <PrintHeader show={show} title={`Rack Drawing · ${name}`} meta={[rackSummary(show, rack), date, `Proto Database v${__APP_VERSION__}`]} />
      <div className="sheet-head screen-only">
        <h3>
          {name} <span className="muted">· {rackSummary(show, rack)}</span>
        </h3>
        <span className="spacer" />
        <button onClick={() => downloadRackPdf(show, rack, date)}>PDF</button>
        <button onClick={() => downloadRackSvg(show, rack, date)}>SVG</button>
        <button onClick={() => downloadRackDxf(show, rack, date)}>DXF</button>
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
            {rackParts(show, rack).map((row) => (
              <tr
                key={row.gearId}
                className={row.problem ? 'warn' : row.placed ? undefined : 'muted'}
                title={row.problem ?? undefined}
              >
                <td className="nowrap">{row.u}</td>
                <td className="nowrap">{row.side}</td>
                <td className={row.placed ? 'strong' : undefined}>
                  {row.problem && '⚠ '}
                  {row.gear}
                </td>
                <td>{row.model}</td>
                <td className="num">{row.ru}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {flow && (
        <div className="sheet-flow">
          <h4 className="flow-head">
            {show.name} · Rack Flow · {name}
          </h4>
          <RackDrawing drawing={flow} label={`${name} flow`} onOpenGear={onOpenGear} />
        </div>
      )}
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
        <button className="primary" onClick={() => downloadRacksPdf(show)} disabled={show.racks.length === 0}>
          PDF of all racks
        </button>
        <button onClick={print} disabled={show.racks.length === 0}>
          Print…
        </button>
        <span className="muted">
          Each rack gets a landscape page with its parts list, then a page for its flow. SVG and DXF export each rack's
          elevation at true scale, in inches.
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
