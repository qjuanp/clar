import type { ListItemCache } from 'obsidian';

export interface TaskNode {
	/** 0-based line of the task in the file — the key used to write a toggle back. */
	line: number;
	/** The raw status character: `' '` is incomplete, anything else is done. */
	status: string;
	/** The task's own line, with the list marker and checkbox stripped. */
	text: string;
	children: TaskNode[];
}

const TASK_LINE_PATTERN = /^(\s*(?:[-*+]|\d+[.)])\s+\[)(.)(\]\s?)(.*)$/;

function indentWidth(line: string): number {
	return /^\s*/.exec(line)?.[0].length ?? 0;
}

/**
 * Builds the note's tasks into a tree that mirrors the file: siblings stay in
 * file order, and nesting follows `ListItemCache.parent`. A task nested under
 * a plain (non-task) bullet hangs off its nearest *task* ancestor instead, or
 * becomes a root if there is none — so no task is ever dropped.
 *
 * `parent` is ambiguous for a list starting on line 0 (a root's `-0` reads as
 * "child of line 0"), so a parent link is only trusted when the parent line is
 * also less indented than the child.
 */
export function buildTaskTree(listItems: ListItemCache[], content: string): TaskNode[] {
	const lines = content.split('\n');
	const itemsByLine = new Map<number, ListItemCache>();
	for (const item of listItems) {
		itemsByLine.set(item.position.start.line, item);
	}

	const parentLineOf = (item: ListItemCache): number | null => {
		const line = item.position.start.line;
		if (item.parent < 0 || item.parent === line || !itemsByLine.has(item.parent)) {
			return null;
		}
		const ownIndent = indentWidth(lines[line] ?? '');
		const parentIndent = indentWidth(lines[item.parent] ?? '');
		return parentIndent < ownIndent ? item.parent : null;
	};

	const tasks = listItems
		.filter((item) => item.task !== undefined)
		.sort((a, b) => a.position.start.line - b.position.start.line);

	const nodesByLine = new Map<number, TaskNode>();
	const roots: TaskNode[] = [];
	for (const item of tasks) {
		const line = item.position.start.line;
		const match = TASK_LINE_PATTERN.exec(lines[line] ?? '');
		const node: TaskNode = {
			line,
			status: item.task ?? ' ',
			text: match?.[4] ?? (lines[line] ?? '').trim(),
			children: [],
		};
		nodesByLine.set(line, node);

		let ancestorLine = parentLineOf(item);
		while (ancestorLine !== null && !nodesByLine.has(ancestorLine)) {
			const ancestor = itemsByLine.get(ancestorLine);
			ancestorLine = ancestor ? parentLineOf(ancestor) : null;
		}
		const parentNode = ancestorLine === null ? undefined : nodesByLine.get(ancestorLine);
		(parentNode?.children ?? roots).push(node);
	}
	return roots;
}

/**
 * Returns `content` with the checkbox on `line` set to done (`x`) or not done
 * (` `), or null if that line no longer looks like a task (the file changed
 * since the board was rendered) — callers should abort rather than guess.
 */
export function setTaskStatusInContent(content: string, line: number, done: boolean): string | null {
	const lines = content.split('\n');
	const current = lines[line];
	if (current === undefined) {
		return null;
	}
	const match = TASK_LINE_PATTERN.exec(current);
	if (!match) {
		return null;
	}
	lines[line] = `${match[1]}${done ? 'x' : ' '}${match[3]}${match[4]}`;
	return lines.join('\n');
}
