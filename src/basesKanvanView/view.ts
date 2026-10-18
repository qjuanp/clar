import { BasesView, Component, MarkdownRenderer, Notice, TFile, type QueryController } from 'obsidian';
import type Sortable from 'sortablejs';
import { KANBAN_OPTION_KEYS, KANBAN_VIEW_TYPE } from './constants';
import { buildKanbanColumns, mergeColumnOrder } from './columns';
import { getTaskStats } from './task-stats';
import { renderKanbanBoard, type TaskListRenderOptions } from './render';
import { buildTaskTree, setTaskStatusInContent, type TaskNode } from './task-list';
import { updateEntryColumn } from './update-column';

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
	/** Paths of cards whose task list is expanded — survives full re-renders. */
	private readonly expandedTaskLists = new Set<string>();
	/** Owns the markdown render children of the current board; replaced on every render. */
	private renderComponent: Component | null = null;

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
		this.resetRenderComponent();

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
			(path, targetColumnLabel) => this.onCardMoved(path, targetColumnLabel),
			(labels) => this.onColumnsReordered(labels),
			// Only an explicit `false` hides the list: an unset option means the default (on).
			this.config.get(KANBAN_OPTION_KEYS.SHOW_TASK_LIST) === false ? null : this.taskListOptions(),
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

	private onCardMoved(path: string, targetColumnLabel: string): void {
		const file = this.app.vault.getAbstractFileByPath(path);
		const groupProperty = this.config.getAsPropertyId(KANBAN_OPTION_KEYS.GROUP_PROPERTY);
		if (!(file instanceof TFile) || !groupProperty) {
			return;
		}
		updateEntryColumn(this.app, file, groupProperty, targetColumnLabel).catch((err: unknown) => {
			console.error('[Clár] Failed to update column for', path, err);
			new Notice('Clár: could not move card — see console for details');
		});
	}

	/**
	 * Persists a dragged column order into the "Column order" option, in the
	 * same comma-separated text form users type by hand. The DOM already shows
	 * the new order, so any re-render this triggers rebuilds the same layout.
	 */
	private onColumnsReordered(labels: string[]): void {
		const previousOrder = parseColumnOrder(this.config.get(KANBAN_OPTION_KEYS.COLUMN_ORDER));
		this.config.set(KANBAN_OPTION_KEYS.COLUMN_ORDER, mergeColumnOrder(previousOrder, labels).join(', '));
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
