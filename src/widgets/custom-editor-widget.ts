import {
	Editor,
	type EditorOptions,
	type EditorTheme,
	visibleWidth,
	truncateToWidth,
	getKeybindings,
	type Component,
	type OverlayHandle,
	type TUI,
} from "@earendil-works/pi-tui";
import type {
	AutocompleteItem,
	AutocompleteProvider,
} from "@earendil-works/pi-tui";
import { icon } from "../icons.ts";
import { registerWidget } from "./registry.ts";
import type { WidgetDeps, WidgetFactory, WidgetInstance } from "./types.ts";
import type { GridCellInfo } from "../grid/types.ts";

// ── Completion overlay component ────────────────────────────────────

class CompletionOverlayComponent implements Component {
	items: AutocompleteItem[] = [];
	selectedIdx = 0;
	width = 40;

	render(_width: number): string[] {
		if (this.items.length === 0) return [];

		const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;
		const bright = (s: string) => `\x1b[1m${s}\x1b[22m`;

		// Content area inside the border: │(space)…(space)│
		const innerWidth = this.width - 4;

		const lines: string[] = [];

		// Top rounded border
		lines.push(dim(`╭${`─`.repeat(Math.max(0, this.width - 2))}╮`));

		for (let i = 0; i < this.items.length; i++) {
			const item = this.items[i]!;
			const isSel = i === this.selectedIdx;

			// Selected item: ▶ prefix + bold; others: two spaces + dim
			const prefix = isSel ? "▶ " : "  ";
			let content = `${prefix}${isSel ? bright(item.label) : item.label}`;
			if (item.description) content += dim(`  ${item.description}`);

			// Truncate content that spills past the right border
			const truncated =
				visibleWidth(content) > innerWidth
					? truncateToWidth(content, innerWidth, "…")
					: content;
			const tw = visibleWidth(truncated);
			const pad = Math.max(0, innerWidth - tw);
			lines.push(dim("│ ") + truncated + " ".repeat(pad) + dim(" │"));
		}

		// Bottom rounded border
		lines.push(dim(`╰${`─`.repeat(Math.max(0, this.width - 2))}╯`));

		return lines;
	}

	handleInput?(_data: string): void {}
	invalidate(): void {}
}

// ── Stub SelectList — tracks selection state, renders nothing ───────

function createStubSelectList(
	items: AutocompleteItem[],
	onSelectionChanged: (idx: number) => void,
) {
	let selectedIndex = 0;

	return {
		items,
		selectedIndex,
		render: () => [] as string[],
		handleInput: (data: string) => {
			const kb = getKeybindings();
			if (kb.matches(data, "tui.select.up")) {
				selectedIndex =
					selectedIndex === 0 ? items.length - 1 : selectedIndex - 1;
				onSelectionChanged(selectedIndex);
			} else if (kb.matches(data, "tui.select.down")) {
				selectedIndex =
					selectedIndex === items.length - 1 ? 0 : selectedIndex + 1;
				onSelectionChanged(selectedIndex);
			}
		},
		invalidate: () => {},
		getSelectedItem: () => items[selectedIndex] ?? null,
		getSelectedIndex: () => selectedIndex,
		setSelectedIndex: (i: number) => {
			if (i !== selectedIndex && i >= 0 && i < items.length) {
				selectedIndex = i;
				onSelectionChanged(i);
			}
		},
		setFilter: () => {},
	};
}

// ── OverlayEditor — built-in Editor + our custom completion overlay ─

class OverlayEditor extends Editor {
	private completionHandle: OverlayHandle | null = null;
	private completionComponent: CompletionOverlayComponent | null = null;
	private cell: GridCellInfo | null = null;
	private deps: WidgetDeps | null = null;
	/** Whether to render a rounded border around the editor */
	borderEnabled = false;

