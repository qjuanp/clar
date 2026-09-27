import { BasesView, type QueryController, type TFile } from 'obsidian';
import type Sortable from 'sortablejs';
import { KANBAN_OPTION_KEYS, KANBAN_VIEW_TYPE } from './constants';
import { buildKanbanColumns } from './kanban-grouping';
import { renderKanbanBoard } from './kanban-render';

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

	constructor(controller: QueryController, containerEl: HTMLElement) {
		super(controller);
		containerEl.addClass('clar-kanban-view');
		this.boardEl = containerEl.createDiv({ cls: 'clar-kanban-board' });
	}

	onDataUpdated(): void {
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
		this.sortables = renderKanbanBoard(this.boardEl, columns, (file) => this.openFile(file));
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
