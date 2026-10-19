# Clár — Obsidian Kanban Board for Bases

## Project overview

Clár is an Obsidian community plugin that adds a custom **Bases** view type
(`clar-kanban`, "Kanban board"). It groups a base's already-filtered notes into
columns by a chosen list-type frontmatter property and lets cards be dragged
between columns, writing the target column's value back into the note's
frontmatter on drop.

- Entry point: `src/main.ts` → `ClarPlugin`. It loads and saves the global settings,
  adds the settings tab, notifies open boards when settings change
  (`onSettingsChange`), and calls `registerKanbanView(this)` from
  `src/basesKanvanView/register-view.ts`.
- Bundled to `main.js` via esbuild; release artifacts are `main.js`,
  `manifest.json`, `styles.css` at the plugin root (never commit `main.js` or
  `dist/`, both are gitignored).
- Global settings (spec 10: recent / stale card indicators) live in `src/settings/`:
  - `settings-model.ts` is **pure**: types, defaults, per-unit limits, `sanitizeSettings`,
    and the golden-rule logic `applyTimeframeChange`. It is unit tested.
  - `settings-tab.ts` is UI only (`PluginSettingTab`).
  Per-board options stay in Bases view options (`view-options.ts`). The tab uses
  `display()`, which is deprecated since Obsidian 1.13. The declarative
  `getSettingDefinitions()` would need `minAppVersion` raised from 1.10.0 to 1.13.0, so
  there is one commented lint suppression for it in `settings-tab.ts`.

Full design docs: [`docs/architecture.md`](docs/architecture.md) (module-by-module
breakdown + a dependency diagram) and [`docs/dev.md`](docs/dev.md) (manual test
walkthrough in a real vault).

## Architecture & module layout

Everything view-specific lives flat under `src/basesKanvanView/` (despite
`docs/architecture.md` and `docs/specs/3_refactor.md` describing a `src/core/`
split for the pure logic — that move was never actually done; treat the doc's
description of the split as aspirational, not current, until someone executes
it for real):

| File | Responsibility |
|---|---|
| `constants.ts` | View type id, config option keys, "No column" id/label |
| `columns.ts` | Pure: groups `BasesEntry[]` into `KanbanColumn[]` by a property's first list value |
| `task-stats.ts` | Pure: active-task count + rounded progress % from `ListItemCache[]` |
| `card-tags.ts` | Pure: normalizes `parseFrontMatterTags()` output into the card's tag pills (strip `#`, dedupe case-insensitively) |
| `task-list.ts` | Pure: builds a note's tasks into a nested `TaskNode[]` tree (file order, hierarchy) and rewrites one task's checkbox in raw content |
| `update-column.ts` | Writes the dropped card's target column value into frontmatter via `app.fileManager.processFrontMatter` |
| `property-type.ts` | Filters the "Column property" dropdown to list-type properties (uses undocumented `app.metadataTypeManager`, degrades gracefully) |
| `card-age.ts` | Pure: decides a card's recent / stale indicators from `file.stat` ctime/mtime + settings + the column's stale switch, and formats the "Not updated for …" relative time |
| `stale-columns.ts` | Pure: per-column "Show stale icon" switch (spec 11) — parses / updates the board's hidden `staleColumns` config list, keyed by column label (or `NO_COLUMN_ID`) |
| `tag-search.ts` | Opens Obsidian search for `tag:#<tag>` when a tag pill is clicked (uses the undocumented core Search plugin via `app.internalPlugins`, returns `false` on failure) |
| `view-options.ts` | Declares the Bases view-config controls (column property, column order, show task list) |
| `register-view.ts` | `Plugin.registerBasesView(...)` registration |
| `render.ts` | DOM rendering + SortableJS wiring (drag-and-drop between columns) |
| `view.ts` | `KanbanBasesView extends BasesView` — orchestrates data → columns → render, drop handling, click-to-open |

