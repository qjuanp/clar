import type { App, TFile } from 'obsidian';

export interface TaskStats {
	active: number;
	progressPercent: number;
}

/**
 * A "task" is any list item with a defined `task` field: `' '` means incomplete,
 * any other character (e.g. 'x', or a custom status from a task plugin) means done.
 * Returns null when the note has no tasks at all, so callers can hide the whole block.
 */
export function getTaskStats(app: App, file: TFile): TaskStats | null {
	const tasks = (app.metadataCache.getFileCache(file)?.listItems ?? []).filter(
		(item) => item.task !== undefined,
	);
	if (tasks.length === 0) {
		return null;
	}

	const completed = tasks.filter((item) => item.task !== ' ').length;
	return {
		active: tasks.length - completed,
		progressPercent: Math.round((completed / tasks.length) * 100),
	};
}
