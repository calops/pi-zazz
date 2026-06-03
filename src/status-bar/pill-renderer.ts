import { visibleWidth } from "@earendil-works/pi-tui";
import { ICONS } from "../icons.ts";

export interface Pill {
	/** ANSI-styled text (includes ANSI codes for bg/fg colors) */
	text: string;
	/** Visible width of the text portion */
	width: number;
	/** 256-color background index extracted from the ANSI codes (for powerline separators) */
	bg: number | null;
	/** 256-color foreground index extracted from the ANSI codes (for powerline separators) */
	fg: number | null;
}

export type ColorFn = (text: string) => string;

export interface PillSeparator {
	char: string;
	width: number;
}

export const SEPARATORS: Record<string, PillSeparator> = {
	powerline: { char: "\u{E0B0}", width: 1 },
	"powerline-thin": { char: "\u{E0B1}", width: 1 },
	slash: { char: " / ", width: 3 },
	pipe: { char: " | ", width: 3 },
	block: { char: "\u{2588}", width: 1 },
	dot: { char: " · ", width: 3 },
	chevron: { char: " > ", width: 3 },
	star: { char: ` ${ICONS.sepDot} `, width: 3 },
	none: { char: " ", width: 1 },
	ascii: { char: " | ", width: 3 },
};

/**
 * Render a single pill with rounded separators and a trailing space.
 * Each pill is self-contained:  content  plus a space after.
 *  and  use the pill's own bg color against the terminal default background,
 * creating a pill shape that doesn't blend into adjacent pills.
 */
function renderPill(
	p: Pill,
	trailingSpace: boolean,
	fallbackSep: string,
): string {
	if (p.bg !== null && p.fg !== null) {
		return (
			// Opening rounded left edge (fg=pill_bg, bg=terminal default)
			`\x1b[38;5;${p.bg}m\x1b[49m\u{E0B6}\x1b[0m` +
			// Pill content (already styled from makePill)
			p.text +
			// Closing rounded right edge (fg=pill_bg, bg=terminal default)
			`\x1b[38;5;${p.bg}m\x1b[49m\u{E0B4}\x1b[0m` +
			// Single space between pills
			(trailingSpace ? " " : "")
		);
	}
	// Fallback for pills without color info
	return p.text + (trailingSpace ? fallbackSep : "");
}

/**
 * Pack pills horizontally into available width.
 * Overflow removes pills from the middle inward.
 */
export function packPills(
	leftPills: readonly Pill[],
	rightPills: readonly Pill[],
	separator: PillSeparator,
	totalWidth: number,
): string {
	const left = [...leftPills];
	const right = [...rightPills];

	// Each pill has  + content +  (+ trailing space except for last pill)
	const perPillOverhead = 2; //  and 
	const spaceBetween = 1; // single space between pills

	let totalNeeded = 0;
	for (const p of [...left, ...right]) totalNeeded += p.width + perPillOverhead;
	totalNeeded += Math.max(0, left.length + right.length - 1) * spaceBetween;

	while (totalNeeded > totalWidth && (left.length > 0 || right.length > 0)) {
		if (right.length >= left.length && right.length > 0) {
			const removed = right.shift()!;
			totalNeeded -= removed.width + perPillOverhead + spaceBetween;
		} else if (left.length > 0) {
			const removed = left.pop()!;
			totalNeeded -= removed.width + perPillOverhead + spaceBetween;
		} else {
			break;
		}
	}

	const renderStr = (pills: Pill[]) =>
		pills
			.map((p, i) => renderPill(p, i < pills.length - 1, separator.char))
			.join("");

	const leftStr = renderStr(left);
	const rightStr = renderStr(right);

	const pillWidth = (pills: Pill[]) =>
		pills.reduce(
			(s, p) => s + p.width + perPillOverhead,
			Math.max(0, pills.length - 1) * spaceBetween,
		);

	const gap = totalWidth - pillWidth(left) - pillWidth(right);
	const gapStr = gap > 0 ? " ".repeat(gap) : "";

	return leftStr + gapStr + rightStr;
}

/** Extract 256-color bg/fg from an ANSI-styled pill string. */
function extractPillColors(styled: string): {
	bg: number | null;
	fg: number | null;
} {
	const bgMatch = styled.match(/\x1b\[48;5;(\d+)m/);
	const fgMatch = styled.match(/\x1b\[38;5;(\d+)m/);
	return {
		bg: bgMatch ? parseInt(bgMatch[1]!, 10) : null,
		fg: fgMatch ? parseInt(fgMatch[1]!, 10) : null,
	};
}

export function makePill(iconStr: string, text: string, color: ColorFn): Pill {
	const content = iconStr ? `${iconStr} ${text}` : text;
	const styled = color(content);
	const colors = extractPillColors(styled);
	return {
		text: styled,
		width: visibleWidth(styled),
		bg: colors.bg,
		fg: colors.fg,
	};
}
