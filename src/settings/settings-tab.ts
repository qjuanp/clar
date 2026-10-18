import { Notice, PluginSettingTab, Setting, type App } from 'obsidian';
import type ClarPlugin from '../main';
import {
	applyTimeframeChange,
	formatTimeframe,
	TIME_UNIT_LABELS,
	TIME_UNIT_MAX,
	TIME_UNITS,
	type Timeframe,
	type TimeframeKey,
	type TimeUnit,
} from './settings-model';

interface AgeSectionLabels {
	heading: string;
	toggleName: string;
	toggleDesc: string;
	timeframeName: string;
}

const SECTION_LABELS: Record<TimeframeKey, AgeSectionLabels> = {
	recentCards: {
		heading: 'Recent cards',
		toggleName: 'Identify recent cards',
		toggleDesc: 'Show an icon on cards whose note was created within the timeframe.',
		timeframeName: 'Recent timeframe',
	},
	staleCards: {
		heading: 'Stale cards',
		toggleName: 'Identify stale cards',
		toggleDesc: "Show an icon on cards whose note hasn't been updated for longer than the timeframe.",
		timeframeName: 'Stale timeframe',
	},
};

/**
 * Settings → Clár (spec 10). UI only: every value goes through the pure
 * `settings-model.ts` (clamping, golden rule) and is saved with
 * `ClarPlugin.updateSettings()`, which also re-renders open boards.
 */
export class ClarSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: ClarPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		this.containerEl.empty();
		this.renderAgeSection('recentCards');
		this.renderAgeSection('staleCards');
	}

	/**
	 * Rebuilds the tab so toggled rows and auto-adjusted values show up.
	 * `display()` is deprecated since Obsidian 1.13 in favour of the declarative
	 * `getSettingDefinitions()`, but that API doesn't exist on 1.10–1.12, which
	 * `minAppVersion` (1.10.0) still supports. Switch once `minAppVersion` is
	 * raised to 1.13.
	 */
	private refresh(): void {
		// eslint-disable-next-line @typescript-eslint/no-deprecated -- needed for Obsidian 1.10–1.12, see above
		this.display();
	}

	private renderAgeSection(key: TimeframeKey): void {
		const labels = SECTION_LABELS[key];
		const indicator = this.plugin.settings[key];

		new Setting(this.containerEl).setName(labels.heading).setHeading();

		new Setting(this.containerEl)
			.setName(labels.toggleName)
			.setDesc(labels.toggleDesc)
			.addToggle((toggle) =>
				toggle.setValue(indicator.enabled).onChange(async (enabled) => {
					const settings = this.plugin.settings;
					await this.plugin.updateSettings({ ...settings, [key]: { ...settings[key], enabled } });
					this.refresh();
				}),
			);

		if (!indicator.enabled) {
			return;
		}

		const { amount, unit } = indicator.timeframe;
		const timeframeSetting = new Setting(this.containerEl)
			.setName(labels.timeframeName)
			.setDesc(`Between 1 and ${TIME_UNIT_MAX[unit]} ${unit}.`)
			.addText((text) => {
				text.inputEl.type = 'number';
				text.inputEl.min = '1';
				text.inputEl.max = String(TIME_UNIT_MAX[unit]);
				text.inputEl.step = '1';
				text.setValue(String(amount));
				// Commit on `change` (blur / Enter), not on every keystroke:
				// `display()` rebuilds the tab and would steal focus mid-typing.
				text.inputEl.addEventListener('change', () => {
					void this.commit(key, { amount: Number(text.inputEl.value), unit });
				});
			})
			.addDropdown((dropdown) => {
				for (const option of TIME_UNITS) {
					dropdown.addOption(option, TIME_UNIT_LABELS[option]);
				}
				dropdown.setValue(unit).onChange(async (value) => {
					await this.commit(key, { amount, unit: value as TimeUnit });
				});
			});
		timeframeSetting.settingEl.addClass(`clar-setting-${key}-timeframe`);
	}

	private async commit(key: TimeframeKey, next: Timeframe): Promise<void> {
		const result = applyTimeframeChange(this.plugin.settings, key, next);
		await this.plugin.updateSettings(result.settings);
		if (result.adjusted === 'recentCards') {
			new Notice(
				`Recent timeframe lowered to ${formatTimeframe(result.settings.recentCards.timeframe)} so recent cards are never stale.`,
			);
		} else if (result.adjusted === 'staleCards') {
			new Notice(
				`Stale timeframe raised to ${formatTimeframe(result.settings.staleCards.timeframe)} so recent cards are never stale.`,
			);
		}
		this.refresh();
	}
}
