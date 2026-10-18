import { browser, expect } from '@wdio/globals';
import { describe, it, beforeEach } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';
import {
	closeAllViews,
	collapseSidebars,
	columnHasHandle,
	dragCardToColumn,
	dragColumn,
	openBase,
	readBaseColumnOrder,
	readColumnLabels,
	readFrontmatterProperty,
	scrollBoardToEnd,
} from '../support/kanban-board';

/**
 * Waits until the `.base` file's persisted `columnOrder` equals `expected`.
 * Bases saves view-config changes on a debounce (~2s), hence the long timeout.
 */
async function waitForPersistedOrder(path: string, expected: string[]): Promise<void> {
	await browser.waitUntil(
		async () => JSON.stringify(await readBaseColumnOrder(path)) === JSON.stringify(expected),
		{
			timeout: 10000,
			timeoutMsg: `${path} columnOrder never became "${expected.join(', ')}"`,
		},
	);
}

describe('Column reorder via drag and drop', function () {
	beforeEach(async function () {
		await obsidianPage.resetVault();
		await closeAllViews();
		// The test window can't be resized; collapsing the sidebars keeps most of the board on screen.
		await collapseSidebars();
	});

	it('moves a column by its handle and writes the new order into the column order option', async function () {
		await openBase('Board.base');
		expect(await readColumnLabels()).toEqual(['todo', 'in-progress', 'done', 'cancelled', 'No column']);

		await dragColumn('done', 'todo', { side: 'before' });

		// The persisted option is the source of truth; check it before the DOM.
		await waitForPersistedOrder('Board.base', ['done', 'todo', 'in-progress', 'cancelled']);
		expect(await readColumnLabels()).toEqual(['done', 'todo', 'in-progress', 'cancelled', 'No column']);
	});

	it('creates a column order when the view had none configured', async function () {
		await openBase('Board Unordered.base');
		expect(await readBaseColumnOrder('Board Unordered.base')).toBeNull();

		const before = (await readColumnLabels()).filter((label) => label !== 'No column');
		const [first, second] = before;
		if (first === undefined || second === undefined) {
			throw new Error('Expected at least two real columns');
		}
		await dragColumn(second, first, { side: 'before' });

		const expected = [second, first, ...before.slice(2)];
		await waitForPersistedOrder('Board Unordered.base', expected);
		expect(await readColumnLabels()).toEqual([...expected, 'No column']);
	});

	it('only starts a column drag from the handle, not from the title text', async function () {
		await openBase('Board.base');
		await dragColumn('done', 'todo', { side: 'before', grabSelector: '.clar-kanban-column__title' });

		await browser.pause(500);
		expect(await readColumnLabels()).toEqual(['todo', 'in-progress', 'done', 'cancelled', 'No column']);
		expect(await readBaseColumnOrder('Board.base')).toEqual(['todo', 'in-progress', 'done', 'cancelled']);
	});

	it('keeps "No column" pinned last, with no handle of its own', async function () {
		await openBase('Board.base');
		expect(await columnHasHandle('No column')).toBe(false);
		expect(await columnHasHandle('todo')).toBe(true);

		// Try to drop a column past "No column": it may land just before it, never after.
		// This asserts the outcome only. The simulated pointer path happens to settle
		// before "No column" even without render.ts's `onMove` guard, so the guard
		// itself (which covers a real user releasing mid-swap) isn't isolated here.
		await scrollBoardToEnd();
		await dragColumn('done', 'No column', { side: 'after' });

		// Check the DOM straight after the drop too, not only after the debounced
		// config save re-renders the board (which always rebuilds "No column" last).
		expect(await readColumnLabels()).toEqual(['todo', 'in-progress', 'cancelled', 'done', 'No column']);
		await waitForPersistedOrder('Board.base', ['todo', 'in-progress', 'cancelled', 'done']);
		expect(await readColumnLabels()).toEqual(['todo', 'in-progress', 'cancelled', 'done', 'No column']);
	});

	it('still moves cards between columns after a column reorder', async function () {
		await openBase('Board.base');
		await dragColumn('done', 'todo', { side: 'before' });
		await waitForPersistedOrder('Board.base', ['done', 'todo', 'in-progress', 'cancelled']);

		// Marketing Plan.md starts as `status: [in-progress]`.
		await dragCardToColumn('Marketing Plan', 'done');
		await browser.waitUntil(
			async () => {
				const status = await readFrontmatterProperty('Projects/Marketing Plan.md', 'status');
				return Array.isArray(status) && status[0] === 'done';
			},
			{ timeout: 5000, timeoutMsg: 'Marketing Plan.md frontmatter status was never updated to "done"' },
		);
	});
});
