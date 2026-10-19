import { browser, expect } from '@wdio/globals';
import { describe, it, beforeEach } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';
import {
	closeAllViews,
	DEFAULT_CLAR_SETTINGS,
	openBase,
	readCardIndicators,
	readClarSettings,
	setClarSettings,
	setFileTimes,
	toggleColumnStaleIcon,
	type CardIndicatorsSnapshot,
	type ClarSettingsSnapshot,
} from '../support/kanban-board';

const HOUR = 60 * 60 * 1000;

/** The internal `app.setting` modal, typed only as far as these tests use it. */
interface SettingsModalLike {
	open(): void;
	close(): void;
	openTabById(id: string): void;
	activeTab: { containerEl: HTMLElement } | null;
}
const DAY = 24 * HOUR;

function settingsWith(overrides: (settings: ClarSettingsSnapshot) => void): ClarSettingsSnapshot {
	const settings = JSON.parse(JSON.stringify(DEFAULT_CLAR_SETTINGS)) as ClarSettingsSnapshot;
	overrides(settings);
	return settings;
}

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

describe('Recent and stale card indicators (spec 10)', function () {
	beforeEach(async function () {
		await obsidianPage.resetVault();
		await closeAllViews();
		// Plugin data may survive resetVault(), so always start from the defaults.
		await setClarSettings(DEFAULT_CLAR_SETTINGS);
	});

	it('marks a recently created note as recent', async function () {
		await openBase('Board.base');
		await setFileTimes('Projects/Marketing Plan.md', { createdAgoMs: HOUR, updatedAgoMs: HOUR });

		await waitForIndicators('Marketing Plan', { recent: 'Recently created', stale: null });
	});

	it('marks a note not updated for longer than the timeframe as stale, with a relative time', async function () {
		await openBase('Board.base');
		// Spec 11: the stale icon is hidden per column until turned on from its menu.
		await toggleColumnStaleIcon('in-progress');
		await setFileTimes('Projects/Marketing Plan.md', { createdAgoMs: 30 * DAY, updatedAgoMs: 10 * DAY });

		await waitForIndicators('Marketing Plan', { recent: null, stale: 'Not updated for 1 week' });
	});

	it('shows no indicator for a note that is neither recent nor stale', async function () {
		await openBase('Board.base');
		await setFileTimes('Projects/Mobile App.md', { createdAgoMs: 30 * DAY, updatedAgoMs: 2 * DAY });

		await waitForIndicators('Mobile App', { recent: null, stale: null });
	});

	it('never shows a recent note as stale, even when its update date is old', async function () {
		await openBase('Board.base');
		await setFileTimes('Projects/Marketing Plan.md', { createdAgoMs: HOUR, updatedAgoMs: 30 * DAY });

		await waitForIndicators('Marketing Plan', { recent: 'Recently created', stale: null });
	});

	it('hides the recent icon when "Identify recent cards" is turned off', async function () {
		await openBase('Board.base');
		await setFileTimes('Projects/Marketing Plan.md', { createdAgoMs: HOUR, updatedAgoMs: HOUR });
		await waitForIndicators('Marketing Plan', { recent: 'Recently created', stale: null });

		await setClarSettings(settingsWith((s) => (s.recentCards.enabled = false)));
		await waitForIndicators('Marketing Plan', { recent: null, stale: null });
	});

	it('hides the stale icon when "Identify stale cards" is turned off', async function () {
		await openBase('Board.base');
		// Spec 11: the stale icon is hidden per column until turned on from its menu.
		await toggleColumnStaleIcon('in-progress');
		await setFileTimes('Projects/Marketing Plan.md', { createdAgoMs: 30 * DAY, updatedAgoMs: 10 * DAY });
		await waitForIndicators('Marketing Plan', { recent: null, stale: 'Not updated for 1 week' });

		await setClarSettings(settingsWith((s) => (s.staleCards.enabled = false)));
		await waitForIndicators('Marketing Plan', { recent: null, stale: null });
	});

	it('follows the configured timeframes', async function () {
		await setClarSettings(
			settingsWith((s) => {
				s.recentCards.timeframe = { amount: 1, unit: 'days' };
				s.staleCards.timeframe = { amount: 3, unit: 'days' };
			}),
		);
		await openBase('Board.base');
		await toggleColumnStaleIcon('in-progress');
		await setFileTimes('Projects/Marketing Plan.md', { createdAgoMs: 30 * DAY, updatedAgoMs: 4 * DAY });

		await waitForIndicators('Marketing Plan', { recent: null, stale: 'Not updated for 4 days' });
	});

	it('auto-adjusts the recent timeframe from the settings tab to keep the golden rule', async function () {
		// Obsidian 1.14 can open Settings in its own popout window, so the tab's DOM
		// isn't in this page's `document`: drive it through the tab's containerEl.
		const openedUnit = await browser.executeObsidian(async ({ app }) => {
			const setting = (app as unknown as { setting: SettingsModalLike }).setting;
			setting.open();
			setting.openTabById('clar');
			const select = setting.activeTab?.containerEl.querySelector<HTMLSelectElement>(
				'.clar-setting-staleCards-timeframe select',
			);
			if (!select) {
				throw new Error('Stale timeframe dropdown not found in the Clár settings tab');
			}
			const unit = select.value;
			// Lower stale from 1 week to 1 hour: recent (1 week) must follow it down.
			select.value = 'hours';
			select.dispatchEvent(new Event('change'));
			return unit;
		});
		expect(openedUnit).toBe('weeks');

		try {
			await browser.waitUntil(
				async () => {
					const settings = await readClarSettings();
					return (
						settings.staleCards.timeframe.unit === 'hours' && settings.recentCards.timeframe.unit === 'hours'
					);
				},
				{ timeout: 5000, timeoutMsg: 'Settings were never auto-adjusted to 1 hour / 1 hour' },
			);
			const settings = await readClarSettings();
			expect(settings.staleCards.timeframe).toEqual({ amount: 1, unit: 'hours' });
			expect(settings.recentCards.timeframe).toEqual({ amount: 1, unit: 'hours' });

			// The rebuilt tab shows the adjusted recent value.
			const recentUnit = await browser.executeObsidian(({ app }) => {
				const setting = (app as unknown as { setting: SettingsModalLike }).setting;
				return (
					setting.activeTab?.containerEl.querySelector<HTMLSelectElement>(
						'.clar-setting-recentCards-timeframe select',
					)?.value ?? null
				);
			});
			expect(recentUnit).toBe('hours');
		} finally {
			await browser.executeObsidian(({ app }) => {
				(app as unknown as { setting: SettingsModalLike }).setting.close();
			});
		}
	});
});
