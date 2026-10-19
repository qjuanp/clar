import { describe, expect, it } from 'vitest';
import { COLUMN_COLORS, isColumnColor, parseColumnColors, setColumnColor } from './column-colors';

describe('COLUMN_COLORS', () => {
	it("offers Obsidian's 8 theme colors, in menu order", () => {
		expect(COLUMN_COLORS.map((color) => color.id)).toEqual([
			'red',
			'orange',
			'yellow',
			'green',
			'cyan',
			'blue',
			'purple',
			'pink',
		]);
	});
});

describe('isColumnColor', () => {
	it('accepts palette ids only', () => {
		expect(isColumnColor('blue')).toBe(true);
		expect(isColumnColor('brown')).toBe(false);
		expect(isColumnColor('Blue')).toBe(false);
		expect(isColumnColor(3)).toBe(false);
	});
});

describe('parseColumnColors', () => {
	it('returns an empty map when nothing is stored', () => {
		expect(parseColumnColors(undefined)).toEqual({});
		expect(parseColumnColors(null)).toEqual({});
	});

	it('ignores values that are not a map', () => {
		expect(parseColumnColors('todo: red')).toEqual({});
		expect(parseColumnColors(['red'])).toEqual({});
		expect(parseColumnColors(7)).toEqual({});
	});

	it('keeps known colors and drops unknown or non-string ones', () => {
		expect(
			parseColumnColors({ todo: 'red', done: 'brown', review: 4, 'in-progress': 'blue', __no_column__: null }),
		).toEqual({ todo: 'red', 'in-progress': 'blue' });
	});
});

describe('setColumnColor', () => {
	it('sets a color for a column', () => {
		expect(setColumnColor({}, 'todo', 'green')).toEqual({ todo: 'green' });
	});

	it('replaces a column color', () => {
		expect(setColumnColor({ todo: 'green', done: 'red' }, 'todo', 'pink')).toEqual({ todo: 'pink', done: 'red' });
	});

	it('removes a column color with null', () => {
		expect(setColumnColor({ todo: 'green', done: 'red' }, 'todo', null)).toEqual({ done: 'red' });
	});

	it('never mutates its input', () => {
		const colors = { todo: 'green' as const };
		setColumnColor(colors, 'done', 'red');
		setColumnColor(colors, 'todo', null);
		expect(colors).toEqual({ todo: 'green' });
	});
});
