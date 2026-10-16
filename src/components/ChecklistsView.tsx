import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import type { Update } from '../App'
import {
  STEPS,
  STEP_LABELS,
  checklist,
  isDone,
  setChecks,
  type CheckGroup,
  type ChecklistKind,
} from '../checklists'
import type { CheckStep, Show } from '../types'
import { PrintHeader } from './PrintHeader'

const PRINT_PAGE = '@media print { @page { size: letter; margin: 0.5in; } }'

const KINDS: { id: ChecklistKind; label: string; hint: string }[] = [
  { id: 'cables', label: 'Cables', hint: "Cables that aren't in a bundle. Every piece, extensions included." },
  { id: 'bundles', label: 'Bundles', hint: 'Every piece in each bundle. Tick a bundle row to check a step for the whole bundle.' },
  { id: 'tails', label: 'Tails', hint: 'One row per fan or box on each trunk, not per pair.' },
]

const today = () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
const now = () => new Date().toISOString()

const when = (iso: string | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''

// A checkbox that shows "some but not all" for a group.
function GroupCheck({ done, total, label, onChange }: { done: number; total: number; label: string; onChange: (on: boolean) => void }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={total > 0 && done === total}
      ref={(el) => {
        if (el) el.indeterminate = done > 0 && done < total
      }}
      onChange={(e) => onChange(e.target.checked)}
    />
  )
}

export function ChecklistsView({ show, update }: { show: Show; update: Update }) {
  const [kind, setKind] = useState<ChecklistKind>('cables')
  const [query, setQuery] = useState('')
  const [hideDone, setHideDone] = useState(false)
  const [printDate, setPrintDate] = useState('')

  useEffect(() => {
    const stamp = () => flushSync(() => setPrintDate(today()))
    window.addEventListener('beforeprint', stamp)
    return () => window.removeEventListener('beforeprint', stamp)
  }, [])

  const steps = STEPS[kind]
  const groups = checklist(show, kind)
  const allItems = groups.flatMap((g) => g.items)
  const complete = (key: string) => steps.every((step) => isDone(show, key, step))

  const q = query.trim().toLowerCase()
  const visible: CheckGroup[] = groups
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (item) =>
          (!hideDone || !complete(item.key)) &&
          (!q || [item.cable.name, item.type, item.location, g.title].some((v) => v.toLowerCase().includes(q))),
      ),
    }))
    .filter((g) => g.items.length > 0)

  const toggle = (keys: string[], step: CheckStep, done: boolean) => {
    const at = now()
    update((s) => setChecks(s, keys, step, done, at))
  }

  const print = () => {
    flushSync(() => setPrintDate(today()))
    window.print()
  }

  const kindInfo = KINDS.find((k) => k.id === kind)!
  const doneCount = allItems.filter((i) => complete(i.key)).length

  return (
    <section className="pane checklist-view">
      <style>{PRINT_PAGE}</style>
      <div className="toolbar">
        <div className="segmented">
          {KINDS.map((k) => (
            <button key={k.id} className={kind === k.id ? 'active' : ''} onClick={() => setKind(k.id)}>
              {k.label}
            </button>
          ))}
        </div>
        <input
          className="search"
          type="search"
          placeholder="Search cables, types, locations…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="check inline">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
          Hide completed
        </label>
        <span className="spacer" />
        <button onClick={print} disabled={allItems.length === 0}>
          Print…
        </button>
      </div>

      <div className="checklist-body">
        <p className="muted small screen-only">{kindInfo.hint}</p>

        {allItems.length > 0 && (
          <div className="progress-row">
            <div className="progress-item">
              <strong>
                {doneCount}/{allItems.length}
              </strong>{' '}
              <span className="muted">complete</span>
            </div>
            {steps.map((step) => {
              const n = allItems.filter((i) => isDone(show, i.key, step)).length
              return (
                <div key={step} className="progress-item">
                  <span>
                    {STEP_LABELS[step]}{' '}
                    <span className="muted">
                      {n}/{allItems.length}
                    </span>
                  </span>
                  <span className="bar">
                    <span style={{ width: `${(n / allItems.length) * 100}%` }} />
                  </span>
                </div>
              )
            })}
          </div>
        )}

        <PrintHeader
          show={show}
          title={`${kindInfo.label} Checklist`}
          meta={[printDate, `${doneCount}/${allItems.length} complete`, `Proto Database v${__APP_VERSION__}`]}
        />

        {allItems.length === 0 ? (
          <div className="empty">
            <p>Nothing to check yet.</p>
            <p className="muted">
              {kind === 'cables'
                ? 'Cables that are loose or interconnects show up here.'
                : kind === 'bundles'
                  ? 'Cables in bundles show up here.'
                  : 'Trunks with a fan or box on an end show up here.'}
            </p>
          </div>
        ) : visible.length === 0 ? (
          <p className="muted pad">{hideDone ? 'Everything here is complete.' : `Nothing matches “${query}”.`}</p>
        ) : (
          <table className="grid checklist">
            <thead>
              <tr>
                <th>Cable</th>
                <th>{kind === 'tails' ? 'End' : 'Piece'}</th>
                <th>{kind === 'tails' ? 'Tail' : 'Type'}</th>
                <th>{kind === 'tails' ? 'Gender' : 'Length'}</th>
                <th>{kind === 'tails' ? 'Location' : 'Route'}</th>
                {steps.map((step) => (
                  <th key={step} className="step">
                    {STEP_LABELS[step]}
                  </th>
                ))}
              </tr>
            </thead>
            {visible.map((g) => {
              const keys = g.items.map((i) => i.key)
              return (
                <tbody key={g.key}>
                  <tr className="group-row">
                    <td colSpan={5}>
                      <strong>{g.title}</strong>
                      <span className="muted">
                        {' · '}
                        {g.items.length} item{g.items.length === 1 ? '' : 's'}
                        {g.bundle?.length != null && ` · ${g.bundle.length}'`}
                      </span>
                    </td>
                    {steps.map((step) => (
                      <td key={step} className="step">
                        <GroupCheck
                          done={keys.filter((k) => isDone(show, k, step)).length}
                          total={keys.length}
                          label={`${STEP_LABELS[step]}: all of ${g.title}`}
                          onChange={(on) => toggle(keys, step, on)}
                        />
                      </td>
                    ))}
                  </tr>
                  {g.items.map((item) => (
                    <tr key={item.key} className={complete(item.key) ? 'done' : undefined}>
                      <td className="strong nowrap">
                        {item.cable.color && <span className="dot" style={{ background: item.cable.color }} />}
                        {item.cable.name || <span className="muted">Unnamed</span>}
                      </td>
                      <td className="muted">{item.piece}</td>
                      <td>{item.type}</td>
                      <td>{item.detail}</td>
                      <td className="muted">{item.location}</td>
                      {steps.map((step) => (
                        <td key={step} className="step" title={when(show.checks[item.key]?.[step])}>
                          <input
                            type="checkbox"
                            aria-label={`${STEP_LABELS[step]}: ${item.cable.name} ${item.piece}`}
                            checked={isDone(show, item.key, step)}
                            onChange={(e) => toggle([item.key], step, e.target.checked)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              )
            })}
          </table>
        )}
      </div>
    </section>
  )
}
