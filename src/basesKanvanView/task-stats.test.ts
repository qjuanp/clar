import { describe, expect, it } from 'vitest';
import type { ListItemCache } from 'obsidian';
import { getTaskStats } from './task-stats';

function listItem(task?: string): ListItemCache {
	return { task, parent: -1 } as ListItemCache;
}

describe('getTaskStats', () => {
	it('returns null when there are no tasks', () => {
		const listWithNoTasks: ListItemCache[] = [listItem(), listItem()];
		const noList: ListItemCache[] = [];
		expect(getTaskStats(listWithNoTasks)).toBeNull();
		expect(getTaskStats(noList)).toBeNull();
	});

	it('counts incomplete tasks (task === " ") as active', () => {
		const stats = getTaskStats([listItem(' '), listItem('x'), listItem(' ')]);
		expect(stats).toEqual({ active: 2, progressPercent: 33 });
	});

	it('treats a custom status character as done, not incomplete', () => {
		const stats = getTaskStats([listItem('-'), listItem('x')]);
		expect(stats).toEqual({ active: 0, progressPercent: 100 });
	});

	it('rounds the progress percentage (not floor/ceil)', () => {
		// 2 of 3 done -> 66.66...% -> rounds to 67
		expect(getTaskStats([listItem('x'), listItem('x'), listItem(' ')])).toEqual({
			active: 1,
			progressPercent: 67,
		});
	});

	it('reports 0% when every task is incomplete', () => {
		expect(getTaskStats([listItem(' '), listItem(' ')])).toEqual({
			active: 2,
			progressPercent: 0,
		});
	});

	it('ignores non-task list items mixed in with tasks', () => {
		const stats = getTaskStats([listItem(), listItem('x'), listItem(' ')]);
		expect(stats).toEqual({ active: 1, progressPercent: 50 });
	});
});
