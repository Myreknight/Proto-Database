# Proto Database: tips and shortcuts

Shortcuts are written for a Mac. On Windows, use Ctrl where it says ⌘.

## Things to know first

- **Your show lives in the browser you're using** (unless it's a shared show; see [Working together](#working-together)). It saves itself as you work, but only there. To back it up or move it to another computer or browser, use **File → Save** (⌘S) to download a `.protodb.json` file, and **File → Open** to load it again. Clearing your browser's data erases the copy in the browser, so save a file now and then.
- **⌘Z undoes** and **⌘⇧Z redoes** (⌘Y works too), even while you're typing in a field.
- **The app warns but never blocks.** A ⚠ appears for things like two cables on one port, a bundle cable flagged at the wrong end, or overlapping gear in a rack. Fix it or leave it; it's your call.
- **Gear links are plain text.** Start a cable end or patch cell with a gear name and it links to that gear. See [Cables and gear](#cables-and-gear) below.

## Working together

On the [online version](https://myreknight.github.io/Proto-Database-Online/), several people can work on one show at the same time, each on their own computer. Everything else works the same as the everyday version.

### Signing in

- **Click Sign in** at the top right.
- **With Google:** click **Continue with Google** and pick your account. That's it.
- **With an email instead:** click **Create an account**, then enter your name (it's what people you share with see), your email and a password. You'll get an email with a link to confirm your address. Open it, then come back and click **Check again** in **File → Shows…** (or **Resend** if it didn't arrive). Until it's confirmed, you can't join shows you're invited to.
- **Forgot your password?** on the sign-in box emails you a link to set a new one.
- Signed in, the button at the top right shows your first name. Click it to get to your shows. **Sign out** is in **File → Shows…**.

### Sharing a show

The person who shares a show is its **owner**.

- **Open the show** on your computer, the way you always have.
- **File → Shows… → Share this device's show**, then **Share it**. The show goes online and opens as the shared copy. The copy on your computer stays as it was; from now on, work in the shared one.
- **Invite people:** click the **Shared** chip next to the show name (or **File → Members…**), type their email and click **Invite**. The app doesn't send an email, so tell them yourself. They need to sign in with that same address. Invitations waiting to be accepted are listed under **Invited**, where **Cancel invitation** takes one back.

### Joining a show

- **Open the online version** and sign in with the email you were invited at. With an email account, confirm the address first.
- **File → Shows…** lists your **Invitations**. Click **Join** and the show opens; **Decline** turns it down.
- **After that**, the show is listed under **Shared** in **File → Shows…**, and the app reopens the last shared show you had open.

### Who can do what

- **Everyone in a show** can change everything in it: cables, bundles, racks, gear, checklists and Show Setup.
- **The owner** also invites people, takes people out (**Remove**), and can delete the show for everyone (**Delete show…**).
- **Anyone else** can **Leave**. Getting back in takes a new invitation.

### How syncing works

- **There's no save button.** Your changes go up about half a second after you stop typing, and every couple of seconds while you keep going. Everyone else sees them a moment later.
- **Changes are field by field.** Two people working on different cables, different fields of one cable, or different tails of one cable never get in each other's way: both changes land.
- **The chip next to the show name** says how it's going: **Connecting…** while it opens, **Saving…** while your changes are on their way, **Synced** once the server has everything, and **Offline** when it can't reach the server.
- **Undo (⌘Z) only undoes your own changes**, never someone else's.
- **Some things stay yours:** sorting, grouping, the skins, label printer offsets and print choices belong to your computer, not the show.

### Working offline

- **Keep working.** The chip says **Offline · changes saved here**, and your changes wait in this browser. Closing the page or the laptop is fine.
- **When you're back online**, open the show in the same browser. Your changes are checked against what everyone else did meanwhile, then go up.
- **Clearing your browser's data while offline** loses changes that haven't gone up yet.

### When two people change the same thing

- **Changes that don't overlap combine on their own.** You changed tail 1 and someone else changed tail 3: both stay, and nobody's asked anything.
- **When you both changed the same spot**, their version shows, and a **⚠ 1 to decide** chip appears by the show name. Click it to see each one side by side: yours, and theirs with their name. Click the one to keep, or use **Keep all mine** or **Keep all theirs**.
- **If someone deleted something you were changing**, you can **Put it back** (with your changes) or **Leave it out**.
- **If someone changed something you deleted**, you see what they changed, then **Take it out anyway** or **Keep it**.
- **Decide later** closes the list without deciding. Nothing of yours is sent over theirs meanwhile, and the list stays until you decide, even if you close the page.
- **Keeping yours** is an ordinary edit: ⌘Z undoes it, and everyone sees it.
- **Two exceptions:** checklist ticks don't ask (the last tick wins), and two changes to the same spot less than a second apart don't either (the last one wins).

### Who's here

- **A circle with initials** sits by the **Shared** chip for each person who has the show open. Hover over one to see who it is and which tab they're on.
- **Members** shows who's online now, and when everyone else was last here.
- Closing the show takes you off the list at once. Losing your connection takes you off within a few minutes.

### Files, backups and leaving

- **Save show file** (⌘S) downloads a copy of whichever show is open, shared ones included. Save one before big changes, and before anyone deletes a show.
- **New show** and **Open show file** work on your computer's own show, so they switch you back to it. The shared show stays online as it is.
- **To put a saved file back online**, open it, then share it as a new show and invite people again.
- **Deleting a shared show** takes it away for everyone, for good.

### Privacy

- A shared show is stored online with Firebase, Google's database service. Only its members can open it, and only the owner decides who's a member.
- Shows you don't share never leave your computer.

### If something's not right

- **No invitation in File → Shows?** Check you're signed in with the email you were invited at. An email account has to be confirmed first; click **Check again**.
- **Stuck on Connecting… or Offline?** Check your internet connection. Your changes are kept either way.
- **Someone can't see your change?** Check that your chip says **Synced**, and theirs too.
- **"You don't have access to this show anymore"** means you were taken out of the show, or it was deleted. The app goes back to your computer's show.
- **The single-file app** you open from your disk, and the everyday site, can't share. Use the online address.

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
- **Patch from the gear's side.** In a unit's **Ports** list (on the Gear tab), click a port, or Tab to the list, move with ↑↓ and press Enter. Pick an interconnect and which end; this rack's interconnects come first. It writes the port into that end, so the cable and the gear always agree. If the end is already patched somewhere else, it asks before moving it. An interconnect patched into a rack moves to that rack, and it asks first if it was in a different one.
- **Tails from the gear's side.** A trunk's tail lives in the rack whose steck rail its end is mounted on, so a trunk with End A on one rack's steck and End B on another's has a tail in each. The picker on a unit lists the tails in its rack pair by pair; tails elsewhere show up when you search. Set **Patch [N] in a row** to patch the pair you pick and the next ones onto this port and the next ones, e.g. #1–#8 onto In 1–In 8 in one go. It asks before moving a pair that's already patched, or doubling up a port.
- **Card slots.** Consoles and I/O racks that take cards list their slots on the model (**Card slots**, like `SD In 1-7, SD Out 1-7` or `RY 1-6, HY 1-2`); a card's model says which kind of slot it fits (**Is a card for**: `SD In`, `RY`, `HY`…). Open a unit and pick a card for each slot (a new one, or a spare); its ports become the unit's ports, so cables patch straight to them. DiGiCo SD cards count on through the slots (the third input card is In 17–24); Yamaha cards are named by slot (`RY3 In 1`). Cards are gear too: they're listed under **Cards** on the gear list, with the unit each is in, so the shop sends them. Make copies of a loaded unit and the copies come loaded.
- **Gear lists.** Each unit is on one list (a show starts with **Main** and **Production**). Set it with **List** on the unit, next to Category. **Gear → Lists…** renames, reorders, adds and deletes lists. New gear goes on the first list, and so do the racks and steck rails. Group the Gear tab by **List** to see each one.
- **Change several units at once.** Tick the boxes at the left of the Gear tab: Shift-click ticks a run, and a group's box ticks the whole group. A bar appears at the top. Each field shows what the ticked units share (**Mixed** if they differ). Pick a List, Category or Rack and they all change; type a Manufacturer and press **Enter**. **Fields** adds Model, Qty or a line for the notes to the bar, or takes fields away. One ⌘Z undoes the whole change. **Esc** or **Clear** unticks everything.
- **Gear → Models** is the model library. Add units from a model there, and use **Make copies** on a unit to get Amp 2, Amp 3 and so on.

## Racks

- **Adding gear to a rack:** in the picker, click one, Shift-click to select a range, or drag down the list to pick several.
- **In the drawing:** drag a unit to move it. It snaps to rack units. Drop it on the rear view to move it to the rear rails, and half-width gear picks a side. Click a unit to open it, or use ▲▼ in the gear list to nudge it.
- **Steck rails are built on the rack page**, not picked from Gear. Click **+ Add steck rail** and set its size (1–4RU). A rail has four quarters, which work like ports for stecks.
- **Mark the ends first.** Tick **Steck** on a cable end in the cable editor, under From and To. Then click **Place…** on a quarter and pick from the marked ends, with this rack's own first (its interconnects, and cables whose end is at the rack's location). Ends already on a rail show up when you search, to move one.
- **A tail fills a quarter.** A 1RU rail takes G-blocks up to 6pr, 2RU and up to 19pr. **Connectors share one**, two per rack unit of rail (2 on 1RU, 4 on 2RU); an NL8 takes two spaces. The connector type comes from the cable.
- **Generic connectors** go in from the same list: XLR, NL4, NL8, etherCON, RG6 (BNC), powerCON, opticalCON DUO and QUAD, LC fiber, or a G-block, with no cable on them yet. The list stays open so you can add a few; × takes one out.
- **The interconnect comes along.** Placing a cable end also places the interconnect it's linked to at that steck. Linked cables share a name, so it shows indented under its cable, marked **interconnect · inside**. Untick **Bring the interconnect it's linked to along** in the list to place just the one end (it remembers). Take anything off with ×; it stays marked Steck, ready to place again.
- **Warnings, never blocks:** a quarter that's over, something sharing a quarter with a tail, or a tail too big for the rail. Moving an end from another rail asks first.
- **On the gear list**, steck rails are counted by size under Racks (`1RU steck rail · SR 1–3`).
- **Each rack page** switches between Elevation and Flow, and exports a PDF (elevation, parts list and flow), SVG or DXF. **Print → Rack Drawings** prints every rack, or makes one PDF of them all. Untick **Flow pages** there to leave the flow pages out; the rack page's PDF follows the same setting.

## Network switches

- **A switch is a model with Network switch ticked.** Tick it on a unit (next to the card fields) or in the **Switch** column of Gear → Models. The starter library's switches already are: Generic, Luminex GigaCore, and NETGEAR M4250, M4300 and M4350 (their SFP ports are drafts; check them against the front panel). An older show picks them up with Gear → Models → **Update from starter list**.
- **The Network tab** lists the show's switches and its **VLANs** (number, name, colour). VLAN 1 is always there. Renumbering a VLAN moves every port on it; deleting one puts its ports back on VLAN 1. **Add a switch** makes a new unit of a switch model (SW 1, SW 2…).
- **Open a switch** to see its ports drawn the way the label prints. Click a port to pick it, or Shift-click for a run. The bar above the table sets **Mode** (Access or Trunk), **VLAN**, **Tagged VLANs** (a trunk's, typed like `10, 20-30`) and **Colour** for every picked port. Each row in the table does the same for one port. **Esc** unpicks.
- **A port's colour** is its VLAN's, unless you give it one of its own (× puts it back). A trunk shows its tagged VLANs as a band of colours.
- **Label text:** type a few words for a port, or leave it blank and the label prints what's patched there (the other end of the cable).
- **Front panel** (at the bottom of a switch's page) sets the model's rows, which ports are SFP cages, and wider gaps between groups, for every switch of that model.

## Bundles and linked cables

- **Flag one end** of each cable in a bundle so all the same ends land together. A cable flagged at the opposite end gets a warning.
- **Create extension** copies every cable in a bundle at a length you choose.
- **A bundle's extensions are listed under it**, one row each. Change **Ext 1**'s length and every cable in it changes. **Add to the other N** extends cables added after the extension was made. **×** removes the extension from the whole bundle, checklist ticks and all (it asks first).
- **Bundle sheets:** **Print → Bundle Sheets** prints one page per bundle to set out on the floor during layout. An extension is laid out like a bundle of its own, so each extension gets its own sheet too ("HL Proscenium Ext 1"). Each page has the bundle's route, length and flagged end in large type, then every cable with its type, tails, length, flag and prep boxes (ticked from the Checklists tab). Print them all, or use **Print this sheet** for just one.
- **Linked cables** (interconnect → steck → bundle → steck → interconnect) share one color. Use **Apply name to linked** to give them all one name.

## Printing

Everything prints from the **Print** tab: Cable List, Labels, Checklists, Bundle Sheets, Gear List and Rack Drawings.

- Pick a printout on the left (↑ and ↓ work there), set it up, and **Print** is always at the top right. CSV and PDF exports sit beside it.
- The Bundles, Racks, Gear and Checklists tabs each have a **Print…** button that jumps to their printout, and so does ⌘P.
- The app remembers the last printout you used.
- **Switch Labels** prints port labels at real size, to sit over a switch's ports: print at 100% (Actual size) and check the 50 mm ruler. A switch wider than the page prints in parts. For a label that goes somewhere else (on top of the switch, or a steck blank), set **Size** to **Fit an area** and give its width and height, or click **1RU blank** or **2RU blank** (19 × 1.75 in and 19 × 3.5 in). The drawing is scaled to fit and centred, and the cut line is drawn at that size. An area wider than the page prints in pieces that butt together, marked 1/2, 2/2. **in / mm** switches every length between inches and millimetres. **Label style** sets the port shape, text, paper and what's shown; **Port sizes** are estimates until you measure one switch (the spacing between ports matters most). **Download SVG** saves one switch's whole label.
- **Gear List** prints all the gear, one list ("Production Gear List"), or **All, by list**: one printout with a section for each. The CSV follows the same choice.
- **The credits** at the top of each printout come from **Show Setup → Audio team**. Untick a role there to leave it off this show (any names in it are kept, in case you turn it back on), or **+ Add a role** for one of your own, like RF Tech.

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
