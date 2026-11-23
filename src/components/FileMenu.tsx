import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

// New / Open / Save live behind one button so none of them get hit by accident. On the
// web, Shows… switches between this device's show and shared ones.
export function FileMenu({
  onSave,
  onOpen,
  onNew,
  onShows,
  onMembers,
}: {
  onSave: () => void
  onOpen: () => void
  onNew: () => void
  onShows?: () => void
  // Only while a shared show is open.
  onMembers?: () => void
}) {
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
          {onShows && (
            <>
              <button role="menuitem" onClick={run(onShows)}>
                <span>Shows…</span>
              </button>
              {onMembers && (
                <button role="menuitem" onClick={run(onMembers)}>
                  <span>Members…</span>
                </button>
              )}
              <div className="menu-sep" role="separator" />
            </>
          )}
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
