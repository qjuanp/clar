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
	/** null when the card has no `clar-kanban-card__meta` block (no tasks in the note). */
	activeTasks: number | null;
	progressPercent: number | null;
}

export interface BoardColumn {
	label: string;
	cards: BoardCard[];
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
			const metaEl = cardEl.$('.clar-kanban-card__meta');
			if (!(await metaEl.isExisting())) {
				return { title, activeTasks: null, progressPercent: null };
			}
			const activeTasksText = await metaEl.$('.clar-kanban-card__active-tasks').getText();
			const progressText = await metaEl.$('.clar-kanban-card__progress').getText();
			return {
				title,
				activeTasks: parseCount(activeTasksText),
				progressPercent: parseCount(progressText),
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
				const metaEl = cardEl.$('.clar-kanban-card__meta');
				if (!(await metaEl.isExisting())) {
					cards.push({ title, activeTasks: null, progressPercent: null });
					continue;
				}
				const activeTasksText = await metaEl.$('.clar-kanban-card__active-tasks').getText();
				const progressText = await metaEl.$('.clar-kanban-card__progress').getText();
				cards.push({
					title,
					activeTasks: parseCount(activeTasksText),
					progressPercent: parseCount(progressText),
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
