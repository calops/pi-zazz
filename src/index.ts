import {
	CustomEditor,
	type ExtensionAPI,
	type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import {
	Container,
	type OverlayHandle,
	type Component,
	type TUI,
	visibleWidth,
} from "@earendil-works/pi-tui";
import { GridComponent } from "./grid/grid-component.ts";
import { MouseManager } from "./mouse/mouse-manager.ts";
import { DEFAULT_GRID } from "./default-config.ts";
import type { GridConfig } from "./grid/types.ts";
import { initializePalette } from "./terminal-palette.ts";

// Side-effect imports: register built-in widgets
import "./widgets/custom-editor-widget.ts";
import "./widgets/status-bar-widget.ts";
import "./widgets/extensions-host-widget.ts";
import "./widgets/prompt-bar-widget.ts";

// Generic widget capturer: intercepts all setWidget() calls so extension
// UI renders inside the grid instead of pi's built-in TUI.
import {
	capture,
	captureLines,
	release,
	setContext,
} from "./widget-capturer.ts";

// Captured by setFooter callback for reading extension statuses.
// Lazy: populated during TUI render (first callback invocation).
let footerDataRef: {
	getExtensionStatuses(): ReadonlyMap<string, string>;
} | null = null;

/**
 * Reserves vertical space equal to the grid height in pi's normal TUI layout.
 * This pushes messages up so the overlay's grid never crops them.
 * Updated by the overlay on each render.
 */
let reservedEditorHeight = 0;

/**
 * Bridge between the StubEditor (pi's focused component) and the grid's editor
 * widget. The overlay is non-capturing so input flows to the StubEditor, which
 * forwards text operations to the widget and dispatches app keybindings.
 */
const editorBridge: {
	handleInput: ((data: string) => boolean) | null;
	onSubmit: ((text: string) => void) | null;
	getText: () => string;
	setText: (text: string) => void;
	addToHistory: ((text: string) => void) | null;
} = {
	handleInput: null,
	onSubmit: null,
	getText: () => "",
	setText: () => {},
	addToHistory: null,
};

/** Holds a reference to the StubEditor so editorBridge can reach its onSubmit. */
let stubEditorRef: StubEditor | null = null;

/**
 * StubEditor replaces the built-in editor, rendering nothing visually
 * but reserving exactly `reservedEditorHeight` blank lines.
 * This ensures pi's message area stops above the overlay's grid area.
 *
 * The overlay is non-capturing, so keyboard input flows to this editor.
 * Text operations are forwarded to the grid's editor widget via editorBridge,
 * and app-level keybindings (C-c, C-p, C-o, escape, etc.) are dispatched
 * by this class (which extends CustomEditor and inherits its actionHandlers).
 */
class StubEditor extends CustomEditor {
	private _keybindings: KeybindingsManager;

	constructor(
		tui: ConstructorParameters<typeof CustomEditor>[0],
		theme: ConstructorParameters<typeof CustomEditor>[1],
		keybindings: KeybindingsManager,
		options?: ConstructorParameters<typeof CustomEditor>[3],
	) {
		super(tui, theme, keybindings, options);
		this._keybindings = keybindings;
	}

	override render(_width: number): string[] {
		return new Array(reservedEditorHeight).fill("");
	}

	override handleInput(data: string): void {
		// Forward text input to the grid editor widget
		editorBridge.handleInput?.(data);

		// Dispatch app-level keybindings (same logic as CustomEditor.handleInput
		// but without the fallthrough to Editor.handleInput for text processing,
		// which is handled by the grid widget).
		if (this.onExtensionShortcut?.(data)) return;
		if (this._keybindings?.matches(data, "app.clipboard.pasteImage")) {
			this.onPasteImage?.();
			return;
		}
		if (this._keybindings?.matches(data, "app.interrupt")) {
			if (!this.isShowingAutocomplete()) {
				const handler =
					this.onEscape ?? this.actionHandlers.get("app.interrupt");
				handler?.();
				return;
			}
			// Let Editor.handleInput cancel autocomplete
			super.handleInput(data);
			return;
		}
		if (this._keybindings?.matches(data, "app.exit")) {
			if (editorBridge.getText().length === 0) {
				const handler = this.onCtrlD ?? this.actionHandlers.get("app.exit");
				handler?.();
				return;
			}
			return;
		}
		for (const [action, handler] of this.actionHandlers) {
			if (
				action !== "app.interrupt" &&
				action !== "app.exit" &&
				this._keybindings?.matches(data, action)
			) {
				handler();
				return;
			}
		}
		// Non-printable editor keys that don't match any editor binding
		// fall through silently — the widget's handleInput already ran.
	}

	override getText(): string {
		return editorBridge.getText();
	}

	override setText(text: string): void {
		editorBridge.setText(text);
	}

	override addToHistory(text: string): void {
		editorBridge.addToHistory?.(text);
	}
}

/**
 * Wraps a component in a rounded border box (╭─╮/╰─╯) and strips the
 * built-in DynamicBorder top/bottom lines from the inner component.
 * Used for floating selector/dialog overlays.
 */
class RoundedBorderWrapper implements Component {
	private child: Component;

	constructor(child: Component) {
		this.child = child;
	}

	render(width: number): string[] {
		const innerWidth = Math.max(1, width - 2);
		const inner = this.child.render(innerWidth);

		// Strip the built-in DynamicBorder top/bottom lines (first & last).
		// All built-in selectors/dialogs follow this pattern.
		const body =
			inner.length > 2 ? inner.slice(1, -1) : inner.length === 1 ? [] : [];

		const top = "╭" + "─".repeat(Math.max(0, width - 2)) + "╮";
		const bottom = "╰" + "─".repeat(Math.max(0, width - 2)) + "╯";

		const bordered = body.map((line) => {
			const vw = visibleWidth(line);
			if (vw <= innerWidth) {
				return "│" + line + " ".repeat(innerWidth - vw) + "│";
			}
			return "│" + line + "│";
		});

		return [top, ...bordered, bottom];
	}

	handleInput(data: string): void {
		this.child.handleInput?.(data);
	}

	invalidate(): void {
		this.child.invalidate();
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

		// Query terminal color palette before building the overlay
		// (falls back to hardcoded values if the terminal doesn't support OSC 4)
		await initializePalette();

		// Hide built-in UI — our overlay replaces everything below the message area
		try {
			// Capture extension statuses from the footer data provider. The factory
			// runs once during the first TUI render cycle, populating footerDataRef.
			ctx.ui.setFooter?.((_tui, _theme, footerData) => {
				footerDataRef = footerData as {
					getExtensionStatuses(): ReadonlyMap<string, string>;
				};
				return { render: () => [], invalidate: () => {} };
			});
			// Replace the built-in editor with a stub that reserves space
			// equal to the grid height. The overlay updates reservedEditorHeight
			// each render so messages stop exactly above the grid.
			ctx.ui.setEditorComponent?.((tui, theme, kb) => {
				stubEditorRef = new StubEditor(tui, theme, kb);
				return stubEditorRef;
			});
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
			(tui, theme, keybindings, close) => {
				// Provide TUI/Theme to the widget capturer so it can lazily
				// create captured widget components when they're first rendered.
				setContext(tui as never, theme as never);

				// Build widget deps
				const deps: Record<string, unknown> = {
					pi: pi as unknown,
					tui: tui as unknown,
					theme: theme as { fg: (c: string, t: string) => string },
					keybindings: keybindings as unknown,
					autocompleteProvider,
					ctx: ctx as unknown,
					// Route through StubEditor.onSubmit (which is pi's defaultEditor.onSubmit)
					// so slash commands (/model, /settings, etc.) are processed before sending.
					submitFn: (text: string) =>
						stubEditorRef?.onSubmit?.(text) ?? pi.sendUserMessage(text),
				};
				// Lazy getter — footerDataRef is populated by the setFooter callback
				// during the first TUI render cycle, after the factory below runs.
				Object.defineProperty(deps, "footerData", {
					get: () => footerDataRef,
					enumerable: true,
				});

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

				// Wire the bridge so StubEditor can forward to the grid's widget
				editorBridge.handleInput = (data) => grid.handleInput(data);
				editorBridge.getText = () => grid.getText();
				editorBridge.setText = (text) => grid.setText(text);
				editorBridge.addToHistory = (text) => grid.addToHistory(text);
				// Forward submit through StubEditor so slash commands (/model, /settings,
				// etc.) are processed by pi's command handler before sending the message.
				editorBridge.onSubmit = (text) => stubEditorRef?.onSubmit?.(text);

				// Initial height estimate from the default layout so the
				// stub editor reserves space even before the first render.
				const estimatedLines = grid.render(80);
				updateReservedHeight(estimatedLines.length);

				// ── Intercept inline selectors/dialogs and show them as TUI ──
				// overlays above the grid. All selectors (/model, /settings, etc.)
				// render by clearing editorContainer and addChild-ing the component.
				// We patch those methods on the specific Container instance so captured
				// selectors appear centered on top of everything via tui.showOverlay().
				const tu = tui as unknown as TUI;

				// ── Mouse support ──────────────────────────────────────────────
				const mouseManager = new MouseManager(
					{ write: (data: string) => process.stdout.write(data) },
					grid,
				);
				const disableMouse = mouseManager.enable();
				const removeMouseListener = tu.addInputListener(
					mouseManager.getInputListener(),
				);

				// Wrap close to disable mouse tracking on overlay removal
				const origClose = close;
				close = (result?: unknown) => {
					disableMouse();
					removeMouseListener();
					origClose?.(result);
				};

				const editorContainer = tu.children.find(
					(c): c is Container =>
						c instanceof Container && c.children.includes(stubEditorRef!),
				);
				if (editorContainer) {
					let selectorOverlayHandle: OverlayHandle | null = null;

					const origAddChild = editorContainer.addChild.bind(editorContainer);
					editorContainer.addChild = (component: Component) => {
						// Only forward the editor to the inline container — all other
						// components (selectors, dialogs, inputs) are shown as TUI overlay
						// exclusively, so the inline editor container stays empty during
						// their lifetime and no duplicate rendering occurs.
						if (component === stubEditorRef) {
							origAddChild(component);
							return;
						}
						selectorOverlayHandle?.hide();
						selectorOverlayHandle = tu.showOverlay(
							new RoundedBorderWrapper(component),
							{
								anchor: "center",
								nonCapturing: false,
								width: "80%",
								maxHeight: "60%",
								margin: { top: 1, bottom: 1, left: 2, right: 2 },
							},
						);
					};

					const origClear = editorContainer.clear.bind(editorContainer);
					editorContainer.clear = () => {
						selectorOverlayHandle?.hide();
						selectorOverlayHandle = null;
						origClear();
					};
				}

				return {
					render: (width: number): string[] => {
						const gridLines = grid.render(width);
						updateReservedHeight(gridLines.length);
						// Toggle mouse button capture: only capture when a
						// scrollable cell has overflow, otherwise let scroll
						// events pass through to the terminal natively.
						mouseManager.setButtonTracking(grid.hasScrollableOverflow());
						// Return only the grid lines. The overlay naturally
						// covers just the bottom gridLines.length rows.
						// Messages above are pi's normal TUI output — not
						// overlay-composited at all, so nothing covers them.
						return gridLines;
					},

					// Non-capturing overlay: keyboard input flows to the StubEditor
					// (pi's focused component), which dispatches it via editorBridge.
					handleInput: (_data: string): void => {
						// Input is handled by the StubEditor; nothing to do here.
					},

					invalidate: (): void => {
						grid.invalidate();
					},
				};
			},
			{
				overlay: true,
				overlayOptions: {
					nonCapturing: true,
					anchor: "bottom-left",
					width: "100%",
					height: "100%",
				},
			},
		);
		// Intercept ALL setWidget calls generically: capture the factories
		// for rendering in the grid's extensions-host widget instead of
		// displaying them in pi's built-in TUI.
		{
			const plUi = ctx.ui as unknown as {
				setWidget?: (
					key: string,
					content:
						| undefined
						| string[]
						| ((tui: unknown, theme: unknown) => unknown),
					doptions?: { placement?: string },
				) => void;
			};
			const origSetWidget = plUi.setWidget?.bind(plUi);
			if (origSetWidget) {
				plUi.setWidget = (key, content) => {
					if (content === undefined || content === null) {
						release(key);
					} else if (typeof content === "function") {
						capture(key, content as never);
					} else if (Array.isArray(content)) {
						captureLines(key, content);
					}
					// Don't call origSetWidget — all extension widgets render
					// through the grid's extensions-host.
				};
			}
		}
	});

	// --- Event wiring for reactive updates ---
	pi.on("model_select", () => requestRenderFn?.());
	pi.on("thinking_level_select", () => requestRenderFn?.());
	pi.on("turn_start", () => requestRenderFn?.());
	pi.on("turn_end", () => requestRenderFn?.());
	pi.on("agent_start", () => requestRenderFn?.());
	pi.on("agent_end", () => requestRenderFn?.());
}
