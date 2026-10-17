import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { textOn } from '../colors'
import {
  FONTS,
  SHEETS,
  fitPt,
  groupLabels,
  groupsFor,
  loadLabelSettings,
  measureIn,
  paginate,
  slotPosition,
  storeLabelSettings,
  type BlockLabel,
  type FillOrder,
  type HeaderLabel,
  type Label,
  type LabelSet,
  type LabelSettings,
  type SheetId,
  type SteckLabel,
  type SheetSpec,
  type TailLabel,
  type TailLayout,
} from '../labels'
import { cableGroups } from '../show'
import type { Show } from '../types'

// Label sheets print edge to edge; each view sets its own page rule.
const LABEL_PAGE = '@media print { @page { size: letter; margin: 0; } }'

function shadeStyle(color: string | null): CSSProperties | undefined {
  return color ? { background: color, color: textOn(color) } : undefined
}

function Shade({ color, children }: { color: string | null; children: string }) {
  return (
    <span className={color ? 'shade' : undefined} style={shadeStyle(color)}>
      {children}
    </span>
  )
}

// Small gray gender tag pinned to a corner of the label.
function GenderTag({ label, sheet, font, corner }: { label: TailLabel; sheet: SheetSpec; font: string; corner: 'top' | 'bottom' }) {
  if (!label.gender) return null
  return (
    <span
      className="tl-gender"
      style={{
        fontFamily: font,
        fontSize: `${sheet.pt.gender}pt`,
        right: `${sheet.padX * 0.6}in`,
        [corner]: `${sheet.padY * 0.6}in`,
      }}
    >
      {label.gender}
    </span>
  )
}

// "EXT 1" in the corner opposite the gender tag, on the labels of an extension piece.
function ExtTag({ label, sheet, font, corner }: { label: TailLabel; sheet: SheetSpec; font: string; corner: 'top' | 'bottom' }) {
  if (!label.ext) return null
  return (
    <span
      className="tl-ext"
      style={{
        fontFamily: font,
        fontSize: `${sheet.pt.gender + 0.5}pt`,
        left: `${sheet.padX * 0.6}in`,
        [corner]: `${sheet.padY * 0.6}in`,
      }}
    >
      EXT {label.ext}
    </span>
  )
}

// Width to keep clear on both sides of a centered line that shares its row with the corner
// tags (gender on one side, EXT on the other). The gender part is always sized for "Female"
// so both ends of a cable print their text the same size.
function genderReserve(label: TailLabel, sheet: SheetSpec, font: string): number {
  const gender = label.gender ? measureIn('Female', 400, sheet.pt.gender, font) : 0
  const ext = label.ext ? measureIn(`EXT ${label.ext}`, 700, sheet.pt.gender + 0.5, font) + 0.04 : 0
  const widest = Math.max(gender, ext)
  return widest ? widest + 0.05 : 0
}

// Layout 1: "Cable Name•3" on top, the tail name big, then "→ patch"; gender in the top corner.
function StackedTail({ label, sheet }: { label: TailLabel; sheet: SheetSpec }) {
  const font = FONTS.geometric
  const width = sheet.labelW - sheet.padX * 2 - 0.05
  const num = label.number != null ? `•${label.number}` : ''
  const topText = label.tailName ? `${label.cableName}${num}` : String(label.number ?? '')
  const topPt = fitPt(topText, 700, sheet.pt.tailTop, 4.5, width - genderReserve(label, sheet, font) * 2, font)
  const patch = label.patch ? `→ ${label.patch}` : ''
  const patchPt = patch ? fitPt(patch, 400, sheet.pt.patch, 4.5, width, font) : 0
  // The big name gives up height when there's a patch line to fit under it.
  const room = (sheet.labelH - sheet.padY * 2) * 72 - sheet.pt.tailTop * 1.2 - (patch ? sheet.pt.patch * 1.2 : 0)
  const big = label.tailName || label.cableName
  const namePt = fitPt(big, 700, Math.min(sheet.pt.tailName, room / 1.05), 5, width, font)
  return (
    <>
      <div className="tl-stacked" style={{ fontFamily: font }}>
        {topText && (
          <div className="tl-top" style={{ fontSize: `${topPt}pt` }}>
            {label.tailName ? (
              <>
                <Shade color={label.color}>{label.cableName}</Shade>
                {num}
              </>
            ) : (
              label.number
            )}
          </div>
        )}
        <div className="tl-name" style={{ fontSize: `${namePt}pt` }}>
          {label.tailName ? big : <Shade color={label.color}>{big}</Shade>}
        </div>
        {patch && (
          <div className="tl-patch" style={{ fontSize: `${patchPt}pt` }}>
            {patch}
          </div>
        )}
      </div>
      <GenderTag label={label} sheet={sheet} font={font} corner="top" />
      <ExtTag label={label} sheet={sheet} font={font} corner="top" />
    </>
  )
}

