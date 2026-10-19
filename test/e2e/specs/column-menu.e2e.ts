import { browser, expect } from '@wdio/globals';
import { describe, it, beforeEach } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';
import {
	closeAllViews,
	columnHasMenu,
	DEFAULT_CLAR_SETTINGS,
	openBase,
	readBaseStaleColumns,
	readCardIndicators,
	readColumnMenuItems,
	setClarSettings,
	setFileTimes,
	toggleColumnStaleIcon,
	type CardIndicatorsSnapshot,
} from '../support/kanban-board';

const DAY = 24 * 60 * 60 * 1000;
const STALE_TIMES = { createdAgoMs: 30 * DAY, updatedAgoMs: 10 * DAY };
const STALE: CardIndicatorsSnapshot = { recent: null, stale: 'Not updated for 1 week' };
const NONE: CardIndicatorsSnapshot = { recent: null, stale: null };

async function waitForIndicators(cardTitle: string, expected: CardIndicatorsSnapshot): Promise<void> {
	let last: CardIndicatorsSnapshot | null = null;
	await browser
		.waitUntil(
			async () => {
				last = await readCardIndicators(cardTitle);
				return JSON.stringify(last) === JSON.stringify(expected);
			},
			{ timeout: 5000 },
		)
		.catch(() => {
			throw new Error(
				`Indicators for "${cardTitle}" never became ${JSON.stringify(expected)}; last seen ${JSON.stringify(last)}`,
			);
		});
}

async function waitForStoredStaleColumns(expected: string[]): Promise<void> {
	let last: unknown = null;
	await browser
		.waitUntil(
			async () => {
				last = await readBaseStaleColumns('Board.base');
				return JSON.stringify(last) === JSON.stringify(expected);
			},
			{ timeout: 5000 },
		)
		.catch(() => {
			throw new Error(`Board.base staleColumns never became ${JSON.stringify(expected)}; last seen ${JSON.stringify(last)}`);
		});
}

describe('Column menu: per-column stale icon (spec 11)', function () {
	beforeEach(async function () {
		await obsidianPage.resetVault();
		await closeAllViews();
		await setClarSettings(DEFAULT_CLAR_SETTINGS);
		await openBase('Board.base');
		await setFileTimes('Projects/Marketing Plan.md', STALE_TIMES);
		await setFileTimes('Projects/Mobile App.md', STALE_TIMES);
	});

	it('hides the stale icon by default', async function () {
		await waitForIndicators('Marketing Plan', NONE);
		await waitForIndicators('Mobile App', NONE);
		expect(await readBaseStaleColumns('Board.base')).toBeNull();
	});

	it('shows the stale icon only in the column where it was turned on, and saves it in the base', async function () {
		await toggleColumnStaleIcon('in-progress');

		await waitForIndicators('Marketing Plan', STALE);
		await waitForIndicators('Mobile App', NONE);
		await waitForStoredStaleColumns(['in-progress']);
	});

	it('hides the stale icon again when turned off', async function () {
		await toggleColumnStaleIcon('in-progress');
		await waitForIndicators('Marketing Plan', STALE);

		await toggleColumnStaleIcon('in-progress');
		await waitForIndicators('Marketing Plan', NONE);
		await waitForStoredStaleColumns([]);
	});

	it('keeps the choice after the board is closed and reopened', async function () {
		await toggleColumnStaleIcon('todo');
		await waitForStoredStaleColumns(['todo']);

		await closeAllViews();
		await openBase('Board.base');
		await setFileTimes('Projects/Mobile App.md', STALE_TIMES);
		await waitForIndicators('Mobile App', STALE);
		await waitForIndicators('Marketing Plan', NONE);
	});

	it('drops the stale item from the menu while "Identify stale cards" is off and restores the saved choice after', async function () {
		await toggleColumnStaleIcon('in-progress');
		await waitForIndicators('Marketing Plan', STALE);

		const staleOff = JSON.parse(JSON.stringify(DEFAULT_CLAR_SETTINGS)) as typeof DEFAULT_CLAR_SETTINGS;
		staleOff.staleCards.enabled = false;
		await setClarSettings(staleOff);
		await waitForIndicators('Marketing Plan', NONE);
		// The menu stays for the column colors; only its stale item goes.
		expect(await columnHasMenu('in-progress')).toBe(true);
		const titlesOff = (await readColumnMenuItems('in-progress')).map((item) => item.title);
		expect(titlesOff).not.toContain('Show stale icon');

		await setClarSettings(DEFAULT_CLAR_SETTINGS);
		await waitForIndicators('Marketing Plan', STALE);
		expect(await readColumnMenuItems('in-progress')).toContainEqual({ title: 'Show stale icon', checked: true });
	});

	it('works for the "No column" column', async function () {
		await setFileTimes('Projects/Old Prototype.md', STALE_TIMES);
		await waitForIndicators('Old Prototype', NONE);

		await toggleColumnStaleIcon('No column');
		await waitForIndicators('Old Prototype', STALE);
		await waitForIndicators('Marketing Plan', NONE);
		await waitForStoredStaleColumns(['__no-column__']);
	});
});
