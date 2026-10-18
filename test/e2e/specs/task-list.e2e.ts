import { browser, expect } from '@wdio/globals';
import { describe, it, beforeEach } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';
import {
	activeFilePath,
	clickTaskCheckbox,
	closeAllViews,
	openBase,
	readNote,
	readTaskList,
	expandTaskList,
	type TaskListItem,
} from '../support/kanban-board';

/**
 * Waits until a card's expanded task list satisfies `ready`. Rows appear
 * first and their text is filled in asynchronously by MarkdownRenderer, so
 * tests wait on the text rather than just the row count.
 */
async function waitForTasks(cardTitle: string, ready: (items: TaskListItem[]) => boolean): Promise<void> {
	await browser.waitUntil(
		async () => {
			const items = (await readTaskList(cardTitle))?.items ?? [];
			return items.length > 0 && items.every((item) => item.text.length > 0) && ready(items);
		},
		{ timeout: 5000, timeoutMsg: `Task list for "${cardTitle}" never finished rendering` },
	);
}

describe('Task list in cards (spec 6)', function () {
	beforeEach(async function () {
		await obsidianPage.resetVault();
		await closeAllViews();
	});

	it('is collapsed by default', async function () {
		await openBase('Task List.base');

		const snapshot = await readTaskList('Nested Tasks');
		expect(snapshot?.expanded).toBe(false);
		// Lazily filled: nothing is rendered until the card is expanded.
		expect(snapshot?.items).toEqual([]);
	});

	it('shows tasks in file order, respecting their nesting, once expanded', async function () {
		await openBase('Task List.base');
		await expandTaskList('Nested Tasks');

		await waitForTasks('Nested Tasks', () => true);
		const snapshot = await readTaskList('Nested Tasks');
		expect(snapshot?.expanded).toBe(true);
		expect(snapshot?.items).toEqual([
			{ text: 'Plan release', checked: false, depth: 0 },
			{ text: 'Pick a date', checked: true, depth: 1 },
			{ text: 'Write notes for Mobile App', checked: false, depth: 1 },
			{ text: 'Draft changelog', checked: false, depth: 2 },
			// Nested under a plain (non-task) bullet with no task ancestor: shown as a root.
			{ text: 'Orphan under a plain bullet', checked: false, depth: 0 },
			{ text: 'Ship it', checked: true, depth: 0 },
		]);
		// Expanding the list must not open the note (the card's own click action).
		expect(await activeFilePath()).toBe('Task List.base');
	});

	it('writes a completed task back to the note and stays expanded after the re-render', async function () {
		await openBase('Task List.base');
		await expandTaskList('Nested Tasks');
		await waitForTasks('Nested Tasks', () => true);

		await clickTaskCheckbox('Nested Tasks', 'Draft changelog');

		await browser.waitUntil(async () => (await readNote('Tasks/Nested Tasks.md')).includes('\t\t- [x] Draft **changelog**'), {
			timeout: 5000,
			timeoutMsg: 'Task completion was never written to the note',
		});
		const note = await readNote('Tasks/Nested Tasks.md');
		// Only that one line changed.
		expect(note).toContain('\t- [ ] Write notes for [[Mobile App]]');
		expect(note).toContain('- [ ] Plan release');

		await browser.waitUntil(
			async () => {
				const snapshot = await readTaskList('Nested Tasks');
				return snapshot?.items.find((item) => item.text === 'Draft changelog')?.checked === true;
			},
			{ timeout: 5000, timeoutMsg: 'Re-rendered task list never showed the task as done' },
		);
		expect((await readTaskList('Nested Tasks'))?.expanded).toBe(true);
		expect(await activeFilePath()).toBe('Task List.base');
	});

	it('scrolls when the list holds more than 10 tasks', async function () {
		await openBase('Task List.base');
		await expandTaskList('Long Checklist');
		await waitForTasks('Long Checklist', (items) => items.length === 14);

		expect((await readTaskList('Long Checklist'))?.scrollable).toBe(true);
	});

	it('renders no task list when the view option is turned off, but keeps the task stats', async function () {
		await openBase('Task List Hidden.base');

		expect(await readTaskList('Nested Tasks')).toBeNull();
		expect(await browser.$$('.clar-kanban-card__tasks-toggle').length).toBe(0);
		expect(await browser.$$('.clar-kanban-card__tasks-list').length).toBe(0);
		// The active-task count and progress bar don't depend on the option.
		expect(await browser.$$('.clar-kanban-card__tasks').length).toBeGreaterThan(0);
		expect(await browser.$$('.clar-kanban-card__active-tasks').length).toBeGreaterThan(0);
		expect(await browser.$$('.clar-kanban-card__progress').length).toBeGreaterThan(0);
	});
});
