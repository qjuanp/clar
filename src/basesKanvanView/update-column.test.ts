import { describe, expect, it } from 'vitest';
import { buildFrontmatterListValue } from './update-column';

describe('buildFrontmatterListValue', () => {
	it('wraps the new column label in a single-item array', () => {
		expect(buildFrontmatterListValue('done')).toEqual(['done']);
	});
});
