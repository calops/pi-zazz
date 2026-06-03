import { basename } from "node:path";
import { hostname as osHostname } from "node:os";
import { icon } from "../icons.ts";

export interface SegmentContext {
	model: { id: string; name?: string; reasoning?: boolean } | undefined;
	thinkingLevel: string;
	cwd: string;
	sessionId: string | undefined;
	contextPercent: number;
	contextWindow: number;
	autoCompactEnabled: boolean;
	customCompactionEnabled: boolean;
	tokenIn: number;
	tokenOut: number;
	tokenTotal: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	usingSubscription: boolean;
	sessionStartTime: number;
	shellModeActive: boolean;
	shellRunning: boolean;
	shellName: string | null;
	shellCwd: string | null;
	git: {
		branch: string | null;
		staged: number;
		unstaged: number;
		untracked: number;
	};
	extensionStatuses: ReadonlyMap<string, string>;
	options: SegmentOptions;
}

export interface SegmentOptions {
	model?: { showThinkingLevel?: boolean };
	path?: { mode?: "basename" | "abbreviated" | "full"; maxLength?: number };
	git?: {
		showBranch?: boolean;
		showStaged?: boolean;
		showUnstaged?: boolean;
		showUntracked?: boolean;
	};
	time?: { format?: "12h" | "24h"; showSeconds?: boolean };
}

export type SegmentId =
	| "model"
	| "shell_mode"
	| "path"
	| "git"
	| "thinking"
	| "subagents"
	| "token_in"
	| "token_out"
	| "token_total"
	| "cost"
	| "context_pct"
	| "context_total"
	| "time_spent"
	| "time"
	| "session"
	| "hostname"
	| "cache_read"
	| "cache_write"
	| "extension_statuses";

export interface RenderedSegment {
	text: string;
	visible: boolean;
	/** Optional sub-pill shown on the right (e.g., thinking level for the model pill) */
	rightExtension?: string;
}

function formatTokens(n: number): string {
	if (n < 1000) return n.toString();
	if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
	if (n < 1000000) return `${Math.round(n / 1000)}k`;
	if (n < 10000000) return `${(n / 1000000).toFixed(1)}M`;
	return `${Math.round(n / 1000000)}M`;
}

function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	if (hours > 0) return `${hours}h${minutes % 60}m`;
	if (minutes > 0) return `${minutes}m${seconds % 60}s`;
	return `${seconds}s`;
}

function withIcon(iconStr: string, text: string): string {
	return iconStr ? `${iconStr} ${text}` : text;
}

export const SEGMENTS: Record<
	SegmentId,
	(ctx: SegmentContext) => RenderedSegment
