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
import { getPalette } from "../terminal-palette.ts";
import * as palette from "../color/palette.ts";

// ── Palette initialisation ───────────────────────────────────────────────────

let _colorsInitialised = false;

/**
 * Register all terminal-detected colours into the named colour palette.
 * Called once before the first render.
 */
function ensureColors(): void {
	if (_colorsInitialised) return;
	_colorsInitialised = true;

	const pal = getPalette();
	palette.setBgRgb(pal.bgRgb[0], pal.bgRgb[1], pal.bgRgb[2]);
	palette.define(
		"neutral",
		pal.neutralBg[0],
		pal.neutralBg[1],
		pal.neutralBg[2],
	);

	for (const [seg, rgb] of Object.entries(pal.segmentBg)) {
		palette.define(seg, rgb[0], rgb[1], rgb[2]);
	}
}

// ── Widget factory ───────────────────────────────────────────────────────────

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
	let cachedCost = 0;
	let cachedUsingSubscription = false;
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
				if (line.startsWith("??")) {
					untracked++;
					continue;
				}
				const code = line.slice(0, 2);
				if (code[0] !== " ") staged++;
				if (code[1] !== " ") unstaged++;
			}
			cachedGit.branch = branch || null;
			cachedGit.staged = staged;
			cachedGit.unstaged = unstaged;
			cachedGit.untracked = untracked;
		} catch {
			/* not a git repo or git not available */
		}
	}

	pi.on(
		"session_start",
		(
			_event: unknown,
			ctx: {
				cwd?: string;
				sessionManager?: {
					getEntries?: () => Array<{
						type: string;
						id: string;
						message?: {
							role?: string;
							usage?: {
								cost?: { total?: number };
							};
						};
					}>;
				};
				modelRegistry?: {
					isUsingOAuth?: (model: { provider: string }) => boolean;
				};
				model?: { provider: string };
			},
		) => {
			cachedSessionStartTime = Date.now();
			cachedCwd = ctx.cwd ?? process.cwd();
			cachedCost = 0;
			cachedUsingSubscription = false;
			const entries = ctx.sessionManager?.getEntries?.();
			if (entries) {
				let totalCost = 0;
				let hasAssistantMessages = false;
				for (const entry of entries) {
					if (
						entry.type === "message" &&
						entry.message?.role === "assistant" &&
						entry.message?.usage?.cost?.total != null
					) {
						totalCost += entry.message.usage.cost.total;
						hasAssistantMessages = true;
					}
				}
				if (hasAssistantMessages) {
					cachedCost = totalCost;
				}
			}
			if (ctx.modelRegistry?.isUsingOAuth && ctx.model) {
				cachedUsingSubscription = ctx.modelRegistry.isUsingOAuth(ctx.model);
			}
			refreshGitStatus();
		},
	);

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
				sessionManager?: {
					getEntries?: () => Array<{
						type: string;
						id: string;
						message?: {
							role?: string;
							usage?: {
								cost?: { total?: number };
							};
						};
					}>;
				};
				modelRegistry?: {
					isUsingOAuth?: (model: { provider: string }) => boolean;
				};
				model?: { provider: string };
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
			if (entries) {
				let totalCost = 0;
				let hasAssistantMessages = false;
				let firstId: string | undefined;
				for (const entry of entries) {
					if (!firstId) firstId = entry.id;
					if (
						entry.type === "message" &&
						entry.message?.role === "assistant" &&
						entry.message?.usage?.cost?.total != null
					) {
						totalCost += entry.message.usage.cost.total;
						hasAssistantMessages = true;
					}
				}
				if (hasAssistantMessages) {
					cachedCost = totalCost;
				}
				if (ctx.modelRegistry?.isUsingOAuth && ctx.model) {
					cachedUsingSubscription = ctx.modelRegistry.isUsingOAuth(ctx.model);
				}
				cachedSessionId = firstId?.slice(0, 8) ?? cachedSessionId;
			}
		},
	);

	/** Read extension statuses from the footer data provider and populate cache. */
	function refreshExtensionStatuses(): void {
		if (!deps.footerData) return;
		try {
			const statuses = deps.footerData.getExtensionStatuses();
			cachedExtensionStatuses.clear();
			for (const [key, value] of statuses) {
				if (value && value.trim()) {
					cachedExtensionStatuses.set(key, value);
				}
			}
		} catch {
			/* footer data provider not available yet */
		}
	}

	function buildContext(): SegmentContext {
		refreshExtensionStatuses();
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
			ensureColors();
			const ctx = buildContext();

			const makePillFromSegment = (segId: SegmentId) => {
				const segFn = SEGMENTS[segId];
				if (!segFn) return null;
				const result = segFn(ctx);
				if (!result.visible) return null;

				const bgName = palette.has(segId) ? segId : "neutral";

				if (result.icon) {
					const pill = makePill(result.icon, "", bgName, "terminal-bg");
					if (result.text) {
						pill.rightExt = makeExtension(result.text, bgName);
					}
					if (result.leftExtension) {
						pill.leftExt = makeExtension(result.leftExtension, bgName);
					}
					return pill;
				} else {
					const pill = makePill("", result.text, bgName, "terminal-bg");
					if (result.leftExtension) {
						pill.leftExt = makeExtension(result.leftExtension, bgName);
					}
					return pill;
				}
			};

			const leftPills = leftSegments
				.map(makePillFromSegment)
				.filter((p): p is NonNullable<typeof p> => p !== null);

			const rightPills = rightSegments
				.map(makePillFromSegment)
				.filter((p): p is NonNullable<typeof p> => p !== null);

			// Append a pill for every extension status
			for (const [, value] of cachedExtensionStatuses) {
				rightPills.push(makePill("", value, "neutral", "terminal-bg"));
			}

			const line = packPills(leftPills, rightPills, separator, width);
			return [line];
		},

		invalidate(): void {},
	};
};

registerWidget("status-bar", statusBarWidgetFactory);
