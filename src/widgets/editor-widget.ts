import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { registerWidget } from "./registry.ts";
import type { WidgetDeps, WidgetFactory } from "./types.ts";

export const editorWidgetFactory: WidgetFactory = (
  deps: WidgetDeps,
  _config: unknown,
) => {
  let baseEditor: CustomEditor | undefined;

  try {
    const pi = deps.pi as { getEditorComponent?: () => (...args: never[]) => CustomEditor | undefined };
    const currentFactory = pi.getEditorComponent?.();
    if (currentFactory) {
      const comp = currentFactory(deps.tui as never, deps.theme as never, deps.keybindings as never);
      if (comp instanceof CustomEditor) baseEditor = comp;
    }
  } catch {
    // Will use fallback rendering
  }

  return {
    render(width: number, height: number): string[] {
      if (baseEditor) {
        const lines = baseEditor.render(width);
        if (lines.length === 0) return [deps.theme.fg("dim", "…")];
        return lines.slice(0, height);
      }
      return [deps.theme.fg("dim", "editor loading…")];
    },

    handleInput(data: string): boolean {
      if (baseEditor) {
        baseEditor.handleInput(data);
        return true;
      }
      return false;
    },

    invalidate(): void {
      baseEditor?.invalidate();
    },
  };
};

registerWidget("editor", editorWidgetFactory);
