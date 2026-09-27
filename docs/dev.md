# Manual testing: Kanban Board Bases view

There is no automated UI test for this feature — verify it by hand in a real Obsidian
vault, following the steps below.

## Prerequisites

- Node.js 18+ (`node --version`).
- Obsidian **1.10.0 or later** (Bases' plugin-facing view API requires it — matches
  `manifest.json`'s `minAppVersion`).
- A vault with the core **Bases** plugin enabled: **Settings → Core plugins → Bases**.

## Build

```bash
npm install
npm run dev     # watch mode, rebuilds dist/main.js on save
# or
npm run build   # one-off production build (also type-checks with tsc)
```

Either way, the build output lands in `dist/` as a self-contained plugin folder:
`dist/main.js`, `dist/manifest.json`, `dist/styles.css` (the latter two are copied
from the repo root on every build).

## Install into a vault

The easiest way is to symlink `dist/` straight into a test vault's plugins folder:

```bash
OBSIDIAN_TEST_VAULT="/path/to/vault" npm run setup-test-vault
```

This creates `<vault>/.obsidian/plugins/clar` as a symlink to `dist/`. It's safe to
re-run (a no-op if already linked) and refuses to touch the target if something other
than that symlink is already there. On Windows, symlinks may need Developer Mode or an
elevated shell — if that's not an option, copy `dist/main.js`, `dist/manifest.json`,
and `dist/styles.css` into the plugin folder manually instead.

Either way, reload Obsidian (`Cmd/Ctrl+R`, or disable/enable the plugin) after each
rebuild, then enable **Clár** under **Settings → Community plugins**.

## Step-by-step test

1. **Create test notes** with a frontmatter property typed as **List** (set the
   property type via Obsidian's property-type UI, or add it directly in frontmatter,
   e.g. `status: [Todo]`). Include:
   - Several notes with a single value each (e.g. `Todo`, `Doing`, `Done`).
   - One note with **multiple values** in that property (e.g. `[Todo, Urgent]`) — to
     confirm only the first value (`Todo`) determines its column.
   - One note that **omits the property entirely** — to confirm it lands in "No
     column".
   - Among these, include a note with a mix of checked/unchecked tasks (e.g.
     `- [ ] one` and `- [x] two`), and a note with **no tasks at all**.
2. **Create or open a `.base` file** over a folder containing those notes, and add a
   base-level filter that excludes at least one note — to confirm the Kanban view never
   shows filtered-out notes.
3. **Add a new view** to the base and select type **"Kanban board"**.
4. **Configure the view**: in its options, select the list property under **Column
   property**. Optionally set **Column order** to a comma-separated list, e.g.
   `Todo, Doing, Done`.
5. **Verify**:
   - Columns render in the order configured, or in order-of-appearance if
     `columnOrder` is left blank.
   - Each card shows only the note's title.
   - The property-less note appears under a **"No column"** column.
   - The multi-value note appears once, under its **first** value only.
   - Notes excluded by the base's filter never appear anywhere on the board.
   - Clicking a card opens the corresponding note.
6. **Rename check**: confirm the view's name is editable via Bases' own view-management
   UI (the plugin doesn't add a separate "name" option — see `architecture.md`).
7. **Task details**: for the note with a mix of checked/unchecked tasks, confirm its
   card shows "Active tasks: N" (count of unchecked boxes) and "Progress: N%" (rounded
   percentage of checked boxes) below the title. Confirm the note with no tasks shows
   neither line — just the title, as before. Open the mixed-tasks note, toggle a
   checkbox, and confirm the board updates without a manual reload.

## Rebuild/reload loop

`npm run dev` recompiles `main.js` automatically on save, but Obsidian still needs a
manual reload (or a hot-reload plugin) to pick up the new build.

## Troubleshooting

- **"Kanban board" doesn't appear in the view-type list**: the core Bases plugin is
  disabled, or the vault's Obsidian version is below `1.10.0`.
- **Column property dropdown shows non-list properties**: expected fallback behavior if
  Obsidian's internal `metadataTypeManager` shape is unavailable — not a bug, see
  `architecture.md`'s known limitations.
- **`main.js` missing**: run `npm run build` or `npm run dev` first.
