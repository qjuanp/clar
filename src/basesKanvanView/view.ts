import { BasesView, type QueryController, type TFile } from 'obsidian';
import type Sortable from 'sortablejs';
import { KANBAN_OPTION_KEYS, KANBAN_VIEW_TYPE } from '../core/constants';
import { buildKanbanColumns } from '../core/columns';
import { getTaskStats } from '../core/task-stats';
import { renderKanbanBoard } from './render';

function parseColumnOrder(rawValue: unknown): string[] {
	if (typeof rawValue !== 'string') {
		return [];
	}
	return rawValue
		.split(',')
		.map((value) => value.trim())
		.filter((value) => value.length > 0);
}

export class KanbanBasesView extends BasesView {
	type = KANBAN_VIEW_TYPE;

	private readonly boardEl: HTMLElement;
	private sortables: Sortable[] = [];
	private metadataListenerRegistered = false;

	constructor(controller: QueryController, containerEl: HTMLElement) {
		super(controller);
		containerEl.addClass('clar-kanban-view');
		this.boardEl = containerEl.createDiv({ cls: 'clar-kanban-board' });
	}

	onDataUpdated(): void {
		if (!this.metadataListenerRegistered) {
			this.metadataListenerRegistered = true;
			// Bases' own onDataUpdated() only fires when the query result changes
			// (filters/sort/frontmatter). Toggling a checkbox edits the note body, not
			// a tracked property, so re-render on every metadata cache update to keep
			// task counts current. Registered here (rather than the constructor) since
			// `this.app` isn't guaranteed to be populated yet at construction time.
			this.registerEvent(this.app.metadataCache.on('changed', () => this.onDataUpdated()));
		}

		this.destroySortables();

		const groupProperty = this.config.getAsPropertyId(KANBAN_OPTION_KEYS.GROUP_PROPERTY);
		if (!groupProperty) {
			this.boardEl.empty();
			this.boardEl.createDiv({
				cls: 'clar-kanban-empty',
				text: 'Select a list property in the view options to build columns.',
			});
			return;
		}

		const columnOrder = parseColumnOrder(this.config.get(KANBAN_OPTION_KEYS.COLUMN_ORDER));
		const columns = buildKanbanColumns(this.data.data, groupProperty, columnOrder);
		this.sortables = renderKanbanBoard(
			this.boardEl,
			columns,
			(file) => this.openFile(file),
			(file) => getTaskStats(this.app.metadataCache.getFileCache(file)?.listItems ?? []),
		);
	}

	onunload(): void {
		this.destroySortables();
		this.boardEl.empty();
	}

	private openFile(file: TFile): void {
		void this.app.workspace.getLeaf(false).openFile(file);
	}

	private destroySortables(): void {
		for (const sortable of this.sortables) {
			sortable.destroy();
		}
		this.sortables = [];
	}
}
