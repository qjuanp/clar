import { describe, expect, it } from 'vitest';
import type { KanbanColumn } from './columns';
import { NO_COLUMN_ID, NO_COLUMN_LABEL } from './constants';
import { columnKey, parseStaleColumns, setStaleColumn } from './stale-columns';

function column(id: string, label: string): KanbanColumn {
	return { id, label, value: id === NO_COLUMN_ID ? null : [label], entries: [] };
}

describe('parseStaleColumns', () => {
	it('returns an empty list when nothing is stored', () => {
		expect(parseStaleColumns(undefined)).toEqual([]);
		expect(parseStaleColumns(null)).toEqual([]);
	});

	it('ignores values that are not a list', () => {
		expect(parseStaleColumns('todo, done')).toEqual([]);
		expect(parseStaleColumns({ todo: true })).toEqual([]);
		expect(parseStaleColumns(3)).toEqual([]);
	});

	it('keeps non-blank strings in order, without duplicates', () => {
		expect(parseStaleColumns(['done', 'todo', 'done'])).toEqual(['done', 'todo']);
	});

	it('drops non-string and blank items', () => {
		expect(parseStaleColumns(['todo', 4, null, '', '   ', 'Q1, Q2'])).toEqual(['todo', 'Q1, Q2']);
	});
});

describe('columnKey', () => {
	it('uses the label for a real column', () => {
		expect(columnKey(column('in-progress', 'in-progress'))).toBe('in-progress');
	});

	it('uses the "No column" id, so a real "No column" value cannot collide with it', () => {
		expect(columnKey(column(NO_COLUMN_ID, NO_COLUMN_LABEL))).toBe(NO_COLUMN_ID);
		expect(columnKey(column(NO_COLUMN_LABEL, NO_COLUMN_LABEL))).toBe(NO_COLUMN_LABEL);
	});
});

describe('setStaleColumn', () => {
	it('adds a key at the end', () => {
		expect(setStaleColumn(['todo'], 'done', true)).toEqual(['todo', 'done']);
	});

	it('does not duplicate or move a key that is already shown', () => {
		expect(setStaleColumn(['todo', 'done'], 'todo', true)).toEqual(['todo', 'done']);
	});

	it('removes a key and keeps the order of the rest', () => {
		expect(setStaleColumn(['todo', 'doing', 'done'], 'doing', false)).toEqual(['todo', 'done']);
	});

	it('is a no-op when hiding a key that is not stored', () => {
		expect(setStaleColumn(['todo'], 'done', false)).toEqual(['todo']);
	});

	it('never mutates its input', () => {
		const keys = ['todo'];
		setStaleColumn(keys, 'done', true);
		setStaleColumn(keys, 'todo', false);
		expect(keys).toEqual(['todo']);
	});
});