// A one-channel cable: just the cable name, big and centered, with its bundle (or
// rack) and this end's location underneath, then the patch point if there is one.
// Gender sits in the top corner. Uses the chosen layout's font.
function SingleTail({ label, sheet, layout }: { label: TailLabel; sheet: SheetSpec; layout: TailLayout }) {
  const font = layout === 'centered' ? FONTS.condensed : FONTS.geometric
  const weight = layout === 'centered' ? 500 : 700
  const width = sheet.labelW - sheet.padX * 2 - 0.05
  const sub = [label.group, label.location].filter(Boolean).join(' · ')
  const patch = label.patch ? `→ ${label.patch}` : ''
  const subPt = sub ? fitPt(sub, 400, sheet.pt.tailTop, 4.5, width, font) : 0
  const patchPt = patch ? fitPt(patch, 400, sheet.pt.patch, 4.5, width, font) : 0
  // The name gives up height for whatever lines sit under it.
  const linesH = (sub ? sheet.pt.tailTop * 1.2 : 0) + (patch ? sheet.pt.patch * 1.2 : 0)
  const maxName = Math.min(sheet.pt.tailName, ((sheet.labelH - sheet.padY * 2) * 72 - linesH) / 1.08)
  // The stack is centered top to bottom; only keep the name clear of the gender tag
  // when the name actually rises to the tag's height (all in points).
  const nameTop = (sheet.labelH * 72 - (maxName * 1.08 + linesH)) / 2 + maxName * 0.2
  const tagBottom = sheet.padY * 0.6 * 72 + sheet.pt.gender
  const reserve = nameTop < tagBottom ? genderReserve(label, sheet, font) * 2 : 0
  const namePt = fitPt(label.cableName, weight, maxName, 5, width - reserve, font)
  return (
    <>
      <div className={layout === 'centered' ? 'tl-single ruled' : 'tl-single'} style={{ fontFamily: font }}>
        <div className="tl-single-name" style={{ fontSize: `${namePt}pt`, fontWeight: weight }}>
          <Shade color={label.color}>{label.cableName}</Shade>
        </div>
        {sub && (
          <div className="tl-single-sub" style={{ fontSize: `${subPt}pt` }}>
            {sub}
          </div>
        )}
        {patch && (
          <div className="tl-patch" style={{ fontSize: `${patchPt}pt` }}>
            {patch}
          </div>
        )}
      </div>
      <GenderTag label={label} sheet={sheet} font={font} corner="top" />
      <ExtTag label={label} sheet={sheet} font={font} corner="top" />
    </>
  )
}

// Layout 2: "1   Tail Name   1" over a rule, then "Cable Name•1 → patch" small;
// gender in the bottom corner, since the top corners hold the numbers.
function CenteredTail({ label, sheet }: { label: TailLabel; sheet: SheetSpec }) {
  const font = FONTS.condensed
  const width = sheet.labelW - sheet.padX * 2
  const num = label.number != null ? String(label.number) : ''
  const big = label.tailName || label.cableName
  const numW = num ? measureIn(num, 500, sheet.pt.tailName, font) + 0.06 : 0
  const namePt = fitPt(big, 500, sheet.pt.tailName, 5, width - numW * 2, font)
  const sub = `${label.tailName ? label.cableName : ''}${num ? `•${num}` : ''}${label.patch ? ` → ${label.patch}` : ''}`
  const subPt = fitPt(sub, 500, sheet.pt.tailTop, 4.5, width - 0.04 - genderReserve(label, sheet, font) * 2, font)
  return (
    <>
      <div className="tl-centered" style={{ fontFamily: font }}>
        <div className="tl-row" style={{ fontSize: `${namePt}pt` }}>
          <span className="tl-num" style={{ fontSize: `${sheet.pt.tailName}pt` }}>
            {num}
          </span>
          <span className="tl-name">{label.tailName ? big : <Shade color={label.color}>{big}</Shade>}</span>
          <span className="tl-num" style={{ fontSize: `${sheet.pt.tailName}pt` }}>
            {num}
          </span>
        </div>
        <div className="tl-sub" style={{ fontSize: `${subPt}pt` }}>
          {label.tailName && <Shade color={label.color}>{label.cableName}</Shade>}
          {num && `•${num}`}
          {label.patch && ` → ${label.patch}`}
        </div>
      </div>
      <GenderTag label={label} sheet={sheet} font={font} corner="bottom" />
      <ExtTag label={label} sheet={sheet} font={font} corner="bottom" />
    </>
  )
}

