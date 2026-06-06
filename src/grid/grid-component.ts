import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { WidgetDeps, WidgetInstance } from "../widgets/types.ts";
import { createFromConfig } from "../widgets/registry.ts";
import { computeLayout } from "./grid-engine.ts";
import type { GridConfig, GridCellInfo, ColumnLayout } from "./types.ts";

/**
 * GridComponent is a pure renderer for the grid layout.
 * It allocates space and delegates each cell to its widget.
 * Input handling is delegated to the active editor widget.
 * No longer extends CustomEditor — the overlay handles all input routing.
 */
export class GridComponent {
	private config: GridConfig;
	private deps: WidgetDeps;
	private widgets: Map<string, WidgetInstance> = new Map();
	private borderColorFn: (text: string) => string;
	private dimColorFn: (text: string) => string;
	private accentColorFn: (text: string) => string;
	private onInvalidate: (() => void) | null = null;
	private cellBounds: Map<
		string,
		{
			rowStart: number;
			rowEnd: number;
			colStart: number;
			colEnd: number;
			scrollable: boolean;
		}
	> = new Map();

	constructor(
		tui: TUI,
		_theme: EditorTheme,
		_keybindings: unknown,
		deps: WidgetDeps,
		config: GridConfig,
	) {
		this.config = config;
		this.deps = deps;
		this.borderColorFn = deps.theme.fg.bind(deps.theme, "border");
		this.dimColorFn = deps.theme.fg.bind(deps.theme, "dim");
		this.accentColorFn = deps.theme.fg.bind(deps.theme, "accent");
		(deps as unknown as Record<string, unknown>).tui = tui;
		(deps as unknown as Record<string, unknown>).gridRef = this;
	}

