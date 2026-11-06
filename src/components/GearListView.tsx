import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { downloadText, safeFilename } from '../files'
import { gearList, gearListToCsv } from '../gear'
import type { Show } from '../types'
import { PrintBar } from './PrintBar'
import { PrintHeader } from './PrintHeader'

// Printed on letter paper with normal margins, like the cable list.
const PRINT_PAGE = '@media print { @page { size: letter; margin: 0.5in; } }'

const today = () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

// The show's gear, totaled by model within each category: the list that goes to the shop.
export function GearListView({ show }: { show: Show }) {
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

  const exportCsv = () => downloadText(`${safeFilename(show.name)} Gear List.csv`, gearListToCsv(show), 'text/csv')

  const sections = gearList(show)
  const total = sections.reduce((n, s) => n + s.qty, 0)

  return (
    <section className="pane pull-view">
      <style>{PRINT_PAGE}</style>
      <PrintBar
        onPrint={print}
        disabled={total === 0}
        actions={
          <button onClick={exportCsv} disabled={total === 0}>
            Export CSV
          </button>
        }
      >
        <span className="muted">{plural(total, 'piece')}, totaled by model within each category.</span>
      </PrintBar>
      {total === 0 ? (
        <div className="empty">
          <p>Nothing on the gear list yet.</p>
          <p className="muted">Gear you add on the Gear tab shows up here, totaled by category and model.</p>
        </div>
      ) : (
        <div className="pull-body">
          <PrintHeader
            show={show}
            title="Gear List"
            meta={[printDate, plural(total, 'piece'), `Proto Database v${__APP_VERSION__}`]}
          />
          {sections.map(({ category, lines, qty }) => (
            <section key={category?.id ?? 'none'} className="pull-section">
              <h3>
                {category?.name || (category ? 'Unnamed category' : 'Uncategorized')}{' '}
                <span className="muted">({plural(qty, 'piece')})</span>
              </h3>
              <table className="grid pull">
                <colgroup>
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '24%' }} />
                  <col style={{ width: '24%' }} />
                  <col style={{ width: '24%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="num">Qty</th>
                    <th>Manufacturer</th>
                    <th>Model</th>
                    <th>Units</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.key}>
                      <td className="num strong">{l.qty}</td>
                      <td>{l.manufacturer}</td>
                      <td className="strong">{l.model}</td>
                      <td className="muted">{l.units}</td>
                      <td className="muted">{l.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}
