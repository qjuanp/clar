import type { BasesEntry, BasesEntryGroup, FrontmatterValue } from 'obsidian';
import { NO_COLUMN_ID, NO_COLUMN_LABEL } from './constants';
import { valueToFrontmatter } from './update-column';

export interface KanbanColumn {
	/** Unique per board; the label, or `NO_COLUMN_ID`, with a ` (2)`… suffix for a repeated label. */
	id: string;
	label: string;
	/** The group key as a frontmatter value: what a dropped card gets, and what the group order stores. */
	value: FrontmatterValue;
	entries: BasesEntry[];
}

/**
 * One column per Bases group (spec 12), in the order Bases returns them: the
 * "Group by" direction, or its manual group order. Bases groups by the whole
 * property value, so `[in-progress, launch]` is its own column. The group with
 * no key becomes "No column", wherever Bases puts it. Empty groups are skipped.
 */
export function buildKanbanColumns(groups: BasesEntryGroup[]): KanbanColumn[] {
	const columns: KanbanColumn[] = [];
	const usedIds = new Set<string>();

	for (const group of groups) {
		if (group.entries.length === 0) {
			continue;
		}
		if (!group.hasKey() || !group.key) {
			columns.push({ id: NO_COLUMN_ID, label: NO_COLUMN_LABEL, value: null, entries: group.entries });
			usedIds.add(NO_COLUMN_ID);
			continue;
		}

		const label = group.key.toString();
		let id = label;
		for (let n = 2; usedIds.has(id); n++) {
			id = `${label} (${n})`;
		}
		usedIds.add(id);
		columns.push({ id, label, value: valueToFrontmatter(group.key), entries: group.entries });
	}

	return columns;
}

/**
 * Comparison key for group order entries. Single-item lists are unwrapped,
 * because Bases matches a stored `todo` and `[todo]` to the same list group.
 */
function orderKey(value: FrontmatterValue): string {
	let current = value;
	while (Array.isArray(current) && current.length === 1) {
		current = current[0];
	}
	return JSON.stringify(current ?? null);
}

/**
 * Builds the group order to save after the user drags columns around.
 * `visibleOrder` is the new on-screen order of column values (`null` for "No
 * column"). Entries from `previousOrder` that aren't on screen — listed groups
 * that currently have no cards, which Bases leaves out of its groups — are kept,
 * each re-inserted right after the entry that preceded it in the old order, so
 * a temporarily empty group doesn't silently drop out of the order.
 */
export function mergeColumnOrder(
	previousOrder: FrontmatterValue[],
	visibleOrder: FrontmatterValue[],
): FrontmatterValue[] {
	const merged: FrontmatterValue[] = [];
	const keys: string[] = [];
	for (const value of visibleOrder) {
		const key = orderKey(value);
		if (!keys.includes(key)) {
			merged.push(value);
			keys.push(key);
		}
	}

	let previousKey: string | null = null;
	for (const value of previousOrder) {
		const key = orderKey(value);
		if (!keys.includes(key)) {
			const insertAt = previousKey === null ? 0 : keys.indexOf(previousKey) + 1;
			merged.splice(insertAt, 0, value);
			keys.splice(insertAt, 0, key);
		}
		previousKey = key;
	}
	return merged;
}
