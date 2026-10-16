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
  rackById,
  setTailField,
  type TailField,
  tailOptions,
  typeById,
  visibleTails,
  withType,
} from '../show'
import { DEPLOYMENTS, type Cable, type Deployment, type Show } from '../types'
import { CABLE_COLORS, colorName } from '../colors'
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

  const range = sel ? { lo: Math.min(sel.anchor, sel.focus), hi: Math.max(sel.anchor, sel.focus) } : null
  const multi = !!range && range.hi > range.lo
  const inRange = (field: TailField, i: number) => !!sel && sel.field === field && !!range && i >= range.lo && i <= range.hi

  // Writes one value into every selected cell, or a list of values down from the top of the selection.
  const fillRange = (values: string[]) => {
    if (!sel || !range) return
    const count = range.hi - range.lo + 1
    const list = values.length === 1 ? Array(count).fill(values[0]) : values
    patch((c, s) => setTailField(s, c, sel.field, range.lo, list))
  }

  const rangeText = () => (sel && range ? tails.slice(range.lo, range.hi + 1).map((t) => t[sel.field]).join('\n') : '')

  const moveTo = (field: TailField, index: number, extend: boolean) => {
    if (index < 0 || index >= tails.length) return
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
      placeholder={i === 0 ? placeholder : ''}
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
        patch((c, s) => setTailField(s, c, field, i, [e.target.value]))
      }}
      onPaste={(e) => {
        const lines = e.clipboardData.getData('text').split(/\r?\n/)
        if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
        if (!multi && lines.length < 2) return
        e.preventDefault()
        if (multi) fillRange(lines.map((l) => l.trim()))
        else patch((c, s) => setTailField(s, c, field, i, lines.map((l) => l.trim())))
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
              onClick={() => patch((c) => ({ ...c, color: null }))}
            />
            {CABLE_COLORS.map((col) => (
              <button
                key={col.hex}
                className={cable.color?.toLowerCase() === col.hex ? 'swatch active' : 'swatch'}
                style={{ background: col.hex }}
                title={col.name}
                aria-label={col.name}
                onClick={() => patch((c) => ({ ...c, color: col.hex }))}
              />
            ))}
            <label className="swatch custom" title="Custom color">
              <input
                type="color"
                aria-label="Custom color"
                value={cable.color ?? '#cccccc'}
                onChange={(e) => patch((c) => ({ ...c, color: e.target.value }))}
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
          Patch A is where each tail plugs in at End A (the From location), Patch B at End B (the To location);
          it prints after the arrow on that end's labels.
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
                <td>{tailInput('name', i, 'e.g. Main HL')}</td>
                <td>{tailInput('patchA', i, 'e.g. Amp 1-A')}</td>
                <td>{tailInput('patchB', i, 'e.g. AR133-1 - out')}</td>
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
