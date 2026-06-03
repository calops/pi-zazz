import { visibleWidth } from "@earendil-works/pi-tui";
import { ICONS } from "../icons.ts";

/** A smaller sub-pill attached to the left or right of a main pill. */
export interface PillExtension {
	/** ANSI-styled text (extension content) */
	text: string;
	/** Visible width of the text */
	width: number;
	/** Background color index (darkened version of the main pill's bg) */
	darkBg: number;
	/** Foreground color index (the main pill's main/accent color) */
	mainFg: number;
}

export interface Pill {
	/** ANSI-styled text (includes ANSI codes for bg/fg colors) */
	text: string;
	/** Visible width of the text portion */
	width: number;
	/** 256-color background index extracted from the ANSI codes (for powerline separators) */
	bg: number | null;
	/** 256-color foreground index extracted from the ANSI codes (for powerline separators) */
	fg: number | null;
	/** Optional sub-pill attached to the left side */
	leftExt?: PillExtension;
	/** Optional sub-pill attached to the right side */
	rightExt?: PillExtension;
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

/** Darken a 256-color index by reducing its RGB components (works on the 6×6×6 cube). */
export function darkenColor(baseColor: number): number {
	if (baseColor >= 16 && baseColor <= 231) {
		const n = baseColor - 16;
		const r = Math.floor(n / 36);
		const g = Math.floor((n % 36) / 6);
		const b = n % 6;
		return (
			16 + Math.max(0, r - 1) * 36 + Math.max(0, g - 1) * 6 + Math.max(0, b - 1)
		);
	}
	// For system / grayscale colors, just decrement (clamped to 0)
	return Math.max(0, baseColor - 8);
}

/**
 * Render an extension sub-pill.
 * Uses the pill's main color as foreground and a darkened version as background,
 * wrapped in / separators colored with the extension's background.
 */
function renderExtension(ext: PillExtension): string {
	return (
		`\x1b[38;5;${ext.darkBg}m\x1b[49m\u{E0B6}\x1b[0m` +
		`\x1b[48;5;${ext.darkBg}m\x1b[38;5;${ext.mainFg}m${ext.text}\x1b[0m` +
		`\x1b[38;5;${ext.darkBg}m\x1b[49m\u{E0B4}\x1b[0m`
	);
}

/**
 * Render a single pill with rounded separators and a trailing space.
 * If the pill has left/right extensions, they are rendered alongside.
 */
function renderPill(
	p: Pill,
	trailingSpace: boolean,
	fallbackSep: string,
): string {
	if (p.bg !== null && p.fg !== null) {
		const left = p.leftExt ? renderExtension(p.leftExt) : "";
		const right = p.rightExt ? renderExtension(p.rightExt) : "";
		return (
			left +
			// Opening rounded left edge (fg=pill_bg, bg=terminal default)
			`\x1b[38;5;${p.bg}m\x1b[49m\u{E0B6}\x1b[0m` +
			// Pill content (already styled from makePill)
			p.text +
			// Closing rounded right edge (fg=pill_bg, bg=terminal default)
			`\x1b[38;5;${p.bg}m\x1b[49m\u{E0B4}\x1b[0m` +
			right +
			// Single space between pills
			(trailingSpace ? " " : "")
		);
	}
	// Fallback for pills without color info
	return p.text + (trailingSpace ? fallbackSep : "");
}

/** Build a PillExtension from raw text and the main pill's base bg color. */
export function makeExtension(text: string, baseBg: number): PillExtension {
	const darkBg = darkenColor(baseBg);
	return {
		text,
		width: visibleWidth(text),
		darkBg,
		mainFg: baseBg,
	};
}

/**
 * Pack pills horizontally into available width.
 * Overflow removes pills from the middle inward.
 */
/** Computes the full visible width of a pill including its / and any extensions. */
function pillFullWidth(p: Pill): number {
	const mainWidth = p.width + 2; //  + content + 
	const leftExt = p.leftExt ? p.leftExt.width + 2 : 0; //  + text + 
	const rightExt = p.rightExt ? p.rightExt.width + 2 : 0;
	return mainWidth + leftExt + rightExt;
}

export function packPills(
	leftPills: readonly Pill[],
	rightPills: readonly Pill[],
	separator: PillSeparator,
	totalWidth: number,
): string {
	const left = [...leftPills];
	const right = [...rightPills];

	const spaceBetween = 1; // single space between pills

	let totalNeeded = 0;
	for (const p of [...left, ...right]) totalNeeded += pillFullWidth(p);
	totalNeeded += Math.max(0, left.length + right.length - 1) * spaceBetween;

	while (totalNeeded > totalWidth && (left.length > 0 || right.length > 0)) {
		if (right.length >= left.length && right.length > 0) {
			const removed = right.shift()!;
			totalNeeded -= pillFullWidth(removed) + spaceBetween;
		} else if (left.length > 0) {
			const removed = left.pop()!;
			totalNeeded -= pillFullWidth(removed) + spaceBetween;
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

	const gap =
		totalWidth -
		left.reduce((s, p) => s + pillFullWidth(p), 0) -
		right.reduce((s, p) => s + pillFullWidth(p), 0) -
		Math.max(0, left.length + right.length - 1) * spaceBetween;
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
