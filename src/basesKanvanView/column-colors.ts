/**
 * Pure helpers for the per-column card color (column colors spec). A colored
 * column draws a shadow in that color around its cards. Colors are Obsidian's
 * theme colors (`var(--color-<id>)` in `styles.css`), so they follow light,
 * dark and custom themes. The board stores the chosen colors as a YAML map from
 * column key (see `columnKey()` in `stale-columns.ts`) to color id; a column not
 * in the map has no color (the default).
 */

export type ColumnColor = 'red' | 'orange' | 'yellow' | 'green' | 'cyan' | 'blue' | 'purple' | 'pink';

/** The palette, in menu order. */
export const COLUMN_COLORS: readonly { id: ColumnColor; label: string }[] = [
	{ id: 'red', label: 'Red' },
	{ id: 'orange', label: 'Orange' },
	{ id: 'yellow', label: 'Yellow' },
	{ id: 'green', label: 'Green' },
	{ id: 'cyan', label: 'Cyan' },
	{ id: 'blue', label: 'Blue' },
	{ id: 'purple', label: 'Purple' },
	{ id: 'pink', label: 'Pink' },
];

export function isColumnColor(value: unknown): value is ColumnColor {
	return COLUMN_COLORS.some((color) => color.id === value);
}

/** Reads the stored map; entries that aren't a known color id are dropped. */
export function parseColumnColors(raw: unknown): Record<string, ColumnColor> {
	const colors: Record<string, ColumnColor> = {};
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		return colors;
	}
	for (const [key, value] of Object.entries(raw)) {
		if (isColumnColor(value)) {
			colors[key] = value;
		}
	}
	return colors;
}

/** Sets or (with `null`) removes one column's color. Never mutates `colors`. */
export function setColumnColor(
	colors: Readonly<Record<string, ColumnColor>>,
	key: string,
	color: ColumnColor | null,
): Record<string, ColumnColor> {
	const next = { ...colors };
	if (color === null) {
		delete next[key];
	} else {
		next[key] = color;
	}
	return next;
}
