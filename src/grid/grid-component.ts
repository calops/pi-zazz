import {
	CustomEditor,
	type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import type { EditorTheme, TUI } from "@earendil-works/pi-tui";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { WidgetDeps, WidgetInstance } from "../widgets/types.ts";
import { createFromConfig } from "../widgets/registry.ts";
import { computeLayout } from "./grid-engine.ts";
import type { GridConfig, GridCellInfo } from "./types.ts";

/**
 * GridComponent extends pi's CustomEditor. It replaces the default editor
 * via ctx.ui.setEditorComponent(). The grid engine allocates space, then
 * each widget renders into its allocated cell.
 */
export class GridComponent extends CustomEditor {
	private config: GridConfig;
	private deps: WidgetDeps;
	private widgets: Map<string, WidgetInstance> = new Map();
	private borderColorFn: (text: string) => string;

	constructor(
		tui: TUI,
		theme: EditorTheme,
		keybindings: KeybindingsManager,
		deps: WidgetDeps,
		config: GridConfig,
	) {
		super(tui, theme, keybindings);
		this.config = config;
		this.deps = deps;
		this.borderColorFn = deps.theme.fg.bind(deps.theme, "border");
	}

	override render(width: number): string[] {
		const termHeight = this.deps.tui.termHeight ?? 24;
		const plan = computeLayout(this.config, width, termHeight);

		if (plan.fallback) {
			return super.render(width);
		}

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
					for (const line of lines) {
						allLines.push(this.clampLine(line, width));
					}
					terminalRow += perColHeight;
				}
			} else {
				let maxCellHeight = 0;
				const cellLines: string[][] = [];

				for (let ci = 0; ci < row.columns.length; ci++) {
					const col = row.columns[ci]!;
					const borderOffset = col.borderLeft ? 1 : 0;
					const widget = this.getWidget(
						col.id,
						row.id,
						ci,
						terminalRow,
						borderOffset,
					);
					const lines = widget.render(col.width, row.height);
					cellLines.push(lines);
					maxCellHeight = Math.max(maxCellHeight, lines.length);
				}

				const effectiveHeight = Math.max(maxCellHeight, row.height);
				for (let lineIdx = 0; lineIdx < effectiveHeight; lineIdx++) {
					let composed = "";
					for (let ci = 0; ci < row.columns.length; ci++) {
						const col = row.columns[ci]!;
						if (col.borderLeft) {
							composed += this.borderColorFn("│");
						}
						const cellLine = cellLines[ci]![lineIdx] ?? "";
						composed += this.clampLine(cellLine, col.width);
					}
					allLines.push(this.clampLine(composed, width));
				}
				terminalRow += effectiveHeight;
			}
		}

		return allLines;
	}

	override invalidate(): void {
		for (const widget of this.widgets.values()) {
			widget.invalidate();
		}
		super.invalidate();
	}

	override handleInput(data: string): void {
		const editorWidget = this.widgets.get("main:editor");
		if (editorWidget?.handleInput?.(data)) return;
		super.handleInput(data);
	}

	/** Reconfigure the grid at runtime */
	setConfig(config: GridConfig): void {
		this.config = config;
		this.widgets.clear();
		this.invalidate();
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
		if (vw <= width) {
			return line + " ".repeat(width - vw);
		}
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
