import type { GridCellInfo } from "../grid/types.ts";

/** Dependencies injected into every widget factory */
export interface WidgetDeps {
	pi: unknown;
	ctx: unknown;
	tui: { termWidth?: number; termHeight?: number; requestRender?: () => void };
	theme: {
		fg: (color: string, text: string) => string;
	};
	keybindings: unknown;
	/** Function to submit editor text (wired to pi's message submission) */
	submitFn: (text: string) => void;
	/** Autocomplete provider chain, captured from pi at startup */
	autocompleteProvider?: unknown;

	/** Reference to the grid for coordinate-based hit-testing and scroll routing */
	gridRef?: {
		hitTest(row: number, col: number): string | null;
		scrollCell(cellId: string, direction: number): void;
		cellBounds: Map<
			string,
			{
				rowStart: number;
				rowEnd: number;
				colStart: number;
				colEnd: number;
				scrollable: boolean;
			}
		>;
	};

	/**
	 * Extension statuses captured from pi's footer data provider.
	 * Provides read-only access to statuses set via ctx.ui.setStatus()
	 * by other extensions (MCP status, LSP status, etc.).
	 * Available after first TUI render cycle.
	 */
	footerData?: {
		getExtensionStatuses(): ReadonlyMap<string, string>;
	};
}

/** Interface every widget must implement */
export interface WidgetInstance {
	/**
	 * Render the widget's content.
	 * @param width - Available character columns
	 * @param height - Available character rows
	 * @returns Array of lines, each ≤ width. Can return fewer lines than height.
	 */
	render(width: number, height: number): string[];

	/**
	 * Handle keyboard input when this widget has focus.
	 * Return true if the input was consumed (prevents bubbling).
	 */
	handleInput?(data: string): boolean;

	/** Clear cached render state. Called on theme changes or data updates. */
	invalidate(): void;

	/** Optional height negotiation. Defaults to { min: 1 }. */
	heightConstraint?(): { min: number; max?: number };

	/** Called after construction with the widget's config from JSON. */
	configure?(config: Record<string, unknown>): void;

	/** Whether this widget wants key release events (Kitty protocol). */
	wantsKeyRelease?: boolean;

	/**
	 * Get the current text content (for editor widgets).
	 * Returns the full text as a single string.
	 */
	getText?(): string;

	/**
	 * Set the text content (for editor widgets).
	 * Replaces the current buffer and resets cursor to end.
	 */
	setText?(text: string): void;

	/**
	 * Add a prompt to the editor's input history (for up/down arrow navigation).
	 * Called by pi after successful submission.
	 */
	addToHistory?(text: string): void;

	/**
	 * Scroll the widget content by `delta` lines.
	 * Positive = scroll down (content moves up), negative = scroll up.
	 * No-op for non-scrollable widgets.
	 */
	scrollBy?(delta: number): void;

	/**
	 * Current scroll offset in lines from the top. 0 = top.
	 */
	getScrollOffset?(): number;

	/**
	 * Total content lines this widget would render if unbounded.
	 * Used by the grid to determine overflow and position the scrollbar.
	 * Returns 0 if unknown or no overflow.
	 */
	getContentHeight?(): number;
}

/** Factory function that creates a widget instance */
export type WidgetFactory = (
	deps: WidgetDeps,
	config: unknown,
	cell: GridCellInfo,
) => WidgetInstance;