// Tail blocks and stecks: the cable name over a couple of centered detail lines.
function CableBody({ label, sheet }: { label: BlockLabel | SteckLabel; sheet: SheetSpec }) {
  const width = sheet.labelW - sheet.padX * 2 - 0.05
  return (
    <div className="label-text centered">
      <div className="label-title" style={{ fontSize: `${fitPt(label.cableName, 700, sheet.pt.cableTitle, 5, width)}pt` }}>
        <Shade color={label.color}>{label.cableName}</Shade>
      </div>
      {label.lines.map((line, i) => (
        <div key={i} className="label-line" style={{ fontSize: `${fitPt(line, 400, sheet.pt.line, 4.5, width)}pt` }}>
          {line}
        </div>
      ))}
    </div>
  )
}

// Gray-shaded separator: the cable name over what the set is and where it goes.
function HeaderBody({ label, sheet }: { label: HeaderLabel; sheet: SheetSpec }) {
  const width = sheet.labelW - sheet.padX * 2 - 0.05
  return (
    <div className="label-text">
      <div className="label-title" style={{ fontSize: `${fitPt(label.cableName, 700, sheet.pt.cableTitle, 5, width)}pt` }}>
        <Shade color={label.color}>{label.cableName}</Shade>
      </div>
      {label.lines.map((line, i) => (
        <div key={i} className="label-line" style={{ fontSize: `${fitPt(line, 600, sheet.pt.line, 4.5, width)}pt` }}>
          {line}
        </div>
      ))}
    </div>
  )
}

function SheetLabel(props: { label: Label; sheet: SheetSpec; layout: TailLayout; x: number; y: number }) {
  const { label, sheet, layout, x, y } = props
  return (
    <div
      className={label.kind === 'header' ? 'sheet-label header' : 'sheet-label'}
      style={{
        left: `${x}in`,
        top: `${y}in`,
        width: `${sheet.labelW}in`,
        height: `${sheet.labelH}in`,
        padding: `${sheet.padY}in ${sheet.padX}in`,
      }}
    >
      {label.kind === 'header' ? (
        <HeaderBody label={label} sheet={sheet} />
      ) : label.kind === 'block' || label.kind === 'steck' ? (
        <CableBody label={label} sheet={sheet} />
      ) : label.single ? (
        <SingleTail label={label} sheet={sheet} layout={layout} />
      ) : layout === 'centered' ? (
        <CenteredTail label={label} sheet={sheet} />
      ) : (
        <StackedTail label={label} sheet={sheet} />
      )}
    </div>
  )
}

