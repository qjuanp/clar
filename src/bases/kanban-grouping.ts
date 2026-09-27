import { ListValue, NullValue, type BasesEntry, type BasesPropertyId } from 'obsidian';
import { NO_COLUMN_ID, NO_COLUMN_LABEL } from './constants';

export interface KanbanColumn {
	id: string;
	label: string;
	entries: BasesEntry[];
}

/**
 * Resolves the column key for a single entry.
 * A list property is expected to hold a single value in practice; if it holds
 * more than one, only the first value is used to place the card (documented
 * assumption, not general multi-column duplication).
 */
function resolveColumnLabel(entry: BasesEntry, groupProperty: BasesPropertyId): string | null {
	const value = entry.getValue(groupProperty);
	if (value === null || value instanceof NullValue) {
		return null;
	}

	if (value instanceof ListValue) {
		if (value.length() === 0) {
			return null;
		}
		const label = value.get(0).toString().trim();
		return label === '' ? null : label;
	}

	const label = value.toString().trim();
	return label === '' ? null : label;
}

export function buildKanbanColumns(
	entries: BasesEntry[],
	groupProperty: BasesPropertyId,
	columnOrder: string[],
): KanbanColumn[] {
	const byLabel = new Map<string, KanbanColumn>();
	const noColumn: KanbanColumn = { id: NO_COLUMN_ID, label: NO_COLUMN_LABEL, entries: [] };

	for (const entry of entries) {
		const label = resolveColumnLabel(entry, groupProperty);
		if (label === null) {
			noColumn.entries.push(entry);
			continue;
		}

		let column = byLabel.get(label);
		if (!column) {
			column = { id: label, label, entries: [] };
			byLabel.set(label, column);
		}
		column.entries.push(entry);
	}

	const ordered: KanbanColumn[] = [];
	for (const label of columnOrder) {
		const column = byLabel.get(label);
		if (column) {
			ordered.push(column);
			byLabel.delete(label);
		}
	}
	// Remaining columns not mentioned in columnOrder, in order of first appearance.
	ordered.push(...byLabel.values());

	if (noColumn.entries.length > 0) {
		ordered.push(noColumn);
	}

	return ordered;
}
