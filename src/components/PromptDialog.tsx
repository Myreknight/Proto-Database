import { useState } from 'react'

interface Props {
  title: string
  detail: string
  label: string
  initial: string
  suggestions: string[]
  confirmLabel: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

// A one-field prompt, e.g. asking which rack an interconnect lives in.
export function PromptDialog({ title, detail, label, initial, suggestions, confirmLabel, onConfirm, onCancel }: Props) {
  const [value, setValue] = useState(initial)
  const listId = 'prompt-suggestions'

  return (
    <div className="dialog-backdrop" onMouseDown={onCancel}>
      <form
        className="dialog"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          onConfirm(value.trim())
        }}
      >
        <h2>{title}</h2>
        <p className="muted">{detail}</p>
        <label className="field">
          <span>{label}</span>
          <input
            autoFocus
            list={listId}
            value={value}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onCancel()}
          />
        </label>
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        {suggestions.length > 0 && (
          <div className="chips">
            {suggestions.map((s) => (
              <button type="button" key={s} className="chip" onClick={() => setValue(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            Skip
          </button>
          <button type="submit" className="primary">
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
