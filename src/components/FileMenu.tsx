import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

// New / Open / Save live behind one button so none of them get hit by accident.
export function FileMenu({ onSave, onOpen, onNew }: { onSave: () => void; onOpen: () => void; onNew: () => void }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open])

  const run = (action: () => void) => () => {
    setOpen(false)
    action()
  }

  // Up/down arrows move between menu items.
  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    const at = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }

  return (
    <div className="menu-wrap" ref={wrapRef}>
      <button
        ref={buttonRef}
        className={open ? 'menu-button open' : 'menu-button'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        File ▾
      </button>
      {open && (
        <div className="menu" role="menu" aria-label="File" onKeyDown={onMenuKey}>
          <button role="menuitem" autoFocus onClick={run(onSave)}>
            <span>Save show file</span>
            <kbd>⌘S</kbd>
          </button>
          <button role="menuitem" onClick={run(onOpen)}>
            <span>Open show file…</span>
          </button>
          <div className="menu-sep" role="separator" />
          <button role="menuitem" className="danger" onClick={run(onNew)}>
            <span>New show…</span>
          </button>
        </div>
      )}
    </div>
  )
}
