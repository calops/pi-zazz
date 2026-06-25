import {
	Editor,
	type EditorOptions,
	type EditorTheme,
	visibleWidth,
	getKeybindings,
	type Component,
	type OverlayHandle,
	type TUI,
} from "@earendil-works/pi-tui";
import * as ansi from "../color/ansi.ts";
import * as palette from "../color/palette.ts";
import type {
	AutocompleteItem,
	AutocompleteProvider,
} from "@earendil-works/pi-tui";
import { getFileIcon } from "../completion/file-icons.ts";
import { icon } from "../icons.ts";
import { registerWidget } from "./registry.ts";
import type { WidgetDeps, WidgetFactory, WidgetInstance } from "./types.ts";
import type { GridCellInfo } from "../grid/types.ts";
import type { CompletionCategory } from "../completion/categories.ts";
import {
	computeItemCategories,
	categoryColorName,
} from "../completion/categories.ts";
import {
	type Column,
	type ColumnLayout,
	computeLayout,
	renderRow,
	measureDescriptionWidth,
	selectionColumn,
	iconColumn,
	labelColumn,
	descriptionColumn,
	cleanDescription,
} from "../completion/columns.ts";

// ── Completion overlay component ────────────────────────────────────

class CompletionOverlayComponent implements Component {
	items: AutocompleteItem[] = [];
	selectedIdx = 0;
	width = 40;
	/** Per-item category for the icon column */
	categories: CompletionCategory[] = [];

	/** The column definitions (set once by showCompletionOverlay) */
	columns: Column[] = [];
	/** The column layout (recomputed on every render) */
	layout: ColumnLayout[] = [];

	render(_width: number): string[] {
		if (this.items.length === 0) return [];

		const actualWidth = _width > 0 ? _width : this.width;
		const dim = (s: string) => `${ansi.DIM}${s}${ansi.NO_BOLD_DIM}`;

		// Recompute layout from columns + items + available width
		const innerWidth = actualWidth - 4; // │ (content) │
		this.layout = computeLayout(this.columns, this.items, innerWidth);

		const lines: string[] = [];

		// Top rounded border
		lines.push(dim(`╭${`─`.repeat(Math.max(0, actualWidth - 2))}╮`));

		for (let i = 0; i < this.items.length; i++) {
			const item = this.items[i]!;
			const ctx = {
				category: this.categories[i] ?? ("builtin" as CompletionCategory),
				isSelected: i === this.selectedIdx,
			};
			const content = renderRow(this.columns, this.layout, item, ctx);
			const pad = Math.max(0, innerWidth - visibleWidth(content));
			lines.push(dim("│ ") + content + " ".repeat(pad) + dim(" │"));
		}

		// Bottom rounded border
		lines.push(dim(`╰${`─`.repeat(Math.max(0, actualWidth - 2))}╯`));

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

		const self = this as unknown as Record<string, unknown>;
		const origClear = self["clearAutocompleteUi"] as () => void;

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

			this.showCompletionOverlay(visible, _prefix);
			return stub;
		};

		self["clearAutocompleteUi"] = () => {
			origClear.call(this);
			this.hideCompletionOverlay();
		};

