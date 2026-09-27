import { Plugin } from 'obsidian';
import { registerKanbanView } from './basesKanvanView/register-view';

export default class ClarPlugin extends Plugin {
	async onload() {
		registerKanbanView(this);
	}
}
