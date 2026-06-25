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
	/** Icon character(s) that go in the main pill (gets solid background color) */
	icon: string;
	/** Info text that goes in the right extension (previously part of the main pill text) */
	text: string;
	visible: boolean;
	/** Optional content for the left extension (previously rightExtension, e.g., thinking level for model pill) */
	leftExtension?: string;
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

export const SEGMENTS: Record<
	SegmentId,
	(ctx: SegmentContext) => RenderedSegment
> = {
	model(ctx): RenderedSegment {
		let name = ctx.model?.name ?? ctx.model?.id ?? "no-model";
		if (name.startsWith("Claude ")) name = name.slice(7);
		const opts = ctx.options.model ?? {};
		let leftExtension: string | undefined;
		if (
			opts.showThinkingLevel !== false &&
			ctx.model?.reasoning &&
			ctx.thinkingLevel !== "off"
		) {
			leftExtension = `${icon("thinking")}${ctx.thinkingLevel}`;
		}
		return { icon: icon("model"), text: name, visible: true, leftExtension };
	},

	shell_mode(ctx): RenderedSegment {
		if (!ctx.shellModeActive) return { icon: "", text: "", visible: false };
		const name = ctx.shellName ?? "shell";
		const state = ctx.shellRunning ? "run" : "idle";
		const parts = [name, state];
		if (ctx.shellCwd) parts.push(basename(ctx.shellCwd));
		return {
			icon: icon("shell"),
			text: parts.join(" · "),
			visible: true,
		};
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
		return { icon: icon("folder"), text: pwd, visible: true };
	},

	git(ctx): RenderedSegment {
		const opts = ctx.options.git ?? {};
		const { branch, staged, unstaged, untracked } = ctx.git;
		if (!branch && staged === 0 && unstaged === 0 && untracked === 0) {
			return { icon: "", text: "", visible: false };
		}
		const indicators: string[] = [];
		if (opts.showStaged !== false && staged > 0)
			indicators.push(`${icon("staged")}${staged}`);
		if (opts.showUnstaged !== false && unstaged > 0)
			indicators.push(`${icon("unstaged")}${unstaged}`);
		if (opts.showUntracked !== false && untracked > 0)
			indicators.push(`${icon("untracked")}${untracked}`);
		const leftExtension =
			indicators.length > 0 ? indicators.join(" ") : undefined;
		return {
			icon: icon("git"),
			text: branch ?? "",
			visible: true,
			leftExtension,
		};
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
			icon: icon("thinking"),
			text: labels[ctx.thinkingLevel] ?? ctx.thinkingLevel,
			visible: true,
		};
	},

	subagents(_ctx): RenderedSegment {
		return { icon: "", text: "", visible: false };
	},

	token_in(ctx): RenderedSegment {
		if (!ctx.tokenIn) return { icon: "", text: "", visible: false };
		return {
			icon: icon("tokensIn"),
			text: formatTokens(ctx.tokenIn),
			visible: true,
		};
	},

	token_out(ctx): RenderedSegment {
		if (!ctx.tokenOut) return { icon: "", text: "", visible: false };
		return {
			icon: icon("tokensOut"),
			text: formatTokens(ctx.tokenOut),
			visible: true,
		};
	},

	token_total(ctx): RenderedSegment {
		if (!ctx.tokenTotal) return { icon: "", text: "", visible: false };
		return {
			icon: icon("cache"),
			text: formatTokens(ctx.tokenTotal),
			visible: true,
		};
	},

	cost(ctx): RenderedSegment {
		if (!ctx.cost && !ctx.usingSubscription)
			return { icon: "", text: "", visible: false };
		const display = ctx.usingSubscription ? "(sub)" : `$${ctx.cost.toFixed(2)}`;
		return { icon: icon("cost"), text: display, visible: true };
	},

	context_pct(ctx): RenderedSegment {
		if (ctx.customCompactionEnabled)
			return { icon: "", text: "", visible: false };
		const pct = ctx.contextPercent;
		const info = `${pct.toFixed(1)}%/${formatTokens(ctx.contextWindow)}${ctx.autoCompactEnabled ? ` ${icon("autoCompact")}` : ""}`;
		return {
			icon: icon("context"),
			text: info,
			visible: true,
		};
	},

	context_total(ctx): RenderedSegment {
		if (ctx.customCompactionEnabled || !ctx.contextWindow)
			return { icon: "", text: "", visible: false };
		return {
			icon: icon("context"),
			text: formatTokens(ctx.contextWindow),
			visible: true,
		};
	},

	time_spent(ctx): RenderedSegment {
		const elapsed = Date.now() - ctx.sessionStartTime;
		if (elapsed < 1000) return { icon: "", text: "", visible: false };
		return {
			icon: icon("clock"),
			text: formatDuration(elapsed),
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
		return { icon: icon("clock"), text: timeStr, visible: true };
	},

	session(ctx): RenderedSegment {
		const display = ctx.sessionId?.slice(0, 8) ?? "new";
		return { icon: icon("session"), text: display, visible: true };
	},

	hostname(_ctx): RenderedSegment {
		const name = osHostname().split(".")[0]!;
		return { icon: icon("host"), text: name, visible: true };
	},

	cache_read(ctx): RenderedSegment {
		if (!ctx.cacheRead) return { icon: "", text: "", visible: false };
		return {
			icon: icon("cache"),
			text: `${icon("tokensIn")} ${formatTokens(ctx.cacheRead)}`,
			visible: true,
		};
	},

	cache_write(ctx): RenderedSegment {
		if (!ctx.cacheWrite) return { icon: "", text: "", visible: false };
		return {
			icon: icon("cache"),
			text: `${icon("tokensOut")} ${formatTokens(ctx.cacheWrite)}`,
			visible: true,
		};
	},

	extension_statuses(ctx): RenderedSegment {
		if (!ctx.extensionStatuses || ctx.extensionStatuses.size === 0)
			return { icon: "", text: "", visible: false };
		const parts: string[] = [];
		for (const [, value] of ctx.extensionStatuses) {
			if (value && value.trim()) parts.push(value.trim());
		}
		if (parts.length === 0) return { icon: "", text: "", visible: false };
		return {
			icon: "",
			text: parts.join(` ${icon("sepDot")} `),
			visible: true,
		};
	},
};
