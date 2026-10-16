// What's playing, as JSON for Proto Database's Winamp skin.
// Run with: osascript -l JavaScript nowplaying.js [web=0]
//
// Spotify or Apple Music, when one is actually playing, always wins. Otherwise
// (unless web=0) it looks for a media tab in a browser that's already open:
// YouTube, YouTube Music, Twitch, SoundCloud or the Spotify web player. It never
// launches an app, and only the matching tab's title is returned.
//
// Firefox can't be asked about its tabs, so for Firefox it reads the session file
// Firefox keeps for crash recovery (updated about every 15 seconds).

ObjC.import('Foundation')

const PLAYERS = ['Spotify', 'Music']

// Safari calls a tab's title "name" and its front tab "currentTab"; Chromium browsers
// use "title" and "activeTab".
const BROWSERS = [
  { app: 'Safari', label: 'Safari', title: 'name', active: 'currentTab' },
  { app: 'Google Chrome', label: 'Chrome', title: 'title', active: 'activeTab' },
  { app: 'Arc', label: 'Arc', title: 'title', active: 'activeTab' },
  { app: 'Brave Browser', label: 'Brave', title: 'title', active: 'activeTab' },
  { app: 'Microsoft Edge', label: 'Edge', title: 'title', active: 'activeTab' },
]

