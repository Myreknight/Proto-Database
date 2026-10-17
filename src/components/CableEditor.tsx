import { useState } from 'react'
import type { Update } from '../App'
import {
  addExtension,
  bundleById,
  bundleLengthMismatch,
  duplicateCable,
  ensureRack,
  joinBundle,
  joinRack,
  linkCable,
  linkedCables,
  moveInLink,
  newCable,
  rackById,
  setCableColor,
  unlinkCable,
  setTailCells,
  type TailField,
  tailOptions,
  typeById,
  visibleTails,
  withType,
} from '../show'
import { DEPLOYMENTS, type Cable, type Deployment, type Show } from '../types'
import { CABLE_COLORS, colorName } from '../colors'
import { endConnectors } from '../labels'
import { LengthDialog } from './LengthDialog'
import { PromptDialog } from './PromptDialog'

interface Props {
  show: Show
  cable: Cable
  update: Update
  onClose: () => void
  onSelect: (id: string | null) => void
}

export function CableEditor({ show, cable, update, onClose, onSelect }: Props) {
  const [extending, setExtending] = useState(false)
  const [askingRack, setAskingRack] = useState(false)
  // Spreadsheet-style range in one tail column: anchor is where it started, focus where it ends.
  const [sel, setSel] = useState<{ field: TailField; anchor: number; focus: number } | null>(null)
  const type = typeById(show, cable.typeId)
  const tails = visibleTails(show, cable)
  const runTypes = show.cableTypes
    .filter((t) => t.part === 'Cable' || t.part === 'Trunk')
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  const tailTypes = tailOptions(show, type)
  const lengthListId = `lengths-${cable.id}`

  const patch = (fn: (c: Cable, s: Show) => Cable) =>
    update((s) => ({ ...s, cables: s.cables.map((c) => (c.id === cable.id ? fn(c, s) : c)) }))

  // Switching to interconnect asks which rack it's in. The rack is kept if the cable
  // is switched away and back, so nothing is lost.
  const setDeployment = (deployment: Deployment) => {
    patch((c) =>
      deployment === 'bundled' ? { ...c, deployment } : { ...c, deployment, bundleId: null, flagEnd: null },
    )
    if (deployment === 'interconnect') setAskingRack(true)
  }

  // Picks a rack by name, adding it to the show's racks if it's new.
  const setRackByName = (name: string) =>
    update((s) => {
      const { show: next, rackId } = ensureRack(s, name)
      return { ...next, cables: next.cables.map((c) => (c.id === cable.id ? joinRack(c, rackId) : c)) }
    })

  // "End A · Amp Room": End A is always the cable's From, End B its To.
  const endLabel = (prefix: string, end: 'A' | 'B') => {
    const where = (end === 'A' ? cable.from : cable.to).trim()
    return where ? `${prefix} · ${where}` : prefix
  }

  const rack = rackById(show, cable.rackId)
  const rackNames = show.racks.map((r) => r.name).filter(Boolean)

  const setBundle = (bundleId: string | null) =>
    patch((c, s) => {
      const bundle = bundleById(s, bundleId)
      return bundle ? joinBundle(c, bundle) : { ...c, bundleId: null, flagEnd: null }
    })

  const mismatch = bundleLengthMismatch(show, cable)

  const setSegmentLength = (segmentId: string, value: string) =>
    patch((c) => ({
      ...c,
      segments: c.segments.map((g) =>
        g.id === segmentId ? { ...g, length: value === '' ? null : Math.max(0, Number(value)) } : g,
      ),
    }))

  const removeSegment = (segmentId: string) =>
    patch((c) => ({ ...c, segments: c.segments.filter((g) => g.id !== segmentId) }))

  const focusTail = (field: TailField, index: number) =>
    document.querySelector<HTMLInputElement>(`[data-tail="${field}-${index}"]`)?.focus()

  // Patch cells follow the connectors on each end, not the circuits, and fill from the
  // top: an NL8 with 2x NL4 on End A has Patch A cells on rows 1–2 only (one per NL4),
  // while 4x NL2 on End B fills rows 1–4. Names stay one per circuit.
  const countA = Math.min(tails.length, endConnectors(show, cable, 'A'))
  const countB = Math.min(tails.length, endConnectors(show, cable, 'B'))
  const countOf = (field: TailField) => (field === 'patchA' ? countA : field === 'patchB' ? countB : tails.length)
  // The rows a column's cells sit on, from one row onward (optionally stopping at another).
  const cellRows = (field: TailField, from: number, to = countOf(field) - 1) => {
    const rows: number[] = []
    for (let r = from; r <= Math.min(to, countOf(field) - 1); r++) rows.push(r)
    return rows
  }
  // On an end where each connector carries several circuits, a cell's hint says which.
  const patchHint = (field: 'patchA' | 'patchB', i: number, example: string) => {
    const per = tails.length / countOf(field)
    if (per > 1 && countOf(field) > 1) return `Circuits ${i * per + 1}–${(i + 1) * per}`
    return i === 0 ? example : ''
  }

  const range = sel ? { lo: Math.min(sel.anchor, sel.focus), hi: Math.max(sel.anchor, sel.focus) } : null
  const multi = !!range && range.hi > range.lo
  const inRange = (field: TailField, i: number) => !!sel && sel.field === field && !!range && i >= range.lo && i <= range.hi

  // Writes one value into every selected cell, or a list of values down from the top of the selection.
  const fillRange = (values: string[]) => {
    if (!sel || !range) return
    const selected = cellRows(sel.field, range.lo, range.hi)
    const rows = values.length === 1 ? selected : cellRows(sel.field, range.lo).slice(0, Math.max(selected.length, values.length))
    const list = values.length === 1 ? Array(rows.length).fill(values[0]) : values
    patch((c, s) => setTailCells(s, c, sel.field, rows, list))
  }

  const rangeText = () =>
    sel && range ? cellRows(sel.field, range.lo, range.hi).map((r) => tails[r][sel.field]).join('\n') : ''

  const moveTo = (field: TailField, index: number, extend: boolean) => {
    if (index < 0 || index >= countOf(field)) return
    setSel((prev) =>
      extend && prev?.field === field ? { ...prev, focus: index } : { field, anchor: index, focus: index },
    )
    focusTail(field, index)
  }

  const tailInput = (field: TailField, i: number, placeholder: string) => (
    <input
      data-tail={`${field}-${i}`}
      className={multi && inRange(field, i) ? 'in-range' : undefined}
      value={tails[i][field]}
      placeholder={placeholder}
      onMouseDown={(e) => {
        // Shift-click extends down the column instead of selecting text.
        if (e.shiftKey && sel?.field === field) {
          e.preventDefault()
          moveTo(field, i, true)
        } else {
          setSel({ field, anchor: i, focus: i })
        }
      }}
      onFocus={() =>
        setSel((prev) =>
          prev?.field === field && i >= Math.min(prev.anchor, prev.focus) && i <= Math.max(prev.anchor, prev.focus)
            ? prev
            : { field, anchor: i, focus: i },
        )
      }
      onChange={(e) => {
        setSel({ field, anchor: i, focus: i })
        patch((c, s) => setTailCells(s, c, field, [i], [e.target.value]))
      }}
      onPaste={(e) => {
        const lines = e.clipboardData.getData('text').split(/\r?\n/)
        if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
        if (!multi && lines.length < 2) return
        e.preventDefault()
        if (multi) fillRange(lines.map((l) => l.trim()))
        else patch((c, s) => setTailCells(s, c, field, cellRows(field, i), lines.map((l) => l.trim())))
      }}
      onCopy={(e) => {
        if (!multi) return
        e.preventDefault()
        e.clipboardData.setData('text/plain', rangeText())
      }}
      onCut={(e) => {
        if (!multi) return
        e.preventDefault()
        e.clipboardData.setData('text/plain', rangeText())
        fillRange([''])
      }}
      onKeyDown={(e) => {
        if (multi && (e.key === 'Delete' || e.key === 'Backspace')) {
          e.preventDefault()
          fillRange([''])
        } else if (e.key === 'Escape') {
          setSel({ field, anchor: i, focus: i })
        } else if (e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
          e.preventDefault()
          const from = sel?.field === field ? sel.focus : i
          moveTo(field, from + (e.key === 'ArrowDown' ? 1 : -1), true)
        } else if (e.key === 'Enter' || e.key === 'ArrowDown') {
          moveTo(field, i + 1, false)
        } else if (e.key === 'ArrowUp') {
          moveTo(field, i - 1, false)
        }
      }}
    />
  )

  const remove = () => {
    if (!confirm(`Delete ${cable.name || 'this cable'}?`)) return
    update((s) => ({ ...s, cables: s.cables.filter((c) => c.id !== cable.id) }))
    onClose()
  }

  const setColor = (color: string | null) => update((s) => setCableColor(s, cable.id, color))

  // The path this cable is part of, and what it says about where each piece runs.
  const path = linkedCables(show, cable)
  const where = (c: typeof cable) => {
    const rackName = c.deployment === 'interconnect' ? rackById(show, c.rackId)?.name : undefined
    const bundleName = bundleById(show, c.bundleId)?.name
    return rackName ? `Rack · ${rackName}` : bundleName ? `Bundle · ${bundleName}` : [c.from, c.to].filter(Boolean).join(' → ')
  }
  const linkable = show.cables.filter((c) => c.id !== cable.id && !path.some((p) => p.id === c.id))

  const addLinked = (otherId: string) => update((s) => linkCable(s, cable.id, otherId))

  // A fresh cable of the same type that joins this path, opened in the editor.
  const newLinked = () => {
    const created = newCable(show, { typeId: cable.typeId, name: cable.name, color: cable.color })
    update((s) => linkCable({ ...s, cables: [...s.cables, created] }, cable.id, created.id))
    onSelect(created.id)
  }

  const applyNameToLinked = () =>
    update((s) => ({
      ...s,
      cables: s.cables.map((c) => (path.some((p) => p.id === c.id) ? { ...c, name: cable.name } : c)),
    }))

  const duplicate = () => {
    const copy = duplicateCable(cable)
    update((s) => ({ ...s, cables: [...s.cables, copy] }))
    onSelect(copy.id)
  }

  return (
    <aside className="editor">
      <div className="editor-head">
        <h2>{cable.name || 'Unnamed cable'}</h2>
        <button className="icon" onClick={onClose} aria-label="Close editor">
          ×
        </button>
      </div>

      <div className="editor-body">
        <label className="field">
          <span>Cable name</span>
          <input
            autoFocus={!cable.name}
            value={cable.name}
            placeholder="e.g. Speaker Main"
            onChange={(e) => patch((c) => ({ ...c, name: e.target.value }))}
          />
        </label>

        <label className="field">
          <span>Type</span>
          <select value={cable.typeId} onChange={(e) => patch((c, s) => withType(s, c, e.target.value))}>
            {!type && <option value={cable.typeId}>Missing type</option>}
            {(['Trunk', 'Cable'] as const).map((part) => (
              <optgroup key={part} label={part === 'Trunk' ? 'Trunks (take tails)' : 'Cables'}>
                {runTypes
                  .filter((t) => t.part === part)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          {type && (
            <small className="muted">
              {type.endA} → {type.endB} · {type.channels} ch
            </small>
          )}
        </label>

        {type?.part === 'Trunk' && (
          <div className="row2">
            <label className="field">
              <span className="clip-label" title={endLabel('End A tail', 'A')}>
                {endLabel('End A tail', 'A')}
              </span>
              <select
                value={cable.tailATypeId ?? ''}
                onChange={(e) => patch((c) => ({ ...c, tailATypeId: e.target.value || null }))}
              >
                <option value="">None</option>
                {tailTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="clip-label" title={endLabel('End B tail', 'B')}>
                {endLabel('End B tail', 'B')}
              </span>
              <select
                value={cable.tailBTypeId ?? ''}
                onChange={(e) => patch((c) => ({ ...c, tailBTypeId: e.target.value || null }))}
              >
                <option value="">None</option>
                {tailTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="row2">
          <label className="field">
            <span>Deployment</span>
            <select value={cable.deployment} onChange={(e) => setDeployment(e.target.value as Deployment)}>
              {DEPLOYMENTS.map((d) => (
                <option key={d} value={d}>
                  {d[0].toUpperCase() + d.slice(1)}
                </option>
              ))}
            </select>
          </label>
          {cable.deployment === 'interconnect' && (
            <label className="field">
              <span>Rack</span>
              <select
                value={cable.rackId ?? ''}
                onChange={(e) => {
                  if (e.target.value === '__new') setAskingRack(true)
                  else patch((c) => joinRack(c, e.target.value || null))
                }}
              >
                <option value="">{show.racks.length ? 'Choose…' : 'No racks yet'}</option>
                {show.racks.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name || 'Unnamed rack'}
                  </option>
                ))}
                <option value="__new">+ New rack…</option>
              </select>
            </label>
          )}
          {cable.deployment === 'bundled' && (
            <label className="field">
              <span>Bundle</span>
              <select value={cable.bundleId ?? ''} onChange={(e) => setBundle(e.target.value || null)}>
                <option value="">{show.bundles.length ? 'Choose…' : 'No bundles yet'}</option>
                {show.bundles.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name || 'Unnamed bundle'}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="field">
          <span>Color code{cable.color ? ` · ${colorName(cable.color)}` : ''}</span>
          <div className="swatches">
            <button
              className={cable.color ? 'swatch none' : 'swatch none active'}
              title="No color"
              aria-label="No color"
              onClick={() => setColor(null)}
            />
            {CABLE_COLORS.map((col) => (
              <button
                key={col.hex}
                className={cable.color?.toLowerCase() === col.hex ? 'swatch active' : 'swatch'}
                style={{ background: col.hex }}
                title={col.name}
                aria-label={col.name}
                onClick={() => setColor(col.hex)}
              />
            ))}
            <label className="swatch custom" title="Custom color">
              <input
                type="color"
                aria-label="Custom color"
                value={cable.color ?? '#cccccc'}
                onChange={(e) => setColor(e.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="row2">
          <label className="field">
            <span>From (End A)</span>
            <input
              list="locations"
              value={cable.from}
              placeholder="e.g. Amp Room"
              onChange={(e) => patch((c) => ({ ...c, from: e.target.value }))}
            />
          </label>
          <label className="field">
            <span>To (End B)</span>
            <input
              list="locations"
              value={cable.to}
              placeholder="e.g. Box Boom HL"
              onChange={(e) => patch((c) => ({ ...c, to: e.target.value }))}
            />
          </label>
        </div>

        <div className="row2 steck-row">
          {(['A', 'B'] as const).map((end) => {
            const key = end === 'A' ? 'steckA' : 'steckB'
            return (
              <label key={end} className="check inline small" title="This end mounts in a steck; prints a steck label">
                <input type="checkbox" checked={cable[key]} onChange={(e) => patch((c) => ({ ...c, [key]: e.target.checked }))} />
                <span className="clip-label">{endLabel(`Steck · End ${end}`, end)}</span>
              </label>
            )
          })}
        </div>

        <h3>
          🔗 Linked cables{path.length > 0 && <span className="muted"> ({path.length})</span>}
        </h3>
        {path.length > 0 ? (
          <>
            <p className="muted small">
              One signal path. Cables join with this cable's name and color; names can be changed, and the color stays shared.
            </p>
            <ol className="link-path">
              {path.map((c, i) => (
                <li key={c.id} className={c.id === cable.id ? 'current' : undefined}>
                  <span className="num muted">{i + 1}</span>
                  <span className="link-name">
                    {c.color && <span className="dot" style={{ background: c.color }} />}
                    {c.id === cable.id ? (
                      <strong>{c.name || 'Unnamed'}</strong>
                    ) : (
                      <button className="link" onClick={() => onSelect(c.id)} title="Open this cable">
                        {c.name || 'Unnamed'}
                      </button>
                    )}
                    <span className="muted small">
                      {' · '}
                      {typeById(show, c.typeId)?.name ?? 'Missing type'}
                      {where(c) && ` · ${where(c)}`}
                    </span>
                  </span>
                  <span className="link-actions">
                    <button className="icon" disabled={i === 0} aria-label="Move earlier" title="Move earlier" onClick={() => update((s) => moveInLink(s, c.id, -1))}>
                      ↑
                    </button>
                    <button
                      className="icon"
                      disabled={i === path.length - 1}
                      aria-label="Move later"
                      title="Move later"
                      onClick={() => update((s) => moveInLink(s, c.id, 1))}
                    >
                      ↓
                    </button>
                    <button className="icon" aria-label={`Unlink ${c.name || 'cable'}`} title="Unlink" onClick={() => update((s) => unlinkCable(s, c.id))}>
                      ×
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="muted small">Not linked. Link the cables that make one signal path, e.g. interconnect → bundled cable → interconnect.</p>
        )}
        <div className="link-controls">
          <select value="" onChange={(e) => e.target.value && addLinked(e.target.value)} disabled={linkable.length === 0}>
            <option value="">Add linked cable…</option>
            {linkable.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || 'Unnamed'}
                {c.linkId && linkedCables(show, c).length ? ' (leaves its current path)' : ''}
              </option>
            ))}
          </select>
          <button onClick={newLinked}>+ New linked cable</button>
          {path.length > 0 && (
            <button onClick={applyNameToLinked} title="Give every cable in this path this cable's name">
              Apply name to linked
            </button>
          )}
        </div>

        <h3>Length</h3>
        <datalist id={lengthListId}>
          {type?.lengths.map((n) => <option key={n} value={n} />)}
        </datalist>
        <div className="segments">
          {cable.segments.map((g, i) => (
            <div className="segment" key={g.id}>
              <span className="segment-label">{g.extension ? `Extension ${i}` : 'Main'}</span>
              <input
                type="number"
                min="0"
                step="any"
                list={lengthListId}
                value={g.length ?? ''}
                placeholder="ft"
                onChange={(e) => setSegmentLength(g.id, e.target.value)}
              />
              <span className="muted">ft</span>
              {g.extension && (
                <button className="icon" onClick={() => removeSegment(g.id)} aria-label="Remove extension">
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        {mismatch && (
          <p className="flag">
            ⚠ Doesn't match {mismatch.name || 'its bundle'}, which is {mismatch.length}'.
          </p>
        )}
        <button onClick={() => setExtending(true)}>Create extension</button>

        <h3>
          Tails <span className="muted">({tails.length})</span>
        </h3>
        <p className="muted small">
          Patch A is where each connector plugs in at End A (the From location), Patch B at End B (the To location),
          so each Patch column has one cell per connector on that end, filling from the top. It prints after the arrow on
          that end's labels.
          Paste a list into any column to fill the tails below it. Shift-click down a column to select
          several cells, then paste to fill them or press Delete to clear them.
        </p>
        <table
          className="tails"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSel(null)
          }}
        >
          <thead>
            <tr>
              <th />
              <th>Name</th>
              <th className="clip-label" title={endLabel('Patch A', 'A')}>
                {endLabel('Patch A', 'A')}
              </th>
              <th className="clip-label" title={endLabel('Patch B', 'B')}>
                {endLabel('Patch B', 'B')}
              </th>
            </tr>
          </thead>
          <tbody>
            {tails.map((t, i) => (
              <tr key={t.number}>
                <td className="num muted">{t.number}</td>
                <td>{tailInput('name', i, i === 0 ? 'e.g. Main HL' : '')}</td>
                <td>{i < countA && tailInput('patchA', i, patchHint('patchA', i, 'e.g. Amp 1-A'))}</td>
                <td>{i < countB && tailInput('patchB', i, patchHint('patchB', i, 'e.g. AR133-1 - out'))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <label className="field">
          <span>Notes</span>
          <textarea
            rows={3}
            value={cable.notes}
            onChange={(e) => patch((c) => ({ ...c, notes: e.target.value }))}
          />
        </label>

        <div className="editor-actions">
          <button onClick={duplicate}>Duplicate</button>
          <button className="danger" onClick={remove}>
            Delete cable
          </button>
        </div>
      </div>

      {askingRack && (
        <PromptDialog
          title="Rack name"
          detail={`Which rack does ${cable.name || 'this interconnect'} patch inside?`}
          label="Rack"
          initial={rack?.name ?? ''}
          suggestions={rackNames}
          confirmLabel="Set rack"
          onCancel={() => setAskingRack(false)}
          onConfirm={(name) => {
            setRackByName(name)
            setAskingRack(false)
          }}
        />
      )}

      {extending && (
        <LengthDialog
          title="Create extension"
          detail={`Adds an extension piece of ${type?.name ?? 'this cable'} to ${cable.name || 'this cable'}.`}
          suggestions={type?.lengths ?? []}
          onCancel={() => setExtending(false)}
          onConfirm={(length) => {
            patch((c) => addExtension(c, length))
            setExtending(false)
          }}
        />
      )}
    </aside>
  )
}
