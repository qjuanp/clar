import type { KanbanColumn } from './columns';
import { NO_COLUMN_ID } from './constants';

/**
 * Pure helpers for the per-column "Show stale icon" option (spec 11). The board
 * stores the keys of the columns that show the stale icon as a YAML string list
 * in its view config; a column not in the list hides it (the default).
 */

/** Reads the stored list; anything that isn't a list of non-blank strings is ignored. */
export function parseStaleColumns(raw: unknown): string[] {
	if (!Array.isArray(raw)) {
		return [];
	}
	const keys: string[] = [];
	for (const item of raw) {
		if (typeof item === 'string' && item.trim().length > 0 && !keys.includes(item)) {
			keys.push(item);
		}
	}
	return keys;
}

/**
 * The column's stored key: its label, or the "No column" id for that column,
 * so a real property value of "No column" can't collide with it.
 */
export function columnKey(column: KanbanColumn): string {
	return column.id === NO_COLUMN_ID ? NO_COLUMN_ID : column.label;
}

/** Adds or removes one key, keeping order and without duplicates. Never mutates `keys`. */
export function setStaleColumn(keys: readonly string[], key: string, shown: boolean): string[] {
	if (shown) {
		return keys.includes(key) ? [...keys] : [...keys, key];
	}
	return keys.filter((existing) => existing !== key);
}
