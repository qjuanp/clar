import { Plugin } from 'obsidian';
import { registerKanbanView } from './bases/register-kanban-view';

export default class ClarPlugin extends Plugin {
	async onload() {
		registerKanbanView(this);
	}
}
