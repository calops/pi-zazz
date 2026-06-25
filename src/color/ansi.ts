/**
 * Low-level ANSI escape code builders.
 *
 * THIS IS THE ONLY FILE in the codebase that contains raw escape sequences.
 * All other files must go through the color framework (palette.ts, style.ts)
 * or through these helpers — never write `\x1b[` directly.
 */

// ── SGR control sequences ───────────────────────────────────────────────────

export const RESET = "\x1b[0m";
export const DEFAULT_FG = "\x1b[39m";
export const DEFAULT_BG = "\x1b[49m";
export const DIM = "\x1b[2m";
export const BRIGHT = "\x1b[1m";
export const NO_BOLD_DIM = "\x1b[22m";

// ── True color (24-bit) sequences ───────────────────────────────────────────

/** Foreground escape for an RGB triple. */
export function fgSeq(r: number, g: number, b: number): string {
	return `\x1b[38;2;${r};${g};${b}m`;
}

/** Background escape for an RGB triple. */
export function bgSeq(r: number, g: number, b: number): string {
	return `\x1b[48;2;${r};${g};${b}m`;
}

/** Style text with true color background and foreground. */
export function styled(
	bgR: number,
	bgG: number,
	bgB: number,
	fgR: number,
	fgG: number,
	fgB: number,
	text: string,
): string {
	return `${bgSeq(bgR, bgG, bgB)}${fgSeq(fgR, fgG, fgB)}${text}${RESET}`;
}

// ── Powerline glyphs ────────────────────────────────────────────────────────

type RgbTriple = readonly [number, number, number];

/**
 * Powerline left triangle ().
 * `curve` = RGB of the curved edge (the "pointing" colour).
 * `fill`  = optional RGB behind the glyph (transition / bleed effect).
 */
export function powerlineLeft(curve: RgbTriple, fill?: RgbTriple): string {
	const fg = fgSeq(curve[0], curve[1], curve[2]);
	if (fill) {
		return `${fg}${bgSeq(fill[0], fill[1], fill[2])}\u{E0B6}${RESET}`;
	}
	return `${fg}${DEFAULT_BG}\u{E0B6}${RESET}`;
}

/**
 * Powerline right triangle ().
 * `curve` = RGB of the curved edge (the "pointing" colour).
 * `fill`  = optional RGB behind the glyph.
 */
export function powerlineRight(curve: RgbTriple, fill?: RgbTriple): string {
	const fg = fgSeq(curve[0], curve[1], curve[2]);
	if (fill) {
		return `${fg}${bgSeq(fill[0], fill[1], fill[2])}\u{E0B4}${RESET}`;
	}
	return `${fg}${DEFAULT_BG}\u{E0B4}${RESET}`;
}
