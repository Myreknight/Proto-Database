import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { downloadText, safeFilename } from '../files'
import { gearList, gearListsByList, gearListToCsv, type GearListChoice, type GearListSection } from '../gear'
import { loadViewSetting, storeViewSetting } from '../sorting'
import type { Show } from '../types'
import { PrintBar } from './PrintBar'
import { PrintHeader } from './PrintHeader'

// Printed on letter paper with normal margins, like the cable list.
const PRINT_PAGE = '@media print { @page { size: letter; margin: 0.5in; } }'

const today = () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const CHOICE_KEY = 'proto-database:gear-list-print'

// One category's lines.
function CategorySection({ section }: { section: GearListSection }) {
  const { category, lines, qty } = section
  return (
    <section className="pull-section">
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
  )
}

// The show's gear, totaled by model within each category: the list that goes to the shop.
// It prints all the gear, one gear list (Main, Production…), or all of it split by list.
export function GearListView({ show }: { show: Show }) {
  const [printDate, setPrintDate] = useState('')
  const [stored, setChoice] = useState<GearListChoice>(() => loadViewSetting(CHOICE_KEY, { choice: 'all' as GearListChoice }).choice)
  useEffect(() => storeViewSetting(CHOICE_KEY, { choice: stored }), [stored])
  const lists = show.info.gearLists
  // A list that's since been deleted falls back to all the gear.
  const choice: GearListChoice = stored === 'all' || stored === 'by-list' || lists.some((l) => l.id === stored) ? stored : 'all'
  const list = lists.find((l) => l.id === choice)

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

  const title = list ? `${list.name.trim() || 'Unnamed list'} Gear List` : 'Gear List'
  const exportCsv = () =>
    downloadText(
      `${safeFilename(show.name)} ${choice === 'by-list' ? 'Gear Lists' : title}.csv`,
      gearListToCsv(show, choice),
      'text/csv',
    )

  const byList = choice === 'by-list' ? gearListsByList(show) : []
  const sections = choice === 'by-list' ? [] : gearList(show, choice === 'all' ? undefined : choice)
  const total = choice === 'by-list' ? byList.reduce((n, x) => n + x.qty, 0) : sections.reduce((n, s) => n + s.qty, 0)

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
        {lists.length > 0 && (
          <label className="inline-select">
            <span className="muted">List</span>
            <select value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Which gear to print">
              <option value="all">All gear</option>
              <option value="by-list">All, by list</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name || 'Unnamed list'}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="muted">
          {plural(total, 'piece')}, totaled by model within each category
          {choice === 'by-list' ? ', a section for each list' : ''}.
          {list && list.id === lists[0]?.id && show.racks.length > 0 ? ' Racks and steck rails go on this list.' : ''}
        </span>
      </PrintBar>
      {total === 0 ? (
        <div className="empty">
          <p>{list ? `Nothing on ${list.name || 'this list'} yet.` : 'Nothing on the gear list yet.'}</p>
          <p className="muted">
            {list
              ? 'Put gear on this list from its List field on the Gear tab, or tick several units there and set their List at once.'
              : 'Gear you add on the Gear tab shows up here, totaled by category and model.'}
          </p>
        </div>
      ) : (
        <div className="pull-body">
          <PrintHeader show={show} title={title} meta={[printDate, plural(total, 'piece'), `Proto Database v${__APP_VERSION__}`]} />
          {choice === 'by-list'
            ? byList.map((x) => (
                <section key={x.list?.id ?? 'none'} className="pull-list">
                  <h2>
                    {x.list ? x.list.name || 'Unnamed list' : 'No list'} <span className="muted">({plural(x.qty, 'piece')})</span>
                  </h2>
                  {x.sections.map((section) => (
                    <CategorySection key={section.category?.id ?? 'none'} section={section} />
                  ))}
                </section>
              ))
            : sections.map((section) => <CategorySection key={section.category?.id ?? 'none'} section={section} />)}
        </div>
      )}
    </section>
  )
}
