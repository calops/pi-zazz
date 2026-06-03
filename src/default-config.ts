import type { GridConfig } from "./grid/types.ts";

export const DEFAULT_GRID: GridConfig = {
	minWidth: 40,
	minHeight: 8,
	rows: [
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
					width: { fraction: 2, min: 20 },
					widget: { type: "editor", config: {} },
				},
				{
					id: "lens",
					width: { fraction: 1, min: 20 },
					scrollable: true,
					widget: { type: "pi-lens", config: { maxDiagnostics: 20 } },
				},
			],
		},
		{
			id: "prompt-bar",
			height: { min: 1, max: 1 },
			columns: [
				{
					id: "prompt",
					width: {},
					widget: {
						type: "prompt-bar",
						config: { maxLength: 120 },
					},
				},
			],
		},
	],
};
