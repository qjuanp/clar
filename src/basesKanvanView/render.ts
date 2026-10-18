import Sortable from 'sortablejs';
import { setIcon, type TFile } from 'obsidian';
import type { KanbanColumn } from './columns';
import type { TaskStats } from './task-stats';
import { NO_COLUMN_ID } from './constants';

/**
 * Callbacks for the collapsible per-card task list (spec 6). Expanded state
 * lives in the view, not the DOM, because every metadata change — including
 * ticking one of these checkboxes — rebuilds the whole board.
 */
export interface TaskListRenderOptions {
	isExpanded: (path: string) => boolean;
	onToggleExpanded: (path: string, expanded: boolean) => void;
	/** Fills `listEl` with the note's tasks. Only called for expanded cards. */
	renderTaskList: (file: TFile, listEl: HTMLElement) => void;
}

const TASK_LIST_CLASS = 'clar-kanban-card__tasks';
const COLUMN_CLASS = 'clar-kanban-column';
const NO_COLUMN_CLASS = 'clar-kanban-column--no-column';
const COLUMN_HANDLE_CLASS = 'clar-kanban-column__handle';

/**
 * Rebuilds the board from scratch on every call. Drag-and-drop moves are
 * reported via `onCardMoved`; the next `onDataUpdated()` re-render (driven by
 * the resulting frontmatter change) is what reconciles the DOM afterwards.
 * Column reorders (dragged by the handle in each column header) are reported
 * via `onColumnsReordered` with the new order of real column labels.
 * Pass `taskList: null` to hide the per-card task list.
 */
export function renderKanbanBoard(
	boardEl: HTMLElement,
	columns: KanbanColumn[],
	onOpenFile: (file: TFile) => void,
	getTaskStats: (file: TFile) => TaskStats | null,
	onCardMoved: (path: string, targetColumnLabel: string) => void,
	onColumnsReordered: (labels: string[]) => void,
	taskList: TaskListRenderOptions | null,
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
		const isNoColumn = column.id === NO_COLUMN_ID;
		const columnEl = boardEl.createDiv({ cls: isNoColumn ? [COLUMN_CLASS, NO_COLUMN_CLASS] : COLUMN_CLASS });
		columnEl.dataset.columnLabel = column.label;
		const headerEl = columnEl.createDiv({ cls: 'clar-kanban-column__header' });
		headerEl.createDiv({ cls: 'clar-kanban-column__title', text: column.label });
		if (!isNoColumn) {
			const handleEl = headerEl.createSpan({
				cls: COLUMN_HANDLE_CLASS,
				attr: { 'aria-label': 'Drag to reorder column' },
			});
			setIcon(handleEl, 'grip-vertical');
		}

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

				if (taskList) {
					renderTaskListSection(cardEl, entry.file, taskList);
				}
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
					isNoColumn
						? { name: 'clar-kanban-cards', put: false }
						: 'clar-kanban-cards',
				animation: 150,
				forceFallback: true,
				fallbackTolerance: 3,
				fallbackOnBody: true, // attaches the clone to document.body instead of the list. Whit this in true was able to attach the card directly to the cursor
				// Pressing inside the task list (checkboxes, links, its scrollbar)
				// must not start a drag; `preventOnFilter: false` keeps those
				// controls' default behaviour working.
				filter: `.${TASK_LIST_CLASS}`,
				preventOnFilter: false,
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

	sortables.push(createColumnSortable(boardEl, onColumnsReordered));
	return sortables;
}

/**
 * Columns are reordered only by their header handle, in a group of their own
 * so cards and columns can never be dropped into each other. "No column" is
 * pinned last: it has no handle (so it can never start a drag — deliberately
 * not a `filter`, which would `preventDefault` every press inside it,
 * including on its cards), and `onMove` refuses any drop that would land
 * after it.
 */
function createColumnSortable(boardEl: HTMLElement, onColumnsReordered: (labels: string[]) => void): Sortable {
	return new Sortable(boardEl, {
		group: 'clar-kanban-columns',
		draggable: `.${COLUMN_CLASS}`,
		handle: `.${COLUMN_HANDLE_CLASS}`,
		direction: 'horizontal',
		animation: 150,
		forceFallback: true,
		fallbackTolerance: 3,
		fallbackOnBody: true,
		onMove: (evt) => !(evt.related.hasClass(NO_COLUMN_CLASS) && evt.willInsertAfter),
		onEnd: (evt) => {
			if (evt.oldIndex === evt.newIndex) {
				return;
			}
			const labels = Array.from(boardEl.children)
				.filter((el): el is HTMLElement => el instanceof HTMLElement && el.hasClass(COLUMN_CLASS))
				.filter((el) => !el.hasClass(NO_COLUMN_CLASS))
				.map((el) => el.dataset.columnLabel)
				.filter((label): label is string => label !== undefined);
			onColumnsReordered(labels);
		},
	});
}

function renderTaskListSection(cardEl: HTMLElement, file: TFile, options: TaskListRenderOptions): void {
	const sectionEl = cardEl.createDiv({ cls: TASK_LIST_CLASS });
	// Clicks inside the section (toggle, checkboxes, links) must not bubble up
	// to the card's open-the-note handler.
	sectionEl.addEventListener('click', (evt) => evt.stopPropagation());

	const toggleEl = sectionEl.createEl('button', { cls: 'clar-kanban-card__tasks-toggle' });
	const listEl = sectionEl.createDiv({ cls: 'clar-kanban-card__tasks-list' });

	const apply = (expanded: boolean) => {
		toggleEl.setText(expanded ? '▾ Hide tasks' : '▸ Show tasks');
		toggleEl.setAttr('aria-expanded', String(expanded));
		listEl.toggleClass('is-collapsed', !expanded);
		if (expanded && listEl.childElementCount === 0) {
			options.renderTaskList(file, listEl);
		}
	};

	toggleEl.addEventListener('click', () => {
		const expanded = !options.isExpanded(file.path);
		options.onToggleExpanded(file.path, expanded);
		apply(expanded);
	});

	apply(options.isExpanded(file.path));
}
