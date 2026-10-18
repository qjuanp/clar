# Architecture: Kanban Board Bases view

## Overview

Clár adds a custom [Bases](https://docs.obsidian.md/plugins/guides/bases-view) view type,
`clar-kanban` ("Kanban board"). It groups a base's already-filtered notes into columns
by the value of a chosen list-type frontmatter property, using
[SortableJS](https://sortablejs.github.io/Sortable/) to let cards be dragged between
columns — dropping a card writes the target column's value back into the note's
frontmatter, under the same property used to build the columns.

## Components

Modules are split by dependency direction: `src/basesKanvanView/` holds everything that
talks to the Obsidian/Bases API directly, and `src/core/` holds framework-agnostic pure
logic that only knows about plain data (`ListItemCache[]`, `BasesEntry[]`, strings) —
nothing in `src/core/` imports `App`, `TFile`, or any other live Obsidian object.

### `src/basesKanvanView/register-view.ts`
Calls `Plugin.registerBasesView(KANBAN_VIEW_TYPE, { name, icon, factory, options })` from
`onload()`. The `factory` constructs a `KanbanBasesView`; `options` comes from
`view-options.ts`. Warns (doesn't throw) if registration returns `false`, which
means the core Bases plugin isn't enabled in the vault.

### `src/basesKanvanView/view-options.ts`
Builds the three view-configuration controls exposed in the Bases toolbar, per the specs:
- **Column property** — a `BasesPropertyOption` ("property" dropdown) filtered via
  `isListProperty()` so only list-type frontmatter properties are selectable.
- **Column order** — a `BasesTextOption` for a comma-separated list defining column order.
  Besides being typed by hand, it is rewritten by the view whenever columns are reordered
  by drag and drop (see `view.ts` below).
- **Show task list** — a `BasesToggleOption` (`showTaskList`, `default: true`) turning the
  per-card collapsible task list (spec 6) on or off. `config.get()` returns `undefined`
  for a never-touched option, so the view treats only an explicit `false` as "off".

There is **no custom "view name" option**. `BasesViewConfig.name` already gives every
Bases view (of any type) a user-editable name generically through Bases' own view
management UI, so the spec's "Name of the view" requirement is satisfied by the
platform, not by plugin code.

### `src/basesKanvanView/property-type.ts`
`isListProperty(app, propertyId)` restricts the dropdown to `note.*` (frontmatter)
properties whose declared type is Obsidian's list type. Obsidian's public API has no
documented way to read a property's declared type, so this reaches into
`app.metadataTypeManager` — an **internal, undocumented API** — via a best-effort,
try/catch-guarded lookup. If that shape is missing or changes in a future Obsidian
release, the fallback is to show **all** `note.*` properties in the dropdown, rather
than hiding all of them, so the feature degrades gracefully instead of breaking.

### `src/core/columns.ts`
Pure functions, no DOM — the easiest part of this feature to verify without a test
framework (this repo has none; see Verification below). `buildKanbanColumns(entries,
groupProperty, columnOrder)`:
- Reads each entry's value via `BasesEntry.getValue(groupProperty)`.
- `null`/`NullValue`/empty `ListValue`/blank string → routed to a "No column" bucket.
- Non-empty `ListValue` → uses **only the first value** (`.get(0)`) as the column key.
  A list property selected here is expected to hold a single value per note in
  practice; this is a deliberate simplification, not general multi-column duplication.
- Any other resolved `Value` → uses `.toString()` directly (defensive, in case a
  selected property resolves to something other than a `ListValue` for a given entry).
- Column ordering: columns named in the configured `columnOrder` come first (only if
  they actually have entries), then any other discovered columns in order of first
  appearance, then "No column" last, always, if non-empty.

`mergeColumnOrder(previousOrder, visibleOrder)` builds the `columnOrder` to persist after a
column drag. It starts from the new on-screen order of real columns and re-inserts any
label from the previous order that isn't on screen (a configured column that currently
has no cards) right after the label that preceded it before. A temporarily empty column
therefore keeps its place in the configuration. Duplicates are dropped. Unit tested in
`columns.test.ts`.

### `src/core/task-stats.ts`
`getTaskStats(listItems: ListItemCache[])` takes the already-parsed list items directly —
it does not touch `App` or `TFile` at all, which keeps this module pure and independent of
Obsidian's live API surface. The caller (`KanbanBasesView`) is responsible for resolving
`app.metadataCache.getFileCache(file)?.listItems ?? []` *before* calling in. A "task" is
any `ListItemCache` whose `task` field is defined: `task === ' '` means incomplete, any
other character means done (this is Obsidian's own definition, so it also works with task
plugins that use custom status characters). Returns `null` when the note has no tasks at
all, otherwise `{ active, progressPercent }` with
`progressPercent = Math.round(completed / total * 100)` (standard rounding, not ceiling).

### `src/basesKanvanView/task-list.ts`
Pure, no DOM, no `App`/`TFile` — unit tested in `task-list.test.ts`.
- `buildTaskTree(listItems, content)` turns a note's `ListItemCache[]` plus its raw text
  into a `TaskNode[]` tree (`{ line, status, text, children }`). Only items with a defined
  `task` are kept, sorted by `position.start.line` so siblings stay in file order. Nesting
  follows `ListItemCache.parent` (the parent item's start line; negative for roots). A
  task nested under a plain, non-task bullet hangs off its nearest *task* ancestor, or
  becomes a root if there is none, so no task is ever dropped. Because a list starting on
  line 0 makes a root's `parent` (`-0`) indistinguishable from "child of line 0", a
  parent link is only trusted when the parent line is also less indented. `text` is the
  task's own line with the list marker and `[ ]` stripped (`-`, `*`, `+`, `1.`, `1)`).
- `setTaskStatusInContent(content, line, done)` rewrites just the checkbox character on
  that line (`x` or space), preserving indentation and text. It returns `null` if the
  line no longer looks like a task, so a stale toggle aborts instead of corrupting the note.

### `src/basesKanvanView/card-tags.ts`
Pure, unit tested in `card-tags.test.ts`. `normalizeTags(raw)` takes
`parseFrontMatterTags()`'s `#`-prefixed list (or `null`). It strips the `#` and drops
blanks. It also removes case-insensitive duplicates (Obsidian treats tags
case-insensitively), keeping the first spelling and the file order.

### `src/basesKanvanView/render.ts`
`renderKanbanBoard(boardEl, columns, onOpenFile, getTaskStats, getTags, onCardMoved,
onColumnsReordered, taskList)` clears and rebuilds the board from scratch on every call. Renders one
`.clar-kanban-column` per column (carrying `data-column-label`; "No column" also gets
`.clar-kanban-column--no-column`) with a `.clar-kanban-column__header` and a card list. The
header holds the `.clar-kanban-column__title` text and, for every real column, a
`.clar-kanban-column__handle` drag handle (Obsidian's `grip-vertical` icon via `setIcon`);
"No column" has no handle. It also renders one `.clar-kanban-card` per entry with a
`.clar-kanban-card__title` (`entry.file.basename`), then:
- **Tags.** When `getTags(entry.file)` is non-empty, a `.clar-kanban-card__meta` row of
  `span.tag.clar-kanban-card__tag` pills (`#tag`, Obsidian's own tag look). They are
  display-only: a click bubbles to the card and opens the note.
- **Task section.** When `getTaskStats(entry.file)` is non-null, a
  `.clar-kanban-card__tasks` footer (see below). Notes with zero tasks have no footer.

Each
card carries a `data-path` attribute (the file's vault path) and each column's card list
a `data-column-label` attribute; both are plain strings read by the drag handler below,
keeping this module free of `App`/`TFile` resolution.

Each column's card list gets a `new Sortable(cardsEl, { group, animation: 0,
forceFallback: true, fallbackTolerance: 3, onEnd })` instance: `group` is a shared
`'clar-kanban-cards'` name so cards can move between columns, except the "No column"
bucket, which sets `group: { name: 'clar-kanban-cards', put: false }` — it can't *accept*
drops (see Known limitations), only let cards be dragged *out* of it. `forceFallback`
makes SortableJS drive the drag off plain pointer events instead of native HTML5 DnD.
`onEnd` is a no-op when a card is dropped back into its origin column (no ordering is
persisted); otherwise it reads `data-path`/`data-column-label` straight off the DOM and
calls `onCardMoved(path, targetColumnLabel)`.

**Column reordering.** One more `Sortable` sits on `boardEl` itself, in its own
`'clar-kanban-columns'` group so cards and columns never mix: `draggable:
'.clar-kanban-column'`, `handle: '.clar-kanban-column__handle'`, `direction: 'horizontal'`,
`forceFallback: true`. Only the handle starts a column drag, so pressing a card or the
title text never moves a column. "No column" stays last for two reasons:
- It has no handle, so it can never be dragged. This is deliberately not done with a
  `filter`, which would `preventDefault` every press inside that column, including on its
  cards.
- `onMove` refuses any position after it (`evt.related` is "No column" and
  `willInsertAfter`).

When the column's index changed, `onEnd` reads the `data-column-label` values of the
board's columns in DOM order, leaves out "No column", and calls
`onColumnsReordered(labels)`. Returns every created `Sortable` instance (card lists plus the
board) so the view can destroy them before the next render.

**Task section (specs 2, 6 and the card-style spec).** `renderTaskSection()` builds the
footer of every card whose note has tasks:
- A `.clar-kanban-card__tasks-header` row.
  - On the left is the `.clar-kanban-card__tasks-toggle` button. It is icon-only
    (`chevron-right` / `chevron-down`), with an `aria-expanded` attribute, and its
    `aria-label` and `setTooltip()` text read "Show tasks" or "Hide tasks".
  - On the right is `.clar-kanban-card__active-tasks`: a `square` icon plus the active
    count, with tooltip "Completed N%".
- The `.clar-kanban-card__tasks-list` body.
- `.clar-kanban-card__progress`, the progress bar along the section's bottom edge. It has
  `role="progressbar"`, `aria-valuenow` and `data-progress`. Its fill width comes from
  a `--clar-progress` CSS variable set with `setCssProps`.

When `taskList` (a `TaskListRenderOptions`) is `null` ("Show task list" off), the toggle
and the list body are left out. The count and the bar stay. The list body carries
`is-collapsed` while closed. The body is filled lazily: `taskList.renderTaskList(file,
listEl)` is called only when the card is expanded, so collapsed cards never read their
file or render markdown. Whether a card is expanded comes from `taskList.isExpanded(path)`
and is reported back via `onToggleExpanded`. The state lives in the view because every
re-render rebuilds the DOM. The footer stops click propagation so that toggling, ticking,
or following a link doesn't trigger the card's open-note handler. Each `Sortable` also gets
`filter: '.clar-kanban-card__tasks'` with `preventOnFilter: false`, so pressing inside the
section never starts a drag and checkboxes, links and the list's scrollbar keep working.
The list's `max-height` (in `styles.css`) fits about 10 single-line tasks before it scrolls.

### `src/basesKanvanView/update-column.ts`
`updateEntryColumn(app, file, groupProperty, newColumnLabel)` is the only place that
writes frontmatter: it resolves the plain property name via `parsePropertyId(groupProperty)`
(same helper `property-type.ts` uses to go the other direction) and calls
`app.fileManager.processFrontMatter(file, fn)` — Obsidian's documented API for safely
editing a note's frontmatter block — setting `frontmatter[name]` to a new single-item
array via `buildFrontmatterListValue(newColumnLabel)`. The write always replaces the
whole array rather than only touching index 0, matching `columns.ts`'s own "first value
only" read model — any extra values beyond index 0 on the original property are dropped.

### `src/basesKanvanView/view.ts`
`KanbanBasesView extends BasesView`. `onDataUpdated()` (the one method Bases requires)
is where re-rendering happens: it reads `groupProperty` via
`this.config.getAsPropertyId('groupProperty')` and `columnOrder` via
`this.config.get('columnOrder')` (comma-split/trimmed), shows an empty-state prompt if
no property is configured yet, otherwise calls `buildKanbanColumns()` then
`renderKanbanBoard()`, passing two callbacks: a
`(file) => getTaskStats(this.app.metadataCache.getFileCache(file)?.listItems ?? [])`
callback (the Obsidian-specific cache lookup, right before handing plain data into the
pure `getTaskStats()`), a `getTags` callback that runs Obsidian's public
`parseFrontMatterTags(cache.frontmatter)` (frontmatter `tags`/`tag` only, list form; the
legacy comma-string form isn't recognised by Obsidian 1.14 and so shows no pills) through
the pure `normalizeTags()`, and `(path, targetColumnLabel) => this.onCardMoved(...)` for
drag-and-drop drops, and `(labels) => this.onColumnsReordered(labels)` for column reorders.
`onColumnsReordered` merges the new order with the current option via
`mergeColumnOrder(parseColumnOrder(config.get('columnOrder')), labels)` and writes it back
with `this.config.set('columnOrder', merged.join(', '))`. That is the same comma-separated text
users type, so the **Column order** field shows the new order. Bases persists the change
to the `.base` file on its own (debounced, about 2s in testing). The DOM already shows the
new order, so the re-render that follows rebuilds the same layout. `onCardMoved` resolves the dropped file via
`app.vault.getAbstractFileByPath(path)`, re-reads the current `groupProperty`, and calls
`updateEntryColumn(...)`, catching any rejection into a `console.error` plus an Obsidian
`Notice` — there's no manual DOM revert on failure; the next metadata-driven re-render is
what reconciles the DOM either way. `onunload()` destroys any tracked `Sortable`
instances defensively.

**Task list (spec 6).** Unless `showTaskList` is explicitly `false`, `onDataUpdated()`
passes `TaskListRenderOptions` to `renderKanbanBoard()`:
- `expandedTaskLists: Set<string>` holds the paths of expanded cards. It lives on the
  view instance, so it survives the full re-render that follows every metadata change,
  including the one a checkbox tick causes. It is not persisted, so closing the view
  resets every card to collapsed.
- `renderTaskList(file, listEl)` calls `app.vault.cachedRead(file)` and builds
  `buildTaskTree(metadataCache.getFileCache(file).listItems, content)`. It renders nested
  `ul.contains-task-list > li.task-list-item` rows, each with a checkbox and a
  `.clar-kanban-task__text` that `MarkdownRenderer.render()` fills, so links, bold text
  and tags render. After the async read it bails if a newer render has replaced the board.
  Internal link clicks are delegated to `app.workspace.openLinkText(href, file.path)`.
- **Render-children lifecycle:** `MarkdownRenderer.render()` needs a `Component` owner.
  The view creates one child `Component` per render (`resetRenderComponent()`, called at
  the top of `onDataUpdated()`) and removes the previous one, so markdown children from
  old boards are unloaded instead of leaking. `onunload()` removes it too.
- A checkbox `change` calls `setTaskDone()`, which runs `app.vault.process(file, ...)`
  with `setTaskStatusInContent()`. If the line no longer matches, the content is left
  untouched, the checkbox is reverted, and a `Notice` is shown. On success nothing else is
  needed: the existing `metadataCache 'changed'` listener re-renders the board, updating
  the list, the active-task count and the progress figure together.

On its first call, `onDataUpdated()` also registers a
`this.app.metadataCache.on('changed', ...)` listener (via `registerEvent`, one-time
guarded) that re-invokes `onDataUpdated()` on every metadata cache update. This exists
because Bases' own `onDataUpdated()` only fires when the *query result* changes
(filters/sort/frontmatter-driven) — toggling a checkbox edits the note body, which isn't
normally a tracked property, so without this listener task counts would go stale. It's
registered inside `onDataUpdated()` rather than the constructor because `this.app` isn't
guaranteed to be populated yet at construction time.

## Component dependencies

The diagram below groups every `src/` module by folder — `basesKanvanView/` (Obsidian/Bases
glue) and `core/` (framework-agnostic pure logic) — plus the Obsidian-provided API surface
each one depends on (bottom subgraph — this is the "expected from Obsidian" contract: base
classes to extend, objects to receive, and methods to call), and the one external library
dependency. Solid arrows are calls/constructions, labeled with the actual parameters
passed; dashed arrows are plain imports of shared constants. Nodes with a dashed border
are supplied by Obsidian core (or, for SortableJS, an external package), not implemented
by this plugin. Note that nothing in the `core/` subgraph has an edge into the Obsidian API
subgraph — that separation is the point of the folder split.

```mermaid
flowchart TD
    main["main.ts<br/>ClarPlugin"]

    subgraph BasesKanvanView["src/basesKanvanView/"]
        register["register-view.ts<br/>registerKanbanView()"]
        viewOptions["view-options.ts<br/>createKanbanViewOptions()"]
        propType["property-type.ts<br/>isListProperty()"]
        view["view.ts<br/>KanbanBasesView"]
        render["render.ts<br/>renderKanbanBoard()"]
        updateColumn["update-column.ts<br/>updateEntryColumn()"]
        taskList["task-list.ts<br/>buildTaskTree(), setTaskStatusInContent()"]
        cardTags["card-tags.ts<br/>normalizeTags()"]
    end

    subgraph Core["src/core/"]
        constants["constants.ts<br/>KANBAN_VIEW_TYPE, KANBAN_OPTION_KEYS,<br/>NO_COLUMN_ID, NO_COLUMN_LABEL"]
        columns["columns.ts<br/>buildKanbanColumns(), mergeColumnOrder()"]
        taskStats["task-stats.ts<br/>getTaskStats(listItems)"]
    end

    subgraph ObsidianAPI["Obsidian API surface (host app — expected, not implemented here)"]
        ObsPluginBase["Plugin (base class)"]
        ObsRegisterView["Plugin.registerBasesView()"]
        ObsBasesView["BasesView (base class)"]
        ObsQueryController["QueryController"]
        ObsBasesViewConfig["BasesViewConfig (this.config)"]
        ObsBasesQueryResult["BasesQueryResult (this.data.data)"]
        ObsBasesEntry["BasesEntry.getValue()"]
        ObsWorkspace["App.workspace"]
        ObsMetadataCache["App.metadataCache"]
        ObsMetadataTypeManager["App.metadataTypeManager (internal, undocumented)"]
        ObsParsePropertyId["parsePropertyId()"]
        ObsTFile["TFile"]
        ObsFileManager["App.fileManager.processFrontMatter()"]
        ObsVault["App.vault.getAbstractFileByPath()"]
        ObsNotice["Notice"]
        ObsVaultContent["App.vault.cachedRead() / process()"]
        ObsMarkdownRenderer["MarkdownRenderer.render() + Component"]
    end

    subgraph External["External library"]
        Sortable["SortableJS: new Sortable()"]
    end

    main -->|extends| ObsPluginBase
    main -->|"registerKanbanView(this: Plugin)"| register

    register -->|"plugin.registerBasesView(KANBAN_VIEW_TYPE, { name, icon, factory, options })"| ObsRegisterView
    register -->|"createKanbanViewOptions(plugin.app)"| viewOptions
    register -->|"factory(controller, containerEl) => new KanbanBasesView(...)"| view

    viewOptions -->|"isListProperty(app, propertyId)"| propType
    viewOptions -.->|imports| constants

    propType -->|"parsePropertyId(propertyId)"| ObsParsePropertyId
    propType -->|"app.metadataTypeManager.properties[name].type"| ObsMetadataTypeManager

    view -->|"extends BasesView(controller)"| ObsBasesView
    view -->|"constructor(controller, containerEl)"| ObsQueryController
    view -.->|imports| constants
    view -->|"this.config.getAsPropertyId('groupProperty'), this.config.get/set('columnOrder')"| ObsBasesViewConfig
    view -->|"this.data.data : BasesEntry[]"| ObsBasesQueryResult
    view -->|"buildKanbanColumns(entries, groupProperty, columnOrder), mergeColumnOrder(previous, labels)"| columns
    view -->|"renderKanbanBoard(boardEl, columns, onOpenFile, getTaskStatsFn, getTagsFn, onCardMoved, onColumnsReordered, taskListOptions)"| render
    view -->|"normalizeTags(parseFrontMatterTags(frontmatter))"| cardTags
    view -->|"app.metadataCache.getFileCache(file)?.listItems ?? []"| ObsMetadataCache
    view -->|"getTaskStats(listItems)"| taskStats
    view -->|"this.app.workspace.getLeaf(false).openFile(file)"| ObsWorkspace
    view -->|"this.app.metadataCache.on('changed', cb)"| ObsMetadataCache
    view -->|"onCardMoved(path, targetColumnLabel)"| ObsVault
    view -->|"updateEntryColumn(app, file, groupProperty, targetColumnLabel)"| updateColumn
    view -->|"new Notice(...) on failure"| ObsNotice
    view -->|"buildTaskTree(listItems, content), setTaskStatusInContent(content, line, done)"| taskList
    view -->|"cachedRead(file), process(file, fn)"| ObsVaultContent
    view -->|"MarkdownRenderer.render(app, text, el, path, component)"| ObsMarkdownRenderer

    columns -.->|imports| constants
    columns -->|"entry.getValue(groupProperty) : Value"| ObsBasesEntry

    render -.->|imports| constants
    render -->|"onOpenFile(entry.file: TFile)"| ObsTFile
    render -->|"new Sortable(cardsEl, { group, forceFallback: true, filter, onEnd }), new Sortable(boardEl, { handle, onMove, onEnd })"| Sortable

    updateColumn -->|"parsePropertyId(groupProperty)"| ObsParsePropertyId
    updateColumn -->|"app.fileManager.processFrontMatter(file, fn)"| ObsFileManager

    classDef obsidian stroke-dasharray: 5 5;
    class ObsPluginBase,ObsRegisterView,ObsBasesView,ObsQueryController,ObsBasesViewConfig,ObsBasesQueryResult,ObsBasesEntry,ObsWorkspace,ObsMetadataCache,ObsMetadataTypeManager,ObsParsePropertyId,ObsTFile obsidian;
    classDef external stroke-dasharray: 2 2;
    class Sortable external;
```
Reading this as "what Clár expects Obsidian to provide": a `Plugin` base class with
`registerBasesView()`; a `BasesView` base class constructed with a `QueryController`;
per-view `BasesViewConfig` (`get`/`getAsPropertyId`/`set`) and `BasesQueryResult`
(`this.data.data`) objects supplied by the Bases engine on every render; `BasesEntry`
objects with `getValue()`; `App.workspace` and `App.metadataCache` (both public API); the
`parsePropertyId()` helper and `TFile` type; and, as the one undocumented exception,
`App.metadataTypeManager` (see Known limitations below). `src/core/task-stats.ts` is
deliberately absent from that list — `view.ts` resolves the Obsidian-specific
`app.metadataCache.getFileCache(file)?.listItems` lookup itself and passes plain
`ListItemCache[]` data in, so `core/` has zero Obsidian API dependencies.

## Data flow

```
Bases engine (base-level filters/sort applied)
        │
        ▼
BasesQueryResult.data  (BasesEntry[] — already filtered/sorted for the whole base)
        │
        ▼
KanbanBasesView.onDataUpdated()
        │
        ▼
buildKanbanColumns()  →  KanbanColumn[]
        │
        ▼
renderKanbanBoard()  →  DOM (+ inert Sortable per column, + one for the columns)
```

A column drag runs the other way: `onColumnsReordered()` → `config.set('columnOrder')` →
Bases saves the `.base` file → the next `onDataUpdated()` renders with the new order.

Because `BasesView.data.data` is already filtered and sorted by Bases for the whole
base, the Kanban view does not implement any of its own filtering logic — this
satisfies the spec's "should incorporate already the filters defined for the whole
base" for free.

## Known limitations / caveats

- **`app.metadataTypeManager` is internal/undocumented.** The list-type filter for the
  property dropdown depends on it; if Obsidian changes or removes this internal, the
  dropdown falls back to showing all frontmatter properties rather than failing.
- **First-value-only for multi-value lists.** If a selected list property holds more
  than one value on a given note, only the first value determines its column.
- **Dropping a card can briefly "flicker".** The frontmatter write triggered by a drop
  is asynchronous, and SortableJS has already moved the DOM node optimistically by the
  time it resolves. A re-render can occur in between (from `metadataCache.on('changed')`
  or from Bases' own re-query) and briefly show the card back in its original column
  before the write lands and a later re-render corrects it. This is an accepted,
  documented tradeoff rather than something actively engineered around — a "pending
  move" overlay was judged disproportionate complexity for what the spec asks for.
- **Dropping onto "No column" is rejected.** "No column" is a fallback bucket for notes
  where the grouping property is missing or empty — it doesn't represent a real value
  the spec's "value represented by the column" wording could mean, so SortableJS's own
  `put: false` on that bucket refuses the drop outright (no frontmatter write, no
  silent-clear behavior).
- **Card order within a column isn't persisted.** Dragging a card within its own column
  is visually allowed (SortableJS's default) but is a no-op — no frontmatter write, and
  the very next unrelated re-render resorts cards back to `this.data.data`'s order.
- **Automated tests.** `npm run test:unit` covers `columns.ts`/`task-stats.ts`/
  `task-list.ts`/`update-column.ts`'s pure logic directly; `npm run test:e2e` drives a real,
  latest-version Obsidian instance via WDIO Obsidian Service against the fixture vault
  in `test/e2e/vaults/kanban/` (copied to a temp dir per run), including drag-and-drop
  coverage in `test/e2e/specs/drag-and-drop.e2e.ts`, column-reorder coverage in
  `test/e2e/specs/column-reorder.e2e.ts`, card-style coverage in
  `test/e2e/specs/card-style.e2e.ts` and task-list coverage in
  `test/e2e/specs/task-list.e2e.ts` (drags are simulated via a manual
  W3C Actions pointer sequence rather than WebdriverIO's built-in `dragAndDrop`, and
  `forceFallback: true` above is what makes that reliable against SortableJS). See
  [`specs/4_testing.md`](specs/4_testing.md) and [`dev.md`](dev.md).
- **Task list: only a task's first line is shown.** Continuation lines of a multi-line
  task item aren't included in its text. Ticking a task always writes `x`, and unticking
  writes a space, so a custom status character (e.g. `[-]`) becomes `[ ]` once unticked.
- **Task stats and the progress bar don't react to clicks.** They sit inside the task
  footer, which stops click propagation. Clicking the count or the bar does nothing,
  rather than opening the note.
- **Task list: the footer is not a drag handle.** Pressing inside a card's task-list
  section never starts a drag (see `render.ts`'s Sortable `filter`). Drag the card by its
  title or meta area instead.
- **Task list: expanded state is per view instance.** It is kept in memory, so it survives
  re-renders but not closing and reopening the base. The e2e suite empties the leaf before
  each spec-6 test for that reason: `obsidianPage.resetVault()` alone keeps the same view
  instance, and its state, alive.
- **Column reorder rewrites the option text.** Dragging a column replaces the
  **Column order** text with the normalised `a, b, c` form. This drops any extra spacing
  or blank entries the user had typed. Labels that don't match a column are kept, in their
  relative position. The `.base` file is written by Bases on its own debounce, so the file
  on disk lags the board by a couple of seconds.
- **Column drags need the handle.** Only the grip icon in a column's header starts a
  column drag. The e2e test for "No column" checks the outcome (it ends last). The
  simulated pointer path never actually tries a drop after it, so the `onMove` guard isn't
  tested on its own.
- **Column-order matching is exact, case-sensitive string comparison** between the
  configured `columnOrder` text and each column's stringified property value; unmatched
  configured labels are silently dropped (no empty phantom columns are created).
- **Task-stats refresh is vault-wide, not scoped to the board's visible files.** The
  `metadataCache.on('changed', ...)` listener re-renders the whole board on *any* file's
  cache update, not just files currently shown. Simple and correct, if slightly more
  re-rendering than a scoped listener would do — acceptable at the note counts this view
  targets.
