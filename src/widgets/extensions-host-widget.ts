/**
 * extensions-host-widget.ts — Generic host widget that renders all captured
 * extension UIs inside the grid.
 *
 * Instead of per-extension data bridges and custom widgets, this host:
 * 1. Reads all widgets captured by `widget-capturer.ts`
 * 2. Lays them out in sub-rows with configurable columns-per-row
 * 3. Responsive: adjusts column count based on available width
 * 4. Hides when no captured widgets have content
 */

import { visibleWidth } from "@earendil-works/pi-tui";
import { registerWidget } from "./registry.ts";
import type { WidgetDeps, WidgetFactory } from "./types.ts";
import {
	getActiveKeys,
	renderWidget,
	hasContent,
	setOnChange,
	getDebugState,
} from "../widget-capturer.ts";

// ── Config ───────────────────────────────────────────────────────────────────

interface ExtensionsHostConfig {
	/** Maximum widgets shown side-by-side in a single sub-row. Default: 2. */
	maxWidgetsPerRow?: number;
	/** Minimum columns before wrapping to the next sub-row. Default: 40. */
	minWidgetWidth?: number;
}

// ── Widget factory ───────────────────────────────────────────────────────────

export const extensionsHostWidgetFactory: WidgetFactory = (
	deps: WidgetDeps,
	config: unknown,
) => {
	const cfg = config as ExtensionsHostConfig | undefined;
	const maxWidgetsPerRow = Math.max(1, cfg?.maxWidgetsPerRow ?? 2);
	const minWidgetWidth = Math.max(20, cfg?.minWidgetWidth ?? 40);

	/** Whether the last render returned non-empty lines. */
	let lastRenderHadContent = false;

	// Register change callback from the capturer so we can invalidate
	// the cached state and trigger re-render when a widget is added/removed.
	// The actual re-render will update lastRenderHadContent correctly.
	setOnChange(() => {
		deps.tui.requestRender?.();
	});

	return {
		heightConstraint(): { min: number; max: number } {
			if (lastRenderHadContent) {
				return { min: 1, max: Infinity };
			}
			// Before first render, check if any captured widgets have content
			if (hasContent()) {
				return { min: 1, max: Infinity };
			}
			return { min: 0, max: 0 };
		},

		render(width: number, height: number): string[] {
			const w = Math.max(1, width);
			const borderColorFn = deps.theme.fg.bind(deps.theme, "border");
			const dim = deps.theme.fg.bind(deps.theme, "dim");

			// Get active widgets
			const activeKeys = getActiveKeys(minWidgetWidth);

			// Diagnostic: show captured state
			const dbg = getDebugState();
			if (dbg && dbg.length > 0) {
				const debugLine = dim(` capt: ${dbg}`);
				// Still render normally if there are active widgets
				if (activeKeys.length === 0) {
					lastRenderHadContent = true;
					return [debugLine];
				}
			}

			// ── Compute layout ─────────────────────────────────────────────
			const columns = Math.max(
				1,
				Math.min(maxWidgetsPerRow, Math.floor(w / minWidgetWidth)),
			);

			// ── Render each widget into its own column data ─────────────────
			// Each column = { key, lines[] }
			const columnsData: Array<{ key: string; lines: string[] }> = [];
			const cellWidth = Math.floor((w - (columns - 1)) / columns); // -1 for borders

			for (const key of activeKeys) {
				const lines = renderWidget(key, cellWidth);
				if (lines.length > 0) {
					columnsData.push({ key, lines });
				}
			}

			if (columnsData.length === 0) {
				lastRenderHadContent = false;
				return [];
			}

			// ── Group into sub-rows ─────────────────────────────────────────
			// Each sub-row has up to `columns` widgets
			const subRows: Array<Array<{ key: string; lines: string[] }>> = [];
			for (let i = 0; i < columnsData.length; i += columns) {
				subRows.push(columnsData.slice(i, i + columns));
			}

			// ── Render sub-rows ─────────────────────────────────────────────
			const allLines: string[] = [];
			const maxHeight = Math.max(1, height);

			for (const subRow of subRows) {
				if (allLines.length >= maxHeight) break;

				// Determine sub-row height = tallest widget in this row
				const rowHeight = Math.max(1, ...subRow.map((c) => c.lines.length));

				for (let li = 0; li < rowHeight && allLines.length < maxHeight; li++) {
					let composedLine = "";

					for (let ci = 0; ci < subRow.length; ci++) {
						const col = subRow[ci]!;

						// Border separator before each column except the first
						if (ci > 0) {
							composedLine += borderColorFn("│");
						}

						const cellLine = col.lines[li] ?? "";
						const visibleCellWidth = visibleWidth(cellLine);
						const allocatedWidth = cellWidth;

						if (visibleCellWidth >= allocatedWidth) {
							// Line is at or wider than allocated space — truncate
							composedLine += truncateToWidth(cellLine, allocatedWidth);
						} else {
							// Pad to match allocated width
							composedLine +=
								cellLine + " ".repeat(allocatedWidth - visibleCellWidth);
						}
					}

					allLines.push(composedLine);
				}
			}

			lastRenderHadContent = allLines.length > 0;
			return allLines;
		},

		invalidate(): void {
			// Reset cached state — next render will re-check
			lastRenderHadContent = false;
		},
	};
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Truncate a string (with ANSI awareness) to a given visible width. */
function truncateToWidth(str: string, maxWidth: number): string {
	let result = "";
	let pos = 0;
	let inEscape = false;
	for (const ch of str) {
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

registerWidget("extensions-host", extensionsHostWidgetFactory);
