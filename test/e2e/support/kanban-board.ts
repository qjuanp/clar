import { browser } from '@wdio/globals';

/**
 * Opens a `.base` file in the active leaf via the Obsidian API, the same way
 * double-clicking it in the file explorer would.
 */
export async function openBase(path: string): Promise<void> {
	await browser.executeObsidian(async ({ app, obsidian }, basePath) => {
		const file = app.vault.getAbstractFileByPath(basePath);
		if (!(file instanceof obsidian.TFile)) {
			throw new Error(`Expected a file at "${basePath}"`);
		}
		await app.workspace.getLeaf(false).openFile(file);
	}, path);
	// Bases mounts the view before its query has actually finished running, so
	// `.clar-kanban-board` can exist briefly with zero columns. Every fixture
	// base used by these tests has at least one matching note, so wait for a
	// real card instead of just the empty container.
	await browser.waitUntil(async () => (await browser.$$('.clar-kanban-card').getElements()).length > 0, {
		timeout: 5000,
		timeoutMsg: `Board at "${path}" never rendered any cards`,
	});
}

export interface BoardCard {
	title: string;
	/** Tag pill texts, without the `#`; empty when the card has no `clar-kanban-card__meta` block. */
	tags: string[];
	/** null when the card has no `clar-kanban-card__tasks` section (no tasks in the note). */
	activeTasks: number | null;
	progressPercent: number | null;
}

export interface BoardColumn {
	label: string;
	cards: BoardCard[];
}

function stripHash(tag: string): string {
	return tag.replace(/^#/, '');
}

function parseCount(text: string): number {
	const match = /(\d+)/.exec(text);
	if (!match) {
		throw new Error(`Expected a number in "${text}"`);
	}
	return Number(match[1]);
}

/**
 * Reads the currently rendered board (assumes a `.base` file is already
 * open). `$$(...).map()` resolves each element and runs the callbacks
 * concurrently while preserving DOM order in the returned array - see
 * WebdriverIO's `AsyncIterators` docs.
 */
export async function readBoard(): Promise<BoardColumn[]> {
	return browser.$$('.clar-kanban-column').map(async (columnEl) => {
		const label = await columnEl.$('.clar-kanban-column__title').getText();
		const cards = await columnEl.$$('.clar-kanban-card').map(async (cardEl) => {
			const title = await cardEl.$('.clar-kanban-card__title').getText();
			const tags = await cardEl.$$('.clar-kanban-card__tag').map((tagEl) => tagEl.getText());
			const tasksEl = cardEl.$('.clar-kanban-card__tasks');
			if (!(await tasksEl.isExisting())) {
				return { title, tags: tags.map(stripHash), activeTasks: null, progressPercent: null };
			}
			const activeTasksText = await tasksEl.$('.clar-kanban-card__active-tasks').getText();
			const progressText = await tasksEl.$('.clar-kanban-card__progress').getAttribute('data-progress');
			return {
				title,
				tags: tags.map(stripHash),
				activeTasks: parseCount(activeTasksText),
				progressPercent: parseCount(progressText ?? ''),
			};
		});
		return { label, cards };
	});
}

async function findCardElement(cardTitle: string) {
	const cards = await browser.$$('.clar-kanban-card').getElements();
	for (const card of cards) {
		if ((await card.$('.clar-kanban-card__title').getText()) === cardTitle) {
			return card;
		}
	}
	throw new Error(`Card not found: ${cardTitle}`);
}

async function findColumnCardsElement(columnLabel: string) {
	const columns = await browser.$$('.clar-kanban-column').getElements();
	for (const column of columns) {
		if ((await column.$('.clar-kanban-column__title').getText()) === columnLabel) {
			return column.$('.clar-kanban-column__cards');
		}
	}
	throw new Error(`Column not found: ${columnLabel}`);
}

function isStaleElementError(err: unknown): boolean {
	return err instanceof Error && /stale element/i.test(err.message);
}

/**
 * Drags a card (matched by its visible title) into another column (matched
 * by its visible label), using a manual W3C Actions pointer sequence rather
 * than WebdriverIO's built-in `dragAndDrop` (which jumps straight from the
 * source to the target in one move - too abrupt for SortableJS's
 * `forceFallback` mode to register as a drag: it needs an initial small
 * move past `fallbackTolerance` while still over the source element before
 * the "real" move to the target, or its own `document`-level mousemove
 * listener never sees the drag start). `forceFallback: true` (see
 * render.ts) makes SortableJS drive drags off plain pointer events instead
 * of native HTML5 DnD, which WebDriver cannot simulate reliably.
 *
 * The board can re-render (destroying and recreating every element) shortly
 * after `openBase()` resolves or after a previous drop, independent of this
 * function - so element lookups here are retried a few times on a stale
 * element error rather than failing the whole drag on a one-off DOM churn.
 */
export async function dragCardToColumn(cardTitle: string, targetColumnLabel: string): Promise<void> {
	const attempts = 3;
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			const cardEl = await findCardElement(cardTitle);
			const targetCardsEl = await findColumnCardsElement(targetColumnLabel);
			await browser
				.action('pointer', { parameters: { pointerType: 'mouse' } })
				.move({ duration: 0, origin: cardEl })
				.down({ button: 0 })
				.pause(50)
				.move({ duration: 100, origin: cardEl, x: 5, y: 5 })
				.pause(50)
				.move({ duration: 200, origin: targetCardsEl })
				.pause(50)
				.move({ duration: 100, origin: targetCardsEl })
				.up({ button: 0 })
				.perform();
			return;
		} catch (err) {
			if (attempt === attempts || !isStaleElementError(err)) {
				throw err;
			}
		}
	}
}

