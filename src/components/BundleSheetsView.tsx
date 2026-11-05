import { useEffect, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { STEPS, STEP_LABELS, bundleChecklist, isDone, type CheckItem } from '../checklists'
import { colorName } from '../colors'
import { bundleContents, bundleFlags, bundleLengthMismatch, describeLength, typeById } from '../show'
import type { Bundle, Cable, Show } from '../types'

interface Props {
  show: Show
  toolbar: ReactNode
  onOpenBundle: (id: string) => void
}

// Portrait, one bundle per page, to set out on the floor while the bundles are built.
const PRINT_PAGE = '@media print { @page { size: letter; margin: 0.5in; } }'

const today = () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

// The small print under a cable's name: where it runs when that isn't the bundle's own
// route, its stecks, and its notes.
function cableDetails(cable: Cable, bundle: Bundle): string[] {
  const offRoute =
    (cable.from.trim() && !sameText(cable.from, bundle.from)) || (cable.to.trim() && !sameText(cable.to, bundle.to))
  const route = offRoute ? `${cable.from || bundle.from || '?'} → ${cable.to || bundle.to || '?'}` : ''
  const stecks = (['A', 'B'] as const)
    .filter((end) => (end === 'A' ? cable.steckA : cable.steckB))
    .map((end) => {
      const at = (end === 'A' ? cable.steckAAt : cable.steckBAt).trim()
      return `Steck ${end}${at ? ` · ${at}` : ''}`
    })
  return [route, ...stecks, cable.notes.trim()].filter(Boolean)
}

// The fan or box clipped on at each end of a trunk, named once when both ends match.
function tailNames(show: Show, cable: Cable): string {
  if (typeById(show, cable.typeId)?.part !== 'Trunk') return ''
  const a = typeById(show, cable.tailATypeId)
  const b = typeById(show, cable.tailBTypeId)
  if (a && a.id === b?.id) return `Both ends: ${a.name}`
  return [a && `A: ${a.name}`, b && `B: ${b.name}`].filter(Boolean).join(' · ')
}

interface SheetProps {
  show: Show
  bundle: Bundle
  pieces: CheckItem[]
  page: number
  pages: number
  date: string
  onOpen: () => void
  onPrint: () => void
}

function BundleSheet({ show, bundle, pieces, page, pages, date, onOpen, onPrint }: SheetProps) {
  const name = bundle.name || 'Unnamed bundle'
  const cables = show.cables.filter((c) => c.bundleId === bundle.id)
  const flags = bundleFlags(show, bundle.id)
  const steps = STEPS.bundles
  // A step is done for a cable once every piece of it (extensions too) has it.
  const done = (cable: Cable, step: (typeof steps)[number]) => {
    const own = pieces.filter((p) => p.cable.id === cable.id)
    return own.length > 0 && own.every((p) => isDone(show, p.key, step))
  }

  return (
    <section className="bundle-sheet">
      <div className="bs-actions screen-only">
        <button onClick={onOpen}>Open bundle</button>
        <button onClick={onPrint}>Print this sheet…</button>
      </div>
      <div className="bs-paper">
        <header className="bs-top">
          {show.info.logo && <img className="bs-logo" src={show.info.logo} alt="" />}
          <span className="bs-show">{show.name} · Bundle Sheet</span>
          <span className="bs-meta">{[show.info.venue, date, `${page} of ${pages}`].filter(Boolean).join(' · ')}</span>
        </header>

        <h2 className="bs-name">{name}</h2>
        {(bundle.from || bundle.to) && (
          <p className="bs-route">
            {bundle.from || '?'} <span className="bs-arrow">→</span> {bundle.to || '?'}
          </p>
        )}

        <div className="bs-facts">
          <div className="bs-flag">
            <span className="bs-label">⚑ Flagged end</span>
            <strong>{flags.place ?? 'Not flagged yet'}</strong>
            <span className="bs-sub">
              {flags.flagged} of {flags.total} cable{flags.total === 1 ? '' : 's'} flagged
            </span>
          </div>
          <div className="bs-fact">
            <span className="bs-label">Length</span>
            <strong>{bundle.length != null ? `${bundle.length}'` : '—'}</strong>
          </div>
          <div className="bs-fact">
            <span className="bs-label">Cables</span>
            <strong>{cables.length}</strong>
          </div>
        </div>
        {flags.reversed.size > 0 && (
          <p className="bs-warn">
            ⚠ {flags.reversed.size} cable{flags.reversed.size === 1 ? ' is' : 's are'} flagged at the opposite end from the
            rest.
          </p>
        )}
        <p className="bs-contents">{bundleContents(show, bundle)}</p>

        <table className="bs-cables">
          <thead>
            <tr>
              <th>Cable</th>
              <th>Type</th>
              <th>Length</th>
              <th>Flag</th>
              {steps.map((step) => (
                <th key={step} className="bs-step">
                  {STEP_LABELS[step]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cables.map((cable) => {
              const place = flags.placeOf(cable)
              const mismatch = bundleLengthMismatch(show, cable)
              const tails = tailNames(show, cable)
              const details = cableDetails(cable, bundle)
              return (
                <tr key={cable.id}>
                  <td>
                    <div className="bs-cable">
                      {cable.color && <span className="bs-swatch" style={{ background: cable.color }} />}
                      <strong>{cable.name || 'Unnamed'}</strong>
                      {cable.color && <span className="bs-sub"> {colorName(cable.color)}</span>}
                    </div>
                    {details.map((d) => (
                      <div key={d} className="bs-sub">
                        {d}
                      </div>
                    ))}
                  </td>
                  <td>
                    {typeById(show, cable.typeId)?.name ?? 'Missing type'}
                    {tails && <div className="bs-sub">{tails}</div>}
                  </td>
                  <td className="bs-nowrap">
                    {describeLength(cable) || '—'}
                    {mismatch && (
                      <div className="bs-sub" title={`The bundle is ${mismatch.length}'`}>
                        ⚠ bundle is {mismatch.length}'
                      </div>
                    )}
                  </td>
                  <td>
                    {place ? `⚑ ${place}` : '—'}
                    {flags.reversed.has(cable.id) && <div className="bs-sub">⚠ opposite end</div>}
                  </td>
                  {steps.map((step) => {
                    const on = done(cable, step)
                    return (
                      <td key={step} className="bs-step">
                        <span
                          className={on ? 'bs-box on' : 'bs-box'}
                          role="img"
                          aria-label={`${STEP_LABELS[step]}: ${on ? 'done' : 'not yet'}`}
                          title="Tick these on the Checklists tab"
                        >
                          {on ? '✓' : ''}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>

        {bundle.notes.trim() && (
          <div className="bs-notes">
            <span className="bs-label">Notes</span>
            <p>{bundle.notes}</p>
          </div>
        )}
      </div>
    </section>
  )
}

// A bundle sheet for each bundle: what's in it and which end gets flagged, one page per
// bundle so the sheets can be set out on the floor while the bundles are laid out.
export function BundleSheetsView({ show, toolbar, onOpenBundle }: Props) {
  const [printDate, setPrintDate] = useState('')
  const [query, setQuery] = useState('')
  // Set while printing a single sheet.
  const [only, setOnly] = useState<string | null>(null)

  // Stamp the date as printing starts, whether from a button or ⌘P, and go back to every
  // sheet once it's done.
  useEffect(() => {
    const stamp = () => flushSync(() => setPrintDate(today()))
    const reset = () => setOnly(null)
    window.addEventListener('beforeprint', stamp)
    window.addEventListener('afterprint', reset)
    return () => {
      window.removeEventListener('beforeprint', stamp)
      window.removeEventListener('afterprint', reset)
    }
  }, [])

  const print = (id: string | null) => {
    flushSync(() => {
      setOnly(id)
      setPrintDate(today())
    })
    window.print()
  }

  const pieces = new Map(bundleChecklist(show).map((g) => [g.key, g.items]))
  const filled = show.bundles.filter((b) => pieces.has(b.id))
  const empty = show.bundles.length - filled.length
  const q = query.trim().toLowerCase()
  const shown = filled.filter(
    (b) =>
      (!only || b.id === only) &&
      (!q ||
        [b.name, b.from, b.to, ...show.cables.filter((c) => c.bundleId === b.id).map((c) => c.name)].some((v) =>
          v.toLowerCase().includes(q),
        )),
  )

  return (
    <section className="pane pull-view bundle-sheets-view">
      <style>{PRINT_PAGE}</style>
      <div className="toolbar">
        {toolbar}
        <input
          className="search"
          type="search"
          placeholder="Search bundles and their cables…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="primary" onClick={() => print(null)} disabled={shown.length === 0}>
          Print {shown.length} sheet{shown.length === 1 ? '' : 's'}…
        </button>
        <span className="muted">
          One page per bundle, to set out while the bundles are laid out.
          {empty > 0 && ` ${empty} empty bundle${empty === 1 ? " isn't" : "s aren't"} included.`}
        </span>
      </div>
      {filled.length === 0 ? (
        <div className="empty">
          <p>No bundle sheets yet.</p>
          <p className="muted">Each bundle with cables in it gets a sheet.</p>
        </div>
      ) : shown.length === 0 ? (
        <p className="muted pad">No bundles match “{query}”.</p>
      ) : (
        <div className="bundle-sheets">
          {shown.map((bundle) => (
            <BundleSheet
              key={bundle.id}
              show={show}
              bundle={bundle}
              pieces={pieces.get(bundle.id) ?? []}
              page={filled.indexOf(bundle) + 1}
              pages={filled.length}
              date={printDate || today()}
              onOpen={() => onOpenBundle(bundle.id)}
              onPrint={() => print(bundle.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
