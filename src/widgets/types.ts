import type { GridCellInfo } from "../grid/types.ts";

/** Dependencies injected into every widget factory */
export interface WidgetDeps {
	pi: unknown; // ExtensionAPI — typed as unknown to avoid import cycle, cast at usage sites
	/** TUI instance (for requestRender, screen dimensions) */
	tui: { termWidth?: number; termHeight?: number; requestRender?: () => void };
	/** Theme foreground color helper */
	theme: {
		fg: (color: string, text: string) => string;
	};
	/** Keybinding manager for shortcut detection */
	keybindings: unknown;
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
}

/** Factory function that creates a widget instance */
export type WidgetFactory = (
	deps: WidgetDeps,
	config: unknown,
	cell: GridCellInfo,
) => WidgetInstance;
