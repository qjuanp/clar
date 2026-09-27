import Sortable from 'sortablejs';
import type { TFile } from 'obsidian';
import type { KanbanColumn } from './kanban-grouping';

/**
 * Rebuilds the board from scratch on every call. No diffing is needed since
 * there is no drag-and-drop yet, just re-rendering the current query result.
 */
export function renderKanbanBoard(
	boardEl: HTMLElement,
	columns: KanbanColumn[],
	onOpenFile: (file: TFile) => void,
): Sortable[] {
	boardEl.empty();

	if (columns.length === 0) {
		boardEl.createDiv({
			cls: 'clar-kanban-empty',
			text: 'No entries found for this base.',
		});
		return [];
	}

	const sortables: Sortable[] = [];

	for (const column of columns) {
		const columnEl = boardEl.createDiv({ cls: 'clar-kanban-column' });
		columnEl.createDiv({ cls: 'clar-kanban-column__title', text: column.label });

		const cardsEl = columnEl.createDiv({ cls: 'clar-kanban-column__cards' });
		for (const entry of column.entries) {
			const cardEl = cardsEl.createDiv({
				cls: 'clar-kanban-card',
				text: entry.file.basename,
			});
			cardEl.addEventListener('click', () => onOpenFile(entry.file));
		}

		// SortableJS is wired in as the stated foundation but intentionally inert:
		// no drag-and-drop yet, this pass only renders the board.
		sortables.push(new Sortable(cardsEl, { disabled: true }));
	}

	return sortables;
}
