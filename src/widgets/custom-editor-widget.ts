import {
	Editor,
	type EditorOptions,
	type EditorTheme,
	visibleWidth,
	type Component,
	type OverlayHandle,
	type TUI,
} from "@earendil-works/pi-tui";
import type {
	AutocompleteItem,
	AutocompleteProvider,
} from "@earendil-works/pi-tui";
import { registerWidget } from "./registry.ts";
import type { WidgetDeps, WidgetFactory, WidgetInstance } from "./types.ts";
import type { GridCellInfo } from "../grid/types.ts";

// ── ANSI theme ──────────────────────────────────────────────────────

const BG_DARK = "\x1b[48;2;35;37;44m";
const BG_SEL = "\x1b[48;2;55;58;68m";
const BG_RESET = "\x1b[49m";
const FG_RESET = "\x1b[0m";

// ── Completion overlay component ────────────────────────────────────

class CompletionOverlayComponent implements Component {
	items: AutocompleteItem[] = [];
	selectedIdx = 0;
	width = 40;

	render(_width: number): string[] {
		if (this.items.length === 0) return [];

		const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;
		const bright = (s: string) => `\x1b[1m${s}\x1b[22m`;

		const lines: string[] = [];
		for (let i = 0; i < this.items.length; i++) {
			const item = this.items[i]!;
			const isSel = i === this.selectedIdx;
			const bg = isSel ? BG_SEL : BG_DARK;
			let row = `  ${isSel ? bright(item.label) : dim(item.label)}`;
			if (item.description) row += dim(`  ${item.description}`);
			const vw = visibleWidth(row);
			const pad = this.width - vw;
			if (pad > 0) row += " ".repeat(pad);
			lines.push(`${bg}${row}${BG_RESET}${FG_RESET}`);
		}
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
		handleInput: () => {},
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

		let maxLabel = 10;
		for (const item of items) {
			let w = item.label.length + 2;
			if (item.description) w += item.description.length + 4;
			if (w > maxLabel) maxLabel = w;
		}
		const popupW = Math.min(Math.max(maxLabel, 20), 60);

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

		let popupRow = cursorTerminalRow - popupH;
		if (popupRow < 0) popupRow = cursorTerminalRow + 1;

		// Column: cursor column + 2 for "> " prefix
		const popupCol = this.cell.terminalCol + (cursor.col as number) + 2;
		const termWidth = this.deps.tui.termWidth ?? 80;
		const clampedCol = Math.min(popupCol, Math.max(0, termWidth - popupW));

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
	_config: unknown,
	cell: GridCellInfo,
) => {
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
		autocompleteMaxVisible: 6,
	});

	if (provider) editor.setup(cell, deps, provider);

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
	};

	return instance;
};

registerWidget("editor", customEditorWidgetFactory);
