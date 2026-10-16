import { useState } from 'react'
import type { Update } from '../App'
import {
  addExtension,
  bundleFlags,
  bundleLengthMismatch,
  describeLength,
  joinBundle,
  typeById,
  visibleTails,
} from '../show'
import type { Bundle, Show } from '../types'
import { LengthDialog } from './LengthDialog'

interface Props {
  show: Show
  bundle: Bundle
  update: Update
  onClose: () => void
  onOpenCable: (id: string) => void
}

export function BundlePane({ show, bundle, update, onClose, onOpenCable }: Props) {
  const [extending, setExtending] = useState(false)
  const cables = show.cables.filter((c) => c.bundleId === bundle.id)
  const others = show.cables.filter((c) => c.bundleId !== bundle.id)
  const mismatched = cables.filter((c) => bundleLengthMismatch(show, c)).length
  const totalTails = cables.reduce((n, c) => n + visibleTails(show, c).length, 0)
  const flags = bundleFlags(show, bundle.id)

  const setFlag = (cableId: string, end: 'A' | 'B' | null) =>
    update((s) => ({ ...s, cables: s.cables.map((c) => (c.id === cableId ? { ...c, flagEnd: end } : c)) }))

  const patchBundle = (changes: Partial<Bundle>) =>
    update((s) => ({ ...s, bundles: s.bundles.map((b) => (b.id === bundle.id ? { ...b, ...changes } : b)) }))

  const setCableBundle = (cableId: string, join: boolean) =>
    update((s) => ({
      ...s,
      cables: s.cables.map((c) => {
        if (c.id !== cableId) return c
        return join ? joinBundle(c, bundle) : { ...c, bundleId: null, deployment: 'loose', flagEnd: null }
      }),
    }))

  // The extension lengthens the whole bundle, so the bundle length grows with its cables.
  const extendBundle = (length: number) =>
    update((s) => ({
      ...s,
      bundles: s.bundles.map((b) =>
        b.id === bundle.id && b.length != null ? { ...b, length: b.length + length } : b,
      ),
      cables: s.cables.map((c) => (c.bundleId === bundle.id ? addExtension(c, length) : c)),
    }))

  const remove = () => {
    const msg = cables.length
      ? `Delete ${bundle.name || 'this bundle'}? Its ${cables.length} cable(s) will become loose.`
      : `Delete ${bundle.name || 'this bundle'}?`
    if (!confirm(msg)) return
    update((s) => ({
      ...s,
      bundles: s.bundles.filter((b) => b.id !== bundle.id),
      cables: s.cables.map((c) =>
        c.bundleId === bundle.id ? { ...c, bundleId: null, deployment: 'loose', flagEnd: null } : c,
      ),
    }))
    onClose()
  }

  const suggestions = [
    ...new Set(cables.flatMap((c) => typeById(show, c.typeId)?.lengths ?? [])),
  ].sort((a, b) => a - b)

  return (
    <aside className="editor">
      <div className="editor-head">
        <h2>{bundle.name || 'Unnamed bundle'}</h2>
        <button className="icon" onClick={onClose} aria-label="Close bundle">
          ×
        </button>
      </div>

      <div className="editor-body">
        <label className="field">
          <span>Bundle name</span>
          <input
            autoFocus={!bundle.name}
            value={bundle.name}
            placeholder="e.g. HL Proscenium"
            onChange={(e) => patchBundle({ name: e.target.value })}
          />
        </label>
        <div className="row2">
          <label className="field">
            <span>From</span>
            <input list="locations" value={bundle.from} onChange={(e) => patchBundle({ from: e.target.value })} />
          </label>
          <label className="field">
            <span>To</span>
            <input list="locations" value={bundle.to} onChange={(e) => patchBundle({ to: e.target.value })} />
          </label>
        </div>
        <div className="row2">
          <label className="field">
            <span>Length (ft)</span>
            <input
              type="number"
              min="0"
              step="any"
              value={bundle.length ?? ''}
              onChange={(e) =>
                patchBundle({ length: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })
              }
            />
          </label>
          <div className="field">
            <span>&nbsp;</span>
            <button disabled={cables.length === 0} onClick={() => setExtending(true)}>
              Create extension
            </button>
          </div>
        </div>

        <h3>
          In this bundle{' '}
          <span className="muted">
            ({cables.length} cable{cables.length === 1 ? '' : 's'} · {totalTails} tail{totalTails === 1 ? '' : 's'})
          </span>
        </h3>
        {mismatched > 0 && (
          <p className="flag">
            ⚠ {mismatched} of {cables.length} cable{cables.length === 1 ? '' : 's'}{' '}
            {mismatched === 1 ? "doesn't" : "don't"} match the bundle length of {bundle.length}'.
          </p>
        )}
        {cables.length > 0 && (
          <p className="muted small flag-summary">
            ⚑ {flags.flagged} of {flags.total} flagged
            {flags.place && (
              <>
                {' · '}flagged end: <strong>{flags.place}</strong>
              </>
            )}
          </p>
        )}
        {flags.reversed.size > 0 && (
          <p className="flag">
            ⚠ {flags.reversed.size} cable{flags.reversed.size === 1 ? ' is' : 's are'} flagged at the opposite end from
            the rest of the bundle.
          </p>
        )}

        {cables.length === 0 ? (
          <p className="muted">No cables in this bundle yet.</p>
        ) : (
          <div className="bundle-cables">
            {cables.map((cable) => {
              const type = typeById(show, cable.typeId)
              const tails = visibleTails(show, cable)
              const named = tails.filter((t) => t.name.trim()).length
              const mismatch = bundleLengthMismatch(show, cable)
              const tailA = typeById(show, cable.tailATypeId)
              const tailB = typeById(show, cable.tailBTypeId)
              return (
                <div key={cable.id} className="bundle-cable">
                  <div className="bc-head">
                    <button className="link" onClick={() => onOpenCable(cable.id)} title="Open in Cables">
                      {cable.color && <span className="dot" style={{ background: cable.color }} />}
                      {cable.name || 'Unnamed'}
                    </button>
                    <span className="spacer" />
                    <span className={mismatch ? 'warn nowrap' : 'nowrap'}>
                      {mismatch && '⚠ '}
                      {describeLength(cable) || 'No length'}
                    </span>
                    <button
                      className="icon"
                      title="Remove from bundle"
                      aria-label={`Remove ${cable.name || 'cable'} from bundle`}
                      onClick={() => setCableBundle(cable.id, false)}
                    >
                      ×
                    </button>
                  </div>
                  <div className="muted small">
                    {type?.name ?? 'Missing type'}
                    {type?.part === 'Trunk' && ` · ${tailA?.name ?? 'no tail'} / ${tailB?.name ?? 'no tail'}`}
                  </div>
                  <div className="bc-flag">
                    <span className="muted small">⚑ Flag</span>
                    {(['A', 'B'] as const).map((end) => {
                      const where = end === 'A' ? cable.from : cable.to
                      return (
                        <label key={end} className="check inline small">
                          <input
                            type="checkbox"
                            checked={cable.flagEnd === end}
                            onChange={(e) => setFlag(cable.id, e.target.checked ? end : null)}
                          />
                          End {end}
                          {where && <span className="muted"> · {where}</span>}
                        </label>
                      )
                    })}
                  </div>
                  {flags.reversed.has(cable.id) && (
                    <p className="flag small">
                      ⚠ Flagged at {flags.placeOf(cable)}; the rest of the bundle is flagged at {flags.place}.
                    </p>
                  )}
                  {tails.length > 0 && (
                    <details className="bc-tails">
                      <summary className="small">
                        {tails.length} tail{tails.length === 1 ? '' : 's'} · {named} named
                      </summary>
                      <ol>
                        {tails.map((t) => (
                          <li key={t.number}>
                            <span className="num muted">{t.number}</span>
                            <span>{t.name || <span className="muted">—</span>}</span>
                            {(t.patchA || t.patchB) && (
                              <span className="muted small">
                                {[t.patchA, t.patchB].filter(Boolean).join(' / ')}
                              </span>
                            )}
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <select
          className="add-to-bundle"
          value=""
          onChange={(e) => e.target.value && setCableBundle(e.target.value, true)}
          disabled={others.length === 0}
        >
          <option value="">Add cable to bundle…</option>
          {others.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name || 'Unnamed'}
              {c.bundleId ? ' (moves from another bundle)' : ''}
            </option>
          ))}
        </select>

        <label className="field">
          <span>Notes</span>
          <textarea rows={3} value={bundle.notes} onChange={(e) => patchBundle({ notes: e.target.value })} />
        </label>

        <div className="editor-actions">
          <span />
          <button className="danger" onClick={remove}>
            Delete bundle
          </button>
        </div>
      </div>

      {extending && (
        <LengthDialog
          title="Create extension"
          detail={`Adds an extension to each of the ${cables.length} cables in ${bundle.name || 'this bundle'}${
            bundle.length != null ? ', and the same length to the bundle' : ''
          }.`}
          suggestions={suggestions}
          onCancel={() => setExtending(false)}
          onConfirm={(length) => {
            extendBundle(length)
            setExtending(false)
          }}
        />
      )}
    </aside>
  )
}
