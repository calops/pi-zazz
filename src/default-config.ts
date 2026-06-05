import type { GridConfig } from "./grid/types.ts";

export const DEFAULT_GRID: GridConfig = {
	minWidth: 40,
	minHeight: 8,
	rows: [
		{
			id: "lints",
			height: { min: 0, max: 12 },
			columns: [
				{
					id: "lens",
					width: { fraction: 1 },
					scrollable: true,
					widget: { type: "pi-lens", config: { maxDiagnostics: 20 } },
				},
				{
					id: "tasks",
					width: { fraction: 1 },
					border: { char: "│", color: "border" },
					scrollable: true,
					widget: { type: "tasks", config: {} },
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
							leftSegments: ["model", "path", "git", "context_pct"],
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
