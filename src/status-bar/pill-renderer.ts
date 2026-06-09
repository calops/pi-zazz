import { visibleWidth } from "@earendil-works/pi-tui";
import { ICONS } from "../icons.ts";

/** A smaller sub-pill attached to the left or right of a main pill. */
export interface PillExtension {
	/** ANSI-styled text (extension content) */
	text: string;
	/** Visible width of the text */
	width: number;
	/** Background RGB for true color ANSI (darkened via blendTowardBg) */
	darkR: number;
	darkG: number;
	darkB: number;
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

// Window background — updated dynamically from terminal palette.
let BG_RGB: [number, number, number] = [30, 30, 46];

/** Override the terminal background RGB used by blendTowardBg. */
export function setBgRgb(r: number, g: number, b: number): void {
	BG_RGB = [r, g, b];
}

/** Read the current terminal background RGB. */
export function getBgRgb(): [number, number, number] {
	return BG_RGB;
}

/**
 * Blend a color toward the window background using linear RGB interpolation
 * (snacks.nvim's blend formula). Returns RGB triple for direct use in true
 * color ANSI codes instead of quantizing through the 6×6×6 cube.
 */
export function blendTowardBg(
	baseR: number,
	baseG: number,
	baseB: number,
	alpha = 0.3,
): [number, number, number] {
	return [
		Math.round(alpha * baseR + (1 - alpha) * BG_RGB[0]),
		Math.round(alpha * baseG + (1 - alpha) * BG_RGB[1]),
		Math.round(alpha * baseB + (1 - alpha) * BG_RGB[2]),
	];
}

/**
 * Darken a 256-color index by blending toward the window background.
 * The result is a 256-color index (falls back to nearest cube entry when
 * true color isn't needed).
 */
export function darkenColor(baseColor: number, alpha = 0.3): number {
	// The 6×6×6 cube is too coarse for proper darkening. Callers that need
	// precision should use blendTowardBg() with true color ANSI codes.
	return Math.round(baseColor * alpha);
}

/**
 * Render a single pill with rounded separators and a trailing space.
 * Render a single pill with rounded separators and a trailing space.
 * If the pill has a right extension, it blends under the closing .
 */
function renderPill(
	p: Pill,
	trailingSpace: boolean,
	fallbackSep: string,
): string {
	if (p.bg !== null && p.fg !== null) {
		const hasRightExt = !!p.rightExt;
		return (
			// Opening rounded left edge (fg=pill_bg, bg=terminal default)
			`\x1b[38;5;${p.bg}m\x1b[49m\u{E0B6}\x1b[0m` +
			// Pill content (already styled from makePill)
			p.text +
			// Closing  transitions to extension bg when present, otherwise terminal default
			(hasRightExt && p.rightExt
				? `\x1b[0m\x1b[38;5;${p.bg}m\x1b[48;2;${p.rightExt.darkR};${p.rightExt.darkG};${p.rightExt.darkB}m\u{E0B4}\x1b[0m` +
				// Extension content (blended under the )
				`\x1b[48;2;${p.rightExt.darkR};${p.rightExt.darkG};${p.rightExt.darkB}m\x1b[38;5;${p.rightExt.mainFg}m${p.rightExt.text}\x1b[0m` +
				// Extension closing  (true color)
				`\x1b[38;2;${p.rightExt.darkR};${p.rightExt.darkG};${p.rightExt.darkB}m\x1b[49m\u{E0B4}\x1b[0m`
				: `\x1b[38;5;${p.bg}m\x1b[49m\u{E0B4}\x1b[0m`) +
			// Single space between pills
			(trailingSpace ? " " : "")
		);
	}
	// Fallback for pills without color info
	return p.text + (trailingSpace ? fallbackSep : "");
}

/** 6×6×6 cube level → actual RGB value. */
function cubeLevelRgb(idx: number): [number, number, number] {
	const levels = [0, 95, 135, 175, 215, 255];
	const n = idx - 16;
	return [
		levels[Math.floor(n / 36)]!,
		levels[Math.floor((n % 36) / 6)]!,
		levels[n % 6]!,
	];
}

/** Build a PillExtension from raw text and the main pill's base 256-color bg. */
export function makeExtension(text: string, baseBg: number): PillExtension {
	const [r, g, b] = cubeLevelRgb(baseBg);
	const [dr, dg, db] = blendTowardBg(r, g, b, 0.2);
	return {
		text,
		width: visibleWidth(text),
		darkR: dr,
		darkG: dg,
		darkB: db,
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
	// Right extension blends under the main ; only adds content + closing 
	const rightExt = p.rightExt ? p.rightExt.width + 1 : 0;
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
	const content = iconStr ? `${iconStr}${text}` : text;
	const styled = color(content);
	const colors = extractPillColors(styled);
	return {
		text: styled,
		width: visibleWidth(styled),
		bg: colors.bg,
		fg: colors.fg,
	};
}
