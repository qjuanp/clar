import { describe, expect, it } from 'vitest';
import { normalizeTags } from './card-tags';

describe('normalizeTags', () => {
	it('returns no tags when the note has none', () => {
		expect(normalizeTags(null)).toEqual([]);
		expect(normalizeTags([])).toEqual([]);
	});

	it('strips the leading # added by parseFrontMatterTags', () => {
		expect(normalizeTags(['#launch', '#q3'])).toEqual(['launch', 'q3']);
	});

	it('accepts tags without a # prefix', () => {
		expect(normalizeTags(['launch'])).toEqual(['launch']);
	});

	it('drops blank entries', () => {
		expect(normalizeTags(['#', ' ', '#launch', ''])).toEqual(['launch']);
	});

	it('removes case-insensitive duplicates, keeping the first spelling', () => {
		expect(normalizeTags(['#Mobile', '#mobile', '#MOBILE'])).toEqual(['Mobile']);
	});

	it('keeps file order', () => {
		expect(normalizeTags(['#zeta', '#alpha', '#mid'])).toEqual(['zeta', 'alpha', 'mid']);
	});

	it('keeps nested tags intact', () => {
		expect(normalizeTags(['#project/active'])).toEqual(['project/active']);
	});
});
