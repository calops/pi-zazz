import type { GridConfig } from "./grid/types.ts";

export const DEFAULT_GRID: GridConfig = {
	minWidth: 40,
	minHeight: 8,
	rows: [
		{
			id: "extensions",
			height: { min: 0, max: 12 },
			columns: [
				{
					id: "host",
					width: {},
					scrollable: true,
					widget: {
						type: "extensions-host",
						config: {
							maxWidgetsPerRow: 2,
							minWidgetWidth: 40,
						},
					},
				},
			],
		},
		{
			id: "status-bar",
			height: { min: 1, max: 1 },
			columns: [
				{
					id: "status",
					width: {},
					widget: {
						type: "status-bar",
						config: {
							separator: "powerline-thin",
							leftSegments: ["model", "path", "git", "context_pct", "cost"],
							rightSegments: [],
							segmentOptions: {
								model: { showThinkingLevel: true },
							},
						},
					},
				},
			],
		},
		{
			id: "main",
			height: { min: 1, max: 12 },
			responsive: { breakpoint: 80, narrowLayout: "stacked" },
			columns: [
				{
					id: "editor",
					width: { fraction: 1, min: 20 },
					widget: { type: "editor", config: {} },
				},
			],
		},
	],
};
