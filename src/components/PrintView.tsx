import type { KeyboardEvent } from 'react'
import type { Update } from '../App'
import { PRINT_DOCS, type PrintDoc } from '../printDocs'
import type { Show } from '../types'
import { BundleSheetsView } from './BundleSheetsView'
import { ChecklistsView } from './ChecklistsView'
import { GearListView } from './GearListView'
import { LabelsView } from './LabelsView'
import { PullListView } from './PullListView'
import { RackDrawingsView } from './RackDrawingsView'

interface Props {
  show: Show
  update: Update
  doc: PrintDoc
  onDoc: (doc: PrintDoc) => void
  onOpenBundle: (id: string) => void
  onOpenGear: (id: string) => void
}

const ALL = PRINT_DOCS.flatMap((g) => g.docs)

// Everything the show prints, in one place: pick a document on the left, set it up and
// print it on the right.
export function PrintView({ show, update, doc, onDoc, onOpenBundle, onOpenGear }: Props) {
  // Up and down step through the documents, like a menu.
  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const at = ALL.findIndex((d) => d.id === doc)
    const next = ALL[(at + (e.key === 'ArrowDown' ? 1 : -1) + ALL.length) % ALL.length]
    onDoc(next.id)
    e.currentTarget.querySelector<HTMLElement>(`[data-doc="${next.id}"]`)?.focus()
  }

  return (
    <div className="print-view">
      <nav className="print-docs" aria-label="Documents to print" onKeyDown={onKey}>
        {PRINT_DOCS.map((group) => (
          <div key={group.group} className="print-doc-group">
            <h3>{group.group}</h3>
            {group.docs.map((d) => (
              <button
                key={d.id}
                data-doc={d.id}
                className={d.id === doc ? 'print-doc-item active' : 'print-doc-item'}
                aria-current={d.id === doc ? 'page' : undefined}
                tabIndex={d.id === doc ? 0 : -1}
                onClick={() => onDoc(d.id)}
              >
                <span className="print-doc-name">{d.label}</span>
                <span className="print-doc-hint">{d.hint}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="print-doc">
        {doc === 'cable-list' && <PullListView show={show} />}
        {doc === 'labels' && <LabelsView show={show} />}
        {doc === 'checklists' && <ChecklistsView show={show} update={update} />}
        {doc === 'bundle-sheets' && <BundleSheetsView show={show} onOpenBundle={onOpenBundle} />}
        {doc === 'gear-list' && <GearListView show={show} />}
        {doc === 'rack-drawings' && <RackDrawingsView show={show} onOpenGear={onOpenGear} />}
      </div>
    </div>
  )
}
