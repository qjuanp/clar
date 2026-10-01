import { browser, expect } from '@wdio/globals';
import { describe, it, beforeEach } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';
import { openBase, readBoard, type BoardColumn } from '../support/kanban-board';

function findCard(board: BoardColumn[], title: string) {
	const card = board.flatMap((column) => column.cards).find((c) => c.title === title);
	if (!card) {
		throw new Error(`Card not found: ${title}`);
	}
	return card;
}

describe('Card task details (spec 2)', function () {
	beforeEach(async function () {
		await obsidianPage.resetVault();
	});

	it('shows the active task count and rounded progress percentage for a note with mixed tasks', async function () {
		await openBase('Board.base');
		const board = await readBoard();

		// Mobile App.md: 2 of 3 tasks done -> 1 active, 66.6...% rounds to 67%.
		expect(findCard(board, 'Mobile App')).toEqual({
			title: 'Mobile App',
			activeTasks: 1,
			progressPercent: 67,
		});
	});

	it('shows 0% progress when every task is incomplete', async function () {
		await openBase('Board.base');
		const board = await readBoard();

		expect(findCard(board, 'Marketing Plan')).toEqual({
			title: 'Marketing Plan',
			activeTasks: 2,
			progressPercent: 0,
		});
	});

	it('shows 100% progress and zero active tasks when every task is done', async function () {
		await openBase('Board.base');
		const board = await readBoard();

		expect(findCard(board, 'Migrate Database')).toEqual({
			title: 'Migrate Database',
			activeTasks: 0,
			progressPercent: 100,
		});
	});

	it('shows no meta block at all for a note with zero tasks', async function () {
		await openBase('Board.base');
		const board = await readBoard();

		expect(findCard(board, 'Website Redesign')).toEqual({
			title: 'Website Redesign',
			activeTasks: null,
			progressPercent: null,
		});
	});

	it('re-renders the board when a checkbox is toggled on disk, without navigating away', async function () {
		await openBase('Board.base');
		expect(findCard(await readBoard(), 'Mobile App').activeTasks).toBe(1);

		// Toggling a checkbox edits the note body, not a tracked frontmatter
		// property - this exercises the metadataCache 'changed' listener in
		// view.ts that keeps task counts live without a query re-run.
		await browser.executeObsidian(async ({ app }) => {
			const file = app.vault.getFileByPath('Projects/Mobile App.md');
			if (!file) {
				throw new Error('Projects/Mobile App.md not found');
			}
			await app.vault.process(file, (data) =>
				data.replace('- [ ] Implement push notifications', '- [x] Implement push notifications'),
			);
		});

		await browser.waitUntil(async () => (await readBoard()).some((c) => c.cards.some((card) => card.title === 'Mobile App' && card.activeTasks === 0)), {
			timeout: 5000,
			timeoutMsg: 'Board did not re-render after the checkbox was toggled on disk',
		});

		expect(findCard(await readBoard(), 'Mobile App')).toEqual({
			title: 'Mobile App',
			activeTasks: 0,
			progressPercent: 100,
		});
	});
});
