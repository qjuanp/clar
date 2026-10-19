import { browser, expect } from '@wdio/globals';
import { describe, it, beforeEach } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';
import {
	clickColumnMenuItem,
	closeAllViews,
	DEFAULT_CLAR_SETTINGS,
	openBase,
	readBaseViewKey,
	readColumnColor,
	readColumnMenuItems,
	setClarSettings,
	type ColumnColorSnapshot,
} from '../support/kanban-board';

const PALETTE = ['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Pink'];

async function waitForColumnColor(columnLabel: string, color: string | null): Promise<ColumnColorSnapshot> {
	let last: ColumnColorSnapshot | null = null;
	await browser
		.waitUntil(
			async () => {
				last = await readColumnColor(columnLabel);
				return last !== null && last.color === color;
			},
			{ timeout: 5000 },
		)
		.catch(() => {
			throw new Error(`Column "${columnLabel}" color never became ${String(color)}; last seen ${JSON.stringify(last)}`);
		});
	if (!last) {
		throw new Error(`Column "${columnLabel}" not found`);
	}
	return last;
}

/** JSON with sorted keys: the stored map's key order isn't meaningful. */
function canonical(value: unknown): string {
	return JSON.stringify(value, (_key, inner: unknown) =>
		inner !== null && typeof inner === 'object' && !Array.isArray(inner)
			? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
			: inner,
	);
}

async function waitForStoredColors(expected: Record<string, string> | null): Promise<void> {
	let last: unknown = null;
	await browser
		.waitUntil(
			async () => {
				last = await readBaseViewKey('Board.base', 'columnColors');
				return canonical(last) === canonical(expected);
			},
			{ timeout: 5000 },
		)
		.catch(() => {
			throw new Error(`Board.base columnColors never became ${JSON.stringify(expected)}; last seen ${JSON.stringify(last)}`);
		});
}

describe('Column colors', function () {
	beforeEach(async function () {
		await obsidianPage.resetVault();
		await closeAllViews();
		await setClarSettings(DEFAULT_CLAR_SETTINGS);
		await openBase('Board.base');
	});

	it('gives no column a color by default', async function () {
		for (const label of ['todo', 'in-progress', 'done', 'cancelled', 'No column']) {
			expect(await readColumnColor(label)).toEqual({ color: null, cardShadow: 'none' });
		}
		expect(await readBaseViewKey('Board.base', 'columnColors')).toBeNull();

		const items = await readColumnMenuItems('todo');
		expect(items.map((item) => item.title)).toEqual(['Show stale icon', 'No color', ...PALETTE]);
		expect(items.find((item) => item.title === 'No color')?.checked).toBe(true);
	});

	it("shades only that column's cards and saves the color in the base", async function () {
		await clickColumnMenuItem('in-progress', 'Red');

		const colored = await waitForColumnColor('in-progress', 'red');
		expect(colored.cardShadow).not.toBe('none');
		expect(await readColumnColor('todo')).toEqual({ color: null, cardShadow: 'none' });
		await waitForStoredColors({ 'in-progress': 'red' });
		expect(await readColumnMenuItems('in-progress')).toContainEqual({ title: 'Red', checked: true });
	});

	it('replaces the color with another one, and "No color" removes it', async function () {
		await clickColumnMenuItem('todo', 'Green');
		await waitForColumnColor('todo', 'green');
		await clickColumnMenuItem('done', 'Blue');
		await waitForColumnColor('done', 'blue');

		await clickColumnMenuItem('todo', 'Purple');
		await waitForColumnColor('todo', 'purple');
		await waitForStoredColors({ todo: 'purple', done: 'blue' });

		await clickColumnMenuItem('todo', 'No color');
		const cleared = await waitForColumnColor('todo', null);
		expect(cleared.cardShadow).toBe('none');
		await waitForStoredColors({ done: 'blue' });
	});

	it('keeps the color after the board is closed and reopened', async function () {
		await clickColumnMenuItem('done', 'Orange');
		await waitForStoredColors({ done: 'orange' });

		await closeAllViews();
		await openBase('Board.base');
		await waitForColumnColor('done', 'orange');
	});

	it('can color the "No column" column', async function () {
		await clickColumnMenuItem('No column', 'Cyan');

		await waitForColumnColor('No column', 'cyan');
		// Stored under NO_COLUMN_ID, so a real "No column" value can't collide with it.
		await waitForStoredColors({ '__no-column__': 'cyan' });
	});

	it('offers the colors while "Identify stale cards" is off', async function () {
		const staleOff = JSON.parse(JSON.stringify(DEFAULT_CLAR_SETTINGS)) as typeof DEFAULT_CLAR_SETTINGS;
		staleOff.staleCards.enabled = false;
		await setClarSettings(staleOff);

		await browser.waitUntil(
			async () => !(await readColumnMenuItems('todo')).some((item) => item.title === 'Show stale icon'),
			{ timeout: 5000, timeoutMsg: 'The stale item was still in the menu with stale cards off' },
		);
		expect((await readColumnMenuItems('todo')).map((item) => item.title)).toEqual(['No color', ...PALETTE]);

		await clickColumnMenuItem('todo', 'Yellow');
		await waitForColumnColor('todo', 'yellow');
	});
});
