// What's playing, as JSON for Proto Database's Winamp skin.
// Run with: osascript -l JavaScript nowplaying.js [web=0]
//
// Spotify or Apple Music, when one is actually playing, always wins. Otherwise
// (unless web=0) it looks for a media tab in a browser that's already open:
// YouTube, YouTube Music, Twitch, SoundCloud or the Spotify web player. It never
// launches an app, and only the matching tab's title is returned.

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

// Browsers can't say whether a tab is actually playing, so prefer the tab that's in
// front of its window, then the first match.
function browserTab() {
  const found = []
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
