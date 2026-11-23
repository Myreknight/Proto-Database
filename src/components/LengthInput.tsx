import { useState } from 'react'
import { fromUnits, toUnits, type SwitchLabelStyle } from '../switchLabels'

type Units = SwitchLabelStyle['units']

// A length kept in mm, shown and typed in inches or mm. What's typed stays as typed
// while it means the same number ("0.0" on the way to "0.05").
export function LengthInput({ mm, units, label, min = 0, onSet }: { mm: number; units: Units; label: string; min?: number; onSet: (mm: number) => void }) {
  const shown = toUnits(mm, units)
  const [draft, setDraft] = useState(String(shown))
  const [was, setWas] = useState(shown)
  if (was !== shown) {
    setWas(shown)
    if (Number(draft) !== shown) setDraft(String(shown))
  }
  return (
    <input
      type="number"
      step={units === 'in' ? 0.05 : 0.5}
      min={min}
      value={draft}
      aria-label={label}
      onChange={(e) => {
        setDraft(e.target.value)
        const n = Number(e.target.value)
        if (e.target.value.trim() !== '' && Number.isFinite(n) && n >= min) onSet(fromUnits(n, units))
      }}
    />
  )
}
