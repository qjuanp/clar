import { browser, expect } from '@wdio/globals';
import { describe, it, beforeEach } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';
import {
	activeFilePath,
	clickTagPill,
	closeAllViews,
	expandTaskList,
	openBase,
	readCardStyle,
	readSearchQuery,
	readTaskList,
} from '../support/kanban-board';

async function cardStyle(title: string) {
	const style = await readCardStyle(title);
	if (!style) {
		throw new Error(`Card not found: ${title}`);
	}
	return style;
}

describe('Card style: tags, task stats and progress bar', function () {
	beforeEach(async function () {
		await obsidianPage.resetVault();
		await closeAllViews();
	});

	it('hides tags by default, when the view does not turn "Show tags" on', async function () {
		await openBase('Board Unordered.base');

		expect(await browser.$$('.clar-kanban-card__meta').length).toBe(0);
		expect(await browser.$$('.clar-kanban-card__tag').length).toBe(0);
	});

	it('shows frontmatter tags as pills in the meta section, in order and deduplicated', async function () {
		// Board.base sets `showTags: true`.
		await openBase('Board.base');

		// Marketing Plan.md: `tags: [launch, q3]`.
		expect((await cardStyle('Marketing Plan')).tags).toEqual(['#launch', '#q3']);
		// Mobile App.md: `tags: [mobile, Mobile]` (a case-insensitive duplicate).
		expect((await cardStyle('Mobile App')).tags).toEqual(['#mobile']);
		// Old Prototype.md has tags but no status, so it lives in "No column".
		expect((await cardStyle('Old Prototype')).tags).toEqual(['#prototype']);
	});

	it('renders no meta section for a note without tags', async function () {
		await openBase('Board.base');

		const style = await cardStyle('Website Redesign');
		expect(style.hasMeta).toBe(false);
		expect(style.tags).toEqual([]);
	});

	it('shows the active task count with an icon and a "Completed N%" hover text', async function () {
		await openBase('Board.base');

		// Mobile App.md: 2 of 3 tasks done.
		expect((await cardStyle('Mobile App')).activeTasks).toEqual({
			count: '1',
			hasIcon: true,
			ariaLabel: 'Completed 67%',
		});
	});

	it('draws progress as a bar along the top of the task section', async function () {
		await openBase('Board.base');

		for (const [title, percent] of [
			['Marketing Plan', 0],
			['Mobile App', 67],
			['Migrate Database', 100],
		] as const) {
			const { progress } = await cardStyle(title);
			expect(progress?.valueNow).toBe(String(percent));
			expect(progress?.sectionPosition).toBe(1);
			expect(progress?.fillRatio).toBeCloseTo(percent / 100, 1);
		}
	});

	it('toggles the task list with an icon-only handle whose hover text follows its state', async function () {
		await openBase('Task List.base');

		const collapsed = await cardStyle('Nested Tasks');
		expect(collapsed.toggle).toEqual({ text: '', hasIcon: true, ariaLabel: 'Show tasks', expanded: 'false' });

		await expandTaskList('Nested Tasks');
		await browser.waitUntil(async () => (await readTaskList('Nested Tasks'))?.expanded === true, {
			timeout: 5000,
			timeoutMsg: 'Task list never expanded',
		});
		const expanded = await cardStyle('Nested Tasks');
		expect(expanded.toggle).toEqual({ text: '', hasIcon: true, ariaLabel: 'Hide tasks', expanded: 'true' });
	});

	it('searches for the tag when a tag pill is clicked, without opening the note', async function () {
		await openBase('Board.base');
		const activeBefore = await activeFilePath();

		// Marketing Plan's first tag is #launch.
		await clickTagPill('Marketing Plan');

		await browser.waitUntil(async () => (await readSearchQuery()) === 'tag:#launch', {
			timeout: 5000,
			timeoutMsg: 'Clicking a tag pill did not open search for "tag:#launch"',
		});
		expect(await activeFilePath()).toBe(activeBefore);
	});

	it('keeps the task stats but drops the toggle when the task list option is off', async function () {
		await openBase('Task List Hidden.base');

		const style = await cardStyle('Nested Tasks');
		expect(style.hasTaskSection).toBe(true);
		expect(style.toggle).toBeNull();
		expect(style.activeTasks?.hasIcon).toBe(true);
		expect(style.progress?.sectionPosition).toBe(1);
	});
});
