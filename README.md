# Proto Database

Offline cable and gear database for a theatrical audio show's design and shop prep: cables, bundles, tails and labels, plus gear, racks and rack drawings.

## Use it without installing anything

- **In a browser:** https://myreknight.github.io/Proto-Database-App/
- **As a single file:** download a frozen version from `releases/` (e.g. `releases/Proto Database v0.6.8.html`) and open it. It works offline and can be sent to someone as-is.

## Run it locally

You need [Node.js](https://nodejs.org/) 20.19 or newer (22 LTS is a good pick).

```bash
git clone https://github.com/Myreknight/Proto-Database.git
cd Proto-Database
git checkout v0.7      # the latest work; main is the last saved release
npm install
npm run dev            # opens a live-reloading copy at http://localhost:5173
```

To build the single-file app instead, run `npm run build`, then open `dist/Proto Database.html`. That one file is the whole app: no server or internet needed.

## Data

- Shows autosave in the browser you're using. **File → Save** downloads a `.protodb.json` show file, and **File → Open** loads one, so shows move between computers (and between the hosted and local copies) as files.
- New shows start with the cable types in `cable_types.csv` and the gear models in `gear_models.csv`. Edit either in a spreadsheet, or import them on the Cable Types tab and Gear → Models. The starter gear port lists are drafts; check them against spec sheets.

## Feedback

Feature requests, bugs and feedback go in the public app repo's [Issues](https://github.com/Myreknight/Proto-Database-App/issues/new/choose).

## Now Playing (optional, macOS)

The ⚡ Winamp skin can scroll what Spotify or Apple Music is playing, or a YouTube / Twitch / SoundCloud tab. That needs a tiny on-demand helper; see [helper/README.md](helper/README.md).

## Releases

Each saved version keeps a frozen copy of the app in `releases/`, which opens on its own no matter what changes later. Its source is tagged in git (e.g. `v0.6.8`). Ongoing work happens on a branch named for the next version (e.g. `v0.7`); `main` holds the last saved release.
