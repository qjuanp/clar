import type { BasesPropertyId, BasesViewConfig, FrontmatterValue } from 'obsidian';

/**
 * Access to the view's Bases "Group by" (spec 12). The public `BasesViewConfig`
 * only exposes grouped results (`BasesQueryResult.groupedData`), not the group
 * property or the manual group order, so these read and write the config's
 * undocumented `groupBy`, `groupOrder` and `setGroupOrder()` (Obsidian 1.14.3+).
 * Like `tag-search.ts`, every helper degrades instead of throwing if the
 * internal shape changes. Covered by e2e, since it needs a live config.
 */
interface GroupConfigLike {
	groupBy?: { property?: unknown } | null;
	groupOrder?: unknown;
	setGroupOrder?: (order: FrontmatterValue[] | null) => void;
}

function asGroupConfig(config: BasesViewConfig): GroupConfigLike {
	return config as unknown as GroupConfigLike;
}

/** The "Group by" property, or null when the view isn't grouped. */
export function getGroupProperty(config: BasesViewConfig): BasesPropertyId | null {
	try {
		const property = asGroupConfig(config).groupBy?.property;
		return typeof property === 'string' && property.length > 0 ? (property as BasesPropertyId) : null;
	} catch {
		return null;
	}
}

/** The manual group order, or null when "Group by" sorts by value instead. */
export function getGroupOrder(config: BasesViewConfig): FrontmatterValue[] | null {
	try {
		const order = asGroupConfig(config).groupOrder;
		return Array.isArray(order) ? (order as FrontmatterValue[]) : null;
	} catch {
		return null;
	}
}

/** Saves a manual group order (Bases writes the `.base` file). Returns false if it couldn't. */
export function setGroupOrder(config: BasesViewConfig, order: FrontmatterValue[]): boolean {
	try {
		const groupConfig = asGroupConfig(config);
		if (typeof groupConfig.setGroupOrder !== 'function') {
			return false;
		}
		groupConfig.setGroupOrder(order);
		return true;
	} catch {
		return false;
	}
}
