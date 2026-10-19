import {
	BasesView,
	Component,
	MarkdownRenderer,
	Notice,
	TFile,
	parseFrontMatterTags,
	parsePropertyId,
	type BasesPropertyId,
	type QueryController,
} from 'obsidian';
import type Sortable from 'sortablejs';
import { KANBAN_OPTION_KEYS, KANBAN_VIEW_TYPE } from './constants';
import { getGroupOrder, getGroupProperty, setGroupOrder } from './bases-group';
import { buildKanbanColumns, mergeColumnOrder, type KanbanColumn } from './columns';
import { getCardAgeIndicators } from './card-age';
import { normalizeTags } from './card-tags';
import { getTaskStats } from './task-stats';
import {
	renderKanbanBoard,
	type ColumnMenuOptions,
	type TagRenderOptions,
	type TaskListRenderOptions,
} from './render';
import { columnKey, parseStaleColumns, setStaleColumn } from './stale-columns';
import { parseColumnColors, setColumnColor, type ColumnColor } from './column-colors';
import { openTagSearch } from './tag-search';
import { buildTaskTree, setTaskStatusInContent, type TaskNode } from './task-list';
import { updateEntryColumn } from './update-column';
import type { SettingsProvider } from '../settings/settings-model';

export class KanbanBasesView extends BasesView {
	type = KANBAN_VIEW_TYPE;

	private readonly boardEl: HTMLElement;
	private sortables: Sortable[] = [];
	private metadataListenerRegistered = false;
	/** Paths of cards whose task list is expanded — survives full re-renders. */
	private readonly expandedTaskLists = new Set<string>();
	/** Owns the markdown render children of the current board; replaced on every render. */
	private renderComponent: Component | null = null;
	/** Set on the first `onDataUpdated()`; before that, `data`/`config` may not be ready. */
	private hasRendered = false;
	/** The columns of the current board by id, to resolve drops and column reorders. */
	private columnsById = new Map<string, KanbanColumn>();

	constructor(
		controller: QueryController,
		containerEl: HTMLElement,
		private readonly settingsProvider: SettingsProvider,
	) {
		super(controller);
		containerEl.addClass('clar-kanban-view');
		this.boardEl = containerEl.createDiv({ cls: 'clar-kanban-board' });
		// Plugin settings (recent / stale indicators) changed: re-render so the
		// card icons follow the new timeframes straight away.
		this.register(
			settingsProvider.onSettingsChange(() => {
				if (this.hasRendered) {
					this.onDataUpdated();
				}
			}),
		);
	}

	onDataUpdated(): void {
		this.hasRendered = true;
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
		this.resetRenderComponent();

		// Columns come from Bases' own "Group by" (spec 12): its property, its
		// order (direction or manual group order) and its grouping of values.
		const groupProperty = getGroupProperty(this.config);
		if (!groupProperty) {
			this.columnsById.clear();
			this.boardEl.empty();
			this.boardEl.createDiv({
				cls: 'clar-kanban-empty',
				text: 'Set "Group by" in the base toolbar to build columns.',
			});
			return;
		}

		const columns = buildKanbanColumns(this.data.groupedData);
		this.columnsById = new Map(columns.map((column) => [column.id, column]));
		const now = Date.now();
		const staleColumns = new Set(parseStaleColumns(this.config.get(KANBAN_OPTION_KEYS.STALE_COLUMNS)));
		const columnColors = parseColumnColors(this.config.get(KANBAN_OPTION_KEYS.COLUMN_COLORS));
		const settings = this.settingsProvider.settings;
		this.sortables = renderKanbanBoard(
			this.boardEl,
			columns,
			(file) => this.openFile(file),
			(file) => getTaskStats(this.app.metadataCache.getFileCache(file)?.listItems ?? []),
			(file, column) =>
				getCardAgeIndicators(
					file.stat.ctime,
					file.stat.mtime,
					now,
					settings,
					staleColumns.has(columnKey(column)),
				),
			// Tags are opt-in: only an explicit `true` shows them (default off).
			this.config.get(KANBAN_OPTION_KEYS.SHOW_TAGS) === true ? this.tagOptions() : null,
			// Only note properties can be written back; a group by `file.folder` or a
			// formula keeps the cards where they are.
			isWritableProperty(groupProperty) ? (path, columnId) => this.onCardMoved(path, columnId) : null,
			(columnIds) => this.onColumnsReordered(columnIds),
			// Only an explicit `false` hides the list: an unset option means the default (on).
			this.config.get(KANBAN_OPTION_KEYS.SHOW_TASK_LIST) === false ? null : this.taskListOptions(),
			// The stale item goes away with the global stale setting; the saved
			// per-column choice is kept for when it comes back.
			this.columnMenuOptions(staleColumns, columnColors, settings.staleCards.enabled),
		);
	}