async function findColumnElement(columnLabel: string) {
	const columns = await browser.$$('.clar-kanban-column').getElements();
	for (const column of columns) {
		if ((await column.$('.clar-kanban-column__title').getText()) === columnLabel) {
			return column;
		}
	}
	throw new Error(`Column not found: ${columnLabel}`);
}

/**
 * Drags a column into another column's place, pressing on `grabSelector`
 * inside the dragged column's header (its handle by default) and releasing
 * over the `side` half of the target column's header.
 *
 * Unlike `dragCardToColumn`, the pointer travels in small viewport-relative
 * steps: SortableJS only swaps a column with the one directly under the
 * pointer, so one long jump past several columns only ever moves the
 * dragged column a single slot. Both
 * points are computed in one in-page call and clamped to the window, since
 * the board can be wider than the (fixed-size) test window.
 */
export async function dragColumn(
	columnLabel: string,
	targetColumnLabel: string,
	options: { side?: 'before' | 'after'; grabSelector?: string } = {},
): Promise<void> {
	const { side = 'before', grabSelector = '.clar-kanban-column__handle' } = options;
	const points = await browser.execute(
		(label, targetLabel, dropSide, selector) => {
			const columnFor = (l: string) =>
				Array.from(document.querySelectorAll('.clar-kanban-column')).find(
					(el) => el.querySelector('.clar-kanban-column__title')?.textContent === l,
				);
			const grabRect = columnFor(label)?.querySelector(selector)?.getBoundingClientRect();
			const targetRect = columnFor(targetLabel)
				?.querySelector('.clar-kanban-column__header')
				?.getBoundingClientRect();
			if (!grabRect || !targetRect) {
				return null;
			}
			const clampX = (x: number) => Math.max(1, Math.min(window.innerWidth - 2, Math.round(x)));
			return {
				from: { x: clampX(grabRect.left + grabRect.width / 2), y: Math.round(grabRect.top + grabRect.height / 2) },
				to: {
					x: clampX(targetRect.left + targetRect.width * (dropSide === 'before' ? 0.25 : 0.75)),
					y: Math.round(targetRect.top + targetRect.height / 2),
				},
			};
		},
		columnLabel,
		targetColumnLabel,
		side,
		grabSelector,
	);
	if (!points) {
		throw new Error(`Could not locate "${grabSelector}" in "${columnLabel}" or the "${targetColumnLabel}" header`);
	}

	const { from, to } = points;
	let action = browser
		.action('pointer', { parameters: { pointerType: 'mouse' } })
		.move({ duration: 0, origin: 'viewport', x: from.x, y: from.y })
		.down({ button: 0 })
		.pause(50)
		.move({ duration: 50, origin: 'viewport', x: from.x + 5, y: from.y + 5 })
		.pause(50);
	const steps = Math.max(1, Math.ceil(Math.abs(to.x - from.x) / 40));
	for (let step = 1; step <= steps; step++) {
		const x = Math.round(from.x + ((to.x - from.x) * step) / steps);
		action = action.move({ duration: 30, origin: 'viewport', x, y: to.y }).pause(60);
	}
	await action.up({ button: 0 }).perform();
}

