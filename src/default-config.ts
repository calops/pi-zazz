import type { GridConfig } from "./grid/types.ts";

export const DEFAULT_GRID: GridConfig = {
	minWidth: 40,
	minHeight: 8,
	rows: [
		{
			id: "model-bar",
			height: { min: 1, max: 1 },
			columns: [
				{
					id: "model",
					width: {},
					widget: { type: "model-name", config: {} },
				},
			],
		},
		{
			id: "editor-row",
			height: { min: 1, max: 12 },
			columns: [
				{
					id: "editor",
					width: {},
					widget: { type: "editor", config: {} },
				},
			],
		},
	],
};
