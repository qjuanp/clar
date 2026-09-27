import type { Plugin } from 'obsidian';
import { KANBAN_VIEW_TYPE } from '../core/constants';
import { KanbanBasesView } from './view';
import { createKanbanViewOptions } from './view-options';

export function registerKanbanView(plugin: Plugin): void {
	const registered = plugin.registerBasesView(KANBAN_VIEW_TYPE, {
		name: 'Kanban board',
		icon: 'lucide-square-kanban',
		factory: (controller, containerEl) => new KanbanBasesView(controller, containerEl),
		options: createKanbanViewOptions(plugin.app),
	});

	if (!registered) {
		console.warn('Clár: could not register the Kanban board view (Bases is not enabled in this vault).');
	}
}