/** Collapses both sidebars so as much of the board as possible fits in the test window. */
export async function collapseSidebars(): Promise<void> {
	await browser.executeObsidian(({ app }) => {
		app.workspace.leftSplit.collapse();
		app.workspace.rightSplit.collapse();
	});
}

/** Scrolls the board horizontally to its far end (it scrolls when wider than the window). */
export async function scrollBoardToEnd(): Promise<void> {
	await browser.execute(() => {
		const viewEl = document.querySelector('.clar-kanban-view');
		if (viewEl) {
			viewEl.scrollLeft = viewEl.scrollWidth;
		}
	});
}

/**
 * The rendered column labels in DOM order, read in a single in-page
 * `execute` call so it can't hit the stale-element burst described on
 * `readBoardTolerant()` while the board re-renders.
 */
export async function readColumnLabels(): Promise<string[]> {
	return browser.execute(() =>
		Array.from(document.querySelectorAll('.clar-kanban-column')).map(
			(el) => el.querySelector('.clar-kanban-column__title')?.textContent ?? '',
		),
	);
}

/** Whether the column with the given label renders a drag handle in its header. */
export async function columnHasHandle(columnLabel: string): Promise<boolean> {
	return (await findColumnElement(columnLabel)).$('.clar-kanban-column__handle').isExisting();
}

/**
 * The manual group order (`groupOrder`, spec 12) stored for a view in a
 * `.base` file, or null when that view has none ("Group by" sorts by value).
 * Reads the raw file, so it reflects what was actually persisted.
 */
export async function readBaseGroupOrder(path: string, viewIndex = 0): Promise<unknown> {
	return readBaseViewKey(path, 'groupOrder', viewIndex);
}

/**
 * Reads the board like `readBoard()`, but sequentially (one WebDriver
 * command in flight at a time) and returns `null` instead of throwing when
 * an element goes stale mid-read. `readBoard()`'s concurrent `.map()`
 * fires dozens of commands in parallel, which is fine once the DOM is
 * stable, but right after a drop - while the board may still be
 * re-rendering - that whole burst can hit staleness together and appears to
 * wedge the WebDriver session for the rest of a `waitUntil` budget (only
 * ever getting one polling attempt in before timing out). Used for polling
 * right after a drag-and-drop action, where a re-render racing the read is
 * expected rather than exceptional.
 */
export async function readBoardTolerant(): Promise<BoardColumn[] | null> {
	try {
		const columns: BoardColumn[] = [];
		for (const columnEl of await browser.$$('.clar-kanban-column').getElements()) {
			const label = await columnEl.$('.clar-kanban-column__title').getText();
			const cards: BoardCard[] = [];
			for (const cardEl of await columnEl.$$('.clar-kanban-card').getElements()) {
				const title = await cardEl.$('.clar-kanban-card__title').getText();
				const tags: string[] = [];
				for (const tagEl of await cardEl.$$('.clar-kanban-card__tag').getElements()) {
					tags.push(stripHash(await tagEl.getText()));
				}
				const tasksEl = cardEl.$('.clar-kanban-card__tasks');
				if (!(await tasksEl.isExisting())) {
					cards.push({ title, tags, activeTasks: null, progressPercent: null });
					continue;
				}
				const activeTasksText = await tasksEl.$('.clar-kanban-card__active-tasks').getText();
				const progressText = await tasksEl.$('.clar-kanban-card__progress').getAttribute('data-progress');
				cards.push({
					title,
					tags,
					activeTasks: parseCount(activeTasksText),
					progressPercent: parseCount(progressText ?? ''),
				});
			}
			columns.push({ label, cards });
		}
		return columns;
	} catch (err) {
		if (isStaleElementError(err)) {
			return null;
		}
		throw err;
	}
}

