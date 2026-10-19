import type { BasesAllOptions, BasesViewConfig } from 'obsidian';
import { KANBAN_OPTION_KEYS } from './constants';

/**
 * Options are read back via BasesViewConfig.get() in the view.
 * Columns and their order come from Bases' own "Group by" toolbar option
 * (spec 12), so there is no column property or column order option here.
 * A custom "view name" option is deliberately not included either: Bases
 * already gives every view a user-editable name via BasesViewConfig.name.
 */
export function createKanbanViewOptions(): (config: BasesViewConfig) => BasesAllOptions[] {
	return () => [
		{
			type: 'toggle',
			key: KANBAN_OPTION_KEYS.SHOW_TASK_LIST,
			displayName: 'Show task list',
			default: true,
		},
		{
			type: 'toggle',
			key: KANBAN_OPTION_KEYS.SHOW_TAGS,
			displayName: 'Show tags',
			default: false,
		},
	];
}
