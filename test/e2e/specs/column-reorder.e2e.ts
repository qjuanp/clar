import { browser, expect } from '@wdio/globals';
import { describe, it, beforeEach } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';
import {
	closeAllViews,
	columnHasHandle,
	collapseSidebars,
	dragCardToColumn,
	dragColumn,
	openBase,
	readBaseGroupOrder,
	readColumnLabels,
	readFrontmatterProperty,
} from '../support/kanban-board';

/** The manual group order entry Bases stores for a column label: `[label]` for a list value, null for "No column". */
function orderEntry(label: string): string[] | null {
	return label === 'No column' ? null : [label];
}

/** Board.base's manual group order as seeded in the fixture. */
const SEEDED_ORDER = [['todo'], ['in-progress'], ['done'], ['cancelled'], null];

/**
 * Waits until the `.base` file's persisted `groupOrder` (spec 12) equals `expected`.
 * Bases saves view-config changes on a debounce (~2s), hence the long timeout.
 */
async function waitForPersistedOrder(path: string, expected: unknown[]): Promise<void> {
	let last: unknown = null;
	await browser
		.waitUntil(
			async () => {
				last = await readBaseGroupOrder(path);
				return JSON.stringify(last) === JSON.stringify(expected);
			},
			{ timeout: 10000 },
		)
		.catch(() => {
			throw new Error(`${path} groupOrder never became ${JSON.stringify(expected)}; last seen ${JSON.stringify(last)}`);
		});
}

describe('Column reorder via drag and drop', function () {
	beforeEach(async function () {
		await obsidianPage.resetVault();
		await closeAllViews();
		// The test window can't be resized; collapsing the sidebars keeps most of the board on screen.
		await collapseSidebars();
	});

	it('moves a column by its handle and saves the new order as the Bases group order', async function () {
		await openBase('Board.base');
		expect(await readColumnLabels()).toEqual(['todo', 'in-progress', 'done', 'cancelled', 'No column']);

		await dragColumn('done', 'todo', { side: 'before' });

		// The persisted order is the source of truth; check it before the DOM.
		await waitForPersistedOrder('Board.base', [['done'], ['todo'], ['in-progress'], ['cancelled'], null]);
		expect(await readColumnLabels()).toEqual(['done', 'todo', 'in-progress', 'cancelled', 'No column']);
	});

	it('switches "Group by" to a manual order when the view sorted by value', async function () {
		await openBase('Board Unordered.base');
		expect(await readBaseGroupOrder('Board Unordered.base')).toBeNull();

		const before = await readColumnLabels();
		const [first, second] = before;
		if (first === undefined || second === undefined || first === 'No column' || second === 'No column') {
			throw new Error('Expected at least two real columns first');
		}
		await dragColumn(second, first, { side: 'before' });

		const expected = [second, first, ...before.slice(2)];
		await waitForPersistedOrder('Board Unordered.base', expected.map(orderEntry));
		expect(await readColumnLabels()).toEqual(expected);
	});

	it('only starts a column drag from the handle, not from the title text', async function () {
		await openBase('Board.base');
		await dragColumn('done', 'todo', { side: 'before', grabSelector: '.clar-kanban-column__title' });

		await browser.pause(500);
		expect(await readColumnLabels()).toEqual(['todo', 'in-progress', 'done', 'cancelled', 'No column']);
		expect(await readBaseGroupOrder('Board.base')).toEqual(SEEDED_ORDER);
	});

	it('still moves cards between columns after a column reorder', async function () {
		await openBase('Board.base');
		await dragColumn('done', 'todo', { side: 'before' });
		await waitForPersistedOrder('Board.base', [['done'], ['todo'], ['in-progress'], ['cancelled'], null]);

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

	it('"No column" has no handle, but sits where the group order puts it and keeps that place (spec 12)', async function () {
		// Move "No column" (null) to the front of Board.base's manual group order.
		await browser.executeObsidian(async ({ app }) => {
			const file = app.vault.getFileByPath('Board.base');
			if (!file) {
				throw new Error('Expected Board.base');
			}
			await app.vault.process(file, (content) =>
				content.replace('      - null\n', '').replace('    groupOrder:\n', '    groupOrder:\n      - null\n'),
			);
		});
		await openBase('Board.base');
		expect(await readColumnLabels()).toEqual(['No column', 'todo', 'in-progress', 'done', 'cancelled']);
		expect(await columnHasHandle('No column')).toBe(false);
		expect(await columnHasHandle('todo')).toBe(true);

		await dragColumn('done', 'todo', { side: 'before' });

		await waitForPersistedOrder('Board.base', [null, ['done'], ['todo'], ['in-progress'], ['cancelled']]);
		expect(await readColumnLabels()).toEqual(['No column', 'done', 'todo', 'in-progress', 'cancelled']);
	});
});
