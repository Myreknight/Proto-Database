import { useEffect, useState, type ReactNode } from 'react'
import { downloadText, safeFilename } from '../files'
import { gearLabel, type PatchReport } from '../gear'
import { switchesOf } from '../network'
import { loadViewSetting, storeViewSetting } from '../sorting'
import {
  AREA_PRESETS,
  buildLabelSvg,
  fitScale,
  LABEL_DEFAULTS,
  labelPieces,
  lengthText,
  loadLabelStyle,
  printableWidth,
  storeLabelStyle,
  SWITCH_PICK_KEY,
  type SwitchLabelStyle,
} from '../switchLabels'
import type { Show } from '../types'
import { LengthInput } from './LengthInput'
import { PrintBar } from './PrintBar'

type Opt<T extends string> = [T, string][]
// Port labels for the show's network switches. At actual size, printed at 100%, they sit
// over the switch's ports, and a switch wider than the page prints in parts. Or fitted
// into an area of its own size (on top of the switch, a blank panel), scaled to fit.
export function SwitchLabelsView({ show, patches }: { show: Show; patches: PatchReport }) {
  const [style, setStyle] = useState<SwitchLabelStyle>(loadLabelStyle)
  const [stored, setPick] = useState<string>(() => loadViewSetting(SWITCH_PICK_KEY, { id: 'all' }).id)
  useEffect(() => storeLabelStyle(style), [style])
  useEffect(() => storeViewSetting(SWITCH_PICK_KEY, { id: stored }), [stored])

  const switches = switchesOf(show)
  const pick = switches.some((g) => g.id === stored) ? stored : 'all'
  const chosen = pick === 'all' ? switches : switches.filter((g) => g.id === pick)
  const pieces = chosen.map((g) => ({ gear: g, pieces: labelPieces(show, g, style, patches.byGear.get(g.id) ?? []) }))
  const labels = pieces.flatMap((x) => x.pieces)
  const fit = style.size === 'fit'
  const units = style.units

  const set = <K extends keyof SwitchLabelStyle>(key: K, value: SwitchLabelStyle[K]) => setStyle((s) => ({ ...s, [key]: value }))
  const select = <T extends string>(key: keyof SwitchLabelStyle, label: string, opts: Opt<T>) => (
    <label className="field">
      <span>{label}</span>
      <select value={String(style[key])} onChange={(e) => set(key, (e.target.value === 'true' ? true : e.target.value === 'false' ? false : e.target.value) as never)}>
        {opts.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  )
  const number = (key: keyof SwitchLabelStyle, label: ReactNode, step = 0.1, min = 0) => (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        min={min}
        value={style[key] as number}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n) && n >= min) set(key, n as never)
        }}
      />
    </label>
  )
  // A length field, in the chosen units.
  const length = (key: 'margin' | 'descLen' | 'jackW' | 'jackH' | 'notchW' | 'notchH' | 'sfpW' | 'sfpH' | 'pitchX' | 'pitchY', label: string) => (
    <label className="field">
      <span>
        {label} ({units})
      </span>
      <LengthInput mm={style[key]} units={units} label={label} onSet={(mm) => set(key, mm)} />
    </label>
  )
  const check = (key: keyof SwitchLabelStyle, label: string, disabled?: string) => (
    <label className="check" title={disabled}>
      <input type="checkbox" checked={style[key] as boolean} disabled={!!disabled} onChange={(e) => set(key, e.target.checked as never)} />
      {label}
    </label>
  )

  const one = chosen.length === 1 ? chosen[0] : null
  const whole = one ? buildLabelSvg(show, one, style, { points: patches.byGear.get(one.id) ?? [] }) : null
  const downloadSvg = () => {
    if (!one || !whole) return
    downloadText(`${safeFilename(`${show.name} ${gearLabel(one)}`)} label.svg`, whole.svg, 'image/svg+xml')
  }
  const split = pieces.some((x) => x.pieces.length > 1)
  const scales = fit ? chosen.map((g) => fitScale(show, g, style)) : []
  const across = lengthText(printableWidth(style), units)
  const pct = (n: number) => `${Math.round(n * 100)}%`

  const summary = !labels.length
    ? ''
    : fit
      ? [
          `${chosen.length} label${chosen.length === 1 ? '' : 's'}, ${lengthText(style.areaW, units)} × ${lengthText(style.areaH, units)}`,
          scales.length
            ? `scaled to ${pct(Math.min(...scales))}${Math.max(...scales) - Math.min(...scales) > 0.005 ? `–${pct(Math.max(...scales))}` : ''}`
            : '',
          split ? `in pieces that butt together (${across} fits across ${style.paper} ${style.orient})` : '',
        ]
          .filter(Boolean)
          .join(', ') + '. Print at 100% (Actual size); the cut line should measure that size.'
      : [
          `${labels.length} label${labels.length === 1 ? '' : 's'}${whole ? `, ${lengthText(whole.w, units)} × ${lengthText(whole.h, units)}` : ''}`,
          split ? `split to fit ${style.paper} ${style.orient} (${across} across)` : '',
        ]
          .filter(Boolean)
          .join(', ') + '. Print at 100% (Actual size), then check the 50 mm ruler.'

  return (
    <section className="pane switch-labels-view">
      <style>{`@media print { @page { size: ${style.paper} ${style.orient}; margin: ${style.margin}mm; } }`}</style>
      <PrintBar
        onPrint={() => window.print()}
        disabled={!labels.length}
        actions={
          <button onClick={downloadSvg} disabled={!one} title={one ? 'The whole label, in one piece, for a label maker or editor' : 'Pick one switch to download its label'}>
            Download SVG
          </button>
        }
      >
        <label className="inline-select">
          <span className="muted">Switch</span>
          <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Which switch's labels to print">
            <option value="all">All switches</option>
            {switches.map((g) => (
              <option key={g.id} value={g.id}>
                {gearLabel(g)}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-select">
          <span className="muted">Size</span>
          <select value={style.size} onChange={(e) => set('size', e.target.value as SwitchLabelStyle['size'])} aria-label="Label size">
            <option value="actual">Actual size, over the ports</option>
            <option value="fit">Fit an area</option>
          </select>
        </label>
        {fit && (
          <span className="area-fields">
            <LengthInput mm={style.areaW} units={units} label="Area width" min={0.1} onSet={(mm) => set('areaW', mm)} />
            <span className="muted">×</span>
            <LengthInput mm={style.areaH} units={units} label="Area height" min={0.1} onSet={(mm) => set('areaH', mm)} />
            <span className="muted">{units}</span>
            {AREA_PRESETS.map((p) => (
              <button
                key={p.label}
                className={`small${Math.abs(style.areaW - p.w) < 0.05 && Math.abs(style.areaH - p.h) < 0.05 ? ' active' : ''}`}
                title={`${lengthText(p.w, units)} × ${lengthText(p.h, units)}`}
                onClick={() => setStyle((s) => ({ ...s, areaW: p.w, areaH: p.h }))}
              >
                {p.label}
              </button>
            ))}
          </span>
        )}
        <div className="segmented units-toggle" role="group" aria-label="Units">
          <button className={units === 'in' ? 'active' : ''} aria-pressed={units === 'in'} onClick={() => set('units', 'in')}>
            in
          </button>
          <button className={units === 'mm' ? 'active' : ''} aria-pressed={units === 'mm'} onClick={() => set('units', 'mm')}>
            mm
          </button>
        </div>
        {summary && <span className="muted">{summary}</span>}
      </PrintBar>

      <details className="switch-label-style">
        <summary>Label style</summary>
        <div className="switch-style-grid">
          {select('shape', 'Port shape', [
            ['rj45', 'RJ45 outline'],
            ['box', 'Plain box'],
          ])}
          {select('latch', 'Latch notch', [
            ['auto', 'Top row up, bottom down'],
            ['up', 'All up'],
            ['down', 'All down'],
          ])}
          {select('descPos', 'Text by the ports', [
            ['outside', 'Outside (top row above, bottom below)'],
            ['above', 'All above'],
            ['below', 'All below'],
            ['none', 'None'],
          ])}
          {select('autoDesc', 'A port with no text of its own', [
            ['far', "What's patched there (the other end)"],
            ['cable', 'The patched cable’s name'],
            ['none', 'Nothing'],
          ])}
          {select('descRotate', 'Text direction', [
            ['false', 'Across'],
            ['true', 'Up and down'],
          ])}
          {number('descSize', 'Text size (pt)', 0.5, 3)}
          {number('descLines', 'Most lines', 1, 1)}
          {length('descLen', 'Up-and-down text length')}
          {select('paper', 'Paper', [
            ['letter', 'Letter'],
            ['legal', 'Legal'],
            ['a4', 'A4'],
            ['a3', 'A3'],
          ])}
          {select('orient', 'Orientation', [
            ['landscape', 'Landscape'],
            ['portrait', 'Portrait'],
          ])}
          {length('margin', 'Page margin')}
        </div>
        <div className="switch-style-checks">
          {check('showNumber', 'Port number')}
          {check('showVlan', 'VLAN in the port')}
          {check('showTitle', 'Title')}
          {check('showLegend', 'VLAN legend')}
          {check('showRuler', '50 mm ruler', fit ? 'Only at actual size: a fitted label is scaled' : undefined)}
          {check('showCut', 'Cut line')}
        </div>
        <details className="switch-dimensions">
          <summary>Port sizes: measure one switch with calipers</summary>
          <p className="muted small">
            These start as estimates. The spacing matters most: measure from the centre of one port to the next, across and down.
          </p>
          <div className="switch-style-grid">
            {length('jackW', 'RJ45 width')}
            {length('jackH', 'RJ45 height, notch included')}
            {length('notchW', 'Notch width')}
            {length('notchH', 'Notch depth')}
            {length('sfpW', 'SFP width')}
            {length('sfpH', 'SFP height')}
            {length('pitchX', 'Across, centre to centre')}
            {length('pitchY', 'Down, centre to centre')}
          </div>
          <button onClick={() => setStyle(LABEL_DEFAULTS)}>Reset the label style</button>
        </details>
      </details>

      {labels.length === 0 ? (
        <div className="empty">
          <p>No network switches to label yet.</p>
          <p className="muted">Switches are set up on the Network tab: each port's VLANs, trunk or access, and colour.</p>
        </div>
      ) : (
        <div className="switch-labels">
          {labels.map((l) => (
            <div key={l.key} className="switch-label-item" dangerouslySetInnerHTML={{ __html: l.svg }} />
          ))}
        </div>
      )}
    </section>
  )
}
