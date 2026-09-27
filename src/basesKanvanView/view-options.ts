import type { App, BasesAllOptions, BasesViewConfig } from 'obsidian';
import { KANBAN_OPTION_KEYS } from './constants';
import { isListProperty } from './property-type';

/**
 * Options are read back via BasesViewConfig.get()/getAsPropertyId() in the view.
 * A custom "view name" option is deliberately not included here: Bases already
 * gives every view a user-editable name via BasesViewConfig.name.
 */
export function createKanbanViewOptions(app: App): (config: BasesViewConfig) => BasesAllOptions[] {
	return () => [
		{
			type: 'property',
			key: KANBAN_OPTION_KEYS.GROUP_PROPERTY,
			displayName: 'Column property',
			filter: (prop) => isListProperty(app, prop),
		},
		{
			type: 'text',
			key: KANBAN_OPTION_KEYS.COLUMN_ORDER,
			displayName: 'Column order',
			placeholder: 'e.g. Todo, Doing, Done',
		},
	];
}