/** Reads a note's frontmatter value for a given property, via the real Obsidian metadata cache. */
export async function readFrontmatterProperty(path: string, propertyName: string): Promise<unknown> {
	return browser.executeObsidian(({ app, obsidian }, notePath, prop) => {
		const file = app.vault.getAbstractFileByPath(notePath);
		if (!(file instanceof obsidian.TFile)) {
			throw new Error(`Expected a file at "${notePath}"`);
		}
		const cache = app.metadataCache.getFileCache(file);
		return (cache?.frontmatter?.[prop] ?? null) as unknown;
	}, path, propertyName);
}

export interface TaskListItem {
	text: string;
	checked: boolean;
	/** 0 for a root task, 1 for its subtasks, and so on. */
	depth: number;
}

export interface TaskListSnapshot {
	expanded: boolean;
	scrollable: boolean;
	items: TaskListItem[];
}

/**
 * Snapshot of one card's task-list section, taken in a single in-page
 * `execute` call (one WebDriver command, no per-element round-trips) so it
 * can't hit the stale-element burst described on `readBoardTolerant()` while
 * the board re-renders after a checkbox toggle. Returns null when the card,
 * or its task-list section, isn't rendered.
 */

export async function readTaskList(cardTitle: string): Promise<TaskListSnapshot | null> {
	return browser.execute((title) => {
		const card = Array.from(document.querySelectorAll('.clar-kanban-card')).find(
			(el) => el.querySelector('.clar-kanban-card__title')?.textContent === title,
		);
		const section = card?.querySelector('.clar-kanban-card__tasks');
		const listEl = section?.querySelector<HTMLElement>('.clar-kanban-card__tasks-list');
		if (!section || !listEl) {
			return null;
		}
		const items = Array.from(listEl.querySelectorAll('li.task-list-item')).map((li) => {
			let depth = 0;
			for (let el = li.parentElement?.closest('li.task-list-item'); el; el = el.parentElement?.closest('li.task-list-item')) {
				depth++;
			}
			return {
				text: li.querySelector(':scope > .clar-kanban-task .clar-kanban-task__text')?.textContent?.trim() ?? '',
				checked: li.querySelector<HTMLInputElement>(':scope > .clar-kanban-task input')?.checked ?? false,
				depth,
			};
		});
		return {
			expanded: !listEl.classList.contains('is-collapsed'),
			scrollable: listEl.scrollHeight > listEl.clientHeight,
			items,
		};
	}, cardTitle);
}

export interface CardStyleSnapshot {
	/** Tag pill texts as rendered (with `#`); empty when there's no meta block. */
	tags: string[];
	hasMeta: boolean;
	hasTaskSection: boolean;
	/** The task-list toggle, or null when it isn't rendered (option off, or no tasks). */
	toggle: { text: string; hasIcon: boolean; ariaLabel: string | null; expanded: string | null } | null;
	activeTasks: { count: string; hasIcon: boolean; ariaLabel: string | null } | null;
	progress: { valueNow: string | null; fillRatio: number; sectionPosition: number } | null;
}

/**
 * Snapshot of a card's meta and task-section styling, in one in-page
 * `execute` call (see `readTaskList()` for why). `fillRatio` is the rendered
 * fill width over the bar's width (0..1). Returns null if the card isn't rendered.
 */
