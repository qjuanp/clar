import { describe, expect, it } from 'vitest';
import { ListValue, NullValue, StringValue } from 'obsidian';
import type { BasesEntry, BasesEntryGroup, Value } from 'obsidian';
import { buildKanbanColumns, mergeColumnOrder } from './columns';
import { NO_COLUMN_ID, NO_COLUMN_LABEL } from './constants';

// buildKanbanColumns() only passes entries through, so any object will do.
function entry(name: string): BasesEntry {
	return { name } as unknown as BasesEntry;
}

/** A fake Bases group: `key: null` is the group of entries with no value. */
function group(key: Value | null, entries: BasesEntry[]): BasesEntryGroup {
	return {
		key: key ?? NullValue.value,
		entries,
		hasKey: () => key !== null,
	};
}

describe('buildKanbanColumns', () => {
	it('keeps groups in Bases\' order, with "No column" where Bases puts it', () => {
		const done = entry('done');
		const none = entry('none');
		const todo = entry('todo');

		const columns = buildKanbanColumns([
			group(new ListValue(['done']), [done]),
			group(null, [none]),
			group(new ListValue(['todo']), [todo]),
		]);

		expect(columns.map((column) => column.id)).toEqual(['done', NO_COLUMN_ID, 'todo']);
		expect(columns.map((column) => column.label)).toEqual(['done', NO_COLUMN_LABEL, 'todo']);
		expect(columns.map((column) => column.entries)).toEqual([[done], [none], [todo]]);
	});

	it('turns the group without a key into "No column", with no value to write', () => {
		const none = entry('none');

		const columns = buildKanbanColumns([group(null, [none])]);

		expect(columns).toEqual([{ id: NO_COLUMN_ID, label: NO_COLUMN_LABEL, value: null, entries: [none] }]);
	});

	it('omits "No column" entirely when every group has a key', () => {
		const columns = buildKanbanColumns([group(new ListValue(['todo']), [entry('a')])]);

		expect(columns.some((column) => column.id === NO_COLUMN_ID)).toBe(false);
	});

	it('skips groups with no entries', () => {
		const columns = buildKanbanColumns([
			group(new ListValue(['todo']), []),
			group(new ListValue(['done']), [entry('a')]),
			group(null, []),
		]);

		expect(columns.map((column) => column.id)).toEqual(['done']);
	});

	it('keeps a multi-value list group as one column labelled with all its values', () => {
		const columns = buildKanbanColumns([group(new ListValue(['in-progress', 'launch']), [entry('a')])]);

		expect(columns).toHaveLength(1);
		expect(columns[0]).toMatchObject({ label: 'in-progress, launch', value: ['in-progress', 'launch'] });
	});

	it('stores each column\'s value in its frontmatter form', () => {
		const columns = buildKanbanColumns([
			group(new ListValue(['todo']), [entry('a')]),
			group(new StringValue('Alice'), [entry('b')]),
		]);

		expect(columns.map((column) => column.value)).toEqual([['todo'], 'Alice']);
	});

	it('gives repeated labels unique ids', () => {
		const columns = buildKanbanColumns([
			group(new ListValue(['todo']), [entry('a')]),
			group(new StringValue('todo'), [entry('b')]),
			group(new StringValue('todo'), [entry('c')]),
		]);

		expect(columns.map((column) => column.id)).toEqual(['todo', 'todo (2)', 'todo (3)']);
		expect(columns.map((column) => column.label)).toEqual(['todo', 'todo', 'todo']);
	});
});

describe('mergeColumnOrder', () => {
	it('uses the visible order as-is when there was no manual order before', () => {
		expect(mergeColumnOrder([], [['done'], ['todo']])).toEqual([['done'], ['todo']]);
	});

	it('replaces a manual order when every group is visible', () => {
		expect(mergeColumnOrder([['todo'], ['in-progress'], ['done']], [['done'], ['todo'], ['in-progress']])).toEqual([
			['done'],
			['todo'],
			['in-progress'],
		]);
	});

	it('keeps a listed group without cards right after its previous neighbour', () => {
		expect(mergeColumnOrder([['todo'], ['review'], ['done']], [['done'], ['todo']])).toEqual([
			['done'],
			['todo'],
			['review'],
		]);
	});

	it('keeps a listed group without cards first when it was first before', () => {
		expect(mergeColumnOrder([['review'], ['todo'], ['done']], [['done'], ['todo']])).toEqual([
			['review'],
			['done'],
			['todo'],
		]);
	});

	it('keeps consecutive listed groups without cards together and in order', () => {
		expect(mergeColumnOrder([['todo'], ['review'], ['qa'], ['done']], [['done'], ['todo']])).toEqual([
			['done'],
			['todo'],
			['review'],
			['qa'],
		]);
	});

	it('includes visible groups that were never listed', () => {
		expect(mergeColumnOrder([['todo'], ['done']], [['backlog'], ['done'], ['todo']])).toEqual([
			['backlog'],
			['done'],
			['todo'],
		]);
	});

	it('never duplicates an entry', () => {
		expect(mergeColumnOrder([['todo'], ['todo'], ['done']], [['done'], ['todo'], ['done']])).toEqual([
			['done'],
			['todo'],
		]);
	});

	it('keeps "No column" (null) where it is on screen, and a listed but hidden null in place', () => {
		expect(mergeColumnOrder([], [['todo'], null, ['done']])).toEqual([['todo'], null, ['done']]);
		expect(mergeColumnOrder([['todo'], null, ['done']], [['done'], ['todo']])).toEqual([['done'], ['todo'], null]);
	});

	it('treats a stored `todo` and `[todo]` as the same group, like Bases does', () => {
		// `review` keeps its stored form and follows its old neighbour `done`; no duplicates.
		expect(mergeColumnOrder(['todo', 'done', 'review'], [['done'], ['todo']])).toEqual([['done'], 'review', ['todo']]);
	});

	it('tells multi-value lists apart by content', () => {
		expect(mergeColumnOrder([['a', 'b'], ['a']], [['a']])).toEqual([['a', 'b'], ['a']]);
	});
});
