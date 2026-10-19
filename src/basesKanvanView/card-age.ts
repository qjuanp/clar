import { timeframeToMs, type ClarSettings } from '../settings/settings-model';

export interface CardAgeIndicators {
	recent: boolean;
	/** Tooltip for the stale icon, e.g. "Not updated for 2 weeks"; null when not stale. */
	staleTooltip: string | null;
}

export const RECENT_TOOLTIP = 'Recently created';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Largest unit first; a month counts as 30 days, matching the settings model. */
const RELATIVE_UNITS: { ms: number; singular: string; plural: string }[] = [
	{ ms: 30 * DAY_MS, singular: 'month', plural: 'months' },
	{ ms: 7 * DAY_MS, singular: 'week', plural: 'weeks' },
	{ ms: DAY_MS, singular: 'day', plural: 'days' },
	{ ms: HOUR_MS, singular: 'hour', plural: 'hours' },
];

/**
 * recent = recent feature enabled && (now - ctime) <= recent timeframe   (inclusive)
 * stale  = stale feature enabled && showStale && !recent && (now - mtime) > stale timeframe   (exclusive)
 * `showStale` is the per-column switch from the column menu (spec 11).
 * `!recent` is a runtime guard for the golden rule: settings guarantee
 * stale ≥ recent, but file dates can disagree (e.g. a copied file with an
 * old mtime and a new ctime), and a recent card must never look stale.
 */
export function getCardAgeIndicators(
	ctime: number,
	mtime: number,
	now: number,
	settings: ClarSettings,
	showStale = true,
): CardAgeIndicators {
	const recent =
		settings.recentCards.enabled && now - ctime <= timeframeToMs(settings.recentCards.timeframe);
	const stale =
		settings.staleCards.enabled && showStale && !recent && now - mtime > timeframeToMs(settings.staleCards.timeframe);
	return {
		recent,
		staleTooltip: stale ? `Not updated for ${formatRelativeDuration(now - mtime)}` : null,
	};
}

/**
 * Relative duration: the largest unit with a whole count ≥ 1, floored.
 * Under 1 hour → "less than an hour". Singular for 1: "1 month", "3 weeks".
 */
export function formatRelativeDuration(ms: number): string {
	for (const unit of RELATIVE_UNITS) {
		const count = Math.floor(ms / unit.ms);
		if (count >= 1) {
			return `${count} ${count === 1 ? unit.singular : unit.plural}`;
		}
	}
	return 'less than an hour';
}