		self["isShowingAutocomplete"] = () => this.completionHandle !== null;
	}

	override render(width: number): string[] {
		if (!this.borderEnabled) {
			const arrowW = 2;
			const contentWidth = Math.max(1, width - arrowW);

			const lines = super.render(contentWidth);
			if (lines.length <= 2) return [];

			const content = lines.slice(1, -1);

			if (content.length > 0 && content[0]) {
				const arrow =
					this.deps?.theme?.fg?.("muted", icon("promptArrow")) ??
					`${ansi.DIM}${icon("promptArrow")} ${ansi.NO_BOLD_DIM}`;
				content[0] = arrow + content[0];
			}

			return content;
		}

		const borderInner = Math.max(1, width - 4);
		const contentWidth = Math.max(1, width - 6);

		const lines = super.render(contentWidth);
		if (lines.length <= 2) return [];

		const editorContent = lines.slice(1, -1);

		const isBash = this.getText().startsWith("!");
		const sty = (text: string) =>
			isBash
				? (this.deps?.theme?.fg?.("success", text) ??
					`${ansi.fgSeq(...palette.getRgb("success"))}${text}${ansi.RESET}`)
				: (this.deps?.theme?.fg?.("border", text) ?? text);

		const arrow =
			this.deps?.theme?.fg?.("muted", icon("promptArrow") + " ") ??
			`${ansi.DIM}${icon("promptArrow")} ${ansi.NO_BOLD_DIM}`;

		const result: string[] = [];

		result.push(sty(`╭`) + sty(`─`.repeat(borderInner)) + sty(`╮`));

		for (let i = 0; i < editorContent.length; i++) {
			let line = editorContent[i]!.trimEnd();
			if (i === 0) line = arrow + line;
			const vw = visibleWidth(line);
			const pad = Math.max(0, borderInner - vw);
			result.push(sty("│ ") + line + " ".repeat(pad) + sty(" │"));
		}

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

	private showCompletionOverlay(items: AutocompleteItem[], prefix = ""): void {
		this.hideCompletionOverlay();
		if (items.length === 0 || !this.cell || !this.deps) return;

		const popupH = items.length;

		// Determine category for each item
		const categories = computeItemCategories(items, prefix);

		// Strip redundant prefixes from labels (e.g. "skill:" when icon shows it)
		items = items.map((item, i) => {
			if (categories[i] === "skill" && item.label.startsWith("skill:")) {
				return { ...item, label: item.label.slice(6) };
			}
			return item;
		});

		// Build colour helpers from theme
		const colorFn = (cat: CompletionCategory, text: string) =>
			this.deps!.theme.fg(categoryColorName(cat), text);
		const dim = (s: string) => `${ansi.DIM}${s}${ansi.NO_BOLD_DIM}`;
		const sourceTagStyle = (tag: string) => {
			if (tag === "custom") return dim(this.deps!.theme.fg("success", tag));
			if (tag === "builtin") return dim(this.deps!.theme.fg("warning", tag));
			return dim(this.deps!.theme.fg("accent", tag));
		};

		// Pre-clean descriptions at setup time: extract source tag + rest
		// and store them on the item so the render path always has access
		// to clean data regardless of how cleanDescription is called.
		items = items.map((item) => {
			if (!item.description) return item;
			let { tag, rest } = cleanDescription(item.description);
			// Map single-letter scope to "custom" for local extensions
			if (tag === "u") tag = "custom";
			// Show a "builtin" label only for slash commands, not @ completions
			if (tag === null && prefix.startsWith("/")) tag = "builtin";
			return {
				...item,
				_cleanTag: tag,
				_cleanRest: rest,
			};
		});

		// Pre-compute file-type-specific Nerd Font icons for @ completions
		// Uses lsd's comprehensive extension mapping, falls back to Seti
		items = items.map((item, i) => {
			const cat = categories[i];
			if (cat !== "file" && cat !== "directory") return item;
			try {
				const ext = item.label.includes(".")
					? item.label.split(".").pop()!
					: "";
				const fileIcon = ext ? getFileIcon(ext) : null;
				if (fileIcon) {
					const hex = fileIcon.color;
					const r = Number.parseInt(hex.slice(1, 3), 16);
					const g = Number.parseInt(hex.slice(3, 5), 16);
					const b = Number.parseInt(hex.slice(5, 7), 16);
					const styled = `${ansi.fgSeq(r, g, b)}${fileIcon.icon}${ansi.DEFAULT_FG}`;
					return { ...item, _nerdIcon: styled };
				}
			} catch {
				/* fall back to generic file/dir icon */
			}
			return item;
		});

		// Build column definitions with env
		const colEnv = { colorFn, sourceTagStyle };
		const columns: Column[] = [
			selectionColumn(),
			iconColumn(colEnv),
			labelColumn(),
			descriptionColumn(colEnv),
		];

		// Compute ideal inner width: fixed column widths + max cleaned description
		const fixedW = columns
			.slice(0, -1)
			.reduce((sum, col) => sum + col.measure(items), 0);
		const descW = measureDescriptionWidth(items);
		const idealInner = fixedW + descW;

		// Read terminal width and cap at 90%
		const tuiTerm = (this as unknown as Record<string, unknown>)["tui"] as
			| { terminal?: { columns?: number } }
			| undefined;
		const termWidth = tuiTerm?.terminal?.columns ?? 80;
		const maxInner = Math.floor(termWidth * 0.9) - 4;

		// Popup inner width: prefer ideal, cap at 90% terminal, floor at minimum
		const popupInner = Math.max(20, Math.min(idealInner, maxInner));
		const popupW = popupInner + 4;

		// Compute popup height and position
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

		const totalPopupH = popupH + 2; // items + 2 border lines
		let popupRow = cursorTerminalRow - totalPopupH;
		if (popupRow < 0) popupRow = cursorTerminalRow + 1;

		const popupCol = this.cell.terminalCol + (cursor.col as number);
		const maxCol = Math.max(0, termWidth - popupW);
		const clampedCol = Math.min(Math.max(0, popupCol), maxCol);

		// Build component
		const comp = new CompletionOverlayComponent();
		comp.categories = categories;
		comp.items = items;
		comp.selectedIdx = 0;
		comp.width = popupW;
		comp.columns = columns;
		this.completionComponent = comp;

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
