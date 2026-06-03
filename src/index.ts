import {
	CustomEditor,
	type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { GridComponent } from "./grid/grid-component.ts";
import { DEFAULT_GRID } from "./default-config.ts";
import type { GridConfig } from "./grid/types.ts";

// Side-effect imports: register built-in widgets
import "./widgets/custom-editor-widget.ts";
import "./widgets/status-bar-widget.ts";
import "./widgets/lens-widget.ts";
import "./widgets/prompt-bar-widget.ts";

/**
 * Reserves vertical space equal to the grid height in pi's normal TUI layout.
 * This pushes messages up so the overlay's grid never crops them.
 * Updated by the overlay on each render.
 */
let reservedEditorHeight = 0;

/**
 * StubEditor replaces the built-in editor, rendering nothing visually
 * but reserving exactly `reservedEditorHeight` blank lines.
 * This ensures pi's message area stops above the overlay's grid area.
 */
class StubEditor extends CustomEditor {
	override render(_width: number): string[] {
		return new Array(reservedEditorHeight).fill("");
	}

	override handleInput(_data: string): void {
		// All input is captured by the overlay
	}

	override getText(): string {
		return "";
	}
}

export default function (pi: ExtensionAPI) {
	let activeGridConfig: GridConfig = DEFAULT_GRID;

	// --- Grid config API ---
	(pi as unknown as Record<string, unknown>).setGridConfig = (
		config: GridConfig,
	) => {
		activeGridConfig = config;
		requestRenderFn?.();
	};
	(pi as unknown as Record<string, unknown>).getGridConfig = (): GridConfig =>
		activeGridConfig;

	// Load user config from settings
	try {
		const getSettings = (
			pi as unknown as { getSettings?: () => Record<string, unknown> }
		).getSettings;
		const settings = getSettings?.();
		const piZazz = settings?.["pi-zazz"] as Record<string, unknown> | undefined;
		if (piZazz?.["grid"]) {
			activeGridConfig = {
				...DEFAULT_GRID,
				...(piZazz["grid"] as Partial<GridConfig>),
			} as GridConfig;
		}
	} catch {
		/* use defaults */
	}

	let requestRenderFn: (() => void) | null = null;

	// --- Session lifecycle ---
	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;

		// Hide built-in UI — our overlay replaces everything below the message area
		try {
			ctx.ui.setWorkingVisible?.(false);
			ctx.ui.setFooter?.(
				() => ({ render: () => [], invalidate: () => {} }) as never,
			);
			// Replace the built-in editor with a stub that reserves space
			// equal to the grid height. The overlay updates reservedEditorHeight
			// each render so messages stop exactly above the grid.
			ctx.ui.setEditorComponent?.(
				(tui, theme, kb) => new StubEditor(tui, theme, kb),
			);
		} catch {
			/* non-critical */
		}

		// Capture autocomplete provider chain
		let autocompleteProvider: unknown = null;
		ctx.ui.addAutocompleteProvider?.((current) => {
			autocompleteProvider = current;
			return current;
		});

		// Open persistent full-window overlay
		const ui = ctx.ui as unknown as {
			custom: (
				factory: (
					tui: unknown,
					theme: unknown,
					kb: unknown,
					close: (r: unknown) => void,
				) => unknown,
				opts: { overlay: boolean; overlayOptions?: Record<string, unknown> },
			) => Promise<unknown>;
		};

		// We never call close() — the overlay stays for the entire session
		void ui.custom(
			(tui, theme, keybindings, _close) => {
				// Build widget deps
				const deps: Record<string, unknown> = {
					pi: pi as unknown,
					tui: tui as unknown,
					theme: theme as { fg: (c: string, t: string) => string },
					keybindings: keybindings as unknown,
					autocompleteProvider,
					submitFn: (text: string) => pi.sendUserMessage(text),
				};

				const grid = new GridComponent(
					tui as never,
					theme as never,
					keybindings as never,
					deps as never,
					activeGridConfig,
				);

				requestRenderFn = () =>
					(tui as { requestRender?: () => void }).requestRender?.();

				const updateReservedHeight = (h: number) => {
					if (h !== reservedEditorHeight) {
						reservedEditorHeight = h;
						requestRenderFn?.();
					}
				};

				// Initial height estimate from the default layout so the
				// stub editor reserves space even before the first render.
				const estimatedLines = grid.render(80);
				updateReservedHeight(estimatedLines.length);

				return {
					render: (width: number): string[] => {
						const gridLines = grid.render(width);
						updateReservedHeight(gridLines.length);
						// Return only the grid lines. The overlay naturally
						// covers just the bottom gridLines.length rows.
						// Messages above are pi's normal TUI output — not
						// overlay-composited at all, so nothing covers them.
						return gridLines;
					},

					handleInput: (data: string): void => {
						grid.handleInput(data);
					},

					invalidate: (): void => {
						grid.invalidate();
					},
				};
			},
			{
				overlay: true,
				overlayOptions: {
					anchor: "bottom-left",
					width: "100%",
					height: "100%",
				},
			},
		);
	});

	// --- Event wiring for reactive updates ---
	pi.on("model_select", () => requestRenderFn?.());
	pi.on("thinking_level_select", () => requestRenderFn?.());
	pi.on("turn_start", () => requestRenderFn?.());
	pi.on("turn_end", () => requestRenderFn?.());
	pi.on("agent_start", () => requestRenderFn?.());
	pi.on("agent_end", () => requestRenderFn?.());
}
