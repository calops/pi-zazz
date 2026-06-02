import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { GridComponent } from "./grid/grid-component.ts";
import { DEFAULT_GRID } from "./default-config.ts";
import type { GridConfig } from "./grid/types.ts";

// Side-effect imports: register built-in widgets
import "./widgets/custom-editor-widget.ts";
import "./widgets/status-bar-widget.ts";
import "./widgets/lens-widget.ts";
import "./widgets/prompt-bar-widget.ts";

export default function (pi: ExtensionAPI) {
  let activeGridConfig: GridConfig = DEFAULT_GRID;

  // --- Grid config API ---
  (pi as unknown as Record<string, unknown>).setGridConfig = (config: GridConfig) => {
    activeGridConfig = config;
    requestRenderFn?.();
  };
  (pi as unknown as Record<string, unknown>).getGridConfig = (): GridConfig => activeGridConfig;

  // Load user config from settings
  try {
    const getSettings = (pi as unknown as { getSettings?: () => Record<string, unknown> }).getSettings;
    const settings = getSettings?.();
    const piZazz = settings?.["pi-zazz"] as Record<string, unknown> | undefined;
    if (piZazz?.["grid"]) {
      activeGridConfig = { ...DEFAULT_GRID, ...(piZazz["grid"] as Partial<GridConfig>) } as GridConfig;
    }
  } catch { /* use defaults */ }

  let requestRenderFn: (() => void) | null = null;

  // --- Session lifecycle ---
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    // Hide built-in UI — our overlay replaces everything below the message area
    try {
      ctx.ui.setWorkingVisible?.(false);
      ctx.ui.setFooter?.(() => ({ render: () => [], invalidate: () => {} }) as never);
    } catch { /* non-critical */ }

    // Capture autocomplete provider chain
    let autocompleteProvider: unknown = null;
    ctx.ui.addAutocompleteProvider?.((current) => {
      autocompleteProvider = current;
      return current;
    });

    // Open persistent full-window overlay
    const ui = ctx.ui as unknown as {
      custom: (
        factory: (tui: unknown, theme: unknown, kb: unknown, close: (r: unknown) => void) => unknown,
        opts: { overlay: boolean; overlayOptions?: Record<string, unknown> },
      ) => Promise<unknown>;
    };

    // We never call close() — the overlay stays for the entire session
    void ui.custom((tui, theme, keybindings, _close) => {
      // Build widget deps
      const deps: Record<string, unknown> = {
        pi: pi as unknown,
        tui: tui as unknown,
        theme: theme as { fg: (c: string, t: string) => string },
        keybindings: keybindings as unknown,
        autocompleteProvider,
        submitFn: (text: string) => pi.sendUserMessage(text),
      };

      // Create the grid — now just a render target, not a CustomEditor
      const grid = new GridComponent(
        tui as never,
        theme as never,
        keybindings as never,
        deps as never,
        activeGridConfig,
      );

      requestRenderFn = () => (tui as { requestRender?: () => void }).requestRender?.();

      return {
        render: (width: number): string[] => {
          // Compute where the grid should appear (bottom of the terminal)
          const termHeight = (tui as { termHeight?: number }).termHeight ?? 24;
          const gridLines = grid.render(width);
          const gridHeight = gridLines.length;

          // Build output: transparent lines above grid, grid at bottom
          const output: string[] = [];
          const emptyPrefix = Math.max(0, termHeight - gridHeight);

          // Transparent lines (message area — pi handles these, we stay see-through)
          for (let i = 0; i < emptyPrefix; i++) {
            output.push(""); // empty = transparent
          }

          // Our grid (status bar + editor + pi-lens + prompt bar)
          for (const line of gridLines) {
            output.push(line);
          }

          return output;
        },

        handleInput: (data: string): void => {
          grid.handleInput(data);
        },

        invalidate: (): void => {
          grid.invalidate();
        },
      };
    }, {
      overlay: true,
      overlayOptions: {
        anchor: "bottom-left",
        width: "100%",
        height: "100%",
      },
    });
  });

  // --- Event wiring for reactive updates ---
  pi.on("model_select", () => requestRenderFn?.());
  pi.on("thinking_level_select", () => requestRenderFn?.());
  pi.on("turn_start", () => requestRenderFn?.());
  pi.on("turn_end", () => requestRenderFn?.());
  pi.on("agent_start", () => requestRenderFn?.());
  pi.on("agent_end", () => requestRenderFn?.());
}
