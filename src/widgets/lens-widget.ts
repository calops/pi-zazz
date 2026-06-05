import { basename } from "node:path";
import { visibleWidth } from "@earendil-works/pi-tui";
import { registerWidget } from "./registry.ts";
import type { WidgetDeps, WidgetFactory } from "./types.ts";
import {
	getState,
	setRenderCallback,
	injectTestData,
	type LensFileRecord,
	type LensDiagnostic,
} from "../lens-data-bridge.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

function isBlocking(d: LensDiagnostic): boolean {
	if (d.semantic === "blocking") return true;
	return d.severity === "error";
}

type FileTier = "blocking" | "warning" | "clean";

function classifyFileTier(rec: LensFileRecord): FileTier {
	if (rec.diagnostics.some(isBlocking)) return "blocking";
	if (
		rec.diagnostics.some(
			(d) => d.severity === "error" || d.severity === "warning",
		)
	) {
		return "warning";
	}
	return "clean";
}

function sortByTierThenRecency(recs: LensFileRecord[]): LensFileRecord[] {
	const order: Record<FileTier, number> = { blocking: 0, warning: 1, clean: 2 };
	return [...recs].sort((a, b) => {
		const ta = order[classifyFileTier(a)];
		const tb = order[classifyFileTier(b)];
		if (ta !== tb) return ta - tb;
		return b.touchedAt - a.touchedAt;
	});
}

// ── Widget factory ───────────────────────────────────────────────────────────

export const lensWidgetFactory: WidgetFactory = (
	deps: WidgetDeps,
	_config: unknown,
) => {
	return {
		/** Signal to the grid: hide this cell when no data is available. */
		heightConstraint(): { min: number; max: number } {
			const { files } = getState();
			if (files.size === 0) {
				injectTestData();
				const { files: updated } = getState();
				if (updated.size === 0) {
					return { min: 0, max: 0 };
				}
			}
			return { min: 1, max: Infinity };
		},

		/**
		 * Render the full pi-lens display.
		 *
		 * `height` is the row's maxHeight (configured in the grid config).
		 * The widget uses it as an output budget — it tries to fill as many
		 * lines as possible with useful content (header → file rows → diagnostics).
		 * The grid component then determines the row's effective height from
		 * `lines.length`, clamped to the row's [min, max] range.
		 */
		render(width: number, height: number): string[] {
			setRenderCallback(() => deps.tui.requestRender?.());
			const w = Math.max(1, width || 80);
			const dim = (s: string) => deps.theme.fg("dim", s);
			const red = (s: string) => deps.theme.fg("error", s);
			const yellow = (s: string) => deps.theme.fg("warning", s);
			const green = (s: string) => deps.theme.fg("success", s);
			const cyan = (s: string) => deps.theme.fg("accent", s);
			const useHorizontal = w >= 70;

			const state = getState();
			const {
				files,
				totalBlocking,
				totalErrors,
				totalWarnings,
				totalResolved,
				sessionLanguages,
			} = state;

			if (files.size === 0) {
				// Inject test data for layout demonstration when no real data has arrived.
				// This only fires once — subsequent real data from pi-lens replaces it.
				injectTestData();
				// Re-read state after injection
				const newState = getState();
				if (newState.files.size === 0) {
					return [fitLine(` ${dim("pi-lens waiting…")}`, w)];
				}
			}

			const maxOutput = Math.max(1, height);
			const lines: string[] = [];

			// ── Header (always) ─────────────────────────────────────────────────
			const langStr = sessionLanguages.slice(0, 6).join(" ");
			const errorChunk =
				totalErrors > 0
					? (totalBlocking > 0 ? red : yellow)(`●${totalErrors}E`)
					: "";
			const warningChunk =
				totalWarnings > 0 ? yellow(`!${totalWarnings}W`) : "";
			const resolvedChunk =
				totalResolved > 0 && !errorChunk && !warningChunk
					? dim(`~${totalResolved} fixed`)
					: "";
			const summary = errorChunk
				? errorChunk + (warningChunk ? " " + warningChunk : "")
				: warningChunk
					? warningChunk
					: resolvedChunk
						? resolvedChunk
						: green("✓ clean");

			const fileCount = dim(`${files.size} file${files.size !== 1 ? "s" : ""}`);
			const header = ` ${cyan("pi-lens")}${langStr ? "  " + dim(langStr) : ""}${summary ? "  " + summary : ""}  ${fileCount}`;
			lines.push(fitLine(header, w));
			if (lines.length >= maxOutput) return lines;

			// ── File rows — ALL files sorted by tier then recency ──────────────
			const sorted = sortByTierThenRecency([...files.values()]);

			if (useHorizontal) {
				// Horizontal mode: file rows take 1 line, rest goes to diagnostics
				const rowLine = packHorizontalRow(sorted, w, dim, red, yellow, green);
				if (rowLine.length > 0) lines.push(rowLine);
			} else {
				// Vertical mode: split remaining budget ~50/50 between file rows and diagnostics
				const remaining = maxOutput - lines.length;
				// Reserve about half for diagnostics + divider + filename
				const diagReserve = Math.min(
					sorted.some((r) => r.diagnostics.some(isBlocking)) ? 4 : 0,
					Math.max(2, Math.floor(remaining * 0.45)),
				);
				const maxFiles = remaining - diagReserve;
				let fileCount = 0;
				for (const rec of sorted) {
					if (fileCount >= maxFiles) break;
					lines.push(formatFileRow(rec, dim, red, yellow, green));
					fileCount++;
				}
				// If some files were left out, show overflow count
				if (fileCount < sorted.length) {
					const overflow = sorted.length - fileCount;
					lines.push(`   ${dim(`… +${overflow} more`)}`);
				}
			}
			if (lines.length >= maxOutput) return lines;

			// ── Blocking diagnostics (single most recent file with blockers) ──
			const withBlocking = sorted.filter((r) => r.diagnostics.some(isBlocking));
			if (withBlocking.length > 0) {
				const rec = withBlocking[0]!;
				const blockers = rec.diagnostics.filter(isBlocking).slice(0, 5);
				if (blockers.length > 0 && lines.length < maxOutput) {
					if (!useHorizontal) {
						lines.push(fitLine(dim("─".repeat(Math.min(w, 60))), w));
						if (lines.length < maxOutput) {
							lines.push(fitLine(` ${dim(basename(rec.filePath))}`, w));
						}
					}
					const remaining = maxOutput - lines.length;
					const shown = blockers.slice(0, remaining);
					for (const d of shown) {
						if (lines.length >= maxOutput) break;
						const loc = d.line != null ? `L${d.line}` : "";
						const rule = d.rule ? dim(` ${d.rule}`) : "";
						const prefix = `   ${red("●")} ${loc}${rule}  `;
						const msgWidth = Math.max(1, w - visibleWidth(prefix));
						const msg = fitLine(d.message, msgWidth, "…");
						lines.push(fitLine(`${prefix}${msg}`, w));
					}
				}
			}

			return lines;
		},

		invalidate(): void {},
	};
};