	constructor(tui: TUI, theme: EditorTheme, options?: EditorOptions) {
		super(tui, theme, options);

		// Monkey-patch three private methods to intercept completion rendering.
		// TypeScript `private` is compile-time only — at runtime these are
		// regular prototype methods we can override via bracket assignment.
		const self = this as unknown as Record<string, unknown>;
		const origClear = self["clearAutocompleteUi"] as () => void;

		// 1) createAutocompleteList — build stub SelectList + show our overlay
		// Note: this replaces the prototype method, called from the parent class's
		// applyAutocompleteSuggestions with (prefix, items) from the suggestion payload.
		// We MUST use those parameters rather than reading autocompleteState (which
		// hasn't been updated yet at that point) and MUST return the stub so the
		// caller's `this.autocompleteList = this.createAutocompleteList(...)` works.
		self["createAutocompleteList"] = (
			_prefix: string,
			items: AutocompleteItem[],
		) => {
			if (!items?.length) {
				return createStubSelectList([], () => {});
			}

			const maxVisible = (self["autocompleteMaxVisible"] as number) ?? 6;
			const visible = items.slice(0, maxVisible);

			const stub = createStubSelectList(visible, (idx) => {
				if (this.completionComponent) {
					this.completionComponent.selectedIdx = idx;
					this.tui.requestRender?.();
				}
			});

			this.showCompletionOverlay(visible);
			return stub;
		};

		// 2) clearAutocompleteUi — hide our overlay + call original for cleanup
		self["clearAutocompleteUi"] = () => {
			origClear.call(this);
			this.hideCompletionOverlay();
		};

		// 3) isShowingAutocomplete — delegate to our overlay state
		self["isShowingAutocomplete"] = () => this.completionHandle !== null;
	}

	override render(width: number): string[] {
		if (!this.borderEnabled) {
			// Simple mode: no border, just arrow prefix
			const arrowW = 2;
			const contentWidth = Math.max(1, width - arrowW);

			const lines = super.render(contentWidth);
			if (lines.length <= 2) return [];

			const content = lines.slice(1, -1);

			if (content.length > 0 && content[0]) {
				const arrow =
					this.deps?.theme?.fg?.("muted", icon("promptArrow") + " ") ??
					`\x1b[2m${icon("promptArrow")} \x1b[22m`;
				content[0] = arrow + content[0];
			}

			return content;
		}

		// Bordered mode: rounded border around the editor
		// 2 chars left ("│ ") + 2 chars right (" │") = 4 total for borders
		const borderInner = Math.max(1, width - 4);
		// Arrow prefix inside the border
		const contentWidth = Math.max(1, width - 6);

		const lines = super.render(contentWidth);
		if (lines.length <= 2) return [];

		const editorContent = lines.slice(1, -1);

		// Border color: green for bash, theme border otherwise
		const isBash = this.getText().startsWith("!");
		const sty = (text: string) =>
			isBash
				? (this.deps?.theme?.fg?.("success", text) ??
					`\x1b[38;5;2m${text}\x1b[0m`)
				: (this.deps?.theme?.fg?.("border", text) ?? text);

		// Arrow indicator for the first line (muted)
		const arrow =
			this.deps?.theme?.fg?.("muted", icon("promptArrow") + " ") ??
			`\x1b[2m${icon("promptArrow")} \x1b[22m`;

		const result: string[] = [];

		// Top border: ╭────╮
		result.push(sty(`╭`) + sty(`─`.repeat(borderInner)) + sty(`╮`));

		// Content lines
		for (let i = 0; i < editorContent.length; i++) {
			let line = editorContent[i]!.trimEnd();
			if (i === 0) line = arrow + line;
			const vw = visibleWidth(line);
			const pad = Math.max(0, borderInner - vw);
			result.push(sty("│ ") + line + " ".repeat(pad) + sty(" │"));
		}

		// Bottom border: ╰────╯
		result.push(sty(`╰`) + sty(`─`.repeat(borderInner)) + sty(`╯`));

		return result;
	}

	setup(
		cell: GridCellInfo,
		deps: WidgetDeps,
		provider: AutocompleteProvider,
	): void {
		this.cell = cell;
		this.deps = deps;
		this.setAutocompleteProvider(provider);
	}

	// ── Overlay management ──────────────────────────────────────────

