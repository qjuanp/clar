import { describe, expect, it } from 'vitest';
import {
	applyTimeframeChange,
	clampAmount,
	createDefaultSettings,
	formatTimeframe,
	sanitizeSettings,
	timeframeToMs,
	type ClarSettings,
	type Timeframe,
} from './settings-model';

function settingsWith(recent: Timeframe, stale: Timeframe): ClarSettings {
	const settings = createDefaultSettings();
	settings.recentCards.timeframe = recent;
	settings.staleCards.timeframe = stale;
	return settings;
}

describe('createDefaultSettings', () => {
	it('enables both indicators with a 1 week timeframe', () => {
		expect(createDefaultSettings()).toEqual({
			recentCards: { enabled: true, timeframe: { amount: 1, unit: 'weeks' } },
			staleCards: { enabled: true, timeframe: { amount: 1, unit: 'weeks' } },
		});
	});

	it('returns a fresh object on every call', () => {
		const first = createDefaultSettings();
		first.recentCards.timeframe.amount = 5;
		expect(createDefaultSettings().recentCards.timeframe.amount).toBe(1);
	});
});

describe('clampAmount', () => {
	it('keeps amounts positive', () => {
		expect(clampAmount(0, 'days')).toBe(1);
		expect(clampAmount(-5, 'days')).toBe(1);
		expect(clampAmount(Number.NaN, 'days')).toBe(1);
	});

	it('only allows whole numbers', () => {
		expect(clampAmount(2.7, 'days')).toBe(2);
	});

	it('caps each unit at its maximum, inclusive', () => {
		expect(clampAmount(13, 'months')).toBe(12);
		expect(clampAmount(54, 'weeks')).toBe(53);
		expect(clampAmount(32, 'days')).toBe(31);
		expect(clampAmount(25, 'hours')).toBe(24);
		expect(clampAmount(24, 'hours')).toBe(24);
	});
});

describe('timeframeToMs', () => {
	it('counts a month as 30 days', () => {
		expect(timeframeToMs({ amount: 1, unit: 'months' })).toBe(timeframeToMs({ amount: 30, unit: 'days' }));
	});

	it('makes 12 months shorter than 53 weeks', () => {
		expect(timeframeToMs({ amount: 12, unit: 'months' })).toBeLessThan(timeframeToMs({ amount: 53, unit: 'weeks' }));
	});
});

describe('formatTimeframe', () => {
	it('uses the singular for one and the plural otherwise', () => {
		expect(formatTimeframe({ amount: 1, unit: 'weeks' })).toBe('1 week');
		expect(formatTimeframe({ amount: 2, unit: 'weeks' })).toBe('2 weeks');
		expect(formatTimeframe({ amount: 1, unit: 'hours' })).toBe('1 hour');
		expect(formatTimeframe({ amount: 12, unit: 'months' })).toBe('12 months');
	});
});

describe('sanitizeSettings', () => {
	it('returns defaults for missing or invalid data', () => {
		expect(sanitizeSettings(undefined)).toEqual(createDefaultSettings());
		expect(sanitizeSettings(null)).toEqual(createDefaultSettings());
		expect(sanitizeSettings('junk')).toEqual(createDefaultSettings());
	});

	it('keeps valid fields and fills in the rest', () => {
		const settings = sanitizeSettings({ recentCards: { enabled: false } });
		expect(settings.recentCards).toEqual({ enabled: false, timeframe: { amount: 1, unit: 'weeks' } });
		expect(settings.staleCards).toEqual(createDefaultSettings().staleCards);
	});

	it('replaces an unknown unit with the default unit', () => {
		const settings = sanitizeSettings({ recentCards: { timeframe: { amount: 2, unit: 'years' } } });
		expect(settings.recentCards.timeframe).toEqual({ amount: 2, unit: 'weeks' });
	});

	it('clamps amounts to the unit range', () => {
		const settings = sanitizeSettings({ staleCards: { timeframe: { amount: 99, unit: 'days' } } });
		expect(settings.staleCards.timeframe).toEqual({ amount: 31, unit: 'days' });
	});

	it('falls back to the default for a non-boolean enabled flag', () => {
		expect(sanitizeSettings({ staleCards: { enabled: 'yes' } }).staleCards.enabled).toBe(true);
	});

	it('raises the stale timeframe when it is shorter than the recent one', () => {
		const settings = sanitizeSettings({
			recentCards: { timeframe: { amount: 2, unit: 'weeks' } },
			staleCards: { timeframe: { amount: 1, unit: 'weeks' } },
		});
		expect(settings.staleCards.timeframe).toEqual({ amount: 2, unit: 'weeks' });
	});
});

