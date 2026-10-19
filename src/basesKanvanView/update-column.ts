import {
	BooleanValue,
	ListValue,
	NullValue,
	NumberValue,
	parsePropertyId,
	type App,
	type BasesPropertyId,
	type FrontmatterValue,
	type TFile,
	type Value,
} from 'obsidian';

/**
 * Converts a Bases group key into the frontmatter value that puts a note in
 * that group, mirroring how Bases itself stores group keys: a list becomes an
 * array (item by item), numbers and booleans keep their type, no value becomes
 * `null`, and anything else (text, dates, links) is written as its text form.
 */
export function valueToFrontmatter(value: Value): FrontmatterValue {
	if (value instanceof NullValue) {
		return null;
	}
	if (value instanceof ListValue) {
		const items: FrontmatterValue[] = [];
		for (let i = 0; i < value.length(); i++) {
			items.push(valueToFrontmatter(value.get(i)));
		}
		return items;
	}
	if (value instanceof NumberValue) {
		return Number(value.toString());
	}
	if (value instanceof BooleanValue) {
		return value.toString() === 'true';
	}
	return value.toString();
}

/** Writes the target column's value into the note's group property (spec 5, spec 12). */
export async function updateEntryColumn(
	app: App,
	file: TFile,
	groupProperty: BasesPropertyId,
	targetValue: FrontmatterValue,
): Promise<void> {
	const { name } = parsePropertyId(groupProperty);
	await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
		frontmatter[name] = Array.isArray(targetValue) ? [...targetValue] : targetValue;
	});
}