	onunload(): void {
		this.destroySortables();
		this.clearRenderComponent();
		this.boardEl.empty();
	}

	private openFile(file: TFile): void {
		void this.app.workspace.getLeaf(false).openFile(file);
	}

	private onCardMoved(path: string, targetColumnId: string): void {
		const file = this.app.vault.getAbstractFileByPath(path);
		const groupProperty = getGroupProperty(this.config);
		const target = this.columnsById.get(targetColumnId);
		if (!(file instanceof TFile) || !groupProperty || !target || target.value === null) {
			return;
		}
		updateEntryColumn(this.app, file, groupProperty, target.value).catch((err: unknown) => {
			console.error('[Clár] Failed to update column for', path, err);
			new Notice('Clár: could not move card — see console for details');
		});
	}

	/**
	 * Saves a dragged column order as the Bases manual group order (spec 12), the
	 * same list the "Group by" menu edits, so both stay in sync. This switches
	 * "Group by" to manual order. The DOM already shows the new order, so the
	 * re-render this triggers rebuilds the same layout.
	 */
	private onColumnsReordered(columnIds: string[]): void {
		const visibleOrder = columnIds
			.map((id) => this.columnsById.get(id))
			.filter((column): column is KanbanColumn => column !== undefined)
			.map((column) => column.value);
		const order = mergeColumnOrder(getGroupOrder(this.config) ?? [], visibleOrder);
		if (!setGroupOrder(this.config, order)) {
			new Notice('Clár: could not save the column order, reorder the groups from the base toolbar instead');
			this.onDataUpdated();
		}
	}

	/**
	 * Per-column stale icon switch (spec 11), saved as a string list under a
	 * config key that isn't a declared view option, so only this menu edits it.
	 */
	private columnMenuOptions(
		staleColumns: ReadonlySet<string>,
		columnColors: Readonly<Record<string, ColumnColor>>,
		showStaleItem: boolean,
	): ColumnMenuOptions {
		return {
			showStaleItem,
			getColor: (column) => columnColors[columnKey(column)] ?? null,
			onSetColor: (column, color) => {
				const current = parseColumnColors(this.config.get(KANBAN_OPTION_KEYS.COLUMN_COLORS));
				this.config.set(KANBAN_OPTION_KEYS.COLUMN_COLORS, setColumnColor(current, columnKey(column), color));
				this.onDataUpdated();
			},
			isStaleShown: (column) => staleColumns.has(columnKey(column)),
			onToggleStale: (column, shown) => {
				const current = parseStaleColumns(this.config.get(KANBAN_OPTION_KEYS.STALE_COLUMNS));
				this.config.set(KANBAN_OPTION_KEYS.STALE_COLUMNS, setStaleColumn(current, columnKey(column), shown));
				this.onDataUpdated();
			},
		};
	}

	private tagOptions(): TagRenderOptions {
		return {
			getTags: (file) =>
				normalizeTags(parseFrontMatterTags(this.app.metadataCache.getFileCache(file)?.frontmatter ?? null)),
			onTagClick: (tag) => {
				if (!openTagSearch(this.app, tag)) {
					new Notice('Clár: could not open search — is the core search plugin enabled?');
				}
			},
		};
	}