describe('applyTimeframeChange', () => {
	it('accepts equal timeframes (1 week / 1 week)', () => {
		const result = applyTimeframeChange(
			settingsWith({ amount: 1, unit: 'weeks' }, { amount: 2, unit: 'weeks' }),
			'staleCards',
			{ amount: 1, unit: 'weeks' },
		);
		expect(result.adjusted).toBeNull();
		expect(result.settings.staleCards.timeframe).toEqual({ amount: 1, unit: 'weeks' });
	});

	it('accepts a longer stale timeframe (1 month / 2 months)', () => {
		const result = applyTimeframeChange(
			settingsWith({ amount: 1, unit: 'months' }, { amount: 1, unit: 'months' }),
			'staleCards',
			{ amount: 2, unit: 'months' },
		);
		expect(result.adjusted).toBeNull();
		expect(result.settings.staleCards.timeframe).toEqual({ amount: 2, unit: 'months' });
	});

	it('lowers the recent timeframe when stale becomes shorter (1 week / 1 hour)', () => {
		const result = applyTimeframeChange(
			settingsWith({ amount: 1, unit: 'weeks' }, { amount: 1, unit: 'weeks' }),
			'staleCards',
			{ amount: 1, unit: 'hours' },
		);
		expect(result.adjusted).toBe('recentCards');
		expect(result.settings.recentCards.timeframe).toEqual({ amount: 1, unit: 'hours' });
		expect(result.settings.staleCards.timeframe).toEqual({ amount: 1, unit: 'hours' });
	});

	it('raises the stale timeframe when recent becomes longer (12 months / 2 weeks)', () => {
		const result = applyTimeframeChange(
			settingsWith({ amount: 1, unit: 'weeks' }, { amount: 2, unit: 'weeks' }),
			'recentCards',
			{ amount: 12, unit: 'months' },
		);
		expect(result.adjusted).toBe('staleCards');
		expect(result.settings.staleCards.timeframe).toEqual({ amount: 12, unit: 'months' });
	});

	it('does not mutate its input', () => {
		const settings = settingsWith({ amount: 1, unit: 'weeks' }, { amount: 1, unit: 'weeks' });
		const snapshot = JSON.parse(JSON.stringify(settings)) as ClarSettings;
		applyTimeframeChange(settings, 'staleCards', { amount: 1, unit: 'hours' });
		expect(settings).toEqual(snapshot);
	});

	it('clamps the amount before comparing', () => {
		const result = applyTimeframeChange(
			settingsWith({ amount: 2, unit: 'days' }, { amount: 2, unit: 'days' }),
			'staleCards',
			{ amount: 99, unit: 'hours' },
		);
		expect(result.settings.staleCards.timeframe).toEqual({ amount: 24, unit: 'hours' });
		expect(result.adjusted).toBe('recentCards');
		expect(result.settings.recentCards.timeframe).toEqual({ amount: 24, unit: 'hours' });
	});

	it('enforces the rule even when a feature is disabled', () => {
		const settings = settingsWith({ amount: 1, unit: 'weeks' }, { amount: 1, unit: 'weeks' });
		settings.recentCards.enabled = false;
		const result = applyTimeframeChange(settings, 'staleCards', { amount: 1, unit: 'days' });
		expect(result.adjusted).toBe('recentCards');
		expect(result.settings.recentCards.enabled).toBe(false);
	});
});