export async function readCardStyle(cardTitle: string): Promise<CardStyleSnapshot | null> {
	return browser.execute((title) => {
		const card = Array.from(document.querySelectorAll('.clar-kanban-card')).find(
			(el) => el.querySelector('.clar-kanban-card__title')?.textContent === title,
		);
		if (!card) {
			return null;
		}
		const meta = card.querySelector('.clar-kanban-card__meta');
		const section = card.querySelector('.clar-kanban-card__tasks');
		const toggle = section?.querySelector('.clar-kanban-card__tasks-toggle');
		const active = section?.querySelector('.clar-kanban-card__active-tasks');
		const progress = section?.querySelector('.clar-kanban-card__progress');
		const fill = progress?.querySelector('.clar-kanban-card__progress-fill');
		const barWidth = progress?.getBoundingClientRect().width ?? 0;
		return {
			tags: Array.from(card.querySelectorAll('.clar-kanban-card__tag')).map((el) => el.textContent ?? ''),
			hasMeta: meta !== null,
			hasTaskSection: section !== null && section !== undefined,
			toggle: toggle
				? {
						text: toggle.textContent?.trim() ?? '',
						hasIcon: toggle.querySelector('svg') !== null,
						ariaLabel: toggle.getAttribute('aria-label'),
						expanded: toggle.getAttribute('aria-expanded'),
					}
				: null,
			activeTasks: active
				? {
						count: active.querySelector('.clar-kanban-card__active-tasks-count')?.textContent ?? '',
						hasIcon: active.querySelector('svg') !== null,
						ariaLabel: active.getAttribute('aria-label'),
					}
				: null,
			progress: progress
				? {
						valueNow: progress.getAttribute('aria-valuenow'),
						fillRatio: barWidth > 0 ? (fill?.getBoundingClientRect().width ?? 0) / barWidth : 0,
						sectionPosition: section?.indexOf(progress) || -1, // -1 if not found
					}
				: null,
		};
	}, cardTitle);
}

/**
 * The query in Obsidian's Search pane, read from its input in the DOM (no
 * internal API), or null when no Search pane is rendered.
 */
export async function readSearchQuery(): Promise<string | null> {
	return browser.execute(() => {
		const input = document.querySelector<HTMLInputElement>(
			'.workspace-leaf-content[data-type="search"] input[type="search"]',
		);
		return input ? input.value : null;
	});
}

/** Clicks a card's first tag pill. */
export async function clickTagPill(cardTitle: string): Promise<void> {
	const cardEl = await findCardElement(cardTitle);
	const [tagEl] = await cardEl.$$('.clar-kanban-card__tag').getElements();
	if (!tagEl) {
		throw new Error(`Card "${cardTitle}" has no tag pills`);
	}
	await tagEl.click();
}

/** Expands a card's task list via its toggle button; a no-op if it's already expanded. */
export async function expandTaskList(cardTitle: string): Promise<void> {
	const cardEl = await findCardElement(cardTitle);
	const toggleEl = cardEl.$('.clar-kanban-card__tasks-toggle');
	if ((await toggleEl.getAttribute('aria-expanded')) !== 'true') {
		await toggleEl.click();
	}
}

/**
 * Empties every root leaf, so the next `openBase()` mounts a brand-new view.
 * `obsidianPage.resetVault()` alone keeps the already-open Bases view (and
 * its in-memory state, like which task lists are expanded) alive across tests.
 */
export async function closeAllViews(): Promise<void> {
	await browser.executeObsidian(async ({ app }) => {
		const leaves: { setViewState: (state: { type: string }) => Promise<void> }[] = [];
		app.workspace.iterateRootLeaves((leaf) => {
			leaves.push(leaf);
		});
		await Promise.all(leaves.map((leaf) => leaf.setViewState({ type: 'empty' })));
	});
}

/** Clicks the checkbox of the task whose rendered text matches `taskText`, inside the given card. */
export async function clickTaskCheckbox(cardTitle: string, taskText: string): Promise<void> {
	const cardEl = await findCardElement(cardTitle);
	for (const rowEl of await cardEl.$$('.clar-kanban-task').getElements()) {
		// `textContent`, not `getText()`: the latter returns *rendered* text,
		// which can differ (wrapping, whitespace) inside a narrow card.
		const text = await rowEl.$('.clar-kanban-task__text').getProperty('textContent');
		if (typeof text === 'string' && text.trim() === taskText) {
			await rowEl.$('input[type="checkbox"]').click();
			return;
		}
	}
	throw new Error(`Task "${taskText}" not found in card "${cardTitle}"`);
}