	render(width: number): string[] {
		const termHeight =
			(this.deps.tui as { termHeight?: number }).termHeight ?? 24;
		const plan = computeLayout(this.config, width, termHeight);

		if (plan.fallback) return [];

		this.cellBounds.clear();

		let terminalRow = 0;
		const allLines: string[] = [];

		for (const row of plan.rows) {
			if (row.stacked) {
				const perColHeight = Math.max(
					1,
					Math.floor(row.height / row.columns.length),
				);
				for (let ci = 0; ci < row.columns.length; ci++) {
					const col = row.columns[ci]!;
					const widget = this.getWidget(col.id, row.id, ci, terminalRow, 0);
					const lines = widget.render(col.width, perColHeight);
					for (const line of lines) allLines.push(this.clampLine(line, width));
					terminalRow += perColHeight;
				}
			} else {
				// ── Determine visible columns ──────────────────────────────────
				// Check each widget's heightConstraint — if max === 0, hide it
				const rowCfg = this.config.rows.find((r) => r.id === row.id);
				const colCfgs = rowCfg?.columns ?? [];

				const visibleIndices: number[] = [];
				for (let ci = 0; ci < row.columns.length; ci++) {
					const col = row.columns[ci]!;
					const widget = this.getWidget(col.id, row.id, ci, terminalRow, 0);
					const hc = widget.heightConstraint?.();
					if (hc && hc.max === 0) continue;
					visibleIndices.push(ci);
				}

				// ── Redistribute width among visible columns ───────────────────
				const redistributed: Array<{
					layout: ColumnLayout;
					width: number;
				}> = [];
				if (visibleIndices.length === 1) {
					const col = row.columns[visibleIndices[0]!]!;
					redistributed.push({
						layout: col,
						width: Math.max(1, width - (col.borderLeft ? 1 : 0)),
					});
				} else if (visibleIndices.length > 1) {
					const totalFractions = visibleIndices.reduce(
						(s, ci) => s + (colCfgs[ci]?.width.fraction ?? 1),
						0,
					);
					const effectiveTotal =
						totalFractions > 0 ? totalFractions : visibleIndices.length;
					const mins = visibleIndices.map((ci) => colCfgs[ci]?.width.min ?? 1);
					const totalMins = mins.reduce((s, m) => s + m, 0);
					const distributable = Math.max(0, width - totalMins);

					let used = 0;
					for (let i = 0; i < visibleIndices.length; i++) {
						const ci = visibleIndices[i]!;
						const col = row.columns[ci]!;
						const cfg = colCfgs[ci];
						const fraction = cfg?.width.fraction ?? 1;
						const min = cfg?.width.min ?? 1;
						let w =
							min + Math.floor((distributable * fraction) / effectiveTotal);
						if (cfg?.width.max !== undefined) {
							w = Math.min(w, cfg.width.max);
						}
						redistributed.push({ layout: col, width: w });
						used += w;
					}
					// Distribute any leftover space
					for (let i = 0; i < redistributed.length && used < width; i++) {
						const rw = redistributed[i]!;
						const cfg = colCfgs[visibleIndices[i]!];
						const max = cfg?.width.max ?? Number.POSITIVE_INFINITY;
						const add = Math.min(width - used, max - rw.width);
						redistributed[i] = { ...rw, width: rw.width + add };
						used += add;
					}
				}

				// ── Phase A: Determine scrollbar needs ────────────────────────
				const scrollbarData = new Map<
					string,
					{ chars: string[]; contentWidth: number }
				>();

				for (let vi = 0; vi < redistributed.length; vi++) {
					const rw = redistributed[vi]!;
					if (!rw.layout.scrollable) continue;

					const key = `${row.id}:${rw.layout.id}`;
					const widget = this.widgets.get(key);
					if (!widget?.getContentHeight) continue;

					const contentHeight = widget.getContentHeight();
					if (contentHeight <= row.maxHeight) continue; // no overflow

					const viewportHeight = Math.max(1, row.maxHeight);
					const maxOffset = Math.max(1, contentHeight - viewportHeight);
					const scrollOff = widget.getScrollOffset?.() ?? 0;
					const thumbRow = Math.round(
						(scrollOff / maxOffset) * (viewportHeight - 1),
					);

					const chars: string[] = [];
					for (let li = 0; li < viewportHeight; li++) {
						chars.push(
							li === thumbRow ? this.accentColorFn("█") : this.dimColorFn("│"),
						);
					}

					scrollbarData.set(key, {
						chars,
						contentWidth: rw.width - 1,
					});
				}

				// ── Phase B: Render widgets ────────────────────────────────────
				let maxCellHeight = 0;
				const cellLines: string[][] = [];
				for (let vi = 0; vi < redistributed.length; vi++) {
					const rw = redistributed[vi]!;
					const key = `${row.id}:${rw.layout.id}`;
					const sbData = scrollbarData.get(key);
					const renderWidth = sbData ? sbData.contentWidth : rw.width;

					const widget = this.getWidget(
						rw.layout.id,
						row.id,
						row.columns.findIndex((c) => c.id === rw.layout.id),
						terminalRow,
						0,
					);
					const lines = widget.render(renderWidth, row.maxHeight);
					cellLines.push(lines);
					maxCellHeight = Math.max(maxCellHeight, lines.length);
				}

				// ── Phase C: Compose final lines with scrollbar ───────────────
				const effectiveHeight = Math.max(
					row.minHeight,
					Math.min(maxCellHeight, row.maxHeight),
				);
				for (let lineIdx = 0; lineIdx < effectiveHeight; lineIdx++) {
					let composed = "";
					for (let vi = 0; vi < redistributed.length; vi++) {
						const rw = redistributed[vi]!;
						if (rw.layout.borderLeft) {
							composed += this.borderColorFn("│");
						}
						const cellLine = cellLines[vi]![lineIdx] ?? "";
						const key = `${row.id}:${rw.layout.id}`;
						const sbData = scrollbarData.get(key);

						if (sbData) {
							composed += this.clampLine(cellLine, sbData.contentWidth);
							composed += sbData.chars[lineIdx] ?? " ";
						} else {
							composed += this.clampLine(cellLine, rw.width);
						}
					}
					allLines.push(this.clampLine(composed, width));
				}

				// ── Phase D: Record cellBounds (relative to grid top) ────────
				let colAccum = 0;
				for (let vi = 0; vi < redistributed.length; vi++) {
					const rw = redistributed[vi]!;
					if (rw.layout.borderLeft) colAccum += 1;

					const key = `${row.id}:${rw.layout.id}`;
					this.cellBounds.set(key, {
						rowStart: terminalRow,
						rowEnd: terminalRow + effectiveHeight,
						colStart: colAccum,
						colEnd: colAccum + rw.width,
						scrollable: rw.layout.scrollable,
					});
					colAccum += rw.width;
				}

				terminalRow += effectiveHeight;
			}
		}
		const tuiObj = this.deps.tui as unknown as TUI;
		const gridTopRow = tuiObj.terminal.rows - allLines.length;

		// Offset all cellBounds by gridTopRow to get terminal-absolute coordinates
		for (const [, bounds] of this.cellBounds) {
			bounds.rowStart += gridTopRow;
			bounds.rowEnd += gridTopRow;
		}

		(this.deps as unknown as Record<string, unknown>).gridTopRow = gridTopRow;

		return allLines;
	}