> = {
	model(ctx): RenderedSegment {
		let name = ctx.model?.name ?? ctx.model?.id ?? "no-model";
		if (name.startsWith("Claude ")) name = name.slice(7);
		const content = withIcon(icon("model"), name);
		const opts = ctx.options.model ?? {};
		let rightExtension: string | undefined;
		if (
			opts.showThinkingLevel !== false &&
			ctx.model?.reasoning &&
			ctx.thinkingLevel !== "off"
		) {
			rightExtension = `${icon("thinking")} ${ctx.thinkingLevel}`;
		}
		return { text: content, visible: true, rightExtension };
	},

	shell_mode(ctx): RenderedSegment {
		if (!ctx.shellModeActive) return { text: "", visible: false };
		const name = ctx.shellName ?? "shell";
		const state = ctx.shellRunning ? "run" : "idle";
		const parts = [name, state];
		if (ctx.shellCwd) parts.push(basename(ctx.shellCwd));
		return { text: withIcon(icon("shell"), parts.join(" · ")), visible: true };
	},

	path(ctx): RenderedSegment {
		const opts = ctx.options.path ?? {};
		const mode = opts.mode ?? "basename";
		let pwd = ctx.shellModeActive && ctx.shellCwd ? ctx.shellCwd : ctx.cwd;
		const home = process.env.HOME;
		if (mode === "basename") {
			pwd = basename(pwd) || pwd;
		} else {
			if (home && pwd.startsWith(home)) pwd = `~${pwd.slice(home.length)}`;
			if (mode === "abbreviated" && pwd.length > (opts.maxLength ?? 40)) {
				pwd = `…${pwd.slice(-(opts.maxLength ?? 40) + 1)}`;
			}
		}
		return { text: withIcon(icon("folder"), pwd), visible: true };
	},

	git(ctx): RenderedSegment {
		const opts = ctx.options.git ?? {};
		const { branch, staged, unstaged, untracked } = ctx.git;
		if (!branch && staged === 0 && unstaged === 0 && untracked === 0) {
			return { text: "", visible: false };
		}
		let text = "";
		if (opts.showBranch !== false && branch) {
			text = withIcon(icon("branch"), branch);
		}
		const indicators: string[] = [];
		if (opts.showStaged !== false && staged > 0)
			indicators.push(`${icon("staged")}${staged}`);
		if (opts.showUnstaged !== false && unstaged > 0)
			indicators.push(`${icon("unstaged")}${unstaged}`);
		if (opts.showUntracked !== false && untracked > 0)
			indicators.push(`${icon("untracked")}${untracked}`);
		const rightExtension =
			indicators.length > 0 ? indicators.join(" ") : undefined;
		return { text, visible: true, rightExtension };
	},

	thinking(ctx): RenderedSegment {
		const labels: Record<string, string> = {
			off: "off",
			minimal: "min",
			low: "low",
			medium: "med",
			high: "high",
			xhigh: "xhigh",
		};
		return {
			text: withIcon(
				icon("thinking"),
				labels[ctx.thinkingLevel] ?? ctx.thinkingLevel,
			),
			visible: true,
		};
	},

	subagents(_ctx): RenderedSegment {
		return { text: "", visible: false };
	},

	token_in(ctx): RenderedSegment {
		if (!ctx.tokenIn) return { text: "", visible: false };
		return {
			text: withIcon(icon("tokensIn"), formatTokens(ctx.tokenIn)),
			visible: true,
		};
	},

	token_out(ctx): RenderedSegment {
		if (!ctx.tokenOut) return { text: "", visible: false };
		return {
			text: withIcon(icon("tokensOut"), formatTokens(ctx.tokenOut)),
			visible: true,
		};
	},

	token_total(ctx): RenderedSegment {
		if (!ctx.tokenTotal) return { text: "", visible: false };
		return {
			text: withIcon(icon("cache"), formatTokens(ctx.tokenTotal)),
			visible: true,
		};
	},

	cost(ctx): RenderedSegment {
		if (!ctx.cost && !ctx.usingSubscription)
			return { text: "", visible: false };
		const display = ctx.usingSubscription ? "(sub)" : `$${ctx.cost.toFixed(2)}`;
		return { text: withIcon(icon("cost"), display), visible: true };
	},

	context_pct(ctx): RenderedSegment {
		if (ctx.customCompactionEnabled) return { text: "", visible: false };
		const pct = ctx.contextPercent;
		const text = `${pct.toFixed(1)}%/${formatTokens(ctx.contextWindow)}${ctx.autoCompactEnabled ? ` ${icon("autoCompact")}` : ""}`;
		let rightExtension: string | undefined;
		if (ctx.cost || ctx.usingSubscription) {
			const display = ctx.usingSubscription
				? "(sub)"
				: `$${ctx.cost.toFixed(2)}`;
			rightExtension = `${icon("cost")} ${display}`;
		}
		return { text: withIcon(icon("context"), text), visible: true, rightExtension };
	},

	context_total(ctx): RenderedSegment {
		if (ctx.customCompactionEnabled || !ctx.contextWindow)
			return { text: "", visible: false };
		return {
			text: withIcon(icon("context"), formatTokens(ctx.contextWindow)),
			visible: true,
		};
	},

	time_spent(ctx): RenderedSegment {
		const elapsed = Date.now() - ctx.sessionStartTime;
		if (elapsed < 1000) return { text: "", visible: false };
		return {
			text: withIcon(icon("clock"), formatDuration(elapsed)),
			visible: true,
		};
	},

	time(ctx): RenderedSegment {
		const opts = ctx.options.time ?? {};
		const now = new Date();
		let hours = now.getHours();
		let suffix = "";
		if (opts.format === "12h") {
			suffix = hours >= 12 ? "pm" : "am";
			hours = hours % 12 || 12;
		}
		const mins = now.getMinutes().toString().padStart(2, "0");
		let timeStr = `${hours}:${mins}`;
		if (opts.showSeconds)
			timeStr += `:${now.getSeconds().toString().padStart(2, "0")}`;
		timeStr += suffix;
		return { text: withIcon(icon("clock"), timeStr), visible: true };
	},

	session(ctx): RenderedSegment {
		const display = ctx.sessionId?.slice(0, 8) ?? "new";
		return { text: withIcon(icon("session"), display), visible: true };
	},

	hostname(_ctx): RenderedSegment {
		const name = osHostname().split(".")[0]!;
		return { text: withIcon(icon("host"), name), visible: true };
	},

	cache_read(ctx): RenderedSegment {
		if (!ctx.cacheRead) return { text: "", visible: false };
		return {
			text: `${icon("cache")} ${icon("tokensIn")} ${formatTokens(ctx.cacheRead)}`,
			visible: true,
		};
	},

	cache_write(ctx): RenderedSegment {
		if (!ctx.cacheWrite) return { text: "", visible: false };
		return {
			text: `${icon("cache")} ${icon("tokensOut")} ${formatTokens(ctx.cacheWrite)}`,
			visible: true,
		};
	},

	extension_statuses(ctx): RenderedSegment {
		if (!ctx.extensionStatuses || ctx.extensionStatuses.size === 0)
			return { text: "", visible: false };
		const parts: string[] = [];
		for (const [, value] of ctx.extensionStatuses) {
			if (value && value.trim()) parts.push(value.trim());
		}
		if (parts.length === 0) return { text: "", visible: false };
		return { text: parts.join(` ${icon("sepDot")} `), visible: true };
	},
};
