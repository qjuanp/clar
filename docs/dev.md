# Manual testing: Kanban Board Bases view

## Automated tests

- `npm run test:unit` — fast unit tests for the pure grouping/task-stats/task-list logic
  (`src/basesKanvanView/columns.ts`, `task-stats.ts`, `task-list.ts`), no Obsidian
  instance needed.
- `npm run test:e2e` — builds the plugin and runs the WDIO Obsidian Service suite
  (`test/e2e/specs/`) against a real, latest-version Obsidian instance, using the
  fixture vault at `test/e2e/vaults/kanban/` (copied to a temp dir per run — the
  fixture itself is never mutated). See `docs/specs/4_testing.md`.
- `npm test` runs both.

The manual walkthrough below is still useful for exploratory testing (styling, visual
drag-and-drop behavior, etc.) beyond what the automated suites assert.

## Prerequisites

- Node.js 20+ (`node --version`; `.nvmrc` pins 24 — run `nvm use`).
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
8. **Drag and drop**: drag a card into a different column and confirm both (a) it
   visually moves, and (b) the note's frontmatter property updates to the target
   column's value (open the note, or inspect the file on disk). Drag a card back into
   its own column and confirm nothing changes. Try dragging a card into **"No column"**
   and confirm the drop is rejected (the card stays where it was, frontmatter
   unchanged) — "No column" is a fallback bucket for notes missing the property, not a
   real value to write.
9. **Column reorder**. Each column header except **"No column"** shows a grip icon in its
   right corner.
   - Drag a column by that icon to a new position. Confirm the board keeps the new order,
     the **Column order** view option now lists it (e.g. `done, todo, in-progress,
     cancelled`), and after a couple of seconds the `.base` file's `columnOrder` matches.
   - Pressing a column's title text, or a card, must not move the column.
   - Try dropping a column after **"No column"** and confirm it lands just before it
     instead. "No column" always stays last and never appears in **Column order**.
   - On a view whose **Column order** is blank, reorder once and confirm the option gets
     filled in.
   - Add a label with no matching notes to **Column order** (e.g. `review` between `todo`
     and `done`), reorder the visible columns, and confirm `review` is still in the option
     next to `todo`.
10. **Task list** (spec 6). Use a note with nested tasks, including one task nested under
   a plain bullet, a `[[link]]` in a task, and more than 10 tasks in total.
   - Confirm each card with tasks shows a collapsed **▸ Show tasks** footer.
   - Expand it. Confirm tasks appear in file order with their nesting, the link renders,
     and the list scrolls past about 10 tasks.
   - Clicking the toggle, a checkbox, or the list body must not open the note.
   - Tick a box. Confirm the note's `[ ]` became `[x]` on disk, the active-task and
     progress figures update, and the list stays expanded after the board refreshes.
   - Click the link and confirm it opens the linked note.
   - Drag the card by its title while the list is expanded and confirm it still moves.
   - Turn **Show task list** off in the view options and confirm every footer disappears.

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
