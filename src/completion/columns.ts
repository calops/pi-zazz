import { visibleWidth, truncateToWidth } from "@earendil-works/pi-tui";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import type { RowContext } from "./categories.ts";
import { iconForCategory } from "./categories.ts";

// ── Column definition ──────────────────────────────────────────────

/**
 * A column in the completion popup.
 * Columns are rendered left-to-right. The LAST column is elastic:
 * it takes all remaining width and is cropped if content exceeds it.
 */
export interface Column {
	/** Unique column id */
	id: string;
	/**
	 * Render this column's content.
	 * @param item  The autocomplete item for this row
	 * @param w     Allocated width for this column in visible characters
	 * @param ctx   Row context (selection state, category, etc.)
	 * @returns     Rendered string whose visibleWidth ≤ w
	 */
	render(item: AutocompleteItem, w: number, ctx: RowContext): string;
	/**
	 * Measure the ideal (max) visible width for this column from data.
	 * Non-last columns use this value. The last column is elastic instead.
	 */
	measure(items: AutocompleteItem[]): number;
}

// ── Built-in columns ───────────────────────────────────────────────

export interface ColumnEnv {
	colorFn: (
		category: import("./categories.ts").CompletionCategory,
		text: string,
	) => string;
	sourceTagStyle: (tag: string) => string;
}

const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;
const bright = (s: string) => `\x1b[1m${s}\x1b[22m`;

export function selectionColumn(): Column {
	return {
		id: "sel",
		render(_item, _w, ctx) {
			return ctx.isSelected ? "▶ " : "  ";
		},
		measure() {
			return 2;
		},
	};
}

export function iconColumn(env: ColumnEnv): Column {
	return {
		id: "icon",
		render(item, _w, ctx) {
			// Use per-file Nerd Font icon if pre-computed (for @ completions)
			const enhanced = item as unknown as Record<string, unknown>;
			if (enhanced._nerdIcon) return enhanced._nerdIcon as string;
			const glyph = iconForCategory(ctx.category);
			return env.colorFn(ctx.category, glyph);
		},
		measure() {
			return 2; // double-width Nerd glyph
		},
	};
}

export function labelColumn(): Column {
	return {
		id: "label",
		render(item, w, ctx) {
			const styled = ctx.isSelected ? bright(item.label) : item.label;
			const vw = visibleWidth(item.label);
			const pad = Math.max(0, w - vw);
			return styled + " ".repeat(pad);
		},
		measure(items) {
			let max = 0;
			for (const item of items) {
				const vw = visibleWidth(item.label);
				if (vw > max) max = vw;
			}
			return max;
		},
	};
}

export function descriptionColumn(env: ColumnEnv): Column {
	return {
		id: "desc",
		render(item, w, _ctx) {
			if (!item.description || w <= 0) return "";
			// Use pre-cleaned data if available (set in showCompletionOverlay)
			const enhanced = item as Record<string, unknown> & AutocompleteItem;
			const preTag = enhanced._cleanTag as string | null | undefined;
			const preRest = enhanced._cleanRest as string | undefined;
			const { tag, rest } =
				preTag !== undefined
					? { tag: preTag, rest: preRest ?? "" }
					: cleanDescription(item.description);
			// Build description content
			let parts = dim("  "); // separator before description
			if (tag) {
				parts += env.sourceTagStyle(tag) + dim(" ");
			}
			if (rest) {
				parts += dim(rest);
			}
			// Crop to allocated width
			const s =
				visibleWidth(parts) <= w ? parts : truncateToWidth(parts, w, "…");
			const tw = visibleWidth(s);
			const pad = Math.max(0, w - tw);
			return s + " ".repeat(pad);
		},
		measure(_items) {
			// Last column is elastic — measurement unused
			return 0;
		},
	};
}

// ── Layout engine ──────────────────────────────────────────────────

export interface ColumnLayout {
	id: string;
	/** Allocated visible width for this column */
	width: number;
}

/**
 * Given a list of columns (first N fixed, last one elastic) and a set of
 * items, compute the allocated width for each column.
 *
 * Non-last columns get their max measured width.
 * The last column gets the remaining space, capped at its content's ideal
 * width (no reason to waste space).
 */
export function computeLayout(
	columns: Column[],
	items: AutocompleteItem[],
	totalWidth: number,
): ColumnLayout[] {
	if (columns.length === 0) return [];

	// All columns except the last get their measured width
	const fixed: ColumnLayout[] = [];
	let used = 0;
	for (let i = 0; i < columns.length - 1; i++) {
		const w = columns[i]!.measure(items);
		fixed.push({ id: columns[i]!.id, width: w });
		used += w;
	}

	// Last column gets the rest
	const lastIdx = columns.length - 1;
	const lastCol = columns[lastIdx]!;
	const lastWidth = Math.max(0, totalWidth - used);
	const layouts = [...fixed, { id: lastCol.id, width: lastWidth }];

	return layouts;
}

/**
 * Render one row through all columns at the given layout widths.
 */
export function renderRow(
	columns: Column[],
	layouts: ColumnLayout[],
	item: AutocompleteItem,
	ctx: RowContext,
): string {
	let line = "";
	for (const layout of layouts) {
		const col = columns.find((c) => c.id === layout.id);
		if (!col) continue;
		line += col.render(item, layout.width, ctx);
	}
	return line;
}

// ── Description cleaning ─────────────────────────────────────────

/**
 * Compute the ideal visible width of the description column for a set of items.
 * Measures the max cleaned description width (separator + tag + space + rest),
 * which is what the elastic description column would consume at full size.
 */
export function measureDescriptionWidth(items: AutocompleteItem[]): number {
	let maxW = 0;
	for (const item of items) {
		if (!item.description) continue;
		// Use pre-cleaned data if available
		const enhanced = item as Record<string, unknown> & AutocompleteItem;
		const preTag = enhanced._cleanTag as string | null | undefined;
		const preRest = enhanced._cleanRest as string | undefined;
		const { tag, rest } =
			preTag !== undefined
				? { tag: preTag, rest: preRest ?? "" }
				: cleanDescription(item.description);
		let w = 2; // separator
		if (tag) w += visibleWidth(tag) + 1;
		if (rest) w += visibleWidth(rest);
		if (w > maxW) maxW = w;
	}
	return maxW;
}

/**
 * Clean a source-tagged description like "[u:git:github.com/user/repo] desc"
 * into a compact tag ("repo") and clean description ("desc").
 */
export function cleanDescription(desc: string): {
	tag: string | null;
	rest: string;
} {
	const match = desc.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
	if (!match)
		return { tag: null, rest: desc.replaceAll(/[\r\n]+/g, " ").trim() };

	const rawTag = match[1]!;
	const rest = match[2]!.replaceAll(/[\r\n]+/g, " ").trim();

	// Split by : or / and take the last non-empty segment
	const segments = rawTag.split(/[:/]/).filter(Boolean);
	let slug = segments[segments.length - 1] ?? rawTag;

	// If the last segment is a single-letter scope (u/p/t), back up
	if (slug.length <= 2 && segments.length > 1) {
		slug = segments[segments.length - 2]!;
	}

	// Strip @ref from git URLs
	slug = slug.replace(/@.*$/, "");

	return { tag: slug, rest };
}
