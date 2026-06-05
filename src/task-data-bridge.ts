/**
 * task-data-bridge.ts — Shared data bridge for task state.
 *
 * Listens to tool_execution_start/end events for @tintinweb/pi-tasks tools
 * and maintains an in-memory task state that the grid widget reads from.
 *
 * Tool execution flow:
 *   tool_execution_start → cache the tool's args by toolCallId
 *   tool_execution_end   → if successful, apply the changes from cached args
 *
 * This allows reliable state tracking even though the tools only return
 * unstructured text content (no structured details).
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type TaskStatus = "pending" | "in_progress" | "completed";

export interface TaskInfo {
	id: string;
	subject: string;
	description: string;
	status: TaskStatus;
	activeForm?: string;
	owner?: string;
	blockedBy: string[];
	metadata: Record<string, unknown>;
	createdAt: number;
	updatedAt: number;
}

export interface TaskState {
	tasks: Map<string, TaskInfo>;
	total: number;
	pending: number;
	inProgress: number;
	completed: number;
}

// ── Shared module state ──────────────────────────────────────────────────────

const tasks = new Map<string, TaskInfo>();
/** Cached tool args keyed by toolCallId (used to correlate start↔end). */
const pendingToolArgs = new Map<string, Record<string, unknown>>();
let requestRenderFn: (() => void) | null = null;

// Tracks the next ID for tasks created via bridge events.
// Only used when we can't parse an ID from the result text (fallback).
let localNextId = 1;

// ── Task tool names ──────────────────────────────────────────────────────────

const TASK_TOOL_NAMES = new Set([
	"TaskCreate",
	"TaskList",
	"TaskGet",
	"TaskUpdate",
	"TaskOutput",
	"TaskStop",
	"TaskExecute",
]);

// ── Public API ───────────────────────────────────────────────────────────────

export function getState(): TaskState {
	const pending = [...tasks.values()].filter(
		(t) => t.status === "pending",
	).length;
	const inProgress = [...tasks.values()].filter(
		(t) => t.status === "in_progress",
	).length;
	const completed = [...tasks.values()].filter(
		(t) => t.status === "completed",
	).length;

	return {
		tasks,
		total: tasks.size,
		pending,
		inProgress,
		completed,
	};
}

export function setRequestRender(fn: (() => void) | null): void {
	requestRenderFn = fn;
}

/**
 * Subscribe to task tool execution events.
 * Call from the extension's default function (or from index.ts).
 */
export function subscribeToTaskEvents(pi: {
	on: (event: string, handler: (event: unknown) => void) => void;
}): void {
	// ── Cache tool args on execution start ───────────────────────────────
	pi.on("tool_execution_start", (raw: unknown) => {
		const event = raw as Record<string, unknown>;
		const toolName = event.toolName as string | undefined;
		if (!toolName || !TASK_TOOL_NAMES.has(toolName)) return;
		pendingToolArgs.set(
			event.toolCallId as string,
			event.args as Record<string, unknown>,
		);
	});

	// ── Apply changes on execution end ───────────────────────────────────
	pi.on("tool_execution_end", (raw: unknown) => {
		const event = raw as Record<string, unknown>;
		const toolName = event.toolName as string | undefined;
		if (!toolName || !TASK_TOOL_NAMES.has(toolName)) return;

		const toolCallId = event.toolCallId as string;
		const isError = event.isError === true;

		// Retrieve cached args
		const args = pendingToolArgs.get(toolCallId);
		pendingToolArgs.delete(toolCallId);

		if (isError) return;

		const result = event.result as
			| { content?: Array<{ text?: string }> }
			| undefined;
		const text = result?.content?.[0]?.text ?? "";

		switch (toolName) {
			case "TaskCreate":
				handleTaskCreate(args, text);
				break;
			case "TaskUpdate":
				handleTaskUpdate(args);
				break;
			case "TaskList":
				handleTaskList(text);
				break;
			case "TaskGet":
				handleTaskGet(text);
				break;
			case "TaskExecute":
				handleTaskExecute(args);
				break;
			case "TaskStop":
				handleTaskStop(args);
				break;
		}

		requestRenderFn?.();
	});
}

// ── Handlers ─────────────────────────────────────────────────────────────────

/**
 * Parse "Task #N created successfully: Subject" to extract ID and subject.
 */
