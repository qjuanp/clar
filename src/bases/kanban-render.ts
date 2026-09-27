import Sortable from 'sortablejs';
import type { TFile } from 'obsidian';
import type { KanbanColumn } from './kanban-columns';
import type { TaskStats } from './task-stats';

/**
 * Rebuilds the board from scratch on every call. No diffing is needed since
 * there is no drag-and-drop yet, just re-rendering the current query result.
 */
export function renderKanbanBoard(
	boardEl: HTMLElement,
	columns: KanbanColumn[],
	onOpenFile: (file: TFile) => void,
	getTaskStats: (file: TFile) => TaskStats | null,
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
			const cardEl = cardsEl.createDiv({ cls: 'clar-kanban-card' });
			cardEl.createDiv({ cls: 'clar-kanban-card__title', text: entry.file.basename });

			const stats = getTaskStats(entry.file);
			if (stats) {
				const metaEl = cardEl.createDiv({ cls: 'clar-kanban-card__meta' });
				metaEl.createDiv({
					cls: 'clar-kanban-card__active-tasks',
					text: `Active tasks: ${stats.active}`,
				});
				metaEl.createDiv({
					cls: 'clar-kanban-card__progress',
					text: `Progress: ${stats.progressPercent}%`,
				});
			}

			cardEl.addEventListener('click', () => onOpenFile(entry.file));
		}

		// SortableJS is wired in as the stated foundation but intentionally inert:
		// no drag-and-drop yet, this pass only renders the board.
		sortables.push(new Sortable(cardsEl, { disabled: true }));
	}

	return sortables;
}
