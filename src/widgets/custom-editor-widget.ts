import { visibleWidth } from "@earendil-works/pi-tui";
import { registerWidget } from "./registry.ts";
import type { WidgetDeps, WidgetFactory, WidgetInstance } from "./types.ts";
import type { CompletionItem } from "../completion/completion-popup.ts";

// ── Types ──────────────────────────────────────────────────────────

interface EditorState {
	lines: string[];
	cursorLine: number;
	cursorCol: number;
	scrollOffset: number;
}

interface AutocompleteProvider {
	getSuggestions(
		lines: string[],
		cursorLine: number,
		cursorCol: number,
		options: { signal?: AbortSignal },
	): Promise<{ prefix: string; items: CompletionItem[] } | null>;
	applyCompletion(
		lines: string[],
		cursorLine: number,
		cursorCol: number,
		item: CompletionItem,
		prefix: string,
	): { lines: string[]; cursorLine: number; cursorCol: number };
}

// ── Key helpers ────────────────────────────────────────────────────

enum Arrow {
	Up = "\x1b[A",
	Down = "\x1b[B",
	Right = "\x1b[C",
	Left = "\x1b[D",
}

function isArrow(data: string, dir: string): boolean {
	return data === dir;
}

function isPrintable(data: string): boolean {
	const code = data.codePointAt(0);
	return code !== undefined && (code >= 0x20 || code === 0x0d || code === 0x0a);
}

function isAutocompleteTrigger(
	data: string,
	_line: string,
	col: number,
): boolean {
	if (data === "\t") return true;
	// Slash at start of line or after whitespace
	if (data === "/" && col === 0) return true;
	// @ anywhere
	if (data === "@") return true;
	return false;
}

// ── Editor Widget ───────────────────────────────────────────────────

