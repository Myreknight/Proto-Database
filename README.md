# Proto Database

Offline cable database for a theatrical audio show's design and shop prep.

## Run it

Open `dist/Proto Database.html` in a browser. It's a single self-contained file: no server or internet needed, and it can be sent to testers as-is.

To rebuild it after code changes:

```bash
npm install
npm run build
```

For development with live reload, use `npm run dev`.

## Data

- The starting cable type library comes from `cable_types.csv`. Edit it in any spreadsheet app, or use Import CSV on the Cable Types tab.
- Shows autosave in the browser. **Save** downloads a `.protodb.json` show file, and **Open** loads one.

## Releases

Each saved version keeps a frozen copy of the app in `releases/` (e.g. `releases/Proto Database v0.5.0.html`), which opens on its own no matter what changes later. Its source is tagged in git (`v0.5.0`), with a zip of that source next to it.

Ongoing work happens on a branch named for the next version (e.g. `v0.6`); `main` holds the last saved release.
