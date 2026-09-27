import { parsePropertyId, type App, type BasesPropertyId } from 'obsidian';

/**
 * Obsidian's internal frontmatter property type id for "List" properties.
 * Not part of the public API (app.metadataTypeManager is undocumented), so this
 * lookup is best-effort: if the internal shape ever changes, isListProperty()
 * falls back to treating every frontmatter property as eligible.
 */
const LIST_PROPERTY_TYPE = 'multitext';

interface MetadataTypeManagerLike {
	properties?: Record<string, { type?: string } | undefined>;
}

export function isListProperty(app: App, propertyId: BasesPropertyId): boolean {
	const { type, name } = parsePropertyId(propertyId);
	if (type !== 'note') {
		return false;
	}

	try {
		const metadataTypeManager = (app as unknown as { metadataTypeManager?: MetadataTypeManagerLike })
			.metadataTypeManager;
		const propertyType = metadataTypeManager?.properties?.[name.toLowerCase()]?.type;
		if (propertyType === undefined) {
			return true;
		}
		return propertyType === LIST_PROPERTY_TYPE;
	} catch {
		return true;
	}
}