	private taskListOptions(): TaskListRenderOptions {
		return {
			isExpanded: (path) => this.expandedTaskLists.has(path),
			onToggleExpanded: (path, expanded) => {
				if (expanded) {
					this.expandedTaskLists.add(path);
				} else {
					this.expandedTaskLists.delete(path);
				}
			},
			renderTaskList: (file, listEl) => {
				this.renderTaskList(file, listEl).catch((err: unknown) => {
					console.error('[Clár] Failed to render task list for', file.path, err);
				});
			},
		};
	}

	private async renderTaskList(file: TFile, listEl: HTMLElement): Promise<void> {
		const component = this.renderComponent;
		const content = await this.app.vault.cachedRead(file);
		// A newer render may have replaced this board while the file was being read.
		if (!component || component !== this.renderComponent || !listEl.isConnected) {
			return;
		}
		const listItems = this.app.metadataCache.getFileCache(file)?.listItems ?? [];
		const tree = buildTaskTree(listItems, content);

		listEl.addEventListener('click', (evt) => {
			const link = evt.target instanceof HTMLElement ? evt.target.closest('a.internal-link') : null;
			const href = link?.getAttribute('data-href') ?? link?.getAttribute('href');
			if (href) {
				evt.preventDefault();
				void this.app.workspace.openLinkText(href, file.path);
			}
		});

		const renders: Promise<void>[] = [];
		const renderNodes = (nodes: TaskNode[], parentEl: HTMLElement) => {
			const ulEl = parentEl.createEl('ul', { cls: 'contains-task-list' });
			for (const node of nodes) {
				const liEl = ulEl.createEl('li', { cls: 'task-list-item' });
				liEl.dataset.line = String(node.line);
				const rowEl = liEl.createDiv({ cls: 'clar-kanban-task' });
				const checkboxEl = rowEl.createEl('input', {
					cls: 'task-list-item-checkbox',
					type: 'checkbox',
				});
				checkboxEl.checked = node.status !== ' ';
				checkboxEl.addEventListener('change', () => {
					void this.setTaskDone(file, node.line, checkboxEl);
				});
				const textEl = rowEl.createDiv({ cls: 'clar-kanban-task__text' });
				renders.push(MarkdownRenderer.render(this.app, node.text, textEl, file.path, component));
				if (node.children.length > 0) {
					renderNodes(node.children, liEl);
				}
			}
		};
		renderNodes(tree, listEl);
		await Promise.all(renders);
	}

	private async setTaskDone(file: TFile, line: number, checkboxEl: HTMLInputElement): Promise<void> {
		const done = checkboxEl.checked;
		let matched = true;
		try {
			await this.app.vault.process(file, (content) => {
				const updated = setTaskStatusInContent(content, line, done);
				matched = updated !== null;
				return updated ?? content;
			});
		} catch (err) {
			console.error('[Clár] Failed to update task in', file.path, err);
			matched = false;
		}
		if (!matched) {
			checkboxEl.checked = !done;
			new Notice('Clár: could not update task — the note changed, try again');
		}
		// On success the metadataCache 'changed' listener re-renders the board.
	}

	private resetRenderComponent(): void {
		this.clearRenderComponent();
		this.renderComponent = this.addChild(new Component());
	}

	private clearRenderComponent(): void {
		if (this.renderComponent) {
			this.removeChild(this.renderComponent);
			this.renderComponent = null;
		}
	}

	private destroySortables(): void {
		for (const sortable of this.sortables) {
			sortable.destroy();
		}
		this.sortables = [];
	}
}

/** A dropped card can only be written back into a note (frontmatter) property. */
function isWritableProperty(propertyId: BasesPropertyId): boolean {
	return parsePropertyId(propertyId).type === 'note';
}
