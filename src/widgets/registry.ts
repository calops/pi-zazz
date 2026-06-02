import type { ColumnConfig, GridCellInfo } from "../grid/types.ts";
import type { WidgetDeps, WidgetFactory, WidgetInstance } from "./types.ts";

/** Global registry of widget factories by type name */
const factories = new Map<string, WidgetFactory>();

/**
 * Register a widget factory under a type name.
 * Built-in widgets call this at module load time.
 * Users can register custom widgets via the extension API.
 */
export function registerWidget(name: string, factory: WidgetFactory): void {
	factories.set(name, factory);
}

/**
 * Create a widget instance from a column config.
 * Looks up the factory by `widget.type`, calls it with deps and config.
 */
export function createFromConfig(
	column: ColumnConfig,
	deps: WidgetDeps,
	cell: GridCellInfo,
): WidgetInstance {
	const factory = factories.get(column.widget.type);
	if (!factory) {
		return createErrorWidget(
			`Unknown widget type: ${column.widget.type}`,
			deps,
		);
	}
	try {
		const instance = factory(deps, column.widget.config ?? {}, cell);
		if (column.widget.config && instance.configure) {
			instance.configure(column.widget.config);
		}
		return instance;
	} catch (err) {
		return createErrorWidget(
			`Widget error (${column.widget.type}): ${(err as Error).message}`,
			deps,
		);
	}
}

/** Check if a widget type is registered */
export function hasWidget(name: string): boolean {
	return factories.has(name);
}

function createErrorWidget(message: string, deps: WidgetDeps): WidgetInstance {
	const errorText = deps.theme.fg("error", message);
	return {
		render(_width: number, height: number): string[] {
			const lines = [errorText];
			for (let i = 1; i < height; i++) {
				lines.push(deps.theme.fg("dim", "·"));
			}
			return lines;
		},
		invalidate(): void {},
	};
}
