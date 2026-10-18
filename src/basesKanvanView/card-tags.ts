/**
 * Cleans a note's frontmatter tags (as returned by Obsidian's
 * `parseFrontMatterTags()`, which prefixes each with `#`) for display as
 * card pills: strips the `#`, drops blanks, and removes case-insensitive
 * duplicates — Obsidian treats tags case-insensitively — keeping the first
 * spelling and the file order. The `#` is added back when rendering.
 */
export function normalizeTags(raw: string[] | null): string[] {
	if (!raw) {
		return [];
	}
	const seen = new Set<string>();
	const tags: string[] = [];
	for (const value of raw) {
		const tag = value.trim().replace(/^#+/, '').trim();
		const key = tag.toLowerCase();
		if (tag === '' || seen.has(key)) {
			continue;
		}
		seen.add(key);
		tags.push(tag);
	}
	return tags;
}