/** Reads a note's raw contents via the Obsidian vault API (no DOM involved). */
export async function readNote(path: string): Promise<string> {
	return browser.executeObsidian(async ({ app }, notePath) => {
		const file = app.vault.getFileByPath(notePath);
		if (!file) {
			throw new Error(`Expected a file at "${notePath}"`);
		}
		return app.vault.read(file);
	}, path);
}

/** The path of the note currently open in the active leaf, or null. */
export async function activeFilePath(): Promise<string | null> {
	return browser.executeObsidian(({ app }) => app.workspace.getActiveFile()?.path ?? null);
}

/** Mirrors `createDefaultSettings()` in src/settings/settings-model.ts (tests can't import plugin code into the page). */
export const DEFAULT_CLAR_SETTINGS = {
	recentCards: { enabled: true, timeframe: { amount: 1, unit: 'weeks' } },
	staleCards: { enabled: true, timeframe: { amount: 1, unit: 'weeks' } },
};

export type ClarSettingsSnapshot = typeof DEFAULT_CLAR_SETTINGS;

interface ClarPluginLike {
	settings: ClarSettingsSnapshot;
	updateSettings(next: ClarSettingsSnapshot): Promise<void>;
}

/**
 * Saves the plugin's global settings through `ClarPlugin.updateSettings()`,
 * which also re-renders open boards. Reaches the plugin via the internal
 * `app.plugins` registry, which is fine in tests.
 */
export async function setClarSettings(settings: ClarSettingsSnapshot): Promise<void> {
	await browser.executeObsidian(async ({ app }, next) => {
		const plugin = (app as unknown as { plugins: { getPlugin(id: string): ClarPluginLike | null } }).plugins.getPlugin(
			'clar',
		);
		if (!plugin) {
			throw new Error('Clár plugin is not loaded');
		}
		await plugin.updateSettings(next);
	}, settings);
}

/** The plugin's current global settings. */
export async function readClarSettings(): Promise<ClarSettingsSnapshot> {
	return browser.executeObsidian(({ app }) => {
		const plugin = (app as unknown as { plugins: { getPlugin(id: string): ClarPluginLike | null } }).plugins.getPlugin(
			'clar',
		);
		if (!plugin) {
			throw new Error('Clár plugin is not loaded');
		}
		return plugin.settings;
	});
}

/**
 * Backdates a note's in-memory `TFile.stat` (created / updated "ago" from now)
 * and re-renders open boards. Real file-system creation dates can't be set
 * from a test, and a freshly copied fixture's `ctime` differs by OS, so tests
 * that check the recent / stale indicators must set both times explicitly.
 * Obsidian only re-reads `stat` on file events, which these tests don't cause.
 */
export async function setFileTimes(path: string, times: { createdAgoMs: number; updatedAgoMs: number }): Promise<void> {
	await browser.executeObsidian(
		async ({ app }, notePath, { createdAgoMs, updatedAgoMs }) => {
			const file = app.vault.getFileByPath(notePath);
			if (!file) {
				throw new Error(`Expected a file at "${notePath}"`);
			}
			const now = Date.now();
			file.stat.ctime = now - createdAgoMs;
			file.stat.mtime = now - updatedAgoMs;
			const plugin = (app as unknown as { plugins: { getPlugin(id: string): ClarPluginLike | null } }).plugins.getPlugin(
				'clar',
			);
			if (!plugin) {
				throw new Error('Clár plugin is not loaded');
			}
			await plugin.updateSettings(plugin.settings);
		},
		path,
		times,
	);
}

export interface CardIndicatorsSnapshot {
	/** Tooltip (`aria-label`) of the recent icon, or null when it isn't shown. */
	recent: string | null;
	/** Tooltip (`aria-label`) of the stale icon, or null when it isn't shown. */
	stale: string | null;
}