export const customEditorWidgetFactory: WidgetFactory = (
	deps: WidgetDeps,
	_config: unknown,
) => {
	const state: EditorState = {
		lines: [""],
		cursorLine: 0,
		cursorCol: 0,
		scrollOffset: 0,
	};

	const completionEngine = deps.completionEngine;
	const autocompleteProvider: AutocompleteProvider | null =
		(deps as { autocompleteProvider?: AutocompleteProvider })
			.autocompleteProvider ?? null;
	const gridRef = (
		deps as {
			gridRef?: { setText: (t: string) => void; getText: () => string };
		}
	).gridRef;

	// ── Cursor / buffer helpers ───────────────────────────────────────

	function clampCursor(): void {
		const line = state.lines[state.cursorLine] ?? "";
		if (state.cursorCol > line.length) state.cursorCol = line.length;
		if (state.cursorCol < 0) state.cursorCol = 0;
	}

	function insertChar(ch: string): void {
		const line = state.lines[state.cursorLine] ?? "";
		state.lines[state.cursorLine] =
			line.slice(0, state.cursorCol) + ch + line.slice(state.cursorCol);
		state.cursorCol += ch.length;
	}

	function insertNewline(): void {
		const line = state.lines[state.cursorLine] ?? "";
		const before = line.slice(0, state.cursorCol);
		const after = line.slice(state.cursorCol);
		state.lines[state.cursorLine] = before;
		state.lines.splice(state.cursorLine + 1, 0, after);
		state.cursorLine++;
		state.cursorCol = 0;
	}

	function deleteBefore(): void {
		if (state.cursorCol > 0) {
			const line = state.lines[state.cursorLine] ?? "";
			state.lines[state.cursorLine] =
				line.slice(0, state.cursorCol - 1) + line.slice(state.cursorCol);
			state.cursorCol--;
		} else if (state.cursorLine > 0) {
			const prevLine = state.lines[state.cursorLine - 1] ?? "";
			const currLine = state.lines[state.cursorLine] ?? "";
			state.cursorCol = prevLine.length;
			state.lines[state.cursorLine - 1] = prevLine + currLine;
			state.lines.splice(state.cursorLine, 1);
			state.cursorLine--;
		}
	}

	function deleteForward(): void {
		const line = state.lines[state.cursorLine] ?? "";
		if (state.cursorCol < line.length) {
			state.lines[state.cursorLine] =
				line.slice(0, state.cursorCol) + line.slice(state.cursorCol + 1);
		} else if (state.cursorLine < state.lines.length - 1) {
			const nextLine = state.lines[state.cursorLine + 1] ?? "";
			state.lines[state.cursorLine] = line + nextLine;
			state.lines.splice(state.cursorLine + 1, 1);
		}
	}

	function deleteWordBefore(): void {
		if (state.cursorCol === 0) {
			deleteBefore();
			return;
		}
		const line = state.lines[state.cursorLine] ?? "";
		let pos = state.cursorCol;
		while (pos > 0 && line[pos - 1] === " ") pos--;
		while (pos > 0 && line[pos - 1] !== " ") pos--;
		state.lines[state.cursorLine] =
			line.slice(0, pos) + line.slice(state.cursorCol);
		state.cursorCol = pos;
	}

	function getFullText(): string {
		return state.lines.join("\n");
	}

	function submitText(): void {
		const text = getFullText();
		// Sync text to GridComponent's native buffer so super.handleInput("\r")
		// can read it and trigger the built-in submit pipeline via Editor.onSubmit.
		gridRef?.setText(text);
		// Clear our buffer
		state.lines = [""];
		state.cursorLine = 0;
		state.cursorCol = 0;
	}

	// ── Autocomplete ──────────────────────────────────────────────────

	async function triggerAutocomplete(): Promise<void> {
		if (!autocompleteProvider || completionEngine?.isActive) return;

		const abortController = new AbortController();
		const result = await autocompleteProvider.getSuggestions(
			state.lines,
			state.cursorLine,
			state.cursorCol,
			{ signal: abortController.signal },
		);

		if (result && result.items.length > 0) {
			const prefix = result.prefix;
			const termHeight = deps.tui.termHeight ?? 24;
			const editorWidth = 60; // approximate, will be adjusted

			completionEngine?.show(
				result.items,
				termHeight,
				editorWidth,
				{
					fg: (c: string, t: string) => deps.theme.fg(c, t),
					bg: (c: string, t: string) => deps.theme.fg(c, t),
				},
				state.cursorLine + 2,
			);

			completionEngine!.onApply = (selectedValue: string) => {
				const selected =
					result.items.find((i) => i.value === selectedValue) ??
					result.items[0]!;
				const newState = autocompleteProvider.applyCompletion(
					state.lines,
					state.cursorLine,
					state.cursorCol,
					selected,
					prefix,
				);
				state.lines = newState.lines;
				state.cursorLine = newState.cursorLine;
				state.cursorCol = newState.cursorCol;
				clampCursor();
			};
		}
	}

	const instance: WidgetInstance = {
		render(width: number, height: number): string[] {
			clampCursor();
			const lines: string[] = [];

			if (state.cursorLine < state.scrollOffset)
				state.scrollOffset = state.cursorLine;
			const maxVisible = height;
			if (state.cursorLine >= state.scrollOffset + maxVisible) {
				state.scrollOffset = state.cursorLine - maxVisible + 1;
			}
			if (state.scrollOffset < 0) state.scrollOffset = 0;

			const visibleLines = state.lines.slice(
				state.scrollOffset,
				state.scrollOffset + maxVisible,
			);

			for (let i = 0; i < visibleLines.length; i++) {
				const lineIdx = state.scrollOffset + i;
				const text = visibleLines[i] ?? "";

				if (lineIdx === state.cursorLine) {
					const before = text.slice(0, state.cursorCol);
					const at = text[state.cursorCol] ?? " ";
					const after = text.slice(state.cursorCol + 1);
					const cursor = deps.theme.fg("accent", `\x1b[7m${at}\x1b[27m`);
					lines.push(padLine(`> ${before}${cursor}${after}`, width));
				} else {
					lines.push(padLine(`  ${text}`, width));
				}
			}

			for (let i = lines.length; i < height; i++) {
				lines.push(
					deps.theme.fg("dim", "~") + " ".repeat(Math.max(0, width - 1)),
				);
			}

			return lines;
		},

		handleInput(data: string): boolean {
			if (completionEngine?.isActive) return true;

			if (data === "\r" || data === "\n") {
				if (state.lines.length > 1) {
					insertNewline();
					return true;
				}
				submitText();
				return false; // let GridComponent.super.handleInput("\r") submit
			}

			if (
				isAutocompleteTrigger(
					data,
					state.lines[state.cursorLine] ?? "",
					state.cursorCol,
				)
			) {
				insertChar(data);
				void triggerAutocomplete();
				return true;
			}

			if (data === "\x1b") {
				state.lines = [""];
				state.cursorLine = 0;
				state.cursorCol = 0;
				return true;
			}
			if (data === "\x7f" || data === "\x08") {
				deleteBefore();
				return true;
			}
			if (data === "\x1b[3~") {
				deleteForward();
				return true;
			}
			if (data === "\x17" || data === "\x1b\x7f") {
				deleteWordBefore();
				return true;
			}

			if (isArrow(data, Arrow.Left)) {
				if (state.cursorCol > 0) state.cursorCol--;
				else if (state.cursorLine > 0) {
					state.cursorLine--;
					state.cursorCol = (state.lines[state.cursorLine] ?? "").length;
				}
				return true;
			}
			if (isArrow(data, Arrow.Right)) {
				const ln = state.lines[state.cursorLine] ?? "";
				if (state.cursorCol < ln.length) state.cursorCol++;
				else if (state.cursorLine < state.lines.length - 1) {
					state.cursorLine++;
					state.cursorCol = 0;
				}
				return true;
			}
			if (isArrow(data, Arrow.Up)) {
				if (state.cursorLine > 0) state.cursorLine--;
				return true;
			}
			if (isArrow(data, Arrow.Down)) {
				if (state.cursorLine < state.lines.length - 1) state.cursorLine++;
				return true;
			}

			if (data === "\x01") {
				state.cursorCol = 0;
				return true;
			}
			if (data === "\x05") {
				const ln2 = state.lines[state.cursorLine] ?? "";
				state.cursorCol = ln2.length;
				return true;
			}

			if (data === "\x0b") {
				const ln3 = state.lines[state.cursorLine] ?? "";
				state.lines[state.cursorLine] = ln3.slice(0, state.cursorCol);
				return true;
			}
			if (data === "\x15") {
				const ln4 = state.lines[state.cursorLine] ?? "";
				state.lines[state.cursorLine] = ln4.slice(state.cursorCol);
				state.cursorCol = 0;
				return true;
			}

			if (isPrintable(data) && data !== "\r" && data !== "\n") {
				insertChar(data);
				return true;
			}

			return false;
		},

		invalidate(): void {},
		configure(_cfg: Record<string, unknown>): void {},
	};

	return instance;
};

function padLine(line: string, width: number): string {
	const vw = visibleWidth(line);
	if (vw >= width) return line.slice(0, width);
	return line + " ".repeat(width - vw);
}

registerWidget("editor", customEditorWidgetFactory);
