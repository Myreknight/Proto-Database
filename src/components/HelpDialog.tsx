import { useEffect, useRef } from 'react'
import tips from '../../site/TIPS.md?raw'
import { Markdown } from './Markdown'

// The tips page in the app, opened with ? or the ? button. It's the same file the public
// repo shows (site/TIPS.md), so the two never disagree; its # line is the dialog's title.
const titled = tips.match(/^#\s+(.*)\r?\n([\s\S]*)$/)
const TITLE = titled?.[1].trim() ?? 'Tips and shortcuts'
const BODY = titled?.[2] ?? tips

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const body = useRef<HTMLDivElement>(null)

  // Focus goes into the tips, so the arrow keys and Space scroll them, and comes back to
  // where it was when they close.
  useEffect(() => {
    const before = document.activeElement
    body.current?.focus()
    return () => {
      if (before instanceof HTMLElement) before.focus()
    }
  }, [])

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog help-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={TITLE}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <div className="help-head">
          <h2>{TITLE}</h2>
          <button className="icon" onClick={onClose} aria-label="Close tips">
            ×
          </button>
        </div>
        <div className="help-body" ref={body} tabIndex={-1}>
          <Markdown source={BODY} idPrefix="tips-" />
        </div>
      </div>
    </div>
  )
}
