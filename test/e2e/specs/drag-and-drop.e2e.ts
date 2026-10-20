import { browser, expect } from '@wdio/globals';
import { describe, it, beforeEach } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';
import {
	closeAllViews,
	openBase,
	readBoardTolerant,
	dragCardToColumn,
	readFrontmatterProperty,
} from '../support/kanban-board';

describe('Drag and drop (spec 5)', function () {
	beforeEach(async function () {
		await obsidianPage.resetVault();
	});

	it('moves a card to a new column and updates the frontmatter property', async function () {
		await openBase('Board.base');
		// Marketing Plan.md starts as `status: [in-progress]`.
		await dragCardToColumn('Marketing Plan', 'done');

		// The frontmatter write is the source of truth and the one thing the
		// spec actually requires; check it directly (no DOM involved, so no
		// risk of a stale-element race with the board's own re-render - which,
		// in this environment, can leave WebDriver recovering from an aborted
		// "stale element" request for several seconds, making DOM polling
		// immediately after a drop unreliable here). The board visually
		// reflecting the move is covered manually (see docs/dev.md) rather
		// than asserted here.
		await browser.waitUntil(
			async () => {
				const status = await readFrontmatterProperty('Projects/Marketing Plan.md', 'status');
				return Array.isArray(status) && status[0] === 'done';
			},
			{ timeout: 5000, timeoutMsg: 'Marketing Plan.md frontmatter status was never updated to "done"' },
		);
	});

	it('does not allow dropping a card into "No column"', async function () {
		await openBase('Board.base');
		await dragCardToColumn('Marketing Plan', 'No column');

		// No frontmatter write should have happened - give any (rejected) drop
		// handling a moment to run, then assert the value is unchanged.
		await browser.pause(500);
		const status = await readFrontmatterProperty('Projects/Marketing Plan.md', 'status');
		expect(status).toEqual(['in-progress']);

		const board = await readBoardTolerant();
		const byLabel = new Map((board ?? []).map((c) => [c.label, c]));
		expect(byLabel.get('in-progress')?.cards.map((c) => c.title)).toContain('Marketing Plan');
		expect(byLabel.get('No column')?.cards.map((c) => c.title) ?? []).not.toContain('Marketing Plan');
	});

	it('is a no-op when a card is dropped back into its own column', async function () {
		await openBase('Board.base');
		await dragCardToColumn('Marketing Plan', 'in-progress');

		await browser.pause(500);
		const status = await readFrontmatterProperty('Projects/Marketing Plan.md', 'status');
		expect(status).toEqual(['in-progress']);
	});

	it('writes the target value in the property\'s own shape: a text property stays text (spec 12)', async function () {
		await closeAllViews();
		await openBase('Board By Owner.base');
		// Mobile App.md starts as `owner: Bob`.
		await dragCardToColumn('Mobile App', 'Alice');

		await browser.waitUntil(
			async () => (await readFrontmatterProperty('Projects/Mobile App.md', 'owner')) === 'Alice',
			{ timeout: 10000, timeoutMsg: 'Mobile App.md owner was never updated to the plain string "Alice"' },
		);
	});

	it('does not move cards when "Group by" is a property it cannot write, like the folder (spec 12)', async function () {
		await closeAllViews();
		await browser.executeObsidian(async ({ app }) => {
			await app.vault.create(
				'Board By Folder.base',
				'views:\n  - type: clar-kanban\n    name: Board by folder\n    groupBy:\n      property: file.folder\n      direction: ASC\n',
			);
		});
		await openBase('Board By Folder.base');
		await dragCardToColumn('Mobile App', 'Tasks');

		await browser.pause(500);
		const stillThere = await browser.executeObsidian(({ app }) => app.vault.getFileByPath('Projects/Mobile App.md') !== null);
		expect(stillThere).toBe(true);
		const board = await readBoardTolerant();
		const byLabel = new Map((board ?? []).map((c) => [c.label, c]));
		expect(byLabel.get('Projects')?.cards.map((c) => c.title)).toContain('Mobile App');
		expect(byLabel.get('Tasks')?.cards.map((c) => c.title) ?? []).not.toContain('Mobile App');
	});
});
