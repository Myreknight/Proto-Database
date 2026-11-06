# Proto Database: tips and shortcuts

Shortcuts are written for a Mac. On Windows, use Ctrl where it says ⌘.

## Things to know first

- **Your show lives in the browser you're using.** It saves itself as you work, but only there. To back it up or move it to another computer or browser, use **File → Save** (⌘S) to download a `.protodb.json` file, and **File → Open** to load it again. Clearing your browser's data erases the copy in the browser, so save a file now and then.
- **⌘Z undoes** and **⌘⇧Z redoes** (⌘Y works too), even while you're typing in a field.
- **The app warns but never blocks.** A ⚠ appears for things like two cables on one port, a bundle cable flagged at the wrong end, or overlapping gear in a rack. Fix it or leave it; it's your call.
- **Gear links are plain text.** Start a cable end or patch cell with a gear name and it links to that gear. See [Cables and gear](#cables-and-gear) below.

## Keyboard

The goal is to enter a whole cable without touching the mouse.

**Anywhere**

| Key | Does |
| --- | --- |
| N | New cable (when you aren't typing in a field) |
| ? | Open these tips in the app (or click **?** in the top bar) |
| ⌘S | Save the show to a file |
| ⌘P | Open the Print tab on the printout for the tab you're on (on the Print tab, print) |
| ⌘Z / ⌘⇧Z | Undo / redo |
| Enter on a checkbox | Ticks it, same as Space |
| Esc | Leaves the field you're in, so N works again |

**Cable editor**

| Key | Does |
| --- | --- |
| Enter / Shift+Enter | Next field / previous field |
| Enter in a field with suggestions | Takes the highlighted suggestion, then moves on |
| Enter on a Steck box | Ticks it and jumps to its rail and slot |
| Arrow keys on the colors | Pick a color (the colors are one Tab stop) |

In Notes, Enter starts a new line.

A cable from start to finish: **N**, type the name, **Enter**, start typing the cable type's name to pick it, **Enter**, and keep going. When you're done, **Esc**, then **N** for the next one.

**Tails table** (works like a spreadsheet column)

| Key | Does |
| --- | --- |
| Enter or ↓ / ↑ | Down / up the column |
| Shift+↓ / Shift+↑, or Shift-click | Select several cells |
| ⌘D | Fill the selection down from its top cell (see below) |
| ⌘C / ⌘X / ⌘V | Copy, cut or paste the selected cells |
| Delete | Clear the selected cells |
| Esc | Back to a single cell, or out of the table |

## Drag to fill (the fill handle)

In the tails table, select a cell (or a few) and drag the **small square at the bottom-right corner** down the column, like Excel's fill handle.

- **One cell keeps counting.** `Ch 1` becomes Ch 2, Ch 3, and `Amp 1-A` becomes Amp 1-B, Amp 1-C.
- **A patch cell on a piece of gear steps through that gear's ports.** `Amp 1 · In A` becomes In B, In C, In D.
- **Two or more cells keep their step.** `In 1, In 3` continues In 5, In 7.
- **Anything else repeats.**

**⌘D** does the same from the keyboard: select the cells with Shift+↓, then press ⌘D.

## Paste from a spreadsheet

Copy a column of cells in Excel, Numbers or Google Sheets, click a tail cell, and paste. Each line fills the next row down. If you've selected some cells first, the paste goes into those, and a single value fills every selected cell.

## Cables and gear

- **Linking.** Start From, To, Patch A or Patch B with a gear name, then the port: `Amp 1 · In A`, `Amp 1 In A`, or just `Amp 1 A`. The name has to end at a break, so `Amp 10` won't link to Amp 1. "Linked to…" appears under the field; click it to open the gear.
- **Suggestions list only free ports**, so ports that are already patched drop off the list.
- **Ports are set once per model**, so every unit of that model gets the same list. Type them as ranges, like `In A-D, Out 1-4, Net Pri`. To keep a range as one port's name (a DB25 marked "In 1-8"), put it in quotes.
- **Renaming a unit updates the cables linked to it.**
- **Gear → Models** is the model library. Add units from a model there, and use **Make copies** on a unit to get Amp 2, Amp 3 and so on.

## Racks

- **Adding gear to a rack:** in the picker, click one, Shift-click to select a range, or drag down the list to pick several.
- **In the drawing:** drag a unit to move it. It snaps to rack units. Drop it on the rear view to move it to the rear rails, and half-width gear picks a side. Click a unit to open it, or use ▲▼ in the gear list to nudge it.
- **Steck rails** are gear models flagged Steck, with 4 slots. A multipin (G-block, Socapex, VEAM) fills a slot, and D-size connectors (etherCON, opticalCON, XLR) fit two to a slot on a 1RU rail, or four on a 2RU rail. Tick **Steck** on a cable end and type its slot, like `SR 1 · 3`.
- **Each rack page** switches between Elevation and Flow, and exports a PDF (elevation, parts list and flow), SVG or DXF. **Print → Rack Drawings** prints every rack, or makes one PDF of them all.

## Bundles and linked cables

- **Flag one end** of each cable in a bundle so all the same ends land together. A cable flagged at the opposite end gets a warning.
- **Create extension** copies every cable in a bundle at a length you choose.
- **Bundle sheets:** **Print → Bundle Sheets** prints one page per bundle to set out on the floor during layout. Each page has the bundle's route, length and flagged end in large type, then every cable with its type, tails, length, flag and prep boxes (ticked from the Checklists tab). Print them all, or use **Print this sheet** for just one.
- **Linked cables** (interconnect → steck → bundle → steck → interconnect) share one color. Use **Apply name to linked** to give them all one name.

## Printing

Everything prints from the **Print** tab: Cable List, Labels, Checklists, Bundle Sheets, Gear List and Rack Drawings.

- Pick a printout on the left (↑ and ↓ work there), set it up, and **Print** is always at the top right. CSV and PDF exports sit beside it.
- The Bundles, Racks, Gear and Checklists tabs each have a **Print…** button that jumps to their printout, and so does ⌘P.
- The app remembers the last printout you used.

### Labels

- On **Print → Labels**, pick **Tails**, **Cables** or **Stecks**, then a sheet: 80 per sheet (Avery 5167 / OL25) or 30 per sheet (Avery 5160).
- Tick **Print outlines** and do a test print on plain paper. If the labels are a little off, adjust **Shift right / Shift down**. **Skip first labels** uses up a partly used sheet.

## Just for fun

**⚡** in the top bar switches to a Winamp skin. A tiny mushroom hidden in the bottom-right corner switches to an 8-bit one. Both change the look only.

**Now Playing (Mac only, optional).** The Winamp skin can scroll what's playing in Spotify or Apple Music, or in a YouTube, Twitch or SoundCloud tab. Without it, the skin scrolls the show's info. It needs a tiny helper, installed from the [source repo](https://github.com/Myreknight/Proto-Database) with `zsh helper/install.sh`. The helper only runs when the page asks, never opens any apps, and nothing leaves your Mac.

- **Expect macOS to ask for permission.** The first time the helper checks Spotify, Music or each browser, macOS asks once whether it may "control" that app. The wording is macOS's standard; the helper only reads what's playing. Click **OK** for the ones you want. **Don't Allow** just leaves that app out, and nothing breaks. Firefox never asks.
- The little **WEB** button on the display turns browser tabs off if you'd rather it didn't look at them.
- `zsh helper/uninstall.sh` removes it. The full details are in the [helper's README](https://github.com/Myreknight/Proto-Database/blob/v0.7/helper/README.md).

---

Found a bug or have an idea? [Open an issue](https://github.com/Myreknight/Proto-Database-App/issues/new/choose).
