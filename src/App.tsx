import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { BundlesView } from './components/BundlesView'
import { CablesView } from './components/CablesView'
import { CableTypesView } from './components/CableTypesView'
import { ChecklistsView } from './components/ChecklistsView'
import { ConflictsDialog } from './components/ConflictsDialog'
import { FileMenu } from './components/FileMenu'
import { GearView } from './components/GearView'
import { HelpDialog } from './components/HelpDialog'
import { PrintView } from './components/PrintView'
import { RacksView } from './components/RacksView'
import { ShowSetupView } from './components/ShowSetupView'
import { MembersDialog } from './components/MembersDialog'
import { MushroomIcon, PixelHud } from './components/PixelDecor'
import { PresenceBar } from './components/PresenceBar'
import { ShowsDialog } from './components/ShowsDialog'
import { SignInDialog } from './components/SignInDialog'
import { AmpDisplay, AmpTitleBar } from './components/WinampDecor'
import { onSignedOut, signOutAccount, useAccount } from './cloud/account'
import { firestoreBackend } from './cloud/backend'
import { cloud, cloudAvailable } from './cloud/firebase'
import { checkIn, CHECK_IN_MS, checkOut, isHere, peopleHere, sessionId, watchPresence, type Presence } from './cloud/presence'
import { shareShow } from './cloud/shows'
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
import { keepMine } from './sync/conflicts'
import { heldStore } from './sync/held'
import { diffShows } from './sync/patch'
import { openSession, type Conflict, type Session, type SyncStatus } from './sync/session'
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

// Which show is open: this device's (null), or a shared one by id. Remembered per viewer.
const OPEN_KEY = 'proto-database:open-show'

function loadOpenShared(): string | null {
  try {
    return cloudAvailable() ? localStorage.getItem(OPEN_KEY) : null
  } catch {
    return null
  }
}

