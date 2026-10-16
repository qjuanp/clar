import Sortable from 'sortablejs';
import type { TFile } from 'obsidian';
import type { KanbanColumn } from './columns';
import type { TaskStats } from './task-stats';
import { NO_COLUMN_ID } from './constants';

/**
 * Rebuilds the board from scratch on every call. Drag-and-drop moves are
 * reported via `onCardMoved`; the next `onDataUpdated()` re-render (driven by
 * the resulting frontmatter change) is what reconciles the DOM afterwards.
 */
export function renderKanbanBoard(
	boardEl: HTMLElement,
	columns: KanbanColumn[],
	onOpenFile: (file: TFile) => void,
	getTaskStats: (file: TFile) => TaskStats | null,
	onCardMoved: (path: string, targetColumnLabel: string) => void,
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
		cardsEl.dataset.columnLabel = column.label;
		for (const entry of column.entries) {
			const cardEl = cardsEl.createDiv({ cls: 'clar-kanban-card' });
			cardEl.dataset.path = entry.file.path;
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

		// "No column" can't `put` (accept drops): it isn't a real property value,
		// so a card dropped there would have nothing meaningful to write. It can
		// still `pull` (be dragged from), since a card with no value should be
		// movable into a real column. `forceFallback` makes SortableJS drive the
		// drag off plain pointer events instead of native HTML5 DnD, which is
		// both more consistent across platforms and reliably driveable in e2e tests.
		sortables.push(
			new Sortable(cardsEl, {
				group:
					column.id === NO_COLUMN_ID
						? { name: 'clar-kanban-cards', put: false }
						: 'clar-kanban-cards',
				animation: 150,
				forceFallback: true,
				fallbackTolerance: 3,
				onEnd: (evt) => {
					if (evt.from === evt.to) {
						return;
					}
					const path = evt.item.dataset.path;
					const targetColumnLabel = evt.to.dataset.columnLabel;
					if (!path || targetColumnLabel === undefined) {
						return;
					}
					onCardMoved(path, targetColumnLabel);
				},
			}),
		);
	}

	return sortables;
}
