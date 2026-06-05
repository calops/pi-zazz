/**
 * widget-capturer.ts — Generic capture of ctx.ui.setWidget() calls.
 *
 * Extensions register their UI via setWidget(key, content). Instead of
 * rendering them in pi's built-in TUI, this module captures the factories
 * and lets the grid's extensions-host widget render them instead.
 *
 * Two content forms:
 *   (tui, theme) => Component  — factory returning a Component with render()
 *   string[]                   — static text lines (less common)
 *
 * Factories are stored but NOT called until first renderWidget() call
 * (lazy initialization). Components are cached and reused.
 */

import type { Component, TUI } from "@earendil-works/pi-tui";
import type { Theme } from "@earendil-works/pi-coding-agent";

// ── Types ────────────────────────────────────────────────────────────────────

interface CapturedFactory {
	type: "factory";
	factory: (tui: TUI, theme: Theme) => Component & { dispose?(): void };
	component: (Component & { dispose?(): void }) | null;
	/** Whether the last render returned non-empty output. */
	hasContent: boolean;
	/** Cached render lines (for invalidation tracking). */
	cachedLines: string[] | null;
	/** Width used for cached render. */
	cachedWidth: number;
}

interface CapturedLines {
	type: "lines";
	lines: string[];
	hasContent: boolean;
}

type CapturedEntry = CapturedFactory | CapturedLines;

// ── Module state ─────────────────────────────────────────────────────────────

const entries = new Map<string, CapturedEntry>();
let tuiRef: TUI | null = null;
let themeRef: Theme | null = null;
let onChangeFn: (() => void) | null = null;

// ── Public API ───────────────────────────────────────────────────────────────

/** Provide the TUI and theme instances needed to create widget components. */
export function setContext(tui: TUI, theme: Theme): void {
	tuiRef = tui;
	themeRef = theme;
}

/** Register a callback fired when any widget is captured, released, or changed. */
export function setOnChange(fn: (() => void) | null): void {
	onChangeFn = fn;
}

/** Capture a component-based widget (may have optional dispose). */
export function capture(
	key: string,
	factory: (tui: TUI, theme: Theme) => Component & { dispose?(): void },
): void {
	const existing = entries.get(key);
	if (existing?.type === "factory") {
		if (existing.factory === factory) return; // same factory, no-op
		disposeComponent(existing.component);
	}
	entries.set(key, {
		type: "factory",
		factory,
		component: null,
		hasContent: false,
		cachedLines: null,
		cachedWidth: 0,
	});
	onChangeFn?.();
}

/** Capture a static string[] widget. */
export function captureLines(key: string, lines: string[]): void {
	const hasContent = lines.some((l) => l.length > 0);
	entries.set(key, { type: "lines", lines, hasContent });
	onChangeFn?.();
}

/** Remove a captured widget. Disposes its component if applicable. */
export function release(key: string): void {
	const entry = entries.get(key);
	if (entry?.type === "factory") {
		disposeComponent(entry.component);
	}
	entries.delete(key);
	onChangeFn?.();
}

/** Invalidate a single widget's cached output. */
export function invalidate(key: string): void {
	const entry = entries.get(key);
	if (entry?.type === "factory") {
		entry.cachedLines = null;
		entry.cachedWidth = 0;
	}
}

/** Invalidate all cached outputs. */
export function invalidateAll(): void {
	for (const entry of entries.values()) {
		if (entry.type === "factory") {
			entry.cachedLines = null;
			entry.cachedWidth = 0;
		}
	}
}

/**
 * Render a captured widget to the given width.
 * Returns empty array if the widget doesn't exist or produces no output.
 * Caches output for subsequent calls at the same width.
 */
export function renderWidget(key: string, width: number): string[] {
	const entry = entries.get(key);
	if (!entry) return [];

	if (entry.type === "lines") {
		return entry.lines;
	}

	// Factory type — create component lazily
	if (!entry.component) {
		if (!tuiRef || !themeRef) return [];
		try {
			entry.component = entry.factory(tuiRef, themeRef);
		} catch {
			return [wrapError(`⚠ "${key}" widget error`)];
		}
	}

	// Use cached output if width matches
	if (entry.cachedLines && entry.cachedWidth === width) {
		return entry.cachedLines;
	}

	// Render
	let lines: string[];
	try {
		lines = entry.component.render(width);
	} catch {
		lines = [wrapError(`⚠ "${key}" widget error`)];
	}

	entry.cachedLines = lines;
	entry.cachedWidth = width;
	entry.hasContent = lines.length > 0 && lines.some((l) => l.trim().length > 0);
	return lines;
}

/**
 * Get keys whose last render returned non-empty output.
 * For factory widgets that haven't rendered yet, attempts a render at a
 * conservative default width to check for content.
 */
export function getActiveKeys(defaultWidth = 40): string[] {
	const active: string[] = [];
	for (const [key, entry] of entries) {
		if (entry.type === "lines") {
			if (entry.hasContent) active.push(key);
		} else if (entry.type === "factory") {
			if (entry.hasContent) {
				active.push(key);
			} else if (!entry.component) {
				// Never rendered — try a quick render to check for content
				renderWidget(key, defaultWidth);
				if (entry.hasContent) active.push(key);
			}
		}
	}
	return active;
}

/** Get all captured keys (regardless of content state). */
export function getAllKeys(): string[] {
	return [...entries.keys()];
}

/** Check if any captured widget has content. */
export function hasContent(): boolean {
	return getActiveKeys().length > 0;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function disposeComponent(comp: Component | null): void {
	if (comp && "dispose" in comp) {
		(comp as { dispose?(): void }).dispose?.();
	}
}

function wrapError(msg: string): string {
	return ` \x1b[31m${msg}\x1b[0m`; // red text
}
