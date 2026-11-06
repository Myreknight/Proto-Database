import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { BundlesView } from './components/BundlesView'
import { CablesView } from './components/CablesView'
import { CableTypesView } from './components/CableTypesView'
import { ChecklistsView } from './components/ChecklistsView'
import { FileMenu } from './components/FileMenu'
import { GearView } from './components/GearView'
import { HelpDialog } from './components/HelpDialog'
import { PrintView } from './components/PrintView'
import { RacksView } from './components/RacksView'
import { ShowSetupView } from './components/ShowSetupView'
import { MushroomIcon, PixelHud } from './components/PixelDecor'
import { AmpDisplay, AmpTitleBar } from './components/WinampDecor'
import { downloadText, pickTextFile, safeFilename } from './files'
import { gearNames, patchReport } from './gear'
import { historyReducer, initHistory, now, typingField } from './history'
import { loadPrintDoc, printDocForTab, storePrintDoc, type PrintDoc } from './printDocs'
import {
  bundleLengthMismatchCount,
  flagReversedCount,
  loadStoredShow,
  locations,
  newCable,
  newShow,
  normalizeShow,
  storeShow,
} from './show'
import type { Show } from './types'

export type Update = (fn: (show: Show) => Show) => void

type Tab = 'setup' | 'cables' | 'bundles' | 'racks' | 'gear' | 'checks' | 'print' | 'types'

// Whether a key press is going into a text field (where N is just a letter).
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true
  if (target.tagName !== 'INPUT') return false
  return !['checkbox', 'radio', 'button', 'submit', 'range', 'color'].includes((target as HTMLInputElement).type)
}

// The skins are a per-viewer joke, so they live in browser storage, not the show. ⚡ flips
// Winamp; the mushroom tucked in the bottom-right corner flips 8-bit.
const SKIN_KEY = 'proto-database:skin'
type Skin = 'default' | 'winamp' | 'pixel'

function loadSkin(): Skin {
  try {
    const skin = localStorage.getItem(SKIN_KEY)
    return skin === 'winamp' || skin === 'pixel' ? skin : 'default'
  } catch {
    return 'default'
  }
}

