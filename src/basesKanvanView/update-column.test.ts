import { describe, expect, it } from 'vitest';
import { BooleanValue, ListValue, NullValue, NumberValue, StringValue } from 'obsidian';
import { valueToFrontmatter } from './update-column';

describe('valueToFrontmatter', () => {
	it('turns a list group key into an array of its items', () => {
		expect(valueToFrontmatter(new ListValue(['done']))).toEqual(['done']);
		expect(valueToFrontmatter(new ListValue(['in-progress', 'launch']))).toEqual(['in-progress', 'launch']);
	});

	it('keeps text as a plain string', () => {
		expect(valueToFrontmatter(new StringValue('Alice'))).toBe('Alice');
	});

	it('keeps numbers and booleans in their own type', () => {
		expect(valueToFrontmatter(new NumberValue(3))).toBe(3);
		expect(valueToFrontmatter(new BooleanValue(true))).toBe(true);
		expect(valueToFrontmatter(new BooleanValue(false))).toBe(false);
	});

	it('turns no value into null', () => {
		expect(valueToFrontmatter(NullValue.value)).toBeNull();
	});
});