// Pages that are a song, video or stream, and how to tidy their tab titles.
const SITES = [
  {
    source: 'YouTube Music',
    url: /^https?:\/\/music\.youtube\.com\/watch/,
    clean: (t) => t.replace(/ - YouTube Music$/, ''),
  },
  {
    source: 'YouTube',
    url: /^https?:\/\/(www\.|m\.)?youtube\.com\/(watch|shorts\/|live\/)/,
    clean: (t) => t.replace(/^\(\d+\)\s*/, '').replace(/ - YouTube$/, ''),
  },
  {
    source: 'Twitch',
    url: /^https?:\/\/(www\.)?twitch\.tv\/(?!directory|settings|downloads|search|p\/|videos)[^/?#]+\/?([?#].*)?$/,
    clean: (t) => t.replace(/ - Twitch$/, ''),
  },
  {
    source: 'SoundCloud',
    url: /^https?:\/\/soundcloud\.com\/[^/]+\/[^/?#]+/,
    clean: (t) =>
      t
        .replace(/^▶\s*/, '')
        .replace(/^Stream /, '')
        .replace(/ \| Listen online.*$/, '')
        .replace(/ \| SoundCloud$/, ''),
  },
  {
    // The web player's title is the song while playing, and "Spotify – Web Player" otherwise.
    source: 'Spotify',
    url: /^https?:\/\/open\.spotify\.com\//,
    clean: (t) => (/Spotify\s*[–-]\s*Web Player/.test(t) ? '' : t),
  },
]

function player() {
  for (const name of PLAYERS) {
    try {
      const app = Application(name)
      if (!app.running()) continue
      if (app.playerState() !== 'playing') continue
      const track = app.currentTrack()
      // Spotify reports track length in milliseconds, Music in seconds.
      const duration = name === 'Spotify' ? track.duration() / 1000 : track.duration()
      return {
        playing: true,
        app: name === 'Music' ? 'Apple Music' : name,
        title: track.name(),
        artist: track.artist(),
        album: track.album(),
        position: app.playerPosition(),
        duration,
      }
    } catch {
      // Not installed, nothing loaded, or not allowed yet: try the next player.
    }
  }
  return null
}

// Every tab's URL and title, window by window (front window first). One request
// per browser when possible, falling back to window by window.
function tabsOf(app, browser) {
  try {
    return { urls: app.windows.tabs.url(), titles: app.windows.tabs[browser.title]() }
  } catch {
    const urls = []
    const titles = []
    for (const win of app.windows()) {
      try {
        urls.push(win.tabs.url())
        titles.push(win.tabs[browser.title]())
      } catch {
        urls.push([])
        titles.push([])
      }
    }
    return { urls, titles }
  }
}

// --- Firefox, from its crash-recovery session file -------------------------------

const FIREFOXES = ['Firefox', 'Firefox Developer Edition', 'Firefox Nightly']
const FIREFOX_PROFILES = '~/Library/Application Support/Firefox/Profiles'
// Only the matching media tabs are cached, never the rest of the session.
const FIREFOX_CACHE = '~/Library/Caches/Proto Database/firefox-media-tabs.json'

const expand = (path) => $(path).stringByExpandingTildeInPath.js

function fileText(path) {
  const text = $.NSString.stringWithContentsOfFileEncodingError(expand(path), $.NSUTF8StringEncoding, null)
  return text.isNil() ? null : text.js
}

// The session file of the profile Firefox saved most recently.
function newestSession() {
  const fm = $.NSFileManager.defaultManager
  const base = expand(FIREFOX_PROFILES)
  const names = ObjC.deepUnwrap(fm.contentsOfDirectoryAtPathError(base, null)) || []
  let newest = null
  for (const name of names) {
    const path = `${base}/${name}/sessionstore-backups/recovery.jsonlz4`
    const attrs = fm.attributesOfItemAtPathError(path, null)
    if (attrs.isNil()) continue
    const mtime = attrs.fileModificationDate.timeIntervalSince1970
    if (!newest || mtime > newest.mtime) newest = { path, mtime }
  }
  return newest
}

function fromBase64(text) {
  const codes = new Uint8Array(128)
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  for (let i = 0; i < 64; i++) codes[alphabet.charCodeAt(i)] = i
  let end = text.length
  while (text[end - 1] === '=') end--
  const out = new Uint8Array((end * 3) >> 2)
  let o = 0
  let buffer = 0
  let bits = 0
  for (let i = 0; i < end; i++) {
    buffer = ((buffer << 6) | codes[text.charCodeAt(i)]) & 0xffffff
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[o++] = (buffer >> bits) & 255
    }
  }
  return out
}

// Firefox's ".jsonlz4": an 8-byte "mozLz40\0" marker, the unpacked size, then one LZ4 block.
function unpackMozLz4(bytes) {
  const marker = 'mozLz40\0'
  for (let i = 0; i < 8; i++) if (bytes[i] !== marker.charCodeAt(i)) return null
  const size = bytes[8] | (bytes[9] << 8) | (bytes[10] << 16) | (bytes[11] << 24)
  const out = new Uint8Array(size)
  let ip = 12
  let op = 0
  while (ip < bytes.length) {
    const token = bytes[ip++]
    let literals = token >> 4
    if (literals === 15) {
      let b
      do {
        b = bytes[ip++]
        literals += b
      } while (b === 255)
    }
    for (let i = 0; i < literals; i++) out[op++] = bytes[ip++]
    if (ip >= bytes.length) break
    const offset = bytes[ip] | (bytes[ip + 1] << 8)
    ip += 2
    let match = token & 15
    if (match === 15) {
      let b
      do {
        b = bytes[ip++]
        match += b
      } while (b === 255)
    }
    match += 4
    for (let i = 0; i < match; i++, op++) out[op] = out[op - offset]
  }
  return out
}

// Most of a session is plain ASCII, so runs of it are converted in one go; anything
// else is decoded character by character.
function fromUtf8(bytes) {
  const parts = []
  let units = []
  let i = 0
  const flush = () => {
    if (units.length) parts.push(String.fromCharCode.apply(null, units))
    units = []
  }
  while (i < bytes.length) {
    if (bytes[i] < 0x80) {
      let end = i
      while (end < bytes.length && end - i < 8192 && bytes[end] < 0x80) end++
      flush()
      parts.push(String.fromCharCode.apply(null, bytes.subarray(i, end)))
      i = end
      continue
    }
    let c = bytes[i++]
    if (c >= 0xf0) {
      c = (((c & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63)) - 0x10000
      units.push(0xd800 + (c >> 10), 0xdc00 + (c & 1023))
    } else if (c >= 0xe0) {
      units.push(((c & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63))
    } else {
      units.push(((c & 31) << 6) | (bytes[i++] & 63))
    }
    if (units.length >= 8192) flush()
  }
  flush()
  return parts.join('')
}

// Media tabs in a Firefox session: the window in front first, and each window's
// selected tab before its others.
function mediaTabsInSession(session) {
  const windows = session.windows || []
  const frontWindow = (session.selectedWindow || 1) - 1
  const order = windows.map((_, i) => i).sort((a, b) => Number(b === frontWindow) - Number(a === frontWindow))
  const tabs = []
  for (const w of order) {
    const win = windows[w]
    ;(win.tabs || []).forEach((tab, i) => {
      const entries = tab.entries || []
      const entry = entries[(tab.index || entries.length) - 1]
      if (!entry) return
      const site = SITES.find((s) => s.url.test(entry.url || ''))
      if (!site) return
      const title = site.clean(String(entry.title || '')).trim()
      if (title) tabs.push({ source: site.source, title, front: i + 1 === win.selected })
    })
  }
  return tabs
}

function firefoxTabs() {
  const running = FIREFOXES.some((name) => {
    try {
      return Application(name).running()
    } catch {
      return false
    }
  })
  if (!running) return []
  const session = newestSession()
  if (!session) return []

  // Reuse the last answer until Firefox saves its session again.
  try {
    const cached = JSON.parse(fileText(FIREFOX_CACHE) || 'null')
    if (cached && cached.path === session.path && cached.mtime === session.mtime) return cached.tabs
  } catch {
    // No usable cache: read the session.
  }

  const data = $.NSData.dataWithContentsOfFile(session.path)
  if (data.isNil()) return []
  const unpacked = unpackMozLz4(fromBase64(data.base64EncodedStringWithOptions(0).js))
  if (!unpacked) return []
  const tabs = mediaTabsInSession(JSON.parse(fromUtf8(unpacked)))

  try {
    const fm = $.NSFileManager.defaultManager
    const cache = expand(FIREFOX_CACHE)
    fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError($(cache).stringByDeletingLastPathComponent, true, $(), null)
    $(JSON.stringify({ path: session.path, mtime: session.mtime, tabs })).writeToFileAtomicallyEncodingError(
      cache,
      true,
      $.NSUTF8StringEncoding,
      null,
    )
  } catch {
    // Couldn't cache: it'll just read the session again next time.
  }
  return tabs
}

// --- Picking a tab ---------------------------------------------------------------

// Browsers can't say whether a tab is actually playing, so prefer the tab that's in
// front of its window, then the first match.
function browserTab() {
  const found = []
  try {
    for (const tab of firefoxTabs()) {
      found.push({ site: { source: tab.source }, browser: { label: 'Firefox' }, title: tab.title, front: tab.front, order: found.length })
    }
  } catch {
    // Firefox's session couldn't be read: carry on with the other browsers.
  }
  for (const browser of BROWSERS) {
    try {
      const app = Application(browser.app)
      if (!app.running()) continue
      const { urls, titles } = tabsOf(app, browser)
      let fronts = []
      try {
        fronts = app.windows[browser.active].url()
      } catch {
        // Fine: just no preference for the front tab.
      }
      urls.forEach((row, w) =>
        (row || []).forEach((url, i) => {
          const site = SITES.find((s) => s.url.test(url || ''))
          if (!site) return
          const title = site.clean(String((titles[w] || [])[i] || '')).trim()
          if (!title) return
          found.push({ site, browser, title, front: fronts[w] === url, order: found.length })
        }),
      )
    } catch {
      // Not installed or not allowed yet: try the next browser.
    }
  }
  found.sort((a, b) => Number(b.front) - Number(a.front) || a.order - b.order)
  const pick = found[0]
  if (!pick) return null
  return {
    playing: true,
    web: true,
    app: `${pick.site.source} · ${pick.browser.label}`,
    title: pick.title,
    artist: '',
    album: '',
    position: 0,
    duration: 0,
  }
}

function run(argv) {
  const web = !(argv || []).includes('web=0')
  return JSON.stringify(player() || (web && browserTab()) || { playing: false })
}