	invalidate(): void {
		for (const widget of this.widgets.values()) widget.invalidate();
		this.onInvalidate?.();
	}

	handleInput(data: string): boolean {
		const editorWidget = this.widgets.get("main:editor");
		if (editorWidget?.handleInput?.(data)) return true;
		return false;
	}

	addToHistory(text: string): void {
		const editorWidget = this.widgets.get("main:editor");
		editorWidget?.addToHistory?.(text);
	}

	setText(text: string): void {
		const editorWidget = this.widgets.get("main:editor");
		editorWidget?.setText?.(text);
	}

	getText(): string {
		const editorWidget = this.widgets.get("main:editor");
		return editorWidget?.getText?.() ?? "";
	}

	setConfig(config: GridConfig): void {
		this.config = config;
		this.widgets.clear();
		this.invalidate();
	}

	setOnInvalidate(fn: () => void): void {
		this.onInvalidate = fn;
	}

	/**
	 * Hit-test: given 1-based terminal coordinates (as received from SGR mouse events),
	 * return the cellId (rowId:colId) of the cell at that position, or null.
	 */
	hitTest(row: number, col: number): string | null {
		// Convert 1-based to 0-based
		const r = row - 1;
		const c = col - 1;
		for (const [cellId, bounds] of this.cellBounds) {
			if (
				r >= bounds.rowStart &&
				r < bounds.rowEnd &&
				c >= bounds.colStart &&
				c < bounds.colEnd
			) {
				return cellId;
			}
		}
		return null;
	}

	/**
	 * Route a scroll delta to a widget by cellId.
	 * @param cellId - cell ID in the form "rowId:colId"
	 * @param direction - +1 for scroll down (show later content), -1 for scroll up (show earlier content)
	 */
	scrollCell(cellId: string, direction: number): void {
		const widget = this.widgets.get(cellId);
		if (widget?.scrollBy) {
			widget.scrollBy(direction);
		}
	}

	/**
	 * Returns true if any scrollable cell has content that exceeds its viewport.
	 * Used by the MouseManager to decide whether to enable button-event tracking.
	 */
	hasScrollableOverflow(): boolean {
		for (const [cellId, bounds] of this.cellBounds) {
			if (!bounds.scrollable) continue;
			const widget = this.widgets.get(cellId);
			if (!widget?.getContentHeight) continue;
			const contentHeight = widget.getContentHeight();
			const viewportHeight = bounds.rowEnd - bounds.rowStart;
			if (contentHeight > viewportHeight) return true;
		}
		return false;
	}

	private getWidget(
		colId: string,
		rowId: string,
		colIndex: number,
		terminalRow: number,
		terminalCol: number,
	): WidgetInstance {
		const key = `${rowId}:${colId}`;
		let widget = this.widgets.get(key);
		if (!widget) {
			const rowCfg = this.config.rows.find((r) => r.id === rowId);
			const colConfig = rowCfg?.columns[colIndex];
			if (!colConfig)
				throw new Error(`Column ${colId} not found in row ${rowId}`);
			const cellInfo: GridCellInfo = {
				row: this.config.rows.findIndex((r) => r.id === rowId),
				col: colIndex,
				rowId,
				colId,
				terminalRow,
				terminalCol,
			};
			widget = createFromConfig(colConfig, this.deps, cellInfo);
			this.widgets.set(key, widget);
		}
		return widget;
	}

	private clampLine(line: string, width: number): string {
		const vw = visibleWidth(line);
		if (vw <= width) return line + " ".repeat(width - vw);
		let result = "";
		let pos = 0;
		let inEscape = false;
		for (const ch of line) {
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
			if (pos >= width) break;
			result += ch;
			pos++;
		}
		return result;
	}
}
