import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { GridComponent } from "./grid/grid-component.ts";
import { DEFAULT_GRID } from "./default-config.ts";
import type { GridConfig } from "./grid/types.ts";

// Side-effect imports: register built-in widgets
import "./widgets/editor-widget.ts";
import "./widgets/custom-editor-widget.ts";
import "./widgets/status-bar-widget.ts";
import "./widgets/lens-widget.ts";
import "./widgets/prompt-bar-widget.ts";

import { CompletionEngine } from "./completion/completion-engine.ts";
import type { WidgetDeps } from "./widgets/types.ts";

export default function (pi: ExtensionAPI) {
	let grid: GridComponent | null = null;
	let completionEngine: CompletionEngine | null = null;
	let activeGridConfig: GridConfig = DEFAULT_GRID;

	// --- Grid config API ---
	(pi as unknown as Record<string, unknown>).setGridConfig = (
		config: GridConfig,
	) => {
		activeGridConfig = config;
		grid?.setConfig(config);
	};
	(pi as unknown as Record<string, unknown>).getGridConfig = (): GridConfig => {
		return activeGridConfig;
	};

	// Load user config from settings (if any)
	try {
		const getSettings = (
			pi as unknown as { getSettings?: () => Record<string, unknown> }
		).getSettings;
		const settings = getSettings?.();
		if (settings?.["pi-zazz"] && typeof settings["pi-zazz"] === "object") {
			const zazzCfg = settings["pi-zazz"] as Record<string, unknown>;
			if (zazzCfg["grid"]) {
				activeGridConfig = {
					...DEFAULT_GRID,
					...(zazzCfg["grid"] as Partial<GridConfig>),
				} as GridConfig;
			}
		}
	} catch {
		// Settings may not be available; use defaults
	}

	// --- Session lifecycle ---
	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;

		// Hide built-in working indicator and footer
		try {
			ctx.ui.setWorkingVisible?.(false);
			ctx.ui.setFooter?.(
				() => ({ render: () => [], invalidate: () => {} }) as never,
			);
		} catch {
			// Non-critical
		}

		const deps: Record<string, unknown> = {
			pi: pi as unknown,
			tui: ctx.ui as never,
			theme: ctx.ui.theme as { fg: (c: string, t: string) => string },
			keybindings: undefined,
			completionEngine: undefined,
			autocompleteProvider: undefined,
			gridRef: undefined,
		};

		// Capture the existing autocomplete provider chain from pi
		ctx.ui.addAutocompleteProvider?.((current) => {
			deps.autocompleteProvider = current;
			return {
						getSuggestions: (lines, line, col, opts) => current.getSuggestions(lines, line, col, opts),
						applyCompletion: (lines, line, col, item, prefix) => current.applyCompletion(lines, line, col, item, prefix),
			};
		});

		completionEngine = new CompletionEngine((component, opts) => {
			const handle = (
				ctx.ui as unknown as {
					custom: (comp: unknown, o: unknown) => { close?: () => void };
				}
			).custom(component, opts);
			return { close: () => handle.close?.() };
		});
		deps.completionEngine = completionEngine;

		// Replace editor — construct GridComponent inside the factory so it receives
		// the real keybindings from pi (required by CustomEditor.handleInput).
		ctx.ui.setEditorComponent?.((tui, theme, keybindings) => {
			const widgetDeps = { ...deps, keybindings } as unknown as WidgetDeps;
			grid = new GridComponent(tui, theme, keybindings, widgetDeps, activeGridConfig);
			// Inject gridRef so the editor widget can sync text on submit
			deps.gridRef = grid;
			return grid;
		});

		ctx.ui.notify("pi-zazz loaded ✨", "info");
	});

	// --- Event wiring for reactive updates ---
	pi.on("model_select", () => grid?.invalidate());
	pi.on("thinking_level_select", () => grid?.invalidate());
	pi.on("turn_start", () => grid?.invalidate());
	pi.on("turn_end", () => grid?.invalidate());
	pi.on("agent_start", () => grid?.invalidate());
	pi.on("agent_end", () => grid?.invalidate());

	pi.on("session_shutdown", () => {
		completionEngine?.dismiss();
		grid = null;
		completionEngine = null;
	});
}