export default function App() {
  const [history, dispatch] = useReducer(historyReducer, undefined, () => initHistory(loadStoredShow()))
  const { show } = history
  const [tab, setTab] = useState<Tab>('cables')
  const [selectedCableId, setSelectedCableId] = useState<string | null>(null)
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null)
  const [selectedRackId, setSelectedRackId] = useState<string | null>(null)
  const [selectedGearId, setSelectedGearId] = useState<string | null>(null)
  const [skin, setSkin] = useState<Skin>(loadSkin)
  const [helpOpen, setHelpOpen] = useState(false)
  const [printDoc, setPrintDoc] = useState<PrintDoc>(loadPrintDoc)
  const winamp = skin === 'winamp'
  const pixel = skin === 'pixel'

  useEffect(() => {
    document.documentElement.dataset.skin = skin
    try {
      localStorage.setItem(SKIN_KEY, skin)
    } catch {
      // Storage blocked: the skin just won't be remembered.
    }
  }, [skin])

  useEffect(() => storeShow(show), [show])
  useEffect(() => storePrintDoc(printDoc), [printDoc])

  // The Print tab, opened on a given document or the last one used.
  const openPrint = useCallback((doc?: PrintDoc) => {
    if (doc) setPrintDoc(doc)
    setTab('print')
  }, [])

  // Which cable ends and patch cells land on which gear ports, shared by every tab.
  const patches = useMemo(() => patchReport(show), [show])
  const places = useMemo(() => locations(show), [show])

  const update: Update = useCallback((fn) => dispatch({ type: 'update', fn, at: now(), field: typingField() }), [])
  const replaceShow = (next: Show) => dispatch({ type: 'replace', show: next, at: now() })
  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])

  const saveShow = useCallback(() => {
    downloadText(
      `${safeFilename(show.name)}.protodb.json`,
      JSON.stringify(show, null, 2),
      'application/json',
    )
  }, [show])

  useEffect(() => {
    // Captured before inputs see it, so ⌘Z is the app's undo even while typing in a field.
    // ⌘P prints from the Print tab; anywhere else it opens the Print tab, on the printout
    // that goes with the tab you're on.
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const key = e.key.toLowerCase()
      if (key === 'p' && !e.shiftKey && !e.altKey) {
        if (tab === 'print') return
        e.preventDefault()
        openPrint(printDocForTab(tab))
      } else if (key === 's') {
        e.preventDefault()
        saveShow()
      } else if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [saveShow, undo, redo, tab, openPrint])

  // A new cable from anywhere, opened in the Cables tab with its name ready to type.
  const addCable = useCallback(() => {
    const cable = newCable(show)
    update((s) => ({ ...s, cables: [...s.cables, cable] }))
    setSelectedCableId(cable.id)
    setTab('cables')
  }, [show, update])

  useEffect(() => {
    // Enter ticks a checkbox (or picks a radio) like Space does, for working without a mouse.
    const onKey = (e: KeyboardEvent) => {
      const t = e.target
      if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.altKey) return
      if (t instanceof HTMLInputElement && (t.type === 'checkbox' || t.type === 'radio')) {
        e.preventDefault()
        t.click()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    // N adds a cable, unless you're typing in a field or a dialog is open.
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      if (isTyping(e.target) || document.querySelector('.dialog-backdrop')) return
      e.preventDefault()
      addCable()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addCable])

  useEffect(() => {
    // ? opens the tips and closes them again, unless you're typing or another dialog is open.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      if (isTyping(e.target) || (!helpOpen && document.querySelector('.dialog-backdrop'))) return
      e.preventDefault()
      setHelpOpen((open) => !open)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [helpOpen])

  const startNewShow = () => {
    if (
      !confirm(
        'Start a new show? This replaces the current show in this browser. Save it first if you want to keep it.',
      )
    )
      return
    replaceShow(newShow())
    setSelectedCableId(null)
    setSelectedBundleId(null)
    setSelectedRackId(null)
    setSelectedGearId(null)
  }

  const openShow = async () => {
    const text = await pickTextFile('.json,application/json')
    if (text == null) return
    try {
      replaceShow(normalizeShow(JSON.parse(text)))
      setSelectedCableId(null)
      setSelectedBundleId(null)
      setSelectedRackId(null)
      setSelectedGearId(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not open that file.')
    }
  }

  const openCable = (id: string) => {
    setSelectedCableId(id)
    setTab('cables')
  }

  const openBundle = (id: string) => {
    setSelectedBundleId(id)
    setTab('bundles')
  }

  const openRack = (id: string) => {
    setSelectedRackId(id)
    setTab('racks')
  }

  const openGear = (id: string) => {
    setSelectedGearId(id)
    setTab('gear')
  }

  const bundleIssues = bundleLengthMismatchCount(show) + flagReversedCount(show)
  const tabs: { id: Tab; label: string; count?: number; flags?: number; flagTitle?: string }[] = [
    { id: 'cables', label: 'Cables', count: show.cables.length },
    {
      id: 'bundles',
      label: 'Bundles',
      count: show.bundles.length,
      flags: bundleIssues,
      flagTitle: `${bundleIssues} bundle warning(s): lengths that don't match, or ends flagged opposite the rest`,
    },
    { id: 'racks', label: 'Racks', count: show.racks.length },
    {
      id: 'gear',
      label: 'Gear',
      count: show.gear.length,
      flags: patches.issues,
      flagTitle: `${patches.issues} patch warning(s): ports a model doesn't list, or two cables on one port`,
    },
    { id: 'checks', label: 'Checklists' },
    { id: 'print', label: 'Print' },
    { id: 'types', label: 'Cable Types', count: show.cableTypes.length },
  ]

  return (
    <div className="app">
      {winamp && <AmpTitleBar />}
      {pixel && <PixelHud show={show} tab={tab} />}
      <header className="topbar">
        <div className="brand">
          Proto Database <span className="version">v{__APP_VERSION__}</span>
        </div>
        {show.info.logo && (
          <button className="topbar-logo" onClick={() => setTab('setup')} title="Show setup">
            <img src={show.info.logo} alt={`${show.name} logo`} />
          </button>
        )}
        <input
          className="show-name"
          aria-label="Show name"
          value={show.name}
          onChange={(e) => update((s) => ({ ...s, name: e.target.value }))}
        />
        {(winamp || pixel) && <AmpDisplay show={show} />}
        <div className="file-actions">
          <button
            className="icon-btn"
            onClick={undo}
            disabled={history.past.length === 0}
            title="Undo (⌘Z)"
            aria-label="Undo"
          >
            ↶
          </button>
          <button
            className="icon-btn"
            onClick={redo}
            disabled={history.future.length === 0}
            title="Redo (⇧⌘Z)"
            aria-label="Redo"
          >
            ↷
          </button>
          <button
            className="skin-toggle"
            aria-pressed={winamp}
            aria-label="Winamp skin"
            title={winamp ? 'Back to the classic skin' : 'Winamp skin (looks only, nothing else changes)'}
            onClick={() => setSkin((s) => (s === 'winamp' ? 'default' : 'winamp'))}
          >
            ⚡
          </button>
          <button
            className={tab === 'setup' ? 'setup-btn active' : 'setup-btn'}
            aria-current={tab === 'setup' ? 'page' : undefined}
            onClick={() => setTab('setup')}
          >
            Show Setup
          </button>
          <FileMenu onSave={saveShow} onOpen={openShow} onNew={startNewShow} />
          <button
            className="icon-btn help-btn"
            onClick={() => setHelpOpen(true)}
            title="Tips and shortcuts (?)"
            aria-label="Tips and shortcuts"
          >
            ?
          </button>
        </div>
      </header>

      <nav className="tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'tab active' : 'tab'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.count != null && <span className="count">{t.count}</span>}
            {!!t.flags && (
              <span className="count flagged" title={t.flagTitle}>
                ⚠ {t.flags}
              </span>
            )}
          </button>
        ))}
      </nav>

      <main className="content">
        {tab === 'setup' && <ShowSetupView show={show} update={update} />}
        {tab === 'cables' && (
          <CablesView
            show={show}
            update={update}
            selectedId={selectedCableId}
            onSelect={setSelectedCableId}
            onOpenBundle={openBundle}
            onOpenRack={openRack}
            onOpenGear={openGear}
            patches={patches}
          />
        )}
        {tab === 'racks' && (
          <RacksView
            show={show}
            update={update}
            selectedId={selectedRackId}
            onSelect={setSelectedRackId}
            onOpenCable={openCable}
            onOpenGear={openGear}
            onOpenPrint={() => openPrint('rack-drawings')}
          />
        )}
        {tab === 'gear' && (
          <GearView
            show={show}
            patches={patches}
            update={update}
            selectedId={selectedGearId}
            onSelect={setSelectedGearId}
            onOpenCable={openCable}
            onOpenRack={openRack}
            onOpenPrint={() => openPrint('gear-list')}
          />
        )}
        {tab === 'bundles' && (
          <BundlesView
            show={show}
            update={update}
            selectedId={selectedBundleId}
            onSelect={setSelectedBundleId}
            onOpenCable={openCable}
            onOpenPrint={() => openPrint('bundle-sheets')}
          />
        )}
        {tab === 'checks' && (
          <ChecklistsView show={show} update={update} onOpenPrint={() => openPrint('checklists')} />
        )}
        {tab === 'print' && (
          <PrintView
            show={show}
            update={update}
            doc={printDoc}
            onDoc={setPrintDoc}
            onOpenBundle={openBundle}
            onOpenGear={openGear}
          />
        )}
        {tab === 'types' && <CableTypesView show={show} update={update} />}
      </main>

      {/* Location fields (racks, bundles) suggest places only. */}
      <datalist id="locations">
        {places.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
      {/* A cable's From/To can be a place or a device's port. */}
      <datalist id="cable-ends">
        {[...new Set([...places, ...gearNames(show), ...patches.freePorts])].map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
      {/* Steck slots with room on the side a cable end would take (see steckFaces). */}
      {(['whole', 'inside', 'outside'] as const).map((face) => (
        <datalist key={face} id={face === 'whole' ? 'steck-slots' : `steck-slots-${face}`}>
          {patches.freeSteckSlots[face].map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      ))}
      <datalist id="patch-points">
        {[...gearNames(show), ...patches.freePorts].map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}

      {/* The 8-bit skin's switch: a mushroom, tucked away in the corner. */}
      <button
        className="mushroom-toggle"
        aria-pressed={pixel}
        aria-label="8-bit skin"
        title={pixel ? 'Back to the classic skin' : '8-bit skin (looks only, nothing else changes)'}
        onClick={() => setSkin((s) => (s === 'pixel' ? 'default' : 'pixel'))}
      >
        <MushroomIcon />
      </button>
    </div>
  )
}
