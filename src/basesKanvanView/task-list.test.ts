import { describe, expect, it } from 'vitest';
import type { ListItemCache } from 'obsidian';
import { buildTaskTree, setTaskStatusInContent, type TaskNode } from './task-list';

/**
 * Derives ListItemCache entries from markdown the way Obsidian does: a list
 * item's `parent` is the line of the nearest less-indented item above it, or
 * the negative line of the list's first item for roots.
 */
function parseListItems(content: string): ListItemCache[] {
	const items: ListItemCache[] = [];
	const stack: { line: number; indent: number }[] = [];
	let listStart: number | null = null;
	content.split('\n').forEach((text, line) => {
		const match = /^(\s*)(?:[-*+]|\d+[.)])\s+(?:\[(.)\])?/.exec(text);
		if (!match) {
			stack.length = 0;
			listStart = null;
			return;
		}
		const indent = match[1]?.length ?? 0;
		while (stack.length > 0 && (stack[stack.length - 1]?.indent ?? 0) >= indent) {
			stack.pop();
		}
		listStart ??= line;
		const parent = stack.length > 0 ? (stack[stack.length - 1]?.line ?? 0) : -listStart;
		items.push({
			task: match[2],
			parent,
			position: { start: { line, col: 0, offset: 0 }, end: { line, col: 0, offset: 0 } },
		});
		stack.push({ line, indent });
	});
	return items;
}

function tree(content: string): TaskNode[] {
	return buildTaskTree(parseListItems(content), content);
}

/** Compact `text` / `[children]` shape for readable assertions. */
function shape(nodes: TaskNode[]): unknown[] {
	return nodes.map((node) => (node.children.length > 0 ? [node.text, shape(node.children)] : node.text));
}

describe('buildTaskTree', () => {
	it('returns an empty list when there are no tasks', () => {
		expect(tree('# Title\n\n- plain\n- bullets')).toEqual([]);
	});

	it('keeps a flat list in file order with line, status and stripped text', () => {
		const nodes = tree('# T\n\n- [x] First\n- [ ] Second\n- [-] Third');
		expect(nodes).toEqual([
			{ line: 2, status: 'x', text: 'First', children: [] },
			{ line: 3, status: ' ', text: 'Second', children: [] },
			{ line: 4, status: '-', text: 'Third', children: [] },
		]);
	});

	it('nests subtasks under their parent task', () => {
		const content = ['- [ ] Parent', '\t- [ ] Child A', '\t\t- [x] Grandchild', '\t- [ ] Child B', '- [ ] Sibling'].join('\n');
		expect(shape(tree(`# T\n${content}`))).toEqual([
			['Parent', [['Child A', ['Grandchild']], 'Child B']],
			'Sibling',
		]);
	});

	it('attaches a task under a plain bullet to the nearest task ancestor', () => {
		const content = ['# T', '- [ ] Task', '\t- plain note', '\t\t- [ ] Deep task'].join('\n');
		expect(shape(tree(content))).toEqual([['Task', ['Deep task']]]);
	});

	it('promotes a task under a plain root bullet to a root', () => {
		const content = ['# T', '- Group', '\t- [ ] Orphan A', '\t- [x] Orphan B'].join('\n');
		expect(shape(tree(content))).toEqual(['Orphan A', 'Orphan B']);
	});

	it('keeps tasks from separate lists in file order', () => {
		const content = ['# T', '- [ ] One', '', 'Paragraph', '', '- [ ] Two'].join('\n');
		expect(shape(tree(content))).toEqual(['One', 'Two']);
	});

	it('strips `*`, `+` and ordered-list markers and keeps inline markdown', () => {
		const content = ['# T', '* [ ] Star', '+ [x] Plus', '1. [ ] Ordered [[Link]]', '2) [ ] **Bold**'].join('\n');
		expect(tree(content).map((n) => n.text)).toEqual(['Star', 'Plus', 'Ordered [[Link]]', '**Bold**']);
	});

	it('does not treat later roots as children when the list starts on line 0', () => {
		expect(shape(tree('- [ ] A\n- [ ] B'))).toEqual(['A', 'B']);
	});
});

describe('setTaskStatusInContent', () => {
	const content = ['# T', '- [ ] Open', '\t- [x] Done [[Link]]', 'not a task'].join('\n');

	it('marks an open task as done', () => {
		expect(setTaskStatusInContent(content, 1, true)?.split('\n')[1]).toBe('- [x] Open');
	});

	it('marks a done task as open, preserving indentation and text', () => {
		expect(setTaskStatusInContent(content, 2, false)?.split('\n')[2]).toBe('\t- [ ] Done [[Link]]');
	});

	it('leaves every other line untouched', () => {
		const lines = setTaskStatusInContent(content, 1, true)?.split('\n');
		expect(lines?.filter((_, i) => i !== 1)).toEqual(content.split('\n').filter((_, i) => i !== 1));
	});

	it('returns null when the line is not a task or does not exist', () => {
		expect(setTaskStatusInContent(content, 3, true)).toBeNull();
		expect(setTaskStatusInContent(content, 99, true)).toBeNull();
	});
});
