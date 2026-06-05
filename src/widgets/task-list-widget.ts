/**
 * task-list-widget.ts — Grid widget for displaying the task list.
 *
 * Follows the same pattern as lens-widget.ts:
 * - Registered as "tasks" widget type
 * - Reads from the task-data-bridge shared state
 * - Uses heightConstraint() to hide when no tasks exist
 * - Renders a compact view suitable for side-by-side display with the lens
 *
 * Display style:
 *   ● tasks  (3 total, 1 in progress, 1 open)
 *     ✔ #1 Set up project configuration
 *     ◼ #2 Implement the grid... (Implementing…)
 *     ◻ #3 Create the status bar
 *     … and 1 more
 */

import { visibleWidth } from "@earendil-works/pi-tui";
import { registerWidget } from "./registry.ts";
import type { WidgetDeps, WidgetFactory } from "./types.ts";
import {
	getState,
	setRequestRender,
	injectTestData,
	type TaskInfo,
} from "../task-data-bridge.ts";

// ── Spinner frames for active tasks (matches Claude Code style) ──────────────

const SPINNER = ["✳", "✴", "✵", "✶", "✷", "✸", "✹", "✺", "✻", "✼", "✽"];

/** Global spinner frame counter (shared across all renders). */
let spinnerFrame = 0;
/** Timer handle for advancing the spinner. */
let spinnerTimer: ReturnType<typeof setInterval> | null = null;

/** Advance the spinner frame every 150ms when there are active tasks. */
function ensureSpinner(state: { tasks: Map<string, TaskInfo> }): void {
	const hasActive = [...state.tasks.values()].some(
		(t) => t.status === "in_progress",
	);
	if (hasActive && !spinnerTimer) {
		spinnerTimer = setInterval(() => {
			spinnerFrame++;
			// Trigger re-render via requestRender which is set below
			const cb = (globalThis as unknown as Record<string, unknown>)
				.__taskRenderRequest;
			(cb as (() => void) | undefined)?.();
		}, 150);
	} else if (!hasActive && spinnerTimer) {
		clearInterval(spinnerTimer);
		spinnerTimer = null;
	}
}

// ── Widget factory ───────────────────────────────────────────────────────────

export const taskListWidgetFactory: WidgetFactory = (
	deps: WidgetDeps,
	_config: unknown,
) => {
	// Register global render request callback for spinner animation
	(globalThis as unknown as Record<string, unknown>).__taskRenderRequest =
		() => {
			(deps.tui as { requestRender?: () => void }).requestRender?.();
		};

	return {
		/** Signal to the grid: hide this cell when no tasks are available. */
		heightConstraint(): { min: number; max: number } {
			const state = getState();
			if (state.total === 0) {
				injectTestData();
				const updated = getState();
				if (updated.total === 0) {
					return { min: 0, max: 0 };
				}
			}
			return { min: 1, max: Infinity };
		},

		render(width: number, height: number): string[] {
			// Register for render callbacks from the data bridge
			setRequestRender(() => {
				(deps.tui as { requestRender?: () => void }).requestRender?.();
			});

			const w = Math.max(1, width || 80);
			const dim = (s: string) => deps.theme.fg("dim", s);
			const accent = (s: string) => deps.theme.fg("accent", s);
			const success = (s: string) => deps.theme.fg("success", s);
			const muted = (s: string) => deps.theme.fg("muted", s);

			const state = getState();

			if (state.total === 0) {
				injectTestData();
				const updated = getState();
				if (updated.total === 0) {
					return [fitLine(` ${dim("no tasks")}`, w)];
				}
			}

			ensureSpinner(state);

			const maxOutput = Math.max(1, height);
			const lines: string[] = [];

			// ── Header ──────────────────────────────────────────────────────
			const counts: string[] = [];
			if (state.completed > 0) counts.push(`${state.completed} done`);
			if (state.inProgress > 0) counts.push(`${state.inProgress} in progress`);
			if (state.pending > 0) counts.push(`${state.pending} open`);
			const summary = counts.length > 0 ? counts.join(", ") : "";

			const header = ` ${accent("●")} ${accent("tasks")}${summary ? `  ${dim(summary)}` : ""}  ${dim(`${state.total} total`)}`;
			lines.push(fitLine(header, w));
			if (lines.length >= maxOutput) return lines;

			// ── Sort tasks: in_progress first, then pending, then completed ──
			const sorted = sortTasks([...state.tasks.values()]);

			// ── Render visible task lines ──────────────────────────────────
			const remaining = maxOutput - lines.length - 1; // -1 for overflow line
			const maxTasks = Math.max(1, remaining);
			let shownCount = 0;

			for (const task of sorted) {
				if (shownCount >= maxTasks) break;
				lines.push(renderTaskLine(task, w, { dim, accent, success, muted }));
				shownCount++;
			}

			// ── Overflow indicator ─────────────────────────────────────────
			if (shownCount < sorted.length) {
				const overflow = sorted.length - shownCount;
				lines.push(fitLine(`   ${dim(`… +${overflow} more`)}`, w));
			}

			return lines;
		},

		invalidate(): void {},
	};
};

