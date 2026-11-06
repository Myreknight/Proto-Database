import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { STEPS, STEP_LABELS, isDone, pieceKey } from '../checklists'
import { colorName } from '../colors'
import { bundleFlags, cableContents, typeById } from '../show'
import type { Bundle, Cable, Segment, Show } from '../types'
import { PrintBar } from './PrintBar'

interface Props {
  show: Show
  onOpenBundle: (id: string) => void
}

// Portrait, one sheet per page, to set out on the floor while the bundles are built.
const PRINT_PAGE = '@media print { @page { size: letter; margin: 0.5in; } }'

const today = () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

// One cable's piece on a sheet: its main run, or one of its extensions.
interface SheetPiece {
  cable: Cable
  segment: Segment
  // Whether this piece carries the cable's End A (the main run) or End B (its last piece).
  endA: boolean
  endB: boolean
}

// What one sheet covers. An extension is laid out and bundled as a bundle of its own, so
// the main run and each extension get their own sheet.
interface Sheet {
  key: string
  bundle: Bundle
  // 0 for the main run, then 1, 2… for the extensions.
  index: number
  extensions: number
  pieces: SheetPiece[]
}

function bundleSheets(show: Show, bundle: Bundle): Sheet[] {
  const cables = show.cables.filter((c) => c.bundleId === bundle.id)
  const runs = Math.max(0, ...cables.map((c) => c.segments.length))
  const sheets: Sheet[] = []
  for (let index = 0; index < runs; index++) {
    const pieces = cables
      .filter((c) => c.segments[index])
      .map((cable) => ({
        cable,
        segment: cable.segments[index],
        endA: index === 0,
        endB: index === cable.segments.length - 1,
      }))
    if (pieces.length) sheets.push({ key: `${bundle.id}:${index}`, bundle, index, extensions: runs - 1, pieces })
  }
  return sheets
}

// The length a sheet's pieces should all be: the bundle's own length when it has no
// extensions, otherwise whatever most of the pieces on the sheet are.
function sheetLength(sheet: Sheet): number | null {
  if (sheet.extensions === 0) return sheet.bundle.length
  const counts = new Map<number, number>()
  for (const { segment } of sheet.pieces) {
    if (segment.length != null) counts.set(segment.length, (counts.get(segment.length) ?? 0) + 1)
  }
  let best: number | null = null
  for (const [length, n] of counts) if (best == null || n > counts.get(best)!) best = length
  return best
}

// The small print under a cable's name: where it runs when that isn't the bundle's own
// route, the stecks on this piece's ends, and its notes.
function pieceDetails(piece: SheetPiece, bundle: Bundle): string[] {
  const { cable } = piece
  const offRoute =
    (cable.from.trim() && !sameText(cable.from, bundle.from)) || (cable.to.trim() && !sameText(cable.to, bundle.to))
  const route = offRoute ? `${cable.from || bundle.from || '?'} → ${cable.to || bundle.to || '?'}` : ''
  const stecks = (['A', 'B'] as const)
    .filter((end) => (end === 'A' ? piece.endA && cable.steckA : piece.endB && cable.steckB))
    .map((end) => {
      const at = (end === 'A' ? cable.steckAAt : cable.steckBAt).trim()
      return `Steck ${end}${at ? ` · ${at}` : ''}`
    })
  return [route, ...stecks, cable.notes.trim()].filter(Boolean)
}

// The fan or box clipped on at this piece's ends of a trunk, named once when both match.
function tailNames(show: Show, piece: SheetPiece): string {
  const { cable } = piece
  if (typeById(show, cable.typeId)?.part !== 'Trunk') return ''
  const a = piece.endA ? typeById(show, cable.tailATypeId) : undefined
  const b = piece.endB ? typeById(show, cable.tailBTypeId) : undefined
  if (a && a.id === b?.id) return `Both ends: ${a.name}`
  return [a && `A: ${a.name}`, b && `B: ${b.name}`].filter(Boolean).join(' · ')
}

interface SheetProps {
  show: Show
  sheet: Sheet
  page: number
  pages: number
  date: string
  onOpen: () => void
  onPrint: () => void
}