function handleTaskCreate(
	args: Record<string, unknown> | undefined,
	resultText: string,
): void {
	const idMatch = resultText.match(/Task #(\d+) created successfully: (.+)/);
	const id = idMatch?.[1] ?? String(localNextId++);
	const subject = idMatch?.[2] ?? (args?.subject as string) ?? "";
	const description = (args?.description as string) ?? "";
	const activeForm = args?.activeForm as string | undefined;

	const now = Date.now();
	tasks.set(id, {
		id,
		subject,
		description,
		status: "pending",
		activeForm,
		owner: undefined,
		blockedBy: [],
		metadata: {},
		createdAt: now,
		updatedAt: now,
	});
}

/**
 * TaskUpdate passes the full field values in args — apply them directly.
 * If status is "deleted", remove the task.
 */
function handleTaskUpdate(args: Record<string, unknown> | undefined): void {
	if (!args) return;
	const taskId = args.taskId as string | undefined;
	if (!taskId) return;

	// Handle deletion
	if (args.status === "deleted") {
		tasks.delete(taskId);
		return;
	}

	const existing = tasks.get(taskId);
	if (!existing) {
		// Task doesn't exist in our local state yet — create a placeholder
		// with the fields we know about. Full state will be synced on TaskList.
		const now = Date.now();
		tasks.set(taskId, {
			id: taskId,
			subject: (args.subject as string) ?? `Task #${taskId}`,
			description: (args.description as string) ?? "",
			status: (args.status as TaskStatus) ?? "pending",
			activeForm: args.activeForm as string | undefined,
			owner: args.owner as string | undefined,
			blockedBy: [],
			metadata: {},
			createdAt: now,
			updatedAt: now,
		});
		return;
	}

	// Update existing task fields
	if (args.status !== undefined && args.status !== "deleted") {
		existing.status = args.status as TaskStatus;
	}
	if (args.subject !== undefined) {
		existing.subject = args.subject as string;
	}
	if (args.description !== undefined) {
		existing.description = args.description as string;
	}
	if (args.activeForm !== undefined) {
		existing.activeForm = args.activeForm as string;
	}
	if (args.owner !== undefined) {
		existing.owner = args.owner as string;
	}
	if (args.metadata !== undefined) {
		existing.metadata = args.metadata as Record<string, unknown>;
	}
	existing.updatedAt = Date.now();
}

/**
 * Parse TaskList output to rebuild full task state.
 * Format:
 *   #1 [pending] Subject
 *   #2 [in_progress] Subject [blocked by #1]
 *   #3 [completed] Subject (owner-id)
 */
function handleTaskList(text: string): void {
	if (!text || text === "No tasks found") {
		tasks.clear();
		return;
	}

	const newTasks = new Map<string, TaskInfo>();
	const lines = text.split("\n");
	const now = Date.now();

	for (const line of lines) {
		const match = line.match(/^#(\d+) \[(\w+)\] (.+)$/);
		if (!match) continue;

		const id = match[1]!;
		const status = match[2] as TaskStatus;
		let rest = match[3]!;

		// Parse blockedBy suffix: [blocked by #1, #2]
		let blockedBy: string[] = [];
		const bMatch = rest.match(/\[blocked by ([^\]]+)\]$/);
		if (bMatch) {
			blockedBy = bMatch[1]!.split(", ").map((s) => s.replace("#", ""));
			rest = rest.slice(0, bMatch.index).trim();
		}

		// Parse owner suffix: (owner-id)
		let owner: string | undefined;
		const oMatch = rest.match(/\(([^)]+)\)$/);
		if (oMatch) {
			owner = oMatch[1];
			rest = rest.slice(0, oMatch.index).trim();
		}

		// Preserve existing description/metadata if we already had this task
		const existing = tasks.get(id);

		newTasks.set(id, {
			id,
			subject: existing?.subject ?? rest,
			description: existing?.description ?? "",
			status,
			activeForm: existing?.activeForm,
			owner: owner ?? existing?.owner,
			blockedBy,
			metadata: existing?.metadata ?? {},
			createdAt: existing?.createdAt ?? now,
			updatedAt: now,
		});
	}

	tasks.clear();
	for (const [id, task] of newTasks) {
		tasks.set(id, task);
	}
}

/**
 * Parse TaskGet output to update a single task's full details.
 * Format:
 *   Task #1: Subject
 *   Status: pending
 *   Owner: name
 *   Description: ... (may be multi-line)
 *   Blocked by: #1, #2
 *   Blocks: ...
 *   Metadata: {...}
 */
