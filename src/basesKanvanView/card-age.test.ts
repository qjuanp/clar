import { describe, expect, it } from 'vitest';
import { createDefaultSettings } from '../settings/settings-model';
import { formatRelativeDuration, getCardAgeIndicators, RECENT_TOOLTIP } from './card-age';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const NOW = Date.UTC(2026, 0, 31);

describe('getCardAgeIndicators', () => {
	it('treats a note created exactly one timeframe ago as recent (inclusive)', () => {
		const settings = createDefaultSettings();
		expect(getCardAgeIndicators(NOW - WEEK, NOW - WEEK, NOW, settings).recent).toBe(true);
		expect(getCardAgeIndicators(NOW - WEEK - 1, NOW - WEEK - 1, NOW, settings).recent).toBe(false);
	});

	it('only marks a note stale once it is past the timeframe (exclusive)', () => {
		const settings = createDefaultSettings();
		settings.recentCards.enabled = false;
		expect(getCardAgeIndicators(NOW - 30 * DAY, NOW - WEEK, NOW, settings).staleTooltip).toBeNull();
		expect(getCardAgeIndicators(NOW - 30 * DAY, NOW - WEEK - 1, NOW, settings).staleTooltip).toBe(
			'Not updated for 1 week',
		);
	});

	it('shows nothing for a disabled feature', () => {
		const settings = createDefaultSettings();
		settings.recentCards.enabled = false;
		settings.staleCards.enabled = false;
		expect(getCardAgeIndicators(NOW, NOW, NOW, settings)).toEqual({ recent: false, staleTooltip: null });
		expect(getCardAgeIndicators(NOW - 365 * DAY, NOW - 365 * DAY, NOW, settings)).toEqual({
			recent: false,
			staleTooltip: null,
		});
	});

	it('never marks a recent note as stale, even when its dates disagree', () => {
		const settings = createDefaultSettings();
		expect(getCardAgeIndicators(NOW, NOW - 365 * DAY, NOW, settings)).toEqual({ recent: true, staleTooltip: null });
	});

	it('applies the guard only when the note is actually shown as recent', () => {
		const settings = createDefaultSettings();
		settings.recentCards.enabled = false;
		expect(getCardAgeIndicators(NOW, NOW - 365 * DAY, NOW, settings).staleTooltip).toBe('Not updated for 12 months');
	});

	it('exposes the recent tooltip text', () => {
		expect(RECENT_TOOLTIP).toBe('Recently created');
	});
});

describe('formatRelativeDuration', () => {
	it('uses the largest whole unit', () => {
		expect(formatRelativeDuration(30 * MINUTE)).toBe('less than an hour');
		expect(formatRelativeDuration(HOUR)).toBe('1 hour');
		expect(formatRelativeDuration(5 * HOUR)).toBe('5 hours');
		expect(formatRelativeDuration(DAY)).toBe('1 day');
		expect(formatRelativeDuration(10 * DAY)).toBe('1 week');
		expect(formatRelativeDuration(29 * DAY)).toBe('4 weeks');
		expect(formatRelativeDuration(30 * DAY)).toBe('1 month');
		expect(formatRelativeDuration(95 * DAY)).toBe('3 months');
	});
});
