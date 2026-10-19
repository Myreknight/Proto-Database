import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import { BundlesView } from './components/BundlesView'
import { CablesView } from './components/CablesView'
import { CableTypesView } from './components/CableTypesView'
import { ChecklistsView } from './components/ChecklistsView'
import { FileMenu } from './components/FileMenu'
import { GearView } from './components/GearView'
import { LabelsView } from './components/LabelsView'
import { PullListView } from './components/PullListView'
import { RacksView } from './components/RacksView'
import { ShowSetupView } from './components/ShowSetupView'
import { AmpDisplay, AmpTitleBar } from './components/WinampDecor'
import { downloadText, pickTextFile, safeFilename } from './files'
import { gearNames, patchReport } from './gear'
import { historyReducer, initHistory, now, typingField } from './history'
import {
  bundleLengthMismatchCount,
  flagReversedCount,
  loadStoredShow,
  locations,
  newShow,
  normalizeShow,
  storeShow,
} from './show'
import type { Show } from './types'

export type Update = (fn: (show: Show) => Show) => void

type Tab = 'setup' | 'cables' | 'bundles' | 'racks' | 'gear' | 'pull' | 'labels' | 'checks' | 'types'

// The Winamp skin is a per-viewer joke, so it lives in browser storage, not the show.
const SKIN_KEY = 'proto-database:skin'

function loadSkin(): boolean {
  try {
    return localStorage.getItem(SKIN_KEY) === 'winamp'
  } catch {
    return false
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
  const [winamp, setWinamp] = useState(loadSkin)

  useEffect(() => {
    document.documentElement.dataset.skin = winamp ? 'winamp' : 'default'
    try {
      localStorage.setItem(SKIN_KEY, winamp ? 'winamp' : 'default')
    } catch {
      // Storage blocked: the skin just won't be remembered.
    }
  }, [winamp])

  useEffect(() => storeShow(show), [show])

  // Which cable ends and patch cells land on which gear ports, shared by every tab.
  const patches = useMemo(() => patchReport(show), [show])

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
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const key = e.key.toLowerCase()
      if (key === 's') {
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
  }, [saveShow, undo, redo])

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
    { id: 'racks', label: 'Interconnects', count: show.racks.length },
    {
      id: 'gear',
      label: 'Gear',
      count: show.gear.length,
      flags: patches.issues,
      flagTitle: `${patches.issues} patch warning(s): ports a model doesn't list, or two cables on one port`,
    },
    { id: 'pull', label: 'Pull List' },
    { id: 'labels', label: 'Labels' },
    { id: 'checks', label: 'Checklists' },
    { id: 'types', label: 'Cable Types', count: show.cableTypes.length },
  ]

  return (
    <div className="app">
      {winamp && <AmpTitleBar />}
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
        {winamp && <AmpDisplay show={show} />}
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
            onClick={() => setWinamp((on) => !on)}
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
          />
        )}
        {tab === 'bundles' && (
          <BundlesView
            show={show}
            update={update}
            selectedId={selectedBundleId}
            onSelect={setSelectedBundleId}
            onOpenCable={openCable}
          />
        )}
        {tab === 'pull' && <PullListView show={show} />}
        {tab === 'labels' && <LabelsView show={show} />}
        {tab === 'checks' && <ChecklistsView show={show} update={update} />}
        {tab === 'types' && <CableTypesView show={show} update={update} />}
      </main>

      <datalist id="locations">
        {[...locations(show), ...patches.freePorts].map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
      <datalist id="steck-slots">
        {patches.freeSteckSlots.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <datalist id="patch-points">
        {[...gearNames(show), ...patches.freePorts].map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </div>
  )
}