Column derivation reads only the **first item** of a list-type property per
note (`columns.ts`'s `resolveColumnLabel`) — this is a deliberate, documented
simplification, not a bug. Writing back on drop replaces the whole array with
a single-item `[newLabel]`, matching that read model.

## Development workflow (spec-driven)

Features in this repo are driven by numbered specs in `docs/specs/*.md`
(`1_base-kanban-board.md`, `2_card-task-details.md`, `5_drag-and-drop.md`,
etc.). When asked to implement something covered by one of these:

1. **Before start planning**, establish a clean baseline. Run
   `npm run lint` first, then the tests (`npm run test:unit` and
   `npm run test:e2e`). Lint must pass with zero errors. If the baseline is
   already failing, report it before changing code, so pre-existing failures
   aren't mistaken for regressions you caused.
2. Read the spec file fully — it usually has its own "Development Process"
   section spelling out the expected order of work (plan → implement → run
   the full existing test suite and fix regressions before adding new tests →
   add new tests for the feature → final full validation pass).
3. Present an implementation plan before writing code if the spec asks for
   one (must do).
4. **After implementation is complete**, run `npm run lint` again first and
   fix everything it reports. Then run **both** `npm run test:unit` and
   `npm run test:e2e`, not just unit tests, before calling the work done.
   `npm test` runs all three in that order (lint → unit → e2e) and stops at
   the first failure. If existing tests break, stop and present a fix plan
   rather than patching around the failure silently.
5. Update `docs/architecture.md` and `docs/dev.md` when the change affects
   what they describe — both have drifted from the code before (see the
   `src/core/` split above); don't let that happen again for changes you make.

## Environment & commands

- **Node version matters: node 26 is being used.** CI lints and
  unit-tests on Node 26.x and runs e2e only on 26.x. Some
  environments default to an old Node from a version manager; Node 26 is the
  default shell Node here. 
  `npm run lint` and `npm run test:unit` now run `scripts/check-node.mjs`
  first (via `prelint`/`pretest:unit`), which stops with a readable message
  instead. `package.json` declares `engines.node >= 2=6`. Switch with nvm,
  which reads `.nvmrc` (`26`):
  ```bash
  source ~/.nvm/nvm.sh && nvm use
  ```
- Package manager: npm (`package-lock.json` is committed).

```bash
npm install                # install deps
npm run dev                # esbuild watch mode
npm run build               # tsc -noEmit + production esbuild bundle
npm run lint                # Node check + eslint . (eslint-plugin-obsidianmd)
npm run test:unit           # vitest run — src/**/*.test.ts
npm run test:e2e            # npm run build && wdio run ./wdio.conf.mts
npm test                    # lint && test:unit && test:e2e
npm run setup-test-vault    # symlinks dist/ into $OBSIDIAN_TEST_VAULT/.obsidian/plugins/clar
```

## Testing

### Unit tests (Vitest)

- Colocated with source: `src/basesKanvanView/*.test.ts`, not under `test/`.
- `obsidian` is aliased in `vitest.config.ts` to `test/unit/mocks/obsidian.ts`
  — a small hand-rolled stand-in for `Value`/`ListValue`/`NullValue`/
  `StringValue` (the real `obsidian` package ships types only, no runtime).
- Only pure logic is unit tested (`columns.ts`, `task-stats.ts`, `task-list.ts`, `card-tags.ts`,
  `card-age.ts`, `stale-columns.ts`, `src/settings/settings-model.ts`,
  `update-column.ts`'s `buildFrontmatterListValue`, `tag-search.ts`'s `buildTagSearchQuery`). Anything that needs a
  live `App`/`TFile` (e.g. `updateEntryColumn`'s actual
  `processFrontMatter` call) is covered by e2e instead — don't try to force
  Obsidian API mocks into the unit layer for that.
- Pattern for faking a `BasesEntry`: `{ getValue: () => value } as unknown as
  BasesEntry` (see `columns.test.ts`) — these functions never touch
  `entry.file`, only `entry.getValue()`.

### E2E tests (WDIO Obsidian Service)

- `test/e2e/specs/**/*.e2e.ts`, mocha + `@wdio/globals`, driven against a
  real, latest-version Obsidian instance.
- Fixture vault at `test/e2e/vaults/kanban/` is copied to a temp dir per test
  run via `obsidianPage.resetVault()` in `beforeEach` — the seed vault itself
  must never be mutated by a test.
- Shared helpers live in `test/e2e/support/kanban-board.ts`: `openBase(path)`,
  `readBoard()` (DOM → `BoardColumn[]`), `dragCardToColumn(cardTitle,
  columnLabel)`, `readFrontmatterProperty(path, prop)`, `readBoardTolerant()`.
- `docs/specs/4_testing.md` states which specs are in e2e scope — update its
  list when adding e2e coverage for a new spec.

### E2E gotchas learned the hard way

- **Simulating drag-and-drop**: WebdriverIO's built-in `element.dragAndDrop()`
  jumps straight from source to target in one move — too abrupt for
  SortableJS's `forceFallback: true` mode (which drives drags off plain
  pointer events, not native HTML5 DnD, specifically because native DnD is
  unreliable to simulate via WebDriver) to register as a drag at all. Use a
  manual `browser.action('pointer')` sequence with a small in-place move
  first (past `fallbackTolerance`) before the real move to the target — see
  `dragCardToColumn` in `kanban-board.ts` for the working sequence.
