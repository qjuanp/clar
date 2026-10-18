import { describe, expect, it } from 'vitest';
import { buildTagSearchQuery } from './tag-search';

describe('buildTagSearchQuery', () => {
	it('builds a tag: search for the tag', () => {
		expect(buildTagSearchQuery('launch')).toBe('tag:#launch');
	});

	it('keeps nested tags intact', () => {
		expect(buildTagSearchQuery('project/active')).toBe('tag:#project/active');
	});
});
