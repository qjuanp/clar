import { browser, expect } from '@wdio/globals';
import { describe, it, beforeEach } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';
import {
	closeAllViews,
	openBase,
	openBaseWithoutCards,
	readBoard,
	readBoardEmptyMessage,
	readColumnLabels,
} from '../support/kanban-board';

describe('Kanban board columns (spec 1)', function () {
	beforeEach(async function () {
		await obsidianPage.resetVault();
	});

	it('renders one column per status group, in the Bases group order, with "No column" where that order puts it', async function () {
		await openBase('Board.base');
		const board = await readBoard();

		expect(board.map((column) => column.label)).toEqual(['todo', 'in-progress', 'done', 'cancelled', 'No column']);

		const byLabel = new Map(board.map((column) => [column.label, column]));
		expect(byLabel.get('todo')?.cards.map((c) => c.title).sort()).toEqual(['Mobile App', 'Website Redesign']);
		expect(byLabel.get('in-progress')?.cards.map((c) => c.title)).toEqual(['Marketing Plan']);
		expect(byLabel.get('done')?.cards.map((c) => c.title)).toEqual(['Migrate Database']);
		expect(byLabel.get('cancelled')?.cards.map((c) => c.title)).toEqual(['Legacy System']);
		// "Old Prototype" has no `status` frontmatter property at all.
		expect(byLabel.get('No column')?.cards.map((c) => c.title)).toEqual(['Old Prototype']);
	});

	it('never shows a note excluded by the base\'s own filter, even if its status would match a column', async function () {
		await openBase('Board.base');
		const board = await readBoard();

		const allTitles = board.flatMap((column) => column.cards.map((c) => c.title));
		// "Deprecated Portal" lives outside Projects/, so Board.base's
		// `file.inFolder("Projects")` filter should exclude it entirely.
		expect(allTitles).not.toContain('Deprecated Portal');
	});

	it('follows the "Group by" direction when there is no manual group order', async function () {
		// Board Unordered.base groups by `status` ascending, with no `groupOrder`:
		// Bases sorts the groups by value and puts the group with no value last.
		await openBase('Board Unordered.base');
		const board = await readBoard();

		expect(board.map((column) => column.label)).toEqual(['cancelled', 'done', 'in-progress', 'todo', 'No column']);
		const byLabel = new Map(board.map((column) => [column.label, column]));
		expect(byLabel.get('todo')?.cards.map((c) => c.title).sort()).toEqual(['Mobile App', 'Website Redesign']);
	});

	it('asks for a "Group by" when the view has none (spec 12)', async function () {
		await closeAllViews();
		await openBaseWithoutCards('Board No Group.base');

		await browser.waitUntil(async () => (await readBoardEmptyMessage()) !== null, {
			timeout: 5000,
			timeoutMsg: 'The board never showed its empty-state prompt',
		});
		expect(await readBoardEmptyMessage()).toBe('Set "Group by" in the base toolbar to build columns.');
		expect(await readColumnLabels()).toEqual([]);
	});

	it('hides values that are not listed in a manual group order, like Bases does (spec 12)', async function () {
		await closeAllViews();
		// Drop `cancelled` from Board.base's manual group order before opening it.
		await browser.executeObsidian(async ({ app }) => {
			const file = app.vault.getFileByPath('Board.base');
			if (!file) {
				throw new Error('Expected Board.base');
			}
			await app.vault.process(file, (content) => content.replace('      - [cancelled]\n', ''));
		});
		await openBase('Board.base');

		expect(await readColumnLabels()).toEqual(['todo', 'in-progress', 'done', 'No column']);
	});
});
