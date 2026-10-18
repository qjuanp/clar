/**
 * Pure settings model for the plugin-wide settings (spec 10: recent / stale
 * card indicators). No runtime `obsidian` imports, so it is unit tested
 * directly; the UI lives in `settings-tab.ts`.
 */

export type TimeUnit = 'hours' | 'days' | 'weeks' | 'months';

export interface Timeframe {
	amount: number;
	unit: TimeUnit;
}

export interface AgeIndicatorSettings {
	enabled: boolean;
	timeframe: Timeframe;
}

export interface ClarSettings {
	recentCards: AgeIndicatorSettings;
	staleCards: AgeIndicatorSettings;
}

/** What the view needs from the plugin; avoids importing main.ts (circular). */
export interface SettingsProvider {
	readonly settings: ClarSettings;
	/** Registers a listener; returns an unsubscribe function. */
	onSettingsChange(listener: () => void): () => void;
}

export type TimeframeKey = 'recentCards' | 'staleCards';

export const TIME_UNITS: readonly TimeUnit[] = ['hours', 'days', 'weeks', 'months'];

export const TIME_UNIT_LABELS: Record<TimeUnit, string> = {
	hours: 'Hours',
	days: 'Days',
	weeks: 'Weeks',
	months: 'Months',
};

export const TIME_UNIT_MAX: Record<TimeUnit, number> = {
	hours: 24,
	days: 31,
	weeks: 53,
	months: 12,
};

const HOUR_MS = 60 * 60 * 1000;

/** A month counts as 30 days, so timeframes in different units stay comparable. */
export const TIME_UNIT_MS: Record<TimeUnit, number> = {
	hours: HOUR_MS,
	days: 24 * HOUR_MS,
	weeks: 7 * 24 * HOUR_MS,
	months: 30 * 24 * HOUR_MS,
};

const SINGULAR_UNIT: Record<TimeUnit, string> = {
	hours: 'hour',
	days: 'day',
	weeks: 'week',
	months: 'month',
};

const DEFAULT_TIMEFRAME: Timeframe = { amount: 1, unit: 'weeks' };

export function createDefaultSettings(): ClarSettings {
	return {
		recentCards: { enabled: true, timeframe: { ...DEFAULT_TIMEFRAME } },
		staleCards: { enabled: true, timeframe: { ...DEFAULT_TIMEFRAME } },
	};
}

export function timeframeToMs(timeframe: Timeframe): number {
	return timeframe.amount * TIME_UNIT_MS[timeframe.unit];
}

/** Whole numbers only, clamped to `[1, TIME_UNIT_MAX[unit]]`; anything non-finite becomes 1. */
export function clampAmount(amount: number, unit: TimeUnit): number {
	if (!Number.isFinite(amount)) {
		return 1;
	}
	return Math.min(TIME_UNIT_MAX[unit], Math.max(1, Math.floor(amount)));
}

/** "1 week", "2 weeks", "12 months". */
export function formatTimeframe(timeframe: Timeframe): string {
	const unit = timeframe.amount === 1 ? SINGULAR_UNIT[timeframe.unit] : timeframe.unit;
	return `${timeframe.amount} ${unit}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isTimeUnit(value: unknown): value is TimeUnit {
	return typeof value === 'string' && (TIME_UNITS as readonly string[]).includes(value);
}

function sanitizeTimeframe(raw: unknown, fallback: Timeframe): Timeframe {
	if (!isRecord(raw)) {
		return { ...fallback };
	}
	const unit = isTimeUnit(raw.unit) ? raw.unit : fallback.unit;
	const amount = typeof raw.amount === 'number' ? clampAmount(raw.amount, unit) : clampAmount(fallback.amount, unit);
	return { amount, unit };
}

function sanitizeIndicator(raw: unknown, fallback: AgeIndicatorSettings): AgeIndicatorSettings {
	if (!isRecord(raw)) {
		return { enabled: fallback.enabled, timeframe: { ...fallback.timeframe } };
	}
	return {
		enabled: typeof raw.enabled === 'boolean' ? raw.enabled : fallback.enabled,
		timeframe: sanitizeTimeframe(raw.timeframe, fallback.timeframe),
	};
}

/**
 * Turns anything loaded from data.json (possibly undefined, partial or
 * invalid) into valid settings: defaults for missing/invalid fields, unknown
 * units fall back to the default unit, amounts are clamped, then the golden
 * rule is enforced by raising the stale timeframe to the recent one if needed.
 */
export function sanitizeSettings(raw: unknown): ClarSettings {
	const defaults = createDefaultSettings();
	const source = isRecord(raw) ? raw : {};
	const settings: ClarSettings = {
		recentCards: sanitizeIndicator(source.recentCards, defaults.recentCards),
		staleCards: sanitizeIndicator(source.staleCards, defaults.staleCards),
	};
	if (timeframeToMs(settings.staleCards.timeframe) < timeframeToMs(settings.recentCards.timeframe)) {
		settings.staleCards.timeframe = { ...settings.recentCards.timeframe };
	}
	return settings;
}

export interface TimeframeChangeResult {
	settings: ClarSettings;
	/** Which other timeframe was auto-adjusted to keep the golden rule, if any. */
	adjusted: TimeframeKey | null;
}

/**
 * Applies a user edit to one timeframe (amount clamped to the unit's range),
 * then enforces the golden rule (stale ≥ recent) by copying the edited
 * timeframe onto the other one when they conflict:
 *  - recent edited and now > stale → stale := recent  (adjusted: 'staleCards')
 *  - stale edited and now < recent → recent := stale  (adjusted: 'recentCards')
 * The rule is enforced whether or not either feature is enabled, so turning a
 * feature on later can never produce a conflict. Never mutates its input.
 */
export function applyTimeframeChange(
	settings: ClarSettings,
	key: TimeframeKey,
	next: Timeframe,
): TimeframeChangeResult {
	const timeframe: Timeframe = { amount: clampAmount(next.amount, next.unit), unit: next.unit };
	const result: ClarSettings = {
		recentCards: { ...settings.recentCards, timeframe: { ...settings.recentCards.timeframe } },
		staleCards: { ...settings.staleCards, timeframe: { ...settings.staleCards.timeframe } },
	};
	result[key].timeframe = timeframe;

	const recentMs = timeframeToMs(result.recentCards.timeframe);
	const staleMs = timeframeToMs(result.staleCards.timeframe);
	if (staleMs >= recentMs) {
		return { settings: result, adjusted: null };
	}
	const other: TimeframeKey = key === 'recentCards' ? 'staleCards' : 'recentCards';
	result[other].timeframe = { ...timeframe };
	return { settings: result, adjusted: other };
}