function handleTaskGet(text: string): void {
	if (!text) return;

	const lines = text.split("\n");
	if (lines.length === 0) return;

	// Parse "Task #N: Subject" from first line
	const headerMatch = lines[0]?.match(/^Task #(\d+): (.+)$/);
	if (!headerMatch) return;

	const id = headerMatch[1]!;
	const subject = headerMatch[2]!;
	let status: TaskStatus = "pending";
	let description = "";
	let owner: string | undefined;
	let blockedBy: string[] = [];
	let metadata: Record<string, unknown> = {};

	// Parse remaining lines
	let inMetadata = false;
	let metadataRaw = "";

	for (let i = 1; i < lines.length; i++) {
		const line = lines[i]!;

		if (inMetadata) {
			metadataRaw += line + "\n";
			continue;
		}

		if (line.startsWith("Status: ")) {
			status = line.slice(8).trim() as TaskStatus;
		} else if (line.startsWith("Owner: ")) {
			owner = line.slice(7).trim();
		} else if (line.startsWith("Description: ")) {
			description = line.slice(13).trim();
		} else if (line.startsWith("Blocked by: ")) {
			blockedBy = line
				.slice(12)
				.split(", ")
				.map((s) => s.replace("#", "").trim())
				.filter(Boolean);
		} else if (line.startsWith("Metadata: ")) {
			inMetadata = true;
			metadataRaw = line.slice(10).trim();
		}
	}

	// Parse metadata JSON
	if (metadataRaw) {
		try {
			metadata = JSON.parse(metadataRaw) as Record<string, unknown>;
		} catch {
			// ignore parse errors
		}
	}

	const now = Date.now();
	tasks.set(id, {
		id,
		subject,
		description,
		status,
		owner,
		blockedBy,
		metadata,
		createdAt: now,
		updatedAt: now,
	});
}

/**
 * TaskExecute spawns subagents for tasks — mark them as in_progress.
 */
function handleTaskExecute(args: Record<string, unknown> | undefined): void {
	if (!args) return;
	const taskIds = args.task_ids as string[] | undefined;
	if (!taskIds) return;

	for (const taskId of taskIds) {
		const task = tasks.get(taskId);
		if (task && task.status === "pending") {
			task.status = "in_progress";
			task.updatedAt = Date.now();
		}
	}
}

/**
 * TaskStop marks a task as completed.
 */
function handleTaskStop(args: Record<string, unknown> | undefined): void {
	if (!args) return;
	const taskId = (args.task_id ?? args.shell_id) as string | undefined;
	if (!taskId) return;

	const task = tasks.get(taskId);
	if (task) {
		task.status = "completed";
		task.updatedAt = Date.now();
	}
}

// ── Test data (for layout verification when no tasks exist yet) ──────────────

let testDataInjected = false;

/**
 * Inject sample task data so the widget can demonstrate its layout
 * even when no real task tools have been used yet.
 */
export function injectTestData(): void {
	if (testDataInjected) return;
	if (tasks.size > 0) return;

	const now = Date.now();

	function add(
		id: string,
		subject: string,
		description: string,
		status: TaskStatus,
		opts?: { activeForm?: string; blockedBy?: string[] },
	) {
		tasks.set(id, {
			id,
			subject,
			description,
			status,
			activeForm: opts?.activeForm,
			owner: undefined,
			blockedBy: opts?.blockedBy ?? [],
			metadata: {},
			createdAt: now,
			updatedAt: now,
		});
	}

	add(
		"1",
		"Set up project configuration",
		"Initialize project config files including tsconfig, package.json",
		"completed",
	);
	add(
		"2",
		"Implement the grid-based overlay layout",
		"Build the GridComponent that arranges widgets",
		"in_progress",
		{ activeForm: "Implementing grid overlay" },
	);
	add(
		"3",
		"Create the status bar with pill rendering",
		"Implement the status bar widget with colored pills",
		"pending",
	);
	add(
		"4",
		"Add task list integration",
		"Integrate the task list into the grid widget",
		"pending",
	);

	testDataInjected = true;
	requestRenderFn?.();
}

export function clearState(): void {
	tasks.clear();
	pendingToolArgs.clear();
	localNextId = 1;
	testDataInjected = false;
}
