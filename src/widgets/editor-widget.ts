import { registerWidget } from "./registry.ts";
import type { WidgetDeps, WidgetFactory } from "./types.ts";

/**
 * EditorWidget renders the built-in editor content.
 * When used outside GridComponent, shows placeholder text.
 * Inside GridComponent, the GridComponent handles editor cells specially
 * by calling CustomEditor.render() directly (see GridComponent.createEditorWidget()).
 */
export const editorWidgetFactory: WidgetFactory = (
	deps: WidgetDeps,
	_config: unknown,
) => {
	return {
		render(width: number, height: number): string[] {
			// When used standalone (non-grid context), show placeholder
			const lines: string[] = [];
			lines.push(deps.theme.fg("dim", "editor"));
			for (let i = 1; i < height; i++) {
				lines.push(deps.theme.fg("dim", "~"));
			}
			// Pad each line to width
			return lines.map((l) => {
				const pad = width - [...l].length;
				return pad > 0 ? l + " ".repeat(pad) : l;
			});
		},

		invalidate(): void {},
	};
};

registerWidget("editor", editorWidgetFactory);