export function LabelsView({ show }: { show: Show }) {
  const [set, setSet] = useState<LabelSet>('tail')
  const [settings, setSettings] = useState<LabelSettings>(loadLabelSettings)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [skip, setSkip] = useState(0)
  const [query, setQuery] = useState('')

  useEffect(() => storeLabelSettings(settings), [settings])

  const sheet = SHEETS[settings.sheets[set]]
  const perSheet = sheet.cols * sheet.rows
  const patch = (changes: Partial<LabelSettings>) => setSettings((s) => ({ ...s, ...changes }))

  // Bundles, then racks, then everything else; each cable's labels come in sets with a header.
  const byBundle = useMemo(
    () =>
      cableGroups(show).map(({ key, title, cables }) => ({
        key,
        title,
        cables: cables.map((cable) => {
          const groups = groupsFor(show, cable, set, settings)
          return { cable, labels: groupLabels(groups, settings.headers[set]) }
        }),
      })),
    [show, set, settings],
  )
  const labels = byBundle.flatMap((b) => b.cables.filter(({ cable }) => !excluded.has(cable.id)).flatMap((c) => c.labels))
  const pages = paginate(labels, sheet, skip)
  const fill = settings.fill[set]
  const at = (i: number) => {
    const { x, y } = slotPosition(i, sheet, fill)
    return { x: x + settings.offsetX, y: y + settings.offsetY }
  }

  const q = query.trim().toLowerCase()
  const listed = byBundle
    .map((b) => ({ ...b, cables: b.cables.filter(({ cable }) => !q || cable.name.toLowerCase().includes(q)) }))
    .filter((b) => b.cables.length > 0)

  const setIncluded = (ids: string[], include: boolean) =>
    setExcluded((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (include) next.delete(id)
        else next.add(id)
      }
      return next
    })

  return (
    <div className="labels-view">
      <style>{LABEL_PAGE}</style>
      <aside className="labels-controls">
        <div className="segmented">
          <button className={set === 'tail' ? 'active' : ''} onClick={() => setSet('tail')}>
            Tails
          </button>
          <button className={set === 'cable' ? 'active' : ''} onClick={() => setSet('cable')}>
            Cables
          </button>
          <button className={set === 'steck' ? 'active' : ''} onClick={() => setSet('steck')}>
            Stecks
          </button>
        </div>
        <p className="muted small">
          {set === 'tail'
            ? 'Only tails picked from a trunk\'s tail menus: each fan or box gets a block label for its multipin side, then one label per connector.'
            : set === 'cable'
              ? 'Every cable and trunk: a label at each end of each piece, extensions included. A built-in fan gets one per jack. Tails print in Tails.'
              : "One per cable end that's checked as mounting in a steck (in the cable editor, under From / To)."}
        </p>

        <h3>Sheet</h3>
        {(Object.keys(SHEETS) as SheetId[]).map((id) => (
          <label key={id} className="radio">
            <input
              type="radio"
              name="sheet"
              checked={settings.sheets[set] === id}
              onChange={() => patch({ sheets: { ...settings.sheets, [set]: id } })}
            />
            <span>
              {SHEETS[id].name}
              <small className="muted">{SHEETS[id].detail}</small>
            </span>
          </label>
        ))}

        {set === 'tail' && (
          <>
            <h3>Layout</h3>
            {(
              [
                ['stacked', 'Cable name on top', 'Dimmer Distro•3  Female / Elec 5'],
                ['centered', 'Number both sides', '1  Piano L  1 / Piano Inputs•1 → patch'],
              ] as const
            ).map(([id, name, example]) => (
              <label key={id} className="radio">
                <input
                  type="radio"
                  name="tail-layout"
                  checked={settings.tailLayout === id}
                  onChange={() => patch({ tailLayout: id })}
                />
                <span>
                  {name}
                  <small className="muted">{example}</small>
                </span>
              </label>
            ))}
          </>
        )}

        {set === 'cable' && (
          <>
            <h3>Cable labels</h3>
            <label className="field">
              <span>Each cable piece</span>
              <select
                value={settings.perPiece}
                onChange={(e) => patch({ perPiece: Number(e.target.value) === 1 ? 1 : 2 })}
              >
                <option value={2}>Label both ends</option>
                <option value={1}>One label (End A only)</option>
              </select>
            </label>
          </>
        )}

        <h3>Order</h3>
        <label className="field">
          <span>Fill the sheet</span>
          <select
            value={fill}
            onChange={(e) => patch({ fill: { ...settings.fill, [set]: e.target.value as FillOrder } })}
          >
            <option value="down">Top to bottom, then left to right</option>
            <option value="across">Left to right, then top to bottom</option>
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.headers[set]}
            onChange={(e) => patch({ headers: { ...settings.headers, [set]: e.target.checked } })}
          />
          Header label before each {set === 'tail' ? 'tail set' : 'cable'}
        </label>
        <p className="muted small">Labels print bundle by bundle, then rack by rack, then everything else.</p>

        <h3>Printing</h3>
        <label className="field">
          <span>Skip first labels on sheet 1</span>
          <input
            type="number"
            min="0"
            max={perSheet - 1}
            value={skip}
            onChange={(e) => setSkip(Math.min(perSheet - 1, Math.max(0, Math.floor(Number(e.target.value) || 0))))}
          />
        </label>
        <div className="row2">
          <label className="field">
            <span>Shift right (in)</span>
            <input
              type="number"
              step="0.01"
              value={settings.offsetX}
              onChange={(e) => patch({ offsetX: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="field">
            <span>Shift down (in)</span>
            <input
              type="number"
              step="0.01"
              value={settings.offsetY}
              onChange={(e) => patch({ offsetY: Number(e.target.value) || 0 })}
            />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={settings.outlines} onChange={(e) => patch({ outlines: e.target.checked })} />
          Print outlines (test print on plain paper)
        </label>

        <div className="print-summary">
          <strong>
            {labels.length} label{labels.length === 1 ? '' : 's'} · {pages.length} sheet{pages.length === 1 ? '' : 's'}
          </strong>
          <button className="primary" disabled={labels.length === 0} onClick={() => window.print()}>
            Print…
          </button>
        </div>
        <p className="muted small">
          In the print dialog use Letter paper, scale 100%, margins None, and turn off headers and footers.
        </p>

        <h3>
          Cables{' '}
          <span className="muted">
            ({show.cables.length - excluded.size}/{show.cables.length})
          </span>
        </h3>
        <div className="list-actions">
          <button onClick={() => setExcluded(new Set())}>All</button>
          <button onClick={() => setExcluded(new Set(show.cables.map((c) => c.id)))}>None</button>
          <input type="search" placeholder="Filter…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="cable-checklist">
          {listed.map(({ key, title, cables }) => {
            const ids = cables.map((c) => c.cable.id)
            const included = ids.filter((id) => !excluded.has(id)).length
            return (
              <div key={key} className="checklist-group">
                <label className="check group-head">
                  <input
                    type="checkbox"
                    checked={included === ids.length}
                    ref={(el) => {
                      if (el) el.indeterminate = included > 0 && included < ids.length
                    }}
                    onChange={(e) => setIncluded(ids, e.target.checked)}
                  />
                  <span className="grow">{title}</span>
                </label>
                {cables.map(({ cable, labels: own }) => (
                  <label key={cable.id} className="check">
                    <input
                      type="checkbox"
                      checked={!excluded.has(cable.id)}
                      onChange={(e) => setIncluded([cable.id], e.target.checked)}
                    />
                    <span className="grow">{cable.name || <span className="muted">Unnamed</span>}</span>
                    <span className="muted small">{own.length}</span>
                  </label>
                ))}
              </div>
            )
          })}
        </div>
      </aside>

      <section className={settings.outlines ? 'labels-preview print-outlines' : 'labels-preview'}>
        {labels.length === 0 ? (
          <div className="empty">
            <p>No labels to print.</p>
            <p className="muted">
              {show.cables.length === 0
                ? 'Add cables first.'
                : set === 'steck'
                  ? 'No steck labels yet. Check "Steck" on a cable end in the cable editor to make one.'
                  : set === 'tail'
                  ? 'No tails to label. Pick a fan or box for a trunk end in the cable editor; single cables and cable ends print in Cables.'
                  : 'Selected cables have nothing to label.'}
            </p>
          </div>
        ) : (
          pages.map((page, p) => (
            <div key={p} className="sheet-wrap">
              <div className="sheet-caption muted small">
                Sheet {p + 1} of {pages.length} · {sheet.name}
              </div>
              <div className="sheet">
                {page.map((label, i) =>
                  label ? (
                    <SheetLabel
                      key={label.key}
                      label={label}
                      sheet={sheet}
                      layout={settings.tailLayout}
                      x={at(i).x}
                      y={at(i).y}
                    />
                  ) : (
                    <div
                      key={`skip-${i}`}
                      className="sheet-label skipped"
                      style={{
                        left: `${at(i).x}in`,
                        top: `${at(i).y}in`,
                        width: `${sheet.labelW}in`,
                        height: `${sheet.labelH}in`,
                      }}
                    />
                  ),
                )}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  )
}
