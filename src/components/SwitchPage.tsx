import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import type { Update } from '../App'
import { gearLabel, setModelField, type PatchPoint } from '../gear'
import { gearModelOf } from '../models'
import {
  parseVlanList,
  portFill,
  portSetup,
  setSwitchPorts,
  switchPortList,
  vlanColor,
  vlanListText,
} from '../network'
import { rackById } from '../show'
import { buildLabelSvg, lengthText, loadLabelStyle, patchedText } from '../switchLabels'
import type { Gear, Show, SwitchLayout, SwitchPort } from '../types'
import { LengthInput } from './LengthInput'

interface Props {
  show: Show
  gear: Gear
  points: PatchPoint[]
  update: Update
  onClose: () => void
  onOpenGear: (id: string) => void
  onPrint: (id: string) => void
}

const MIXED = '__mixed'

// The value every picked port shares, or MIXED.
function common<T>(list: SwitchPort[], get: (p: SwitchPort) => T): T | typeof MIXED {
  const first = get(list[0])
  return list.every((p) => get(p) === first) ? first : MIXED
}

// Tagged VLANs typed as "10, 20-30": applied on Enter or on leaving the box; anything
// that doesn't read as VLAN numbers stays in the box, marked, until it does.
function TaggedInput({ value, disabled, onSet, label }: { value: number[] | typeof MIXED; disabled?: boolean; onSet: (ids: number[]) => void; label: string }) {
  const start = value === MIXED ? '' : vlanListText(value)
  const [draft, setDraft] = useState(start)
  const [was, setWas] = useState(start)
  if (was !== start) {
    setWas(start)
    setDraft(start)
  }
  const parsed = parseVlanList(draft)
  const commit = () => {
    if (parsed && draft !== start && !(value === MIXED && !draft.trim())) onSet(parsed)
  }
  return (
    <input
      className={parsed ? 'tagged-input' : 'tagged-input invalid'}
      value={draft}
      disabled={disabled}
      placeholder={value === MIXED ? 'Mixed' : disabled ? '—' : 'e.g. 10, 20-30'}
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        }
      }}
    />
  )
}

