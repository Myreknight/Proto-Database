import { useState } from 'react'

interface Props {
  title: string
  detail: string
  suggestions: number[]
  onConfirm: (length: number) => void
  onCancel: () => void
}

export function LengthDialog({ title, detail, suggestions, onConfirm, onCancel }: Props) {
  const [value, setValue] = useState('')
  const length = Number(value)
  const valid = value.trim() !== '' && Number.isFinite(length) && length > 0

  return (
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <form
        className="dialog"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (valid) onConfirm(length)
        }}
      >
        <h2>{title}</h2>
        <p className="muted">{detail}</p>
        <label className="field">
          <span>Length (ft)</span>
          <input
            autoFocus
            type="number"
            min="0"
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onCancel()}
          />
        </label>
        {suggestions.length > 0 && (
          <div className="chips">
            {suggestions.map((n) => (
              <button type="button" key={n} className="chip" onClick={() => setValue(String(n))}>
                {n}'
              </button>
            ))}
          </div>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={!valid}>
            Create extension
          </button>
        </div>
      </form>
    </div>
  )
}
