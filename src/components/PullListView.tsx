import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { toCsv } from '../csv'
import { downloadText, safeFilename } from '../files'
import { pullList, type PullGroup } from '../show'
import type { Part, Show } from '../types'
import { PrintHeader } from './PrintHeader'

// Printed on letter paper with normal margins (label sheets print edge to edge).
const PRINT_PAGE = '@media print { @page { size: letter; margin: 0.5in; } }'

const SECTION_TITLES: Record<Part, string> = {
  Cable: 'Cables',
  Trunk: 'Trunks',
  Tail: 'Tails',
  Adapter: 'Adapters',
}

const today = () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

function Section({ title, groups, tails }: { title: string; groups: PullGroup[]; tails?: boolean }) {
  if (groups.length === 0) return null
  const pieces = groups.reduce((n, g) => n + g.quantity, 0)
  return (
    <section className="pull-section">
      <h3>
        {title}{' '}
        <span className="muted">
          ({pieces} piece{pieces === 1 ? '' : 's'})
        </span>
      </h3>
      <table className="grid pull">
        {tails ? (
          <colgroup>
            <col style={{ width: '30%' }} />
            <col style={{ width: '58%' }} />
            <col style={{ width: '12%' }} />
          </colgroup>
        ) : (
          <colgroup>
            <col style={{ width: '30%' }} />
            <col style={{ width: '30%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '12%' }} />
          </colgroup>
        )}
        <thead>
          <tr>
            <th>{tails ? 'Tail' : 'Type'}</th>
            <th>{tails ? 'Trunk end → Fan / box' : 'End A → End B'}</th>
            {!tails && <th className="num">Length</th>}
            <th className="num">Qty</th>
            {!tails && <th className="num">Extensions</th>}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) =>
            tails ? (
              <tr key={g.type.id}>
                <td className="strong">{g.type.name}</td>
                <td className="muted">
                  {g.type.endA} → {g.type.endB}
                </td>
                <td className="num strong">{g.quantity}</td>
              </tr>
            ) : (
              [
                <tr key={g.type.id} className="pull-type">
                  <td className="strong">{g.type.name}</td>
                  <td className="muted">
                    {g.type.endA} → {g.type.endB}
                  </td>
                  <td className="num muted">{g.footage ? `${g.footage}' total` : ''}</td>
                  <td className="num strong">{g.quantity}</td>
                  <td />
                </tr>,
                ...g.lines.map((line) => (
                  <tr key={`${g.type.id}|${line.length ?? ''}`} className="pull-line">
                    <td />
                    <td />
                    <td className="num">{line.length == null ? <span className="warn">no length</span> : `${line.length}'`}</td>
                    <td className="num">{line.quantity}</td>
                    <td className="num muted">{line.extensions || ''}</td>
                  </tr>
                )),
              ]
            ),
          )}
        </tbody>
      </table>
    </section>
  )
}

export function PullListView({ show }: { show: Show }) {
  const sections = pullList(show)
  const empty = sections.length === 0
  const total = sections.flatMap((s) => s.groups).reduce((n, g) => n + g.quantity, 0)
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

  const exportCsv = () =>
    downloadText(
      `${safeFilename(show.name)} Cable List.csv`,
      toCsv([
        ['Section', 'Type', 'Part', 'End A', 'End B', 'Length (ft)', 'Qty', 'Extensions'],
        ...sections.flatMap(({ part, groups }) =>
          groups.flatMap((g) =>
            part === 'Tail'
              ? [[SECTION_TITLES[part], g.type.name, g.type.part, g.type.endA, g.type.endB, '', String(g.quantity), '']]
              : g.lines.map((line) => [
                  SECTION_TITLES[part],
                  g.type.name,
                  g.type.part,
                  g.type.endA,
                  g.type.endB,
                  line.length == null ? '' : String(line.length),
                  String(line.quantity),
                  String(line.extensions),
                ]),
          ),
        ),
      ]),
      'text/csv',
    )

  return (
    <section className="pane pull-view">
      <style>{PRINT_PAGE}</style>
      <div className="toolbar">
        <button className="primary" onClick={print} disabled={empty}>
          Print…
        </button>
        <button onClick={exportCsv} disabled={empty}>
          Export CSV
        </button>
        <span className="muted">
          {total} piece{total === 1 ? '' : 's'}. Updates as cables are added, including extensions and the
          tails on each trunk.
        </span>
      </div>

      {empty ? (
        <div className="empty">
          <p>Nothing on the list yet.</p>
          <p className="muted">Every cable, extension and tail you add shows up here, counted by type and length.</p>
        </div>
      ) : (
        <div className="pull-body">
          <PrintHeader
            show={show}
            title="Cable List"
            meta={[printDate, `${total} pieces`, `Proto Database v${__APP_VERSION__}`]}
          />
          {sections.map(({ part, groups }) => (
            <Section key={part} title={SECTION_TITLES[part]} groups={groups} tails={part === 'Tail'} />
          ))}
        </div>
      )}
    </section>
  )
}
