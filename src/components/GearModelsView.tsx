import { useState, type ReactNode } from 'react'
import type { Update } from '../App'
import { gearModelsFromCsv, parseRu } from '../csv'
import { downloadText, pickTextFile, safeFilename } from '../files'
import {
  addUnitsOfModel,
  applyStarterModels,
  gearModelsToCsv,
  mergeGearModels,
  modelKey,
  renameGearModel,
  starterChanges,
} from '../gear'
import { newId } from '../ids'
import { expandPorts } from '../ports'
import type { GearModel, Show } from '../types'
import { AddFromModelDialog } from './AddFromModelDialog'

interface Props {
  show: Show
  update: Update
  toolbar: ReactNode
  // After gear of a model is added: show it in Units.
  onAdded: (gearId: string) => void
}

// Keeps a draft while typing, so renaming a model (and its units) happens once, on blur.
function DraftInput({
  value,
  onCommit,
  className,
  placeholder,
  autoFocus,
}: {
  value: string
  onCommit: (value: string) => void
  className?: string
  placeholder?: string
  autoFocus?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      className={className}
      autoFocus={autoFocus}
      placeholder={placeholder}
      value={draft ?? value}
      onFocus={() => setDraft(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft != null && draft !== value) onCommit(draft)
        setDraft(null)
      }}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

export function GearModelsView({ show, update, toolbar, onAdded }: Props) {
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [newModelId, setNewModelId] = useState<string | null>(null)
  const [adding, setAdding] = useState<GearModel | null>(null)
  const starter = starterChanges(show)

  const units = new Map<string, number>()
  for (const g of show.gear) {
    const key = modelKey(g.manufacturer, g.model)
    if (key) units.set(key, (units.get(key) ?? 0) + 1)
  }
  const keyCounts = new Map<string, number>()
  for (const m of show.gearModels) {
    const key = modelKey(m.manufacturer, m.model)
    if (key) keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1)
  }

  const q = query.trim().toLowerCase()
  const rows = show.gearModels.filter(
    (m) =>
      !q ||
      [m.manufacturer, m.model, m.ports, m.notes, show.gearCategories.find((c) => c.id === m.categoryId)?.name ?? '']
        .some((v) => v.toLowerCase().includes(q)),
  )

  const patchModel = (id: string, changes: Partial<GearModel>) =>
    update((s) => ({ ...s, gearModels: s.gearModels.map((m) => (m.id === id ? { ...m, ...changes } : m)) }))

  const addModel = () => {
    const model: GearModel = {
      id: newId(),
      manufacturer: '',
      model: '',
      categoryId: null,
      ru: null,
      halfWidth: false,
      steck: false,
      ports: '',
      notes: '',
    }
    update((s) => ({ ...s, gearModels: [model, ...s.gearModels] }))
    setNewModelId(model.id)
    setQuery('')
  }

  const removeModel = (m: GearModel) => {
    const n = units.get(modelKey(m.manufacturer, m.model) ?? '') ?? 0
    const name = [m.manufacturer, m.model].filter(Boolean).join(' ') || 'this model'
    const msg = n
      ? `Delete ${name}? Its ${n} unit(s) keep their make and model but lose the shared ports.`
      : `Delete ${name}?`
    if (!confirm(msg)) return
    update((s) => ({ ...s, gearModels: s.gearModels.filter((x) => x.id !== m.id) }))
  }

  // Merges by manufacturer and model: matches are updated, new models added, and models
  // missing from the file are left alone.
  const importCsv = async () => {
    const text = await pickTextFile('.csv,text/csv')
    if (text == null) return
    const { rows: incoming, warnings } = gearModelsFromCsv(text)
    if (incoming.length === 0) {
      setNotice(`Nothing imported. ${warnings.join(' ')}`)
      return
    }
    const result = mergeGearModels(show, incoming, 'replace')
    update(() => result.show)
    setNotice(
      [
        `Imported ${incoming.length} models: ${result.updated} updated, ${result.added} added.`,
        result.newCategories.length ? `New categories: ${result.newCategories.join(', ')}.` : '',
        ...warnings,
      ]
        .filter(Boolean)
        .join(' '),
    )
  }

  const exportCsv = () =>
    downloadText(`${safeFilename(show.name)} Gear Models.csv`, gearModelsToCsv(show), 'text/csv')

  const addStarters = () => {
    const result = applyStarterModels(show)
    update(() => result.show)
    setNotice(
      [
        result.added ? `Added ${result.added} starter model${result.added === 1 ? '' : 's'}.` : '',
        result.updated ? `Filled blanks in ${result.updated} model${result.updated === 1 ? '' : 's'}.` : '',
      ]
        .filter(Boolean)
        .join(' '),
    )
  }

  return (
    <section className="pane">
      <div className="toolbar">
        {toolbar}
        <button className="primary" onClick={addModel}>
          Add model
        </button>
        <input
          className="search"
          type="search"
          placeholder="Search models, makers, ports…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="spacer" />
        {starter.missing + starter.fills > 0 && (
          <button
            onClick={addStarters}
            title={`Adds ${starter.missing} model(s) from the starter list and fills blank rack sizes, ports and categories in ${starter.fills} more. Nothing you've entered is overwritten.`}
          >
            Update from starter list
          </button>
        )}
        <button onClick={importCsv}>Import CSV…</button>
        <button onClick={exportCsv} disabled={show.gearModels.length === 0}>
          Export CSV
        </button>
      </div>

      <p className="legend muted small">
        Every unit with the same manufacturer and model shares that model's rack size (RU, 1U = 1.75 in), width and ports. Type a
        model on a unit and it picks up the maker and category from here. Ports are ranges like <strong>In A-D, Out 1-4, Net Pri</strong>; put a name in
        quotes (<strong>"In 1-8"</strong>) to keep it as one port. A <strong>Steck</strong> model is a steck rail or panel:
        its ports are the slots tail connectors mount in. Starter port lists are drafts: check them against the
        spec sheet.
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
        <table className="grid editable models">
          <thead>
            <tr>
              <th>Manufacturer</th>
              <th>Model</th>
              <th>Category</th>
              <th className="num">RU</th>
              <th title="Half the rack's width, so two sit side by side">Half</th>
              <th title="A steck rail or panel: its ports are slots for tail connectors">Steck</th>
              <th>Ports</th>
              <th>Notes</th>
              <th className="num">Units</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const key = modelKey(m.manufacturer, m.model)
              const used = key ? (units.get(key) ?? 0) : 0
              const dup = !!key && (keyCounts.get(key) ?? 0) > 1
              const count = expandPorts(m.ports).length
              return (
                <tr key={m.id}>
                  <td>
                    <DraftInput
                      className="end"
                      autoFocus={m.id === newModelId}
                      value={m.manufacturer}
                      placeholder="Manufacturer"
                      onCommit={(v) => update((s) => renameGearModel(s, m.id, v, m.model))}
                    />
                  </td>
                  <td>
                    <DraftInput
                      className={dup || !m.model.trim() ? 'end invalid' : 'end'}
                      value={m.model}
                      placeholder="Model"
                      onCommit={(v) => update((s) => renameGearModel(s, m.id, m.manufacturer, v))}
                    />
                    {dup && <span className="warn small"> Listed twice</span>}
                  </td>
                  <td>
                    <select value={m.categoryId ?? ''} onChange={(e) => patchModel(m.id, { categoryId: e.target.value || null })}>
                      <option value="">Uncategorized</option>
                      {show.gearCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name || 'Unnamed category'}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num">
                    <input
                      className="narrow"
                      type="number"
                      min="0"
                      step="1"
                      value={m.ru ?? ''}
                      aria-label="Rack units"
                      onChange={(e) => patchModel(m.id, { ru: parseRu(e.target.value) })}
                    />
                  </td>
                  <td className="center">
                    <input
                      type="checkbox"
                      checked={m.halfWidth}
                      aria-label="Half width"
                      onChange={(e) => patchModel(m.id, { halfWidth: e.target.checked })}
                    />
                  </td>
                  <td className="center">
                    <input
                      type="checkbox"
                      checked={m.steck}
                      aria-label="Steck rail"
                      onChange={(e) => patchModel(m.id, { steck: e.target.checked })}
                    />
                  </td>
                  <td>
                    <input
                      className="ports"
                      value={m.ports}
                      title={count ? `${count} port${count === 1 ? '' : 's'}` : undefined}
                      onChange={(e) => patchModel(m.id, { ports: e.target.value })}
                    />
                  </td>
                  <td>
                    <input className="notes" value={m.notes} onChange={(e) => patchModel(m.id, { notes: e.target.value })} />
                  </td>
                  <td className="num muted">{used || ''}</td>
                  <td className="num nowrap">
                    <button
                      className="small add-unit"
                      disabled={!m.model.trim()}
                      title={`Add gear of this model to the show`}
                      onClick={() => setAdding(m)}
                    >
                      Add
                    </button>
                    <button
                      className="icon"
                      title="Delete model"
                      aria-label={`Delete ${m.model || 'model'}`}
                      onClick={() => removeModel(m)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="muted pad">{show.gearModels.length ? `No models match “${query}”.` : 'No models yet.'}</p>
        )}
      </div>
      {adding && (
        <AddFromModelDialog
          show={show}
          model={adding}
          onCancel={() => setAdding(null)}
          onAdd={(opts) => {
            const result = addUnitsOfModel(show, adding, opts)
            update(() => result.show)
            setAdding(null)
            onAdded(result.gearId)
          }}
        />
      )}
    </section>
  )
}
