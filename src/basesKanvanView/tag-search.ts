import type { App } from 'obsidian';

/** The core Search plugin's id in `app.internalPlugins`. */
const SEARCH_PLUGIN_ID = 'global-search';

interface GlobalSearchLike {
	openGlobalSearch?: (query: string) => void;
}

interface InternalPluginsLike {
	getEnabledPluginById?: (id: string) => GlobalSearchLike | null | undefined;
}

/** Obsidian search syntax for "notes with this tag (or one of its nested tags)". */
export function buildTagSearchQuery(tag: string): string {
	return `tag:#${tag}`;
}

/**
 * Opens Obsidian's Search pane with a `tag:#<tag>` query. Obsidian's public API
 * has no way to run a search, so this goes through the core Search plugin's
 * internal `openGlobalSearch()` (`app.internalPlugins` is undocumented) — the
 * same thing clicking a tag inside a note does. Best-effort, like
 * `bases-group.ts`: returns false instead of throwing when the plugin is
 * disabled or the internal shape has changed, so the caller can tell the user.
 */
export function openTagSearch(app: App, tag: string): boolean {
	try {
		const internalPlugins = (app as unknown as { internalPlugins?: InternalPluginsLike }).internalPlugins;
		const search = internalPlugins?.getEnabledPluginById?.(SEARCH_PLUGIN_ID);
		if (typeof search?.openGlobalSearch !== 'function') {
			return false;
		}
		search.openGlobalSearch(buildTagSearchQuery(tag));
		return true;
	} catch {
		return false;
	}
}