	private showCompletionOverlay(items: AutocompleteItem[]): void {
		this.hideCompletionOverlay();
		if (items.length === 0 || !this.cell || !this.deps) return;

		const popupH = items.length;

		// Measure visible content width (prefix 2 + label + optional "  " + description)
		let maxContent = 10;
		for (const item of items) {
			let w = 2 + visibleWidth(item.label);
			if (item.description) w += 2 + visibleWidth(item.description);
			if (w > maxContent) maxContent = w;
		}
		// Add 4 for border overhead ("│ " left + " │" right)
		const popupW = Math.min(Math.max(maxContent + 4, 24), 64);

		const gridTop =
			((this.deps as unknown as Record<string, unknown>).gridTopRow as
				| number
				| undefined) ?? 0;
		const cursor = this.getCursor();
		const scrollOffset =
			(this as unknown as Record<string, unknown>)["scrollOffset"] ?? 0;
		const cursorVisibleRow = (cursor.line as number) - (scrollOffset as number);
		const cursorTerminalRow =
			gridTop + this.cell.terminalRow + cursorVisibleRow;

		// Total popup height = items + 2 border lines (top rounded + bottom rounded)
		const totalPopupH = popupH + 2;
		let popupRow = cursorTerminalRow - totalPopupH;
		if (popupRow < 0) popupRow = cursorTerminalRow + 1;

		// Popup's internal `  ` prefix aligns its text with the cursor's visual column.
		// Anchor at the cursor; don't clamp to the right — the terminal clips naturally
		// and it's better to lose the right edge than to appear far from where the user
		// is typing.
		const popupCol = this.cell.terminalCol + (cursor.col as number);
		const clampedCol = Math.max(0, popupCol);

		this.completionComponent = new CompletionOverlayComponent();
		this.completionComponent.items = items;
		this.completionComponent.selectedIdx = 0;
		this.completionComponent.width = popupW;

		// tui is the protected field from Editor
		const tuiObj = (this as unknown as Record<string, unknown>)["tui"] as TUI;
		this.completionHandle = tuiObj.showOverlay(this.completionComponent, {
			nonCapturing: true,
			row: popupRow,
			col: clampedCol,
			width: popupW,
		});
	}

	private hideCompletionOverlay(): void {
		if (this.completionHandle) {
			this.completionHandle.hide();
			this.completionHandle = null;
			this.completionComponent = null;
		}
	}
}

// ── Widget factory ──────────────────────────────────────────────────

export const customEditorWidgetFactory: WidgetFactory = (
	deps: WidgetDeps,
	config: unknown,
	cell: GridCellInfo,
) => {
	const widgetConfig = (config ?? {}) as { border?: boolean };
	const tui = deps.tui as unknown as TUI;
	const provider = deps.autocompleteProvider as
		| AutocompleteProvider
		| undefined;
	const submitFn = deps.submitFn;

	const editorTheme: EditorTheme = {
		borderColor: (str: string) => deps.theme.fg("border", str),
		selectList: {
			selectedPrefix: (str: string) => deps.theme.fg("accent", str),
			selectedText: (str: string) => deps.theme.fg("accent", str),
			description: (str: string) => deps.theme.fg("muted", str),
			scrollInfo: (str: string) => deps.theme.fg("dim", str),
			noMatch: (str: string) => deps.theme.fg("dim", str),
		},
	};

	const editor = new OverlayEditor(tui, editorTheme, {
		autocompleteMaxVisible: 20,
	});

	if (provider) editor.setup(cell, deps, provider);

	editor.borderEnabled = widgetConfig.border ?? false;

	editor.onSubmit = (text: string) => submitFn(text);

	const instance: WidgetInstance = {
		render(width: number, _height: number): string[] {
			return editor.render(width);
		},

		handleInput(data: string): boolean {
			editor.handleInput(data);
			return true;
		},

		getText(): string {
			return editor.getText();
		},

		setText(text: string): void {
			editor.setText(text);
		},

		invalidate(): void {
			editor.invalidate();
		},

		configure(_cfg: Record<string, unknown>): void {},

		addToHistory(text: string): void {
			editor.addToHistory(text);
		},
	};

	return instance;
};

registerWidget("editor", customEditorWidgetFactory);