// What the shared chip in the top bar says.
function syncText(status: SyncStatus | null): string {
  if (!status || status.state === 'loading') return 'Opening…'
  if (status.state === 'connecting') return 'Connecting…'
  if (status.state === 'offline') return status.unsent ? 'Offline · changes saved here' : 'Offline'
  if (status.state === 'saving') return 'Saving…'
  return 'Synced'
}

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
  // Shared shows: who's signed in, which shared show is open (null: this device's), and
  // how its syncing is going.
  const account = useAccount()
  const uid = account.user?.uid
  const [sharedId, setSharedId] = useState<string | null>(loadOpenShared)
  // The open shared show's sync status (kept with its id, so a switch never shows the last one's).
  const [sync, setSync] = useState<{ id: string; status: SyncStatus } | null>(null)
  const syncStatus = sync && sync.id === sharedId ? sync.status : null
  const sharedRef = useRef(sharedId)
  const [showsOpen, setShowsOpen] = useState(false)
  const [membersOpen, setMembersOpen] = useState(false)
  // Things you and someone else both changed, waiting for you to pick (kept with the show's id).
  const [conflictState, setConflicts] = useState<{ id: string; list: Conflict[] } | null>(null)
  const conflicts = conflictState && conflictState.id === sharedId ? conflictState.list : []
  const [conflictsOpen, setConflictsOpen] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const sessionRef = useRef<Session | null>(null)
  // Who has the shared show open (kept with its id, like the sync status), and a clock
  // that ticks so people drop off once their check-ins stop.
  const [presence, setPresence] = useState<{ id: string; list: Presence[] } | null>(null)
  const [clock, setClock] = useState(() => Date.now())
  const tabLabelRef = useRef('')
  // The show as the session last gave it; what's changed since goes up as one change.
  const baseRef = useRef<Show | null>(null)
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

  // This device's show is kept in the browser; a shared one is kept by Firebase.
  useEffect(() => {
    if (!sharedId) storeShow(show)
  }, [show, sharedId])
  useEffect(() => {
    try {
      if (sharedId) localStorage.setItem(OPEN_KEY, sharedId)
      else localStorage.removeItem(OPEN_KEY)
    } catch {
      // Storage blocked: it opens on this device's show next time.
    }
  }, [sharedId])
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

  const clearSelection = () => {
    setSelectedCableId(null)
    setSelectedBundleId(null)
    setSelectedRackId(null)
    setSelectedGearId(null)
  }

  // Back to this device's show (leaving a shared one, or after losing access to it).
  const openDevice = useCallback((replacement?: Show) => {
    sessionRef.current?.flush()
    setSharedId(null)
    dispatch({ type: 'reset', show: replacement ?? loadStoredShow() })
    clearSelection()
  }, [])

  const openShared = (id: string) => {
    if (id === sharedId) return
    sessionRef.current?.flush()
    setSharedId(id)
    clearSelection()
  }

  // A shared show stays open while its session runs: it loads, then changes from others
  // arrive as they happen, and edits here go up (see the push below).
  useEffect(() => {
    sharedRef.current = sharedId
    if (!sharedId || !uid) return
    baseRef.current = null
    const session = openSession(firestoreBackend(cloud().db, sharedId), {
      show: (next, first) => {
        baseRef.current = next
        dispatch(first ? { type: 'reset', show: next } : { type: 'remote', show: next })
      },
      status: (status) => setSync({ id: sharedId, status }),
      conflicts: (list) => setConflicts({ id: sharedId, list }),
      error: (message) => {
        alert(message)
        openDevice()
      },
    }, { by: uid, store: heldStore(sharedId, uid) })
    sessionRef.current = session
    return () => {
      session.close()
      sessionRef.current = null
      baseRef.current = null
    }
  }, [sharedId, uid, openDevice])

  // Signed out (here, in another tab, or before this visit) with a shared show open: back to
  // this device's show.
  useEffect(() => {
    if (!cloudAvailable()) return
    return onSignedOut(() => {
      if (sharedRef.current) openDevice()
    })
  }, [openDevice])

  // Edits to a shared show go up as changes, field by field.
  useEffect(() => {
    const session = sessionRef.current
    const base = baseRef.current
    if (!session || !base || base === show) return
    session.push(diffShows(base, show))
    baseRef.current = show
  }, [show])

  // Being here: checks in on opening a shared show, every couple of minutes, and on
  // switching tabs; checks out on leaving it or closing the page.
  const presenceSession = useRef<string | null>(null)
  useEffect(() => {
    const user = account.user
    if (!sharedId || !user) return
    const session = sessionId(user)
    presenceSession.current = session
    const beat = () => void checkIn(sharedId, session, user, tabLabelRef.current).catch(() => {})
    let tidied = false
    const unwatch = watchPresence(
      sharedId,
      (list) => {
        setPresence({ id: sharedId, list })
        // Your own windows that closed without checking out go, once.
        if (!tidied) {
          tidied = true
          const now = Date.now()
          for (const p of list) if (p.uid === user.uid && p.id !== session && !isHere(p, now)) void checkOut(sharedId, p.id).catch(() => {})
        }
      },
      () => {},
    )
    beat()
    const timer = setInterval(beat, CHECK_IN_MS)
    const ticker = setInterval(() => setClock(Date.now()), 30_000)
    const leave = () => void checkOut(sharedId, session).catch(() => {})
    window.addEventListener('pagehide', leave)
    return () => {
      clearInterval(timer)
      clearInterval(ticker)
      unwatch()
      window.removeEventListener('pagehide', leave)
      leave()
      presenceSession.current = null
    }
  }, [sharedId, account.user])

  const presenceList = presence && presence.id === sharedId ? presence.list : []
  const othersHere = peopleHere(presenceList, clock).filter((p) => p.uid !== uid)

  // Anything still waiting goes up before the page closes or hides.
  useEffect(() => {
    const flush = () => sessionRef.current?.flush()
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', flush)
    }
  }, [])

  // Puts this device's show online, with you as owner, and opens it there.
  const shareDeviceShow = async () => {
    if (!account.user) return
    const id = await shareShow(sharedId ? loadStoredShow() : show, account.user)
    openShared(id)
    setShowsOpen(false)
  }

  const sharedLoading = !!sharedId && (!syncStatus || syncStatus.state === 'loading')

  // New and Open work on this device's show; from a shared one, they switch back to it
  // (the shared show stays online as it is).
  const startNewShow = () => {
    const ask = sharedId
      ? 'Start a new show on this device? It replaces the show kept on this device; the shared show stays online as it is.'
      : 'Start a new show? This replaces the current show in this browser. Save it first if you want to keep it.'
    if (!confirm(ask)) return
    if (sharedId) openDevice(newShow())
    else replaceShow(newShow())
    clearSelection()
  }

  const openShow = async () => {
    if (sharedId && !confirm('Open a show file on this device? It replaces the show kept on this device; the shared show stays online as it is.')) return
    const text = await pickTextFile('.json,application/json')
    if (text == null) return
    try {
      const opened = normalizeShow(JSON.parse(text))
      if (sharedId) openDevice(opened)
      else replaceShow(opened)
      clearSelection()
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

  // A steck isn't on the Gear tab, so opening one goes to its rack.
  const openGear = (id: string) => {
    const steck = show.gear.find((g) => g.id === id && g.steck)
    if (steck?.rackId) {
      openRack(steck.rackId)
      return
    }
    setSelectedGearId(id)
    setTab('gear')
  }

  // Deciding conflicts: keeping yours is an edit like any other (so it can be undone);
  // keeping theirs just clears it, since theirs is what's showing.
  const keepConflicts = (list: Conflict[], keep: 'mine' | 'theirs') => {
    if (keep === 'mine') update((s) => list.reduce(keepMine, s))
    sessionRef.current?.resolve(list.map((c) => c.key))
  }

  const openConflict = (c: Conflict) => {
    setConflictsOpen(false)
    if (c.kind === 'cables') openCable(c.id)
    else if (c.kind === 'bundles') openBundle(c.id)
    else if (c.kind === 'racks') openRack(c.id)
    else if (c.kind === 'gear') openGear(c.id)
    else if (c.kind === 'gearModels' || c.kind === 'gearCategories') setTab('gear')
    else if (c.kind === 'cableTypes') setTab('types')
    else if (c.kind === 'show') setTab('setup')
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
    {
      id: 'racks',
      label: 'Racks',
      count: show.racks.length,
      flags: patches.steckIssues,
      flagTitle: `${patches.steckIssues} steck warning(s): a quarter that's over, or a tail too big for its rail`,
    },
    {
      id: 'gear',
      label: 'Gear',
      count: show.gear.filter((g) => !g.steck).length,
      flags: patches.issues,
      flagTitle: `${patches.issues} patch warning(s): ports a model doesn't list, or two cables on one port`,
    },
    { id: 'checks', label: 'Checklists' },
    { id: 'print', label: 'Print' },
    { id: 'types', label: 'Cable Types', count: show.cableTypes.length },
  ]

  // Which tab you're on, for others to see; a switch checks in (after a moment, so flicking
  // through tabs is one write).
  const tabLabel = tab === 'setup' ? 'Show Setup' : (tabs.find((t) => t.id === tab)?.label ?? '')
  useEffect(() => {
    tabLabelRef.current = tabLabel
    const session = presenceSession.current
    const user = account.user
    if (!sharedId || !session || !user) return
    const timer = setTimeout(() => void checkIn(sharedId, session, user, tabLabel).catch(() => {}), 1500)
    return () => clearTimeout(timer)
  }, [tabLabel, sharedId, account.user])

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
        {sharedId && (
          <button
            className={`shared-chip ${syncStatus?.state ?? 'loading'}`}
            onClick={() => setMembersOpen(true)}
            title="Shared show: who's in it"
          >
            Shared · {syncText(syncStatus)}
          </button>
        )}
        {sharedId && conflicts.length > 0 && (
          <button
            className="conflict-chip"
            onClick={() => setConflictsOpen(true)}
            title="You and someone else changed the same things. Pick which to keep."
          >
            ⚠ {conflicts.length} to decide
          </button>
        )}
        {sharedId && <PresenceBar people={othersHere} onOpen={() => setMembersOpen(true)} />}
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
          {cloudAvailable() && account.user !== undefined && (
            <button
              className="account-btn"
              onClick={() => (account.user ? setShowsOpen(true) : setSigningIn(true))}
              title={account.user ? `Signed in as ${account.user.email}. Shows…` : 'Sign in to work on shared shows'}
            >
              {account.user ? account.user.displayName?.split(' ')[0] || account.user.email : 'Sign in'}
            </button>
          )}
          <FileMenu
            onSave={saveShow}
            onOpen={openShow}
            onNew={startNewShow}
            onShows={cloudAvailable() ? () => setShowsOpen(true) : undefined}
            onMembers={sharedId && account.user ? () => setMembersOpen(true) : undefined}
          />
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
        {sharedLoading ? (
          <div className="empty">
            <p>Opening the shared show…</p>
            <p className="muted">
              The first time takes a moment; after that it opens from this device, even offline.{' '}
              <button className="link" onClick={() => openDevice()}>
                Open this device's show instead
              </button>
            </p>
          </div>
        ) : (
          <>
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
          </>
        )}
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
      {signingIn && <SignInDialog onClose={() => setSigningIn(false)} />}
      {showsOpen && (
        <ShowsDialog
          user={account.user ?? null}
          verified={account.verified}
          recheck={account.recheck}
          openId={sharedId}
          deviceName={sharedId ? loadStoredShow().name : show.name}
          onOpenDevice={() => {
            openDevice()
            setShowsOpen(false)
          }}
          onOpenShared={(id) => {
            openShared(id)
            setShowsOpen(false)
          }}
          onShareDevice={shareDeviceShow}
          onSignIn={() => {
            setShowsOpen(false)
            setSigningIn(true)
          }}
          onSignOut={() => {
            setShowsOpen(false)
            if (sharedId) openDevice()
            void signOutAccount()
          }}
          onClose={() => setShowsOpen(false)}
        />
      )}
      {conflictsOpen && account.user && sharedId && (
        <ConflictsDialog
          show={show}
          showId={sharedId}
          me={account.user.uid}
          conflicts={conflicts}
          onKeep={keepConflicts}
          onOpen={openConflict}
          onClose={() => setConflictsOpen(false)}
        />
      )}
      {membersOpen && account.user && sharedId && (
        <MembersDialog
          user={account.user}
          showId={sharedId}
          presence={presenceList}
          now={clock}
          onGone={() => {
            setMembersOpen(false)
            openDevice()
          }}
          onClose={() => setMembersOpen(false)}
        />
      )}

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
