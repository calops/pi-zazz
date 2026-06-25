/**
 * Named-colour styling functions.
 *
 * Every function here operates on colour *names* only — no raw RGB values,
 * no escape sequences.  The actual ANSI code generation is delegated to
 * `ansi.ts` and the colour lookups to `palette.ts`.
 */

import * as ansi from "./ansi.ts";
import { getRgb, getBgRgb } from "./palette.ts";

/** Apply a named background colour to text (foreground is terminal default). */
export function bg(name: string, text: string): string {
	const [r, g, b] = getRgb(name);
	return ansi.bgSeq(r, g, b) + text + ansi.RESET;
}

/** Apply a named foreground colour to text. */
export function fg(name: string, text: string): string {
	const [r, g, b] = getRgb(name);
	return ansi.fgSeq(r, g, b) + text + ansi.RESET;
}

/**
 * Style text with a named background and foreground.
 * This is the generic two-colour styling function.
 */
export function apply(bgName: string, fgName: string, text: string): string {
	const [br, bg, bb] = getRgb(bgName);
	const [fr, fg, fb] = getRgb(fgName);
	return ansi.styled(br, bg, bb, fr, fg, fb, text);
}

/**
 * "Punched out" styling: background = named colour, foreground = terminal bg.
 * This makes text appear cut out of the coloured pill, revealing the terminal
 * background behind it.
 */
export function punched(bgName: string, text: string): string {
	const [br, bg, bb] = getRgb(bgName);
	const [fr, fg, fb] = getBgRgb();
	return ansi.styled(br, bg, bb, fr, fg, fb, text);
}

// ── Powerline separators ────────────────────────────────────────────────────

/** Powerline left separator () using named colours. */
export function powerlineLeft(colorName: string, fillName?: string): string {
	const curve = getRgb(colorName);
	return ansi.powerlineLeft(curve, fillName ? getRgb(fillName) : undefined);
}

/** Powerline right separator () using named colours. */
export function powerlineRight(colorName: string, fillName?: string): string {
	const curve = getRgb(colorName);
	return ansi.powerlineRight(curve, fillName ? getRgb(fillName) : undefined);
}
