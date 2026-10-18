import { Plugin } from 'obsidian';
import { registerKanbanView } from './basesKanvanView/register-view';
import {
	createDefaultSettings,
	sanitizeSettings,
	type ClarSettings,
	type SettingsProvider,
} from './settings/settings-model';
import { ClarSettingTab } from './settings/settings-tab';

export default class ClarPlugin extends Plugin implements SettingsProvider {
	settings: ClarSettings = createDefaultSettings();
	private readonly settingsListeners = new Set<() => void>();

	async onload() {
		this.settings = sanitizeSettings(await this.loadData());
		this.addSettingTab(new ClarSettingTab(this.app, this));
		registerKanbanView(this);
	}

	/** Sanitizes, persists and notifies open boards (they re-render). */
	async updateSettings(next: ClarSettings): Promise<void> {
		this.settings = sanitizeSettings(next);
		await this.saveData(this.settings);
		for (const listener of this.settingsListeners) {
			listener();
		}
	}

	onSettingsChange(listener: () => void): () => void {
		this.settingsListeners.add(listener);
		return () => {
			this.settingsListeners.delete(listener);
		};
	}
}
