import { describe, expect, it } from 'vitest';
import { ListValue, NullValue } from 'obsidian';
import type { BasesEntry, BasesPropertyId, Value } from 'obsidian';
import { buildKanbanColumns } from './columns';
import { NO_COLUMN_ID, NO_COLUMN_LABEL } from './constants';

const GROUP_PROPERTY = 'note.status' as BasesPropertyId;

// buildKanbanColumns() never touches `entry.file`, only `entry.getValue()`,
// so the fake entries below only need to satisfy that part of the shape.
function entry(value: Value | null): BasesEntry {
	return { getValue: () => value } as unknown as BasesEntry;
}

describe('buildKanbanColumns', () => {
	it('groups entries by the first value of a list property', () => {
		const todo = entry(new ListValue(['todo']));
		const done = entry(new ListValue(['done']));

		const columns = buildKanbanColumns([todo, done], GROUP_PROPERTY, []);

		expect(columns.map((column) => column.label)).toEqual(['todo', 'done']);
		expect(columns[0]?.entries).toEqual([todo]);
		expect(columns[1]?.entries).toEqual([done]);
	});

	it('routes null, empty-list, and blank-string values to "No column"', () => {
		const nullEntry = entry(NullValue.value);
		const missingEntry = entry(null);
		const emptyListEntry = entry(new ListValue([]));

		const columns = buildKanbanColumns([nullEntry, missingEntry, emptyListEntry], GROUP_PROPERTY, []);

		expect(columns).toHaveLength(1);
		expect(columns[0]).toMatchObject({ id: NO_COLUMN_ID, label: NO_COLUMN_LABEL });
		expect(columns[0]?.entries).toEqual([nullEntry, missingEntry, emptyListEntry]);
	});

	it('orders configured column names first, dropping unmatched names, then appends discovered columns and "No column" last', () => {
		const todo = entry(new ListValue(['todo']));
		const done = entry(new ListValue(['done']));
		const inProgress = entry(new ListValue(['in-progress']));
		const noColumn = entry(NullValue.value);

		const columns = buildKanbanColumns(
			[todo, done, inProgress, noColumn],
			GROUP_PROPERTY,
			['done', 'does-not-exist', 'todo'],
		);

		expect(columns.map((column) => column.label)).toEqual(['done', 'todo', 'in-progress', NO_COLUMN_LABEL]);
	});

	it('omits "No column" entirely when every entry has a value', () => {
		const columns = buildKanbanColumns([entry(new ListValue(['todo']))], GROUP_PROPERTY, []);

		expect(columns.some((column) => column.id === NO_COLUMN_ID)).toBe(false);
	});

	it('does not duplicate a card across columns when a list value has multiple items', () => {
		const entryWithTwoValues = entry(new ListValue(['todo', 'done']));

		const columns = buildKanbanColumns([entryWithTwoValues], GROUP_PROPERTY, []);

		expect(columns).toHaveLength(1);
		expect(columns[0]?.label).toBe('todo');
	});
});