// ── Format helpers ───────────────────────────────────────────────────────────

function formatFileRow(
	rec: LensFileRecord,
	_dim: (s: string) => string,
	red: (s: string) => string,
	yellow: (s: string) => string,
	green: (s: string) => string,
): string {
	const base = basename(rec.filePath);
	const blocking = rec.diagnostics.filter(isBlocking).length;
	const errors = rec.diagnostics.filter((d) => d.severity === "error").length;
	const warnings = rec.diagnostics.filter(
		(d) => d.severity === "warning",
	).length;

	const tier = classifyFileTier(rec);
	const dot =
		tier === "blocking"
			? red("●")
			: tier === "warning"
				? yellow("!")
				: green("✓");

	const counts =
		errors > 0
			? " " +
				(blocking > 0 ? red : yellow)(`${errors}E`) +
				(warnings > 0 ? " " + yellow(`${warnings}W`) : "")
			: warnings > 0
				? " " + yellow(`${warnings}W`)
				: "";

	return ` ${dot} ${base}${counts}`;
}

function packHorizontalRow(
	recs: LensFileRecord[],
	totalWidth: number,
	dim: (s: string) => string,
	red: (s: string) => string,
	yellow: (s: string) => string,
	_green: (s: string) => string,
): string {
	if (recs.length === 0) return "";
	const indent = "   ";
	const sep = "  ";
	const overflowReserve = 4;
	let used = visibleWidth(indent);
	const parts: string[] = [indent];
	const addedWidths: number[] = [];

	for (let i = 0; i < recs.length; i++) {
		const rec = recs[i]!;
		const willOverflow = i < recs.length - 1;
		const reserve = willOverflow ? overflowReserve : 0;
		const remaining =
			totalWidth - used - (parts.length > 1 ? visibleWidth(sep) : 0) - reserve;
		if (remaining < 3) break;

		const token = formatFileToken(rec, remaining, dim, red, yellow, _green);
		const tokenWidth = visibleWidth(token);
		if (token.length === 0 || used + tokenWidth > totalWidth) break;

		if (parts.length > 1) {
			parts.push(sep);
			used += visibleWidth(sep);
		}
		parts.push(token);
		used += tokenWidth;
		addedWidths.push(tokenWidth);
	}

	const dropped = recs.length - addedWidths.length;
	if (dropped > 0) {
		const overflow = " " + dim(`+${dropped}`);
		while (
			used + visibleWidth(overflow) > totalWidth &&
			addedWidths.length > 0
		) {
			const lastWidth = addedWidths.pop()!;
			used -= lastWidth + visibleWidth(sep);
			parts.pop();
			parts.pop();
		}
		if (used + visibleWidth(overflow) <= totalWidth) {
			parts.push(overflow);
		}
	}

	return fitLine(parts.join(""), totalWidth);
}