function BundleSheet({ show, sheet, page, pages, date, onOpen, onPrint }: SheetProps) {
  const { bundle, index, extensions, pieces } = sheet
  const bundleName = bundle.name || 'Unnamed bundle'
  const name = index > 0 ? `${bundleName} Ext ${index}` : bundleName
  const flags = bundleFlags(show, bundle.id)
  const flagged = pieces.filter((p) => p.cable.flagEnd).length
  const reversed = pieces.filter((p) => flags.reversed.has(p.cable.id)).length
  const length = sheetLength(sheet)
  const steps = STEPS.bundles

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
        {extensions > 0 && (
          <p className="bs-part">
            {index > 0
              ? `Extension ${index} of ${bundleName}`
              : `Main run · ${extensions === 1 ? '1 extension' : `${extensions} extensions`} on separate sheets`}
          </p>
        )}
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
              {flagged} of {pieces.length} cable{pieces.length === 1 ? '' : 's'} flagged
            </span>
          </div>
          <div className="bs-fact">
            <span className="bs-label">Length</span>
            <strong>{length != null ? `${length}'` : '—'}</strong>
          </div>
          <div className="bs-fact">
            <span className="bs-label">Cables</span>
            <strong>{pieces.length}</strong>
          </div>
        </div>
        {reversed > 0 && (
          <p className="bs-warn">
            ⚠ {reversed} cable{reversed === 1 ? ' is' : 's are'} flagged at the opposite end from the rest.
          </p>
        )}
        <p className="bs-contents">{cableContents(show, pieces.map((p) => p.cable))}</p>

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
            {pieces.map((piece) => {
              const { cable, segment } = piece
              const place = flags.placeOf(cable)
              const tails = tailNames(show, piece)
              const details = pieceDetails(piece, bundle)
              const off = length != null && segment.length !== length
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
                    {segment.length != null ? `${segment.length}'` : '—'}
                    {off && (
                      <div className="bs-sub">
                        ⚠ {extensions === 0 ? 'bundle is' : 'the rest are'} {length}'
                      </div>
                    )}
                  </td>
                  <td>
                    {place ? `⚑ ${place}` : '—'}
                    {flags.reversed.has(cable.id) && <div className="bs-sub">⚠ opposite end</div>}
                  </td>
                  {steps.map((step) => {
                    const on = isDone(show, pieceKey(segment.id), step)
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

// A bundle sheet for each bundle, and one for each of its extensions: what's in it and
// which end gets flagged, one per page so the sheets can be set out on the floor while
// the bundles are laid out.
export function BundleSheetsView({ show, onOpenBundle }: Props) {
  const [printDate, setPrintDate] = useState('')
  const [query, setQuery] = useState('')
  // Set to a sheet's key while printing just that sheet.
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

  const print = (key: string | null) => {
    flushSync(() => {
      setOnly(key)
      setPrintDate(today())
    })
    window.print()
  }

  const all = show.bundles.flatMap((b) => bundleSheets(show, b))
  const empty = show.bundles.filter((b) => !all.some((s) => s.bundle === b)).length
  const q = query.trim().toLowerCase()
  const matches = (b: Bundle) =>
    !q ||
    [b.name, b.from, b.to, ...show.cables.filter((c) => c.bundleId === b.id).map((c) => c.name)].some((v) =>
      v.toLowerCase().includes(q),
    )
  const shown = all.filter((s) => (!only || s.key === only) && matches(s.bundle))

  return (
    <section className="pane pull-view bundle-sheets-view">
      <style>{PRINT_PAGE}</style>
      <PrintBar
        onPrint={() => print(null)}
        disabled={shown.length === 0}
        label={`Print ${shown.length} sheet${shown.length === 1 ? '' : 's'}…`}
      >
        <input
          className="search"
          type="search"
          placeholder="Search bundles and their cables…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="muted">
          One page per bundle, and one per extension, to set out while the bundles are laid out.
          {empty > 0 && ` ${empty} empty bundle${empty === 1 ? " isn't" : "s aren't"} included.`}
        </span>
      </PrintBar>
      {all.length === 0 ? (
        <div className="empty">
          <p>No bundle sheets yet.</p>
          <p className="muted">Each bundle with cables in it gets a sheet, and so does each of its extensions.</p>
        </div>
      ) : shown.length === 0 ? (
        <p className="muted pad">No bundles match “{query}”.</p>
      ) : (
        <div className="bundle-sheets">
          {shown.map((sheet) => (
            <BundleSheet
              key={sheet.key}
              show={show}
              sheet={sheet}
              page={all.indexOf(sheet) + 1}
              pages={all.length}
              date={printDate || today()}
              onOpen={() => onOpenBundle(sheet.bundle.id)}
              onPrint={() => print(sheet.key)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