// ── Sort helpers ─────────────────────────────────────────────────────────────

function taskRank(t: TaskInfo): number {
	switch (t.status) {
		case "in_progress":
			return 0;
		case "pending":
			return 1;
		case "completed":
			return 2;
	}
}

function sortTasks(tasks: TaskInfo[]): TaskInfo[] {
	return [...tasks].sort((a, b) => {
		const ra = taskRank(a);
		const rb = taskRank(b);
		if (ra !== rb) return ra - rb;
		return Number(a.id) - Number(b.id);
	});
}

// ── Render helpers ───────────────────────────────────────────────────────────

interface ThemeFns {
	dim: (s: string) => string;
	accent: (s: string) => string;
	success: (s: string) => string;
	muted: (s: string) => string;
}

function renderTaskLine(
	task: TaskInfo,
	width: number,
	theme: ThemeFns,
): string {
	const isActive = task.status === "in_progress";
	const isComplete = task.status === "completed";
	const isPending = task.status === "pending";

	// Icon
	let icon: string;
	if (isActive) {
		icon = theme.accent(SPINNER[spinnerFrame % SPINNER.length]);
	} else if (isComplete) {
		icon = theme.success("✔");
	} else {
		icon = theme.muted("◻");
	}

	const idTag = theme.dim(`#${task.id}`);

	// Subject & extra info
	let displayText: string;
	if (isActive && task.activeForm) {
		displayText = theme.accent(`${task.activeForm}…`);
	} else if (isComplete) {
		displayText = theme.dim(task.subject);
	} else {
		displayText = task.subject;
	}

	// Blocked indicator
	let blockedSuffix = "";
	if (isPending && task.blockedBy.length > 0) {
		blockedSuffix = theme.dim(" › blocked");
	}

	const prefix = ` ${icon} ${idTag} `;
	const prefixWidth = visibleWidth(prefix);
	const suffix = blockedSuffix;
	const suffixWidth = visibleWidth(suffix);
	const textAvailable = Math.max(1, width - prefixWidth - suffixWidth);
	const truncated = truncateText(displayText, textAvailable, "…");

	return fitLine(`${prefix}${truncated}${suffix}`, width);
}

// ── Text helpers ─────────────────────────────────────────────────────────────

/** Truncate a string to a given visible width with an ellipsis character. */
function truncateText(s: string, maxWidth: number, ellipsis = "…"): string {
	const vw = visibleWidth(s);
	if (vw <= maxWidth) return s;

	const elWidth = visibleWidth(ellipsis);
	const target = Math.max(0, maxWidth - elWidth);
	let result = "";
	let pos = 0;
	let inEscape = false;

	for (const ch of s) {
		if (inEscape) {
			result += ch;
			if (ch === "m") inEscape = false;
			continue;
		}
		if (ch === "\x1b") {
			inEscape = true;
			result += ch;
			continue;
		}
		if (pos >= target) break;
		result += ch;
		pos++;
	}

	return result + ellipsis;
}

/** Pad or truncate a string to a given visible width. */
function fitLine(s: string, maxWidth: number): string {
	const vw = visibleWidth(s);
	if (vw <= maxWidth) return s + " ".repeat(maxWidth - vw);

	let result = "";
	let pos = 0;
	let inEscape = false;

	for (const ch of s) {
		if (inEscape) {
			result += ch;
			if (ch === "m") inEscape = false;
			continue;
		}
		if (ch === "\x1b") {
			inEscape = true;
			result += ch;
			continue;
		}
		if (pos >= maxWidth) break;
		result += ch;
		pos++;
	}

	return result;
}

registerWidget("tasks", taskListWidgetFactory);
