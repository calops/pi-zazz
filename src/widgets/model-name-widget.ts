import { registerWidget } from "./registry.ts";
import type { WidgetDeps, WidgetFactory, WidgetInstance } from "./types.ts";
import type { GridCellInfo } from "../grid/types.ts";
import { icon } from "../icons.ts";

export const modelNameWidgetFactory: WidgetFactory = (
	_deps: WidgetDeps,
	_config: unknown,
	_cell: GridCellInfo,
) => {
	let cachedModel = "no-model";

	const pi = _deps.pi as {
		on: (event: string, handler: (...args: never[]) => void) => void;
	};

	pi.on("model_select", (event: unknown) => {
		const m = (
			event as { model?: { id: string; name?: string } }
		).model;
		cachedModel = m?.name ?? m?.id ?? "no-model";
		if (cachedModel.startsWith("Claude ")) cachedModel = cachedModel.slice(7);
	});

	const instance: WidgetInstance = {
		render(_width: number, _height: number): string[] {
			return [`${icon("model")} ${cachedModel}`];
		},

		handleInput(_data: string): boolean {
			return false;
		},

		getText(): string {
			return "";
		},

		setText(_text: string): void {},

		invalidate(): void {},
		configure(_cfg: Record<string, unknown>): void {},
	};

	return instance;
};

registerWidget("model-name", modelNameWidgetFactory);
