# Now Playing helper (optional)

Lets the ⚡ Winamp skin scroll what's playing. Without it, the skin scrolls the show's info.

**What it shows, in order:**

1. **Spotify or Apple Music,** whenever one of them is actually playing. This always wins, with artist, title, album and the real track time.
2. **A media tab in a browser** that's already open (Safari, Chrome, Arc, Brave, Edge or Firefox): YouTube, YouTube Music, Twitch, SoundCloud or the Spotify web player. Browsers can't say whether a tab is actually playing, so it prefers the tab in front of its window. The clock counts from when that tab was first seen.
   - **Firefox** doesn't let other apps ask about its tabs, so the helper reads the session file Firefox keeps for crash recovery instead. That needs no permission prompt, but Firefox only re-saves it about every 15 seconds, so a new video can take that long to show up. The file is only unpacked when Firefox has saved a new one. The helper caches just the matching media tabs (in `~/Library/Caches/Proto Database/`), never the rest of your session. Private windows aren't in that file, so they never show.
3. Otherwise, the show info.

The little **WEB** button on the display switches browser tabs off (or back on). When it's off, the helper doesn't look at browsers at all. To find the media tab, the helper reads your open tabs' addresses and titles. Only the matching tab's title is passed on, and only to the page on your own Mac.

It's built to have as little impact as possible:

- **Nothing runs in the background.** macOS's own launchd listens on `127.0.0.1:47823` and only starts `nowplaying.sh` when the page asks. The script checks the player, answers, and exits (about a tenth of a second).
- **Nothing extra to install.** It uses zsh and AppleScript (JavaScript flavor), which come with macOS.
- **It never opens Spotify, Music or a browser.** It only looks at apps that are already running.
- **Local only.** It listens on 127.0.0.1, so nothing on the network can reach it and nothing leaves the Mac.
- The page only asks while the skin is on and the window is visible: every 5 seconds, or every 30 seconds if the helper isn't installed.

## Install

```bash
zsh helper/install.sh
```

The first time it looks at Spotify, Music or each browser (except Firefox, which needs no permission), macOS asks once to let it read that app. Click OK. Clicking Don't Allow just leaves that app out.

## Remove

```bash
zsh helper/uninstall.sh
```

This removes the launchd entry (`~/Library/LaunchAgents/com.protodatabase.nowplaying.plist`), the two scripts in `~/Library/Application Support/Proto Database/`, and the Firefox cache in `~/Library/Caches/Proto Database/`.
