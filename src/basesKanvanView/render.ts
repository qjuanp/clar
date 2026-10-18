import Sortable from 'sortablejs';
import { setIcon, setTooltip, type TFile } from 'obsidian';
import type { KanbanColumn } from './columns';
import type { TaskStats } from './task-stats';
import { RECENT_TOOLTIP, type CardAgeIndicators } from './card-age';
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

/** Callbacks for the per-card tag pills (tags spec). */
export interface TagRenderOptions {
	/** The note's tags, without `#`. */
	getTags: (file: TFile) => string[];
	/** Called when a pill is clicked; the click doesn't also open the note. */
	onTagClick: (tag: string) => void;
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
 * Pass `taskList: null` to hide the per-card task list; a card's task stats
 * (active count + progress bar) are shown either way. Pass `tags: null` to
 * hide the tag pills.
 */
export function renderKanbanBoard(
	boardEl: HTMLElement,
	columns: KanbanColumn[],
	onOpenFile: (file: TFile) => void,
	getTaskStats: (file: TFile) => TaskStats | null,
	getCardAge: (file: TFile) => CardAgeIndicators,
	tags: TagRenderOptions | null,
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
			renderCardHeader(cardEl, entry.file.basename, getCardAge(entry.file));

			if (tags) {
				renderTagPills(cardEl, entry.file, tags);
			}

			const stats = getTaskStats(entry.file);
			if (stats) {
				renderTaskSection(cardEl, entry.file, stats, taskList);
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

/**
 * The card's title row: the title (kept text-only) plus, on the right, the
 * recent / stale indicator icons (spec 10). Icons have no click handler, so
 * a click bubbles to the card and opens the note, like the title.
 */
function renderCardHeader(cardEl: HTMLElement, title: string, age: CardAgeIndicators): void {
	const headerEl = cardEl.createDiv({ cls: 'clar-kanban-card__header' });
	headerEl.createDiv({ cls: 'clar-kanban-card__title', text: title });
	if (!age.recent && age.staleTooltip === null) {
		return;
	}
	const indicatorsEl = headerEl.createDiv({ cls: 'clar-kanban-card__indicators' });
	if (age.recent) {
		const recentEl = indicatorsEl.createSpan({
			cls: ['clar-kanban-card__indicator', 'clar-kanban-card__indicator--recent'],
		});
		setIcon(recentEl, 'sparkles');
		setTooltip(recentEl, RECENT_TOOLTIP);
	}
	if (age.staleTooltip !== null) {
		const staleEl = indicatorsEl.createSpan({
			cls: ['clar-kanban-card__indicator', 'clar-kanban-card__indicator--stale'],
		});
		setIcon(staleEl, 'hourglass');
		setTooltip(staleEl, age.staleTooltip);
	}
}

/**
 * Tag pills in the card's meta row, using Obsidian's own `a.tag` markup. A
 * click runs `onTagClick` instead of the card's open-the-note handler.
 */
function renderTagPills(cardEl: HTMLElement, file: TFile, options: TagRenderOptions): void {
	const tags = options.getTags(file);
	if (tags.length === 0) {
		return;
	}
	const metaEl = cardEl.createDiv({ cls: 'clar-kanban-card__meta' });
	for (const tag of tags) {
		const tagEl = metaEl.createEl('a', {
			cls: ['tag', 'clar-kanban-card__tag'],
			text: `#${tag}`,
			href: `#${tag}`,
		});
		setTooltip(tagEl, `Search for #${tag}`);
		tagEl.addEventListener('click', (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			options.onTagClick(tag);
		});
	}
}

/**
 * The card's task footer: an optional expand/collapse icon (only when the
 * task list is enabled), the active-task count with a "Completed N%"
 * tooltip, the collapsible list itself, and a progress bar along the
 * section's bottom edge.
 */
function renderTaskSection(
	cardEl: HTMLElement,
	file: TFile,
	stats: TaskStats,
	options: TaskListRenderOptions | null,
): void {
	const sectionEl = cardEl.createDiv({ cls: TASK_LIST_CLASS });
	// Clicks inside the section (toggle, count, checkboxes, links) must not
	// bubble up to the card's open-the-note handler.
	sectionEl.addEventListener('click', (evt) => evt.stopPropagation());

	const headerEl = sectionEl.createDiv({ cls: 'clar-kanban-card__tasks-header' });
	const toggleEl = options
		? headerEl.createEl('button', { cls: ['clickable-icon', 'clar-kanban-card__tasks-toggle'] })
		: null;

	const completedPercentageText = `Completed ${stats.progressPercent}%`;
	const activeEl = headerEl.createDiv({ cls: 'clar-kanban-card__active-tasks' });
	setIcon(activeEl.createSpan({ cls: 'clar-kanban-card__active-tasks-icon' }), 'square');
	activeEl.createSpan({ cls: 'clar-kanban-card__active-tasks-count', text: String(stats.active) });
	setTooltip(activeEl, completedPercentageText);

	const progressEl = sectionEl.createDiv({
		cls: 'clar-kanban-card__progress',
		attr: {
			role: 'progressbar',
			title: completedPercentageText,
			'aria-valuemin': '0',
			'aria-valuemax': '100',
			'aria-valuenow': String(stats.progressPercent),
			'data-progress': String(stats.progressPercent),
		},
	});
	progressEl.setCssProps({ '--clar-progress': `${stats.progressPercent}%` });
	progressEl.createDiv({ cls: 'clar-kanban-card__progress-fill' });

	if (options && toggleEl) {
		const listEl = sectionEl.createDiv({ cls: 'clar-kanban-card__tasks-list' });
		const apply = (expanded: boolean) => {
			const label = expanded ? 'Hide tasks' : 'Show tasks';
			setIcon(toggleEl, expanded ? 'chevron-down' : 'chevron-right');
			setTooltip(toggleEl, label);
			toggleEl.setAttr('aria-label', label);
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

	
}
