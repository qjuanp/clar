export const KANBAN_VIEW_TYPE = 'clar-kanban';

export const KANBAN_OPTION_KEYS = {
	SHOW_TASK_LIST: 'showTaskList',
	SHOW_TAGS: 'showTags',
	/**
	 * Column keys whose cards show the stale icon (spec 11). Set only from the
	 * column header menu; deliberately not a declared view option.
	 */
	STALE_COLUMNS: 'staleColumns',
	/**
	 * Map of column key to card color (column colors spec). Set only from the
	 * column header menu; deliberately not a declared view option.
	 */
	COLUMN_COLORS: 'columnColors',
} as const;

export const NO_COLUMN_ID = '__no-column__';
export const NO_COLUMN_LABEL = 'No column';
