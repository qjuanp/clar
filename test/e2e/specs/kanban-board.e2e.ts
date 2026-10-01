import { expect } from '@wdio/globals';
import { describe, it, beforeEach } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';
import { openBase, readBoard } from '../support/kanban-board';

describe('Kanban board columns (spec 1)', function () {
	beforeEach(async function () {
		await obsidianPage.resetVault();
	});

	it('renders one column per configured status, in the configured order, with a trailing "No column" bucket', async function () {
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

	it('groups the same set of notes into columns even without a configured column order', async function () {
		// Board Unordered.base groups by the same `status` property but has no
		// `columnOrder` set. Bases' own default ordering of query results isn't
		// part of this plugin's contract, so this only asserts the resulting set
		// of columns/cards is correct, not a specific column sequence.
		await openBase('Board Unordered.base');
		const board = await readBoard();

		expect(board.map((column) => column.label).sort()).toEqual(
			['No column', 'cancelled', 'done', 'in-progress', 'todo'].sort(),
		);
		const byLabel = new Map(board.map((column) => [column.label, column]));
		expect(byLabel.get('todo')?.cards.map((c) => c.title).sort()).toEqual(['Mobile App', 'Website Redesign']);
	});
});
