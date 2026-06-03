import type {
	ColumnConfig,
	ColumnLayout,
	GridConfig,
	RowConfig,
	RowLayout,
	LayoutPlan,
} from "./types.ts";

/**
 * Pure function: given a grid config and terminal dimensions,
 * produce a LayoutPlan with exact row heights and column widths.
 */
export function computeLayout(
	config: GridConfig,
	termWidth: number,
	termHeight: number,
): LayoutPlan {
	const minWidth = config.minWidth ?? 40;
	const minHeight = config.minHeight ?? 8;
	if (termWidth < minWidth || termHeight < minHeight) {
		return { rows: [], fallback: true };
	}

	const visibleRows = config.rows.filter((r) => r.visible !== false);
	if (visibleRows.length === 0) {
		return { rows: [], fallback: false };
	}

	const rowHeights = allocateHeights(visibleRows, termHeight);

	const rows: RowLayout[] = [];
	for (let i = 0; i < visibleRows.length; i++) {
		const rowConfig = visibleRows[i]!;
		const height = rowHeights[i]!;
		const { stacked, columns } = allocateWidths(rowConfig, termWidth);
		rows.push({
			id: rowConfig.id,
			height,
			minHeight: rowConfig.height.min,
			maxHeight: rowConfig.height.max ?? Number.POSITIVE_INFINITY,
			stacked,
			columns,
		});
	}

	return { rows, fallback: false };
}

function allocateHeights(
	rowConfigs: readonly RowConfig[],
	termHeight: number,
): number[] {
	// Start each row at its minimum height — no grow distribution.
	// Actual rendered content determines the row's final height in
	// GridComponent.render() (clamped to each row's [min, max]).
	const heights = rowConfigs.map((r) => r.height.min);

	let used = heights.reduce((sum, h) => sum + h, 0);

	// If total minimums exceed terminal height, shrink from the bottom
	if (used > termHeight) {
		for (let i = rowConfigs.length - 1; i >= 0; i--) {
			const min = rowConfigs[i]!.height.min;
			const excess = used - termHeight;
			if (excess <= 0) break;
			const shrink = Math.min(heights[i]! - min, excess);
			heights[i] = heights[i]! - shrink;
			used -= shrink;
		}
	}

	return heights;
}

function allocateWidths(
	rowConfig: RowConfig,
	termWidth: number,
): { stacked: boolean; columns: ColumnLayout[] } {
	const responsive = rowConfig.responsive;
	const columns = rowConfig.columns;

	const useStacked =
		responsive !== undefined && termWidth < responsive.breakpoint;

	if (useStacked) {
		return {
			stacked: true,
			columns: columns.map((col) => ({
				id: col.id,
				width: termWidth,
				scrollable: col.scrollable ?? false,
				borderLeft: undefined,
				widget: col.widget,
			})),
		};
	}

	return {
		stacked: false,
		columns: distributeWidths(columns, termWidth),
	};
}

function distributeWidths(
	columns: readonly ColumnConfig[],
	totalWidth: number,
): ColumnLayout[] {
	if (columns.length === 0) return [];

	const totalFractions = columns.reduce(
		(sum, c) => sum + (c.width.fraction ?? 0),
		0,
	);
	const effectiveTotal = totalFractions > 0 ? totalFractions : columns.length;

	const mins = columns.map((c) => c.width.min ?? 1);
	const totalMins = mins.reduce((s, m) => s + m, 0);
	const distributable = Math.max(0, totalWidth - totalMins);

	const widths: number[] = [];
	for (let i = 0; i < columns.length; i++) {
		const col = columns[i]!;
		const fraction = col.width.fraction ?? 1;
		const extra = Math.floor((distributable * fraction) / effectiveTotal);
		let w = mins[i]! + extra;
		if (col.width.max !== undefined) {
			w = Math.min(w, col.width.max);
		}
		widths.push(w);
	}

	let used = widths.reduce((s, w) => s + w, 0);
	if (used < totalWidth) {
		for (let i = 0; i < widths.length && used < totalWidth; i++) {
			const col = columns[i]!;
			const max = col.width.max ?? Number.POSITIVE_INFINITY;
			const add = Math.min(totalWidth - used, max - widths[i]!);
			widths[i] = widths[i]! + add;
			used += add;
		}
	}

	return columns.map((col, i) => ({
		id: col.id,
		width: widths[i]!,
		scrollable: col.scrollable ?? false,
		borderLeft: col.border,
		widget: col.widget,
	}));
}