// One network switch: its ports drawn the way the label prints them (click one to pick
// it, Shift-click for a run), and a table to set each port's VLANs, trunk or access, and
// colour. Several picked ports change together from the bar above the table.
export function SwitchPage({ show, gear, points, update, onClose, onOpenGear, onPrint }: Props) {
  const model = gearModelOf(show, gear)
  const layout = model?.switchLayout
  const ports = useMemo(() => switchPortList(show, gear), [show, gear])
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set())
  const anchor = useRef<string | null>(null)
  const style = useMemo(() => loadLabelStyle(), [])

  // Ports the model no longer lists drop out of the pick.
  const pickedPorts = ports.filter((p) => picked.has(p))
  const pickedSetups = pickedPorts.map((p) => portSetup(gear, p))

  const pick = (port: string, shift: boolean) => {
    const from = anchor.current ? ports.indexOf(anchor.current) : -1
    const to = ports.indexOf(port)
    const run = shift && from >= 0 && to >= 0 ? ports.slice(Math.min(from, to), Math.max(from, to) + 1) : [port]
    const on = !picked.has(port)
    setPicked((prev) => {
      const next = new Set(prev)
      for (const p of run) {
        if (on) next.add(p)
        else next.delete(p)
      }
      return next
    })
    anchor.current = port
  }
  const clear = () => {
    setPicked(new Set())
    anchor.current = null
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target
      if (e.key !== 'Escape' || !picked.size) return
      if ((t instanceof HTMLInputElement && t.type !== 'checkbox') || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return
      clear()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [picked.size])

  const setPorts = (list: string[], change: Partial<SwitchPort>) => update((s) => setSwitchPorts(s, gear.id, list, change))
  const setLayout = (changes: Partial<SwitchLayout>) =>
    layout && update((s) => setModelField(s, gear, { switchLayout: { ...layout, ...changes } }))

  const { svg, w, h } = buildLabelSvg(show, gear, style, { points, selected: new Set(pickedPorts), interactive: true, natural: true })
  const onDrawingClick = (e: MouseEvent<HTMLDivElement>) => {
    const port = (e.target as Element).closest('[data-port]')?.getAttribute('data-port')
    if (port) pick(port, e.shiftKey)
  }

  const vlanOptions = show.info.vlans.map((v) => (
    <option key={v.id} value={v.id}>
      {v.id}
      {v.name ? ` · ${v.name}` : ''}
    </option>
  ))
  const rack = rackById(show, gear.rackId)
  const used = ports.filter((p) => gear.switchPorts[p]).length

  const bulkMode = pickedSetups.length ? common(pickedSetups, (p) => p.mode) : MIXED
  const bulkVlan = pickedSetups.length ? common(pickedSetups, (p) => p.vlan) : MIXED
  const bulkTagged = pickedSetups.length ? common(pickedSetups, (p) => vlanListText(p.tagged)) : MIXED
  const bulkColor = pickedSetups.length ? common(pickedSetups, (p) => p.color) : MIXED

  return (
    <section className="pane switch-page">
      <div className="toolbar">
        <button onClick={onClose}>← Switches</button>
        <h2 className="switch-title">{gearLabel(gear)}</h2>
        <span className="muted">
          {[model ? [model.manufacturer, model.model].filter(Boolean).join(' ') : '', rack?.name, `${ports.length} ports`, used ? `${used} set up` : '']
            .filter(Boolean)
            .join(' · ')}
        </span>
        <span className="spacer" />
        <button onClick={() => onOpenGear(gear.id)}>Open in Gear</button>
        <button className="primary" onClick={() => onPrint(gear.id)}>
          Print label…
        </button>
      </div>

      {ports.length === 0 ? (
        <div className="empty">
          <p>This switch's model has no ports listed yet.</p>
          <p className="muted">
            Give the model its ports on the Gear tab (like <code>1-24, SFP 25-28</code>), and they show up here.
          </p>
        </div>
      ) : (
        <div className="switch-body">
          <div className="switch-drawing" onClick={onDrawingClick}>
            <div
              className="switch-svg"
              style={{ maxWidth: `${Math.round(w * 4.2)}px`, aspectRatio: `${w} / ${h}` }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <p className="muted small">
              Click a port to pick it, Shift-click for a run.{' '}
              {style.size === 'fit'
                ? `It prints fitted to ${lengthText(style.areaW, style.units)} × ${lengthText(style.areaH, style.units)}`
                : 'This is the label at actual size, as it prints'}
              ; size and style are set on Print → Switch Labels.
            </p>
          </div>

          {pickedPorts.length > 0 && (
            <div className="batch-bar switch-batch" role="region" aria-label="Change the picked ports">
              <div className="batch-count">
                <strong>
                  {pickedPorts.length} port{pickedPorts.length === 1 ? '' : 's'}
                </strong>
                <span className="muted small">{pickedPorts.length <= 4 ? pickedPorts.join(', ') : `${pickedPorts[0]} … ${pickedPorts[pickedPorts.length - 1]}`}</span>
              </div>
              <label className="batch-field">
                <span className="muted small">Mode</span>
                <select value={bulkMode} onChange={(e) => setPorts(pickedPorts, { mode: e.target.value as SwitchPort['mode'] })}>
                  {bulkMode === MIXED && (
                    <option value={MIXED} disabled>
                      Mixed
                    </option>
                  )}
                  <option value="access">Access</option>
                  <option value="trunk">Trunk</option>
                </select>
              </label>
              <label className="batch-field">
                <span className="muted small">{bulkMode === 'trunk' ? 'Untagged VLAN' : 'VLAN'}</span>
                <select value={bulkVlan} onChange={(e) => setPorts(pickedPorts, { vlan: Number(e.target.value) })}>
                  {bulkVlan === MIXED && (
                    <option value={MIXED} disabled>
                      Mixed
                    </option>
                  )}
                  {vlanOptions}
                </select>
              </label>
              <label className="batch-field">
                <span className="muted small">Tagged VLANs</span>
                <TaggedInput
                  label="Tagged VLANs for the picked ports"
                  value={bulkTagged === MIXED ? MIXED : (parseVlanList(bulkTagged) ?? [])}
                  disabled={bulkMode === 'access'}
                  onSet={(tagged) => setPorts(pickedPorts, { tagged, mode: 'trunk' })}
                />
              </label>
              <label className="batch-field">
                <span className="muted small">Colour</span>
                <span className="batch-input">
                  <input
                    type="color"
                    value={bulkColor === MIXED || !bulkColor ? vlanColor(show, bulkVlan === MIXED ? 1 : bulkVlan) : bulkColor}
                    aria-label="Colour for the picked ports"
                    onChange={(e) => setPorts(pickedPorts, { color: e.target.value })}
                  />
                  <button
                    type="button"
                    className="small"
                    disabled={bulkColor === null}
                    title="Back to each port's VLAN colour"
                    onClick={() => setPorts(pickedPorts, { color: null })}
                  >
                    VLAN colour
                  </button>
                </span>
              </label>
              <span className="spacer" />
              <button onClick={() => setPicked(new Set(ports))}>All ports</button>
              <button onClick={clear} title="Untick everything (Esc)">
                Clear
              </button>
            </div>
          )}

          <div className="table-wrap">
            <table className="grid switch-ports">
              <thead>
                <tr>
                  <th className="pick">
                    <input
                      type="checkbox"
                      aria-label="Pick every port"
                      checked={pickedPorts.length === ports.length}
                      ref={(el) => {
                        if (el) el.indeterminate = pickedPorts.length > 0 && pickedPorts.length < ports.length
                      }}
                      onChange={() => (pickedPorts.length === ports.length ? clear() : setPicked(new Set(ports)))}
                    />
                  </th>
                  <th>Port</th>
                  <th>Mode</th>
                  <th>VLAN</th>
                  <th>Tagged (trunk)</th>
                  <th>Colour</th>
                  <th>Label text</th>
                </tr>
              </thead>
              <tbody>
                {ports.map((port) => {
                  const p = portSetup(gear, port)
                  const auto = patchedText(points, port, 'far')
                  return (
                    <tr key={port} className={picked.has(port) ? 'picked' : undefined}>
                      <td className="pick" onClick={(e) => pick(port, e.shiftKey)}>
                        <input
                          type="checkbox"
                          checked={picked.has(port)}
                          aria-label={`Pick port ${port}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            pick(port, e.shiftKey)
                          }}
                          onChange={() => {}}
                        />
                      </td>
                      <td className="strong nowrap">
                        <span className="swatch" style={{ background: portFill(show, p) }} />
                        {port}
                      </td>
                      <td>
                        <select value={p.mode} aria-label={`Port ${port} mode`} onChange={(e) => setPorts([port], { mode: e.target.value as SwitchPort['mode'] })}>
                          <option value="access">Access</option>
                          <option value="trunk">Trunk</option>
                        </select>
                      </td>
                      <td>
                        <select
                          value={p.vlan}
                          aria-label={p.mode === 'trunk' ? `Port ${port} untagged VLAN` : `Port ${port} VLAN`}
                          title={p.mode === 'trunk' ? 'Untagged (native) VLAN' : undefined}
                          onChange={(e) => setPorts([port], { vlan: Number(e.target.value) })}
                        >
                          {vlanOptions}
                        </select>
                      </td>
                      <td>
                        <TaggedInput
                          label={`Port ${port} tagged VLANs`}
                          value={p.tagged}
                          disabled={p.mode === 'access'}
                          onSet={(tagged) => setPorts([port], { tagged })}
                        />
                      </td>
                      <td className="nowrap">
                        <input
                          type="color"
                          value={p.color ?? vlanColor(show, p.vlan)}
                          aria-label={`Port ${port} colour`}
                          title={p.color ? 'Its own colour' : "Its VLAN's colour; pick one to give it its own"}
                          onChange={(e) => setPorts([port], { color: e.target.value })}
                        />
                        {p.color && (
                          <button className="icon" title="Back to its VLAN's colour" aria-label={`Port ${port}: back to its VLAN's colour`} onClick={() => setPorts([port], { color: null })}>
                            ×
                          </button>
                        )}
                      </td>
                      <td className="wide-cell">
                        <input
                          value={p.desc}
                          placeholder={auto || 'Nothing patched'}
                          title={auto ? `Leave blank to print what's patched here: ${auto}` : undefined}
                          aria-label={`Port ${port} label text`}
                          onChange={(e) => setPorts([port], { desc: e.target.value })}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {layout && (
            <section className="switch-layout-settings">
              <h3>
                Front panel <span className="muted small">shared by every {[model?.manufacturer, model?.model].filter(Boolean).join(' ')}</span>
              </h3>
              <div className="switch-layout-fields">
                <label className="field">
                  <span>Rows</span>
                  <select value={layout.rows} onChange={(e) => setLayout({ rows: Number(e.target.value) === 2 ? 2 : 1 })}>
                    <option value={1}>1 row</option>
                    <option value={2}>2 rows (odd on top, even below)</option>
                  </select>
                </label>
                <label className="field" title="Ports drawn as SFP cages. Ports named SFP… are anyway.">
                  <span>SFP ports</span>
                  <input value={layout.sfp} placeholder="e.g. 25-28" onChange={(e) => setLayout({ sfp: e.target.value })} />
                </label>
                <label className="field">
                  <span>Wider gap before</span>
                  <input value={layout.gapBefore} placeholder="e.g. 25" onChange={(e) => setLayout({ gapBefore: e.target.value })} />
                </label>
                <label className="field">
                  <span>Gap ({style.units})</span>
                  <LengthInput mm={layout.gap} units={style.units} label="Gap" onSet={(gap) => setLayout({ gap })} />
                </label>
                <label className="field" title="0: never">
                  <span>Gap every N columns</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={layout.groupCols}
                    onChange={(e) => setLayout({ groupCols: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                  />
                </label>
              </div>
            </section>
          )}
        </div>
      )}
    </section>
  )
}