function formatFileToken(
	rec: LensFileRecord,
	remainingWidth: number,
	dim: (s: string) => string,
	red: (s: string) => string,
	yellow: (s: string) => string,
	_green: (s: string) => string,
): string {
	const blocking = rec.diagnostics.filter(isBlocking).length;
	const errors = rec.diagnostics.filter((d) => d.severity === "error").length;
	const warnings = rec.diagnostics.filter(
		(d) => d.severity === "warning",
	).length;

	const tier = classifyFileTier(rec);
	const dotChar =
		tier === "blocking"
			? red("●")
			: tier === "warning"
				? yellow("!")
				: dim("·");
	void _green;

	let countsStyled = "";
	if (errors > 0 && warnings > 0) {
		const eColor = blocking > 0 ? red : yellow;
		countsStyled = " " + eColor(`${errors}E`) + yellow(`${warnings}W`);
	} else if (errors > 0) {
		const eColor = blocking > 0 ? red : yellow;
		countsStyled = " " + eColor(`${errors}E`);
	} else if (warnings > 0) {
		countsStyled = " " + yellow(`${warnings}W`);
	}

	const fullBasename = basename(rec.filePath);
	const fixedWidth = visibleWidth(dotChar) + 1 + visibleWidth(countsStyled);
	const basenameBudget = remainingWidth - fixedWidth;
	if (basenameBudget < 3) return "";
	const truncated = truncateBasename(fullBasename, basenameBudget);
	return `${dotChar} ${truncated}${countsStyled}`;
}

function truncateBasename(name: string, maxWidth: number): string {
	if (visibleWidth(name) <= maxWidth) return name;
	if (maxWidth < 2) return "…";
	const extIdx = name.lastIndexOf(".");
	const ext = extIdx >= 0 ? name.slice(extIdx) : "";
	const stem = extIdx >= 0 ? name.slice(0, extIdx) : name;
	const keep = maxWidth - ext.length - 1;
	if (keep < 1) return name.slice(0, maxWidth - 1) + "…";
	return stem.slice(0, keep) + "…" + ext;
}

function fitLine(s: string, maxWidth: number, ellipsis = "..."): string {
	return trimToWidth(s, Math.max(0, maxWidth), ellipsis);
}

/** Truncate a string (with ANSI awareness) to a given visible width. */
function trimToWidth(str: string, maxWidth: number, ellipsis?: string): string {
	const vw = visibleWidth(str);
	if (vw <= maxWidth) return str;
	if (maxWidth < 0) return "";
	if (!ellipsis) ellipsis = "";
	const elWidth = visibleWidth(ellipsis);
	const target = Math.max(0, maxWidth - elWidth);
	let result = "";
	let pos = 0;
	let inEscape = false;
	for (const ch of str) {
		if (inEscape) {
			result += ch;
			if (ch === "m") inEscape = false;
			continue;
		}
		if (ch === "\x1b") {
			inEscape = true;
			result += ch;
			continue;
		}
		if (pos >= target) break;
		result += ch;
		pos++;
	}
	return result + ellipsis;
}

registerWidget("pi-lens", lensWidgetFactory);