- **Stale elements after a drop**: a successful drop triggers an async
  frontmatter write, which triggers a full board re-render (destroying and
  recreating every DOM node). Reading the board concurrently (e.g. via
  `.map()` over many elements at once, like `readBoard()` does) right after a
  drop can hit a burst of simultaneous "stale element" errors that appear to
  **wedge the WebDriver session for the rest of a `waitUntil` timeout**
  (only one polling attempt ever completes, then a hang). Prefer verifying
  through the Obsidian API directly where possible (e.g.
  `readFrontmatterProperty`, no DOM involved) rather than polling the DOM
  immediately after an action that's expected to trigger a re-render.
  `readBoardTolerant()` reads sequentially (one command in flight at a time)
  and returns `null` on staleness for the cases where a DOM check is still
  needed.
- **`resetVault()` does not give you a fresh view.** The already-open Bases view
  instance survives it, together with its in-memory state (e.g. which task lists are
  expanded). Tests that depend on view state should call `closeAllViews()` from
  `kanban-board.ts` after `resetVault()`.
- **Async markdown text**: task-list rows appear before `MarkdownRenderer` fills their
  text, so wait on the text itself, not the row count. Match text with `textContent`
  rather than `getText()`.
- **Native menus**: on macOS Obsidian shows `Menu`s natively by default, so they never
  appear in the DOM. Turn the `nativeMenus` app config off before clicking a menu (see
  `toggleColumnStaleIcon` in `kanban-board.ts`).
- A brief visual "flicker" after a drop (card briefly back in its old column
  before the frontmatter write lands) is an accepted, documented limitation —
  don't try to eliminate it by polling harder; see `docs/architecture.md`'s
  Known limitations section.

## Linting & code style

- `npm run lint` runs ESLint with `eslint-plugin-obsidianmd`'s recommended
  config (flat config, `eslint.config.mts`). It must exit with **zero
  errors**: it's a gate before tests, both before and after implementation
  (see Development workflow), and in CI (`.github/workflows/lint.yml`).
- Lint runs before the tests because it's fast and catches type-aware
  problems (e.g. `no-unnecessary-type-assertion`, floating promises) that
  `tsc` and the tests don't.
- Node scripts outside `src/`/`test/` (`esbuild.config.mjs`,
  `scripts/*.mjs`, …) are listed in `globalIgnores` in `eslint.config.mts`.
  Add new ones there, since the config only sets browser globals.
- Style already in the codebase: tabs for indentation, single quotes,
  semicolons, `interface` for object shapes (`KanbanColumn`, `TaskStats`,
  etc.), and `import type { ... }` for type-only imports. Match existing
  files rather than introducing a new style.
- Don't disable rules or add `--no-verify`/ignore comments to work around a
  failure without understanding why it's failing first.

## Manifest & versioning

- `manifest.json`: `id: "clar"`, `minAppVersion: "1.10.0"` (required for the
  Bases plugin-facing view API) — bump this if a change depends on a newer
  Obsidian API.
- Bump `version` (SemVer) in `manifest.json`/`package.json` and add an entry
  to `versions.json` mapping plugin version → minimum Obsidian version before
  a release. `npm version patch|minor|major` automates this.
- Never rename the plugin `id` after release.

## References

- Obsidian Bases view API: https://docs.obsidian.md/plugins/guides/bases-view
- Obsidian API docs: https://docs.obsidian.md
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- SortableJS: https://sortablejs.github.io/Sortable/
- WDIO Obsidian Service: https://github.com/jesse-r-s-hines/wdio-obsidian-service
