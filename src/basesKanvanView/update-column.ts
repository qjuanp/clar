import { parsePropertyId, type App, type BasesPropertyId, type TFile } from 'obsidian';

export function buildFrontmatterListValue(newColumnLabel: string): string[] {
	return [newColumnLabel];
}

export async function updateEntryColumn(
	app: App,
	file: TFile,
	groupProperty: BasesPropertyId,
	newColumnLabel: string,
): Promise<void> {
	const { name } = parsePropertyId(groupProperty);
	await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
		frontmatter[name] = buildFrontmatterListValue(newColumnLabel);
	});
}