/** A card's recent / stale indicators, read in one in-page call. Null if the card isn't rendered. */
export async function readCardIndicators(cardTitle: string): Promise<CardIndicatorsSnapshot | null> {
	return browser.execute((title) => {
		const card = Array.from(document.querySelectorAll('.clar-kanban-card')).find(
			(el) => el.querySelector('.clar-kanban-card__title')?.textContent === title,
		);
		if (!card) {
			return null;
		}
		return {
			recent: card.querySelector('.clar-kanban-card__indicator--recent')?.getAttribute('aria-label') ?? null,
			stale: card.querySelector('.clar-kanban-card__indicator--stale')?.getAttribute('aria-label') ?? null,
		};
	}, cardTitle);
}

/** Whether the column with the given label renders the "Column options" menu button (spec 11). */
export async function columnHasMenu(columnLabel: string): Promise<boolean> {
	return (await findColumnElement(columnLabel)).$('.clar-kanban-column__menu').isExisting();
}

/**
 * Opens a column's header menu and clicks "Show stale icon", which flips the
 * column's stale switch and saves it to the board's `.base` file.
 * Obsidian draws menus with the OS ("native menus") by default on macOS, which
 * never reach the DOM, so this switches the app to its DOM menus first.
 */
export async function toggleColumnStaleIcon(columnLabel: string): Promise<void> {
	await browser.executeObsidian(({ app }) => {
		(app.vault as unknown as { setConfig(key: string, value: unknown): void }).setConfig('nativeMenus', false);
	});
	await (await findColumnElement(columnLabel)).$('.clar-kanban-column__menu').click();
	const clicked = await browser.waitUntil(
		() =>
			browser.execute(() => {
				const item = Array.from(document.querySelectorAll<HTMLElement>('.menu .menu-item')).find(
					(el) => el.querySelector('.menu-item-title')?.textContent === 'Show stale icon',
				);
				item?.click();
				return item !== undefined;
			}),
		{ timeout: 5000, timeoutMsg: `"Show stale icon" menu item never appeared for column "${columnLabel}"` },
	);
	if (!clicked) {
		throw new Error(`Could not click "Show stale icon" for column "${columnLabel}"`);
	}
	await browser.waitUntil(async () => (await browser.$$('.menu').getElements()).length === 0, {
		timeout: 5000,
		timeoutMsg: 'Column menu never closed',
	});
}

/** The `staleColumns` list stored for a view in a `.base` file (spec 11), or null when unset. */
export async function readBaseStaleColumns(path: string, viewIndex = 0): Promise<unknown> {
	return readBaseViewKey(path, 'staleColumns', viewIndex);
}

/**
 * One key of a view in a `.base` file, or null when that view has no such
 * entry. Parses the raw file with Obsidian's YAML parser, so it reflects what
 * was actually persisted rather than in-memory view state.
 */
export async function readBaseViewKey(path: string, key: string, viewIndex = 0): Promise<unknown> {
	const content = await readNote(path);
	return browser.executeObsidian(
		({ obsidian }, raw, viewKey, index) => {
			const parsed = obsidian.parseYaml(raw) as { views?: Record<string, unknown>[] } | null;
			return parsed?.views?.[index]?.[viewKey] ?? null;
		},
		content,
		key,
		viewIndex,
	);
}

/**
 * Opens a `.base` file without waiting for cards, for boards expected to show
 * an empty state instead, and waits for the board container.
 */
export async function openBaseWithoutCards(path: string): Promise<void> {
	await browser.executeObsidian(async ({ app, obsidian }, basePath) => {
		const file = app.vault.getAbstractFileByPath(basePath);
		if (!(file instanceof obsidian.TFile)) {
			throw new Error(`Expected a file at "${basePath}"`);
		}
		await app.workspace.getLeaf(false).openFile(file);
	}, path);
	await browser.$('.clar-kanban-board').waitForExist({ timeout: 5000 });
}

/** The board's empty-state message, or null when it renders columns. */
export async function readBoardEmptyMessage(): Promise<string | null> {
	return browser.execute(() => document.querySelector('.clar-kanban-empty')?.textContent ?? null);
}
