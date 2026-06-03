import { registerWidget } from "./registry.ts";
import type { WidgetDeps, WidgetFactory } from "./types.ts";
import {
	makePill,
	makeExtension,
	packPills,
	SEPARATORS,
} from "../status-bar/pill-renderer.ts";
import {
	SEGMENTS,
	type SegmentContext,
	type SegmentId,
	type SegmentOptions,
} from "../status-bar/segments.ts";

// Each pill has its own distinguishing background color. The foreground uses
// color 0 (typical terminal default background) so text appears to be punched
// through the pill rather than painted on top.
const PILL_FG = "0";

const SEGMENT_COLORS: Record<string, (t: string) => string> = {
	model: (t) => `\x1b[48;5;39m\x1b[38;5;${PILL_FG}m${t}\x1b[0m`,
	thinking: (t) => `\x1b[48;5;99m\x1b[38;5;${PILL_FG}m${t}\x1b[0m`,
	shell_mode: (t) => `\x1b[48;5;33m\x1b[38;5;${PILL_FG}m${t}\x1b[0m`,
	path: (t) => `\x1b[48;5;71m\x1b[38;5;${PILL_FG}m${t}\x1b[0m`,
	git: (t) => `\x1b[48;5;178m\x1b[38;5;${PILL_FG}m${t}\x1b[0m`,
	context_pct: (t) => `\x1b[48;5;238m\x1b[38;5;${PILL_FG}m${t}\x1b[0m`,
	context_total: (t) => `\x1b[48;5;238m\x1b[38;5;${PILL_FG}m${t}\x1b[0m`,
	cost: (t) => `\x1b[48;5;130m\x1b[38;5;${PILL_FG}m${t}\x1b[0m`,
	token_in: (t) => `\x1b[48;5;238m\x1b[38;5;${PILL_FG}m${t}\x1b[0m`,
	token_out: (t) => `\x1b[48;5;238m\x1b[38;5;${PILL_FG}m${t}\x1b[0m`,
	token_total: (t) => `\x1b[48;5;238m\x1b[38;5;${PILL_FG}m${t}\x1b[0m`,
	cache_read: (t) => `\x1b[48;5;238m\x1b[38;5;${PILL_FG}m${t}\x1b[0m`,
	cache_write: (t) => `\x1b[48;5;238m\x1b[38;5;${PILL_FG}m${t}\x1b[0m`,
	time: (t) => `\x1b[48;5;238m\x1b[38;5;${PILL_FG}m${t}\x1b[0m`,
	time_spent: (t) => `\x1b[48;5;238m\x1b[38;5;${PILL_FG}m${t}\x1b[0m`,
	session: (t) => `\x1b[48;5;238m\x1b[38;5;${PILL_FG}m${t}\x1b[0m`,
	hostname: (t) => `\x1b[48;5;238m\x1b[38;5;${PILL_FG}m${t}\x1b[0m`,
	extension_statuses: (t) => `\x1b[48;5;238m\x1b[38;5;${PILL_FG}m${t}\x1b[0m`,
};

function defaultColor(t: string): string {
	return `\x1b[48;5;238m\x1b[38;5;${PILL_FG}m${t}\x1b[0m`;
}

