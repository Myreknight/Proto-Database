import type { ReactNode } from 'react'

// The top of every printout: its options on the left (wrapping if they need to), then any
// exports, and Print at the far right, in the same spot for every document.
export function PrintBar({
  children,
  actions,
  onPrint,
  disabled,
  label = 'Print…',
  title,
}: {
  children?: ReactNode
  actions?: ReactNode
  onPrint: () => void
  disabled?: boolean
  label?: string
  title?: string
}) {
  return (
    <div className="toolbar print-bar">
      <div className="print-bar-options">{children}</div>
      <div className="print-bar-actions">
        {actions}
        <button className="primary" onClick={onPrint} disabled={disabled} title={title}>
          {label}
        </button>
      </div>
    </div>
  )
}
