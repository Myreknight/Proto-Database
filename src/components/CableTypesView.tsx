import { useMemo, useState } from 'react'
import type { Update } from '../App'
import { cableTypesFromCsv, cableTypesToCsv, parseLengths } from '../csv'
import { downloadText, pickTextFile, safeFilename } from '../files'
import { newId } from '../ids'
import { typeUsage } from '../show'
import { PARTS, type CableType, type Part, type Show } from '../types'

interface Props {
  show: Show
  update: Update
}

// Keeps a draft while typing so "10;" doesn't collapse to "10" mid-edit.
function LengthsInput({ value, onCommit }: { value: number[]; onCommit: (v: number[]) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      className="lengths"
      value={draft ?? value.join(';')}
      onFocus={() => setDraft(value.join(';'))}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft != null) onCommit(parseLengths(draft))
        setDraft(null)
      }}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

export function CableTypesView({ show, update }: Props) {
  const [query, setQuery] = useState('')
  const [part, setPart] = useState<Part | ''>('')
  const [notice, setNotice] = useState<string | null>(null)
  const [newTypeId, setNewTypeId] = useState<string | null>(null)

  const duplicates = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of show.cableTypes) {
      const key = t.name.trim().toLowerCase()
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return new Set([...counts].filter(([, n]) => n > 1).map(([k]) => k))
  }, [show.cableTypes])

  const rows = show.cableTypes.filter((t) => {
    if (part && t.part !== part) return false
    const q = query.trim().toLowerCase()
    if (!q) return true
    return [t.name, t.endA, t.endB, t.notes].some((v) => v.toLowerCase().includes(q))
  })

  const patchType = (id: string, changes: Partial<CableType>) =>
    update((s) => ({
      ...s,
      cableTypes: s.cableTypes.map((t) => (t.id === id ? { ...t, ...changes } : t)),
    }))

  const addType = () => {
    const type: CableType = {
      id: newId(),
      name: '',
      part: part || 'Cable',
      channels: 1,
      endA: '',
      endB: '',
      lengths: [],
      notes: '',
    }
    update((s) => ({ ...s, cableTypes: [type, ...s.cableTypes] }))
    setNewTypeId(type.id)
    setQuery('')
  }

  const removeType = (type: CableType) => {
    if (!confirm(`Delete the cable type "${type.name || 'unnamed'}"?`)) return
    update((s) => ({ ...s, cableTypes: s.cableTypes.filter((t) => t.id !== type.id) }))
  }

  // Merges by name: matching names are updated in place (cables keep pointing at them),
  // new names are added, and types missing from the file are left alone.
  const importCsv = async () => {
    const text = await pickTextFile('.csv,text/csv')
    if (text == null) return
    const { types, warnings } = cableTypesFromCsv(text)
    if (types.length === 0) {
      setNotice(`Nothing imported. ${warnings.join(' ')}`)
      return
    }
    let updated = 0
    let added = 0
    const incomingNames = new Set(types.map((t) => t.name.toLowerCase()))
    const kept = show.cableTypes.filter((t) => !incomingNames.has(t.name.toLowerCase())).length
    const merged = [...show.cableTypes]
    for (const t of types) {
      const i = merged.findIndex((m) => m.name.toLowerCase() === t.name.toLowerCase())
      if (i >= 0) {
        merged[i] = { ...t, id: merged[i].id }
        updated++
      } else {
        merged.push(t)
        added++
      }
    }
    update((s) => ({ ...s, cableTypes: merged }))
    setNotice(
      [
        `Imported ${types.length} types: ${updated} updated, ${added} added.`,
        kept ? `${kept} existing types weren't in the file and were kept.` : '',
        ...warnings,
      ]
        .filter(Boolean)
        .join(' '),
    )
  }

  const exportCsv = () =>
    downloadText(
      `${safeFilename(show.name)} Cable Types.csv`,
      cableTypesToCsv(show.cableTypes),
      'text/csv',
    )

  return (
    <section className="pane">
      <div className="toolbar">
        <button className="primary" onClick={addType}>
          Add cable type
        </button>
        <input
          className="search"
          type="search"
          placeholder="Search names, connectors, notes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={part} onChange={(e) => setPart(e.target.value as Part | '')}>
          <option value="">All parts</option>
          {PARTS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <button onClick={importCsv}>Import CSV…</button>
        <button onClick={exportCsv}>Export CSV</button>
      </div>

      <p className="legend muted small">
        <strong>End A / End B</strong> are the connectors at each physical end. A Trunk has its
        multipin (or NL4/NL8) at both ends. A Tail plugs into the trunk with End A, and End B is the fan
        or box that does the patching.
      </p>

      {notice && (
        <div className="notice">
          <span>{notice}</span>
          <button className="icon" onClick={() => setNotice(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <div className="table-wrap">
        <table className="grid editable">
          <thead>
            <tr>
              <th>Name</th>
              <th>Part</th>
              <th className="num">Ch</th>
              <th>End A</th>
              <th>End B</th>
              <th>Standard lengths (ft)</th>
              <th>Notes</th>
              <th className="num">Used</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const used = typeUsage(show, t.id)
              const dup = duplicates.has(t.name.trim().toLowerCase())
              return (
                <tr key={t.id}>
                  <td>
                    <input
                      autoFocus={t.id === newTypeId}
                      className={dup || !t.name.trim() ? 'name invalid' : 'name'}
                      title={dup ? 'Another type has this name' : undefined}
                      value={t.name}
                      placeholder="Type name"
                      onChange={(e) => patchType(t.id, { name: e.target.value })}
                    />
                  </td>
                  <td>
                    <select className="part" value={t.part} onChange={(e) => patchType(t.id, { part: e.target.value as Part })}>
                      {PARTS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num">
                    <input
                      className="narrow"
                      type="number"
                      min="1"
                      value={t.channels}
                      onChange={(e) =>
                        patchType(t.id, { channels: Math.max(1, Math.floor(Number(e.target.value) || 1)) })
                      }
                    />
                  </td>
                  <td>
                    <input className="end" value={t.endA} onChange={(e) => patchType(t.id, { endA: e.target.value })} />
                  </td>
                  <td>
                    <input className="end" value={t.endB} onChange={(e) => patchType(t.id, { endB: e.target.value })} />
                  </td>
                  <td>
                    <LengthsInput value={t.lengths} onCommit={(lengths) => patchType(t.id, { lengths })} />
                  </td>
                  <td>
                    <input
                      className="wide"
                      value={t.notes}
                      onChange={(e) => patchType(t.id, { notes: e.target.value })}
                    />
                  </td>
                  <td className="num muted">{used || ''}</td>
                  <td className="num">
                    <button
                      className="icon"
                      disabled={used > 0}
                      title={used ? `Used by ${used} cable(s)` : 'Delete type'}
                      aria-label="Delete type"
                      onClick={() => removeType(t)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted pad">No cable types match.</p>}
      </div>
    </section>
  )
}