export const statusBarWidgetFactory: WidgetFactory = (
	deps: WidgetDeps,
	config: unknown,
) => {
	const opts = (config ?? {}) as {
		separator?: string;
		leftSegments?: SegmentId[];
		rightSegments?: SegmentId[];
		segmentOptions?: SegmentOptions;
	};

	const separator =
		SEPARATORS[opts.separator ?? "powerline-thin"] ??
		SEPARATORS["powerline-thin"]!;
	const leftSegments: SegmentId[] = opts.leftSegments ?? [];
	const rightSegments: SegmentId[] = opts.rightSegments ?? [];
	const segmentOptions: SegmentOptions = opts.segmentOptions ?? {};

	// Cached state populated by event callbacks
	let cachedModel: SegmentContext["model"] = (
		deps.ctx as { model?: { id: string; name?: string } } | undefined
	)?.model;
	let cachedThinkingLevel =
		(
			deps.pi as { getThinkingLevel?: () => string } | undefined
		)?.getThinkingLevel?.() ?? "off";
	let cachedCwd = process.cwd();
	let cachedSessionId: string | undefined;
	let cachedContextPercent = 0;
	let cachedContextWindow = 0;
	const cachedTokensIn = 0;
	const cachedTokensOut = 0;
	const cachedTokensTotal = 0;
	const cachedCacheRead = 0;
	const cachedCacheWrite = 0;
	const cachedCost = 0;
	const cachedUsingSubscription = false;
	let cachedSessionStartTime = Date.now();
	const cachedGit = {
		branch: null as string | null,
		staged: 0,
		unstaged: 0,
		untracked: 0,
	};
	const cachedExtensionStatuses = new Map<string, string>();

	const pi = deps.pi as {
		on: (event: string, handler: (...args: never[]) => void) => void;
		getThinkingLevel?: () => string;
	};

	function refreshGitStatus(): void {
		try {
			const { execSync } = require("node:child_process") as {
				execSync: (
					cmd: string,
					opts: { cwd?: string; encoding: string },
				) => string;
			};
			const opts = { cwd: cachedCwd, encoding: "utf-8" };
			const branch = execSync(
				"git branch --show-current 2>/dev/null || true",
				opts,
			).trim();
			const status = execSync(
				"git status --porcelain 2>/dev/null || true",
				opts,
			);
			let staged = 0,
				unstaged = 0,
				untracked = 0;
			for (const line of status.split("\n")) {
				if (!line.trim()) continue;
				const code = line.slice(0, 2);
				if (code[0] !== " ") staged++;
				if (code[1] !== " ") unstaged++;
				if (line.startsWith("?")) untracked++;
			}
			cachedGit.branch = branch || null;
			cachedGit.staged = staged;
			cachedGit.unstaged = unstaged;
			cachedGit.untracked = untracked;
		} catch {
			/* not a git repo or git not available */
		}
	}

	pi.on("session_start", (_event: unknown, ctx: { cwd?: string }) => {
		cachedSessionStartTime = Date.now();
		cachedCwd = ctx.cwd ?? process.cwd();
		refreshGitStatus();
	});

	pi.on("turn_end", () => {
		refreshGitStatus();
	});

	pi.on("model_select", (event: unknown) => {
		const m = (
			event as { model?: { id: string; name?: string; reasoning?: boolean } }
		).model;
		cachedModel = m ?? undefined;
	});

	pi.on("thinking_level_select", (event: unknown) => {
		cachedThinkingLevel = (event as { level?: string }).level ?? "off";
	});

	pi.on(
		"turn_end",
		(
			_event: unknown,
			ctx: {
				getContextUsage?: () => {
					tokens?: number;
					contextWindow?: number;
					percent?: number | null;
				};
				sessionManager?: { getEntries?: () => Array<{ sessionId?: string }> };
			},
		) => {
			const usage = ctx.getContextUsage?.() ?? {
				tokens: 0,
				contextWindow: 0,
				percent: null,
			};
			cachedContextPercent = usage.percent ?? 0;
			cachedContextWindow = usage.contextWindow ?? 0;
			const entries = ctx.sessionManager?.getEntries?.();
			if (entries && entries.length > 0) {
				cachedSessionId = entries[0]!.sessionId ?? cachedSessionId;
			}
		},
	);

	function buildContext(): SegmentContext {
		return {
			model: cachedModel,
			thinkingLevel: cachedThinkingLevel,
			cwd: cachedCwd,
			sessionId: cachedSessionId,
			contextPercent: cachedContextPercent,
			contextWindow: cachedContextWindow,
			autoCompactEnabled: false,
			customCompactionEnabled: false,
			tokenIn: cachedTokensIn,
			tokenOut: cachedTokensOut,
			tokenTotal: cachedTokensTotal,
			cacheRead: cachedCacheRead,
			cacheWrite: cachedCacheWrite,
			cost: cachedCost,
			usingSubscription: cachedUsingSubscription,
			sessionStartTime: cachedSessionStartTime,
			shellModeActive: false,
			shellRunning: false,
			shellName: null,
			shellCwd: null,
			git: cachedGit,
			extensionStatuses: cachedExtensionStatuses,
			options: segmentOptions,
		};
	}

	return {
		render(width: number, _height: number): string[] {
			const ctx = buildContext();

			const makePillFromSegment = (segId: SegmentId) => {
				const segFn = SEGMENTS[segId];
				if (!segFn) return null;
				const result = segFn(ctx);
				if (!result.visible) return null;
				const colorFn = SEGMENT_COLORS[segId] ?? defaultColor;
				const pill = makePill("", result.text, colorFn);
				// Attach right extension if the segment provides one
				if (result.rightExtension && pill.bg !== null) {
					pill.rightExt = makeExtension(result.rightExtension, pill.bg);
				}
				return pill;
			};

			const leftPills = leftSegments
				.map(makePillFromSegment)
				.filter((p): p is NonNullable<typeof p> => p !== null);

			const rightPills = rightSegments
				.map(makePillFromSegment)
				.filter((p): p is NonNullable<typeof p> => p !== null);

			const line = packPills(leftPills, rightPills, separator, width);
			return [line];
		},

		invalidate(): void {},
	};
};

registerWidget("status-bar", statusBarWidgetFactory);
