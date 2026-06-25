import { visibleWidth } from "@earendil-works/pi-tui";
import { ICONS } from "../icons.ts";
import * as style from "../color/style.ts";
import { defineBlend } from "../color/palette.ts";

/** A smaller sub-pill attached to the left or right of a main pill. */
export interface PillExtension {
	/** ANSI-styled text (extension content) */
	text: string;
	/** Visible width of the text */
	width: number;
	/** Registered colour name for the extension's blended background */
	bgColor: string;
	/** Registered colour name for the text foreground (the main pill's accent) */
	fgColor: string;
}

export interface Pill {
	/** ANSI-styled text (includes colour codes) */
	text: string;
	/** Visible width of the text portion */
	width: number;
	/** Registered colour name for the pill's background (for powerline separators) */
	bgColor: string;
	/** Registered colour name for the pill's foreground */
	fgColor: string;
	/** Optional sub-pill attached to the left side */
	leftExt?: PillExtension;
	/** Optional sub-pill attached to the right side */
	rightExt?: PillExtension;
}

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

// ── Pill construction ───────────────────────────────────────────────────────

/**
 * Construct a Pill with its content styled using named colours.
 * The text is styled as "punched out" — background is the named colour,
 * foreground is the terminal's own background colour.
 */
export function makePill(
	iconStr: string,
	text: string,
	bgColor: string,
	fgColor: string,
): Pill {
	const content = iconStr ? `${iconStr}${text}` : text;
	const styled = style.punched(bgColor, content);
	return {
		text: styled,
		width: visibleWidth(styled),
		bgColor,
		fgColor,
	};
}

/** Build a PillExtension with blended background from a base colour name. */
export function makeExtension(text: string, baseColor: string): PillExtension {
	const blendName = defineBlend(baseColor, 0.2);
	return {
		text,
		width: visibleWidth(text),
		bgColor: blendName,
		fgColor: baseColor,
	};
}

// ── Rendering ───────────────────────────────────────────────────────────────

/** Render a single pill with rounded separators and a trailing space. */
function renderPill(
	p: Pill,
	trailingSpace: boolean,
	_fallbackSep: string,
): string {
	const hasLeftExt = !!p.leftExt;
	const hasRightExt = !!p.rightExt;

	let result = "";

	// Left extension:  + text + transition 
	if (hasLeftExt && p.leftExt) {
		const ext = p.leftExt;
		result +=
			// Opening rounded left edge in extension colour
			style.powerlineLeft(ext.bgColor) +
			// Extension content (blended bg, main accent fg)
			style.apply(ext.bgColor, ext.fgColor, ext.text) +
			// Transition  from extension bg to main pill bg (main encroaches onto ext)
			style.powerlineLeft(p.bgColor, ext.bgColor);
	} else {
		// No left extension: standard opening rounded left edge
		result += style.powerlineLeft(p.bgColor);
	}

	// Main pill content (already styled from makePill)
	result += p.text;

	// Right extension / main closing 
	if (hasRightExt && p.rightExt) {
		const ext = p.rightExt;
		result +=
			// Transition  from main bg to extension bg
			style.powerlineRight(p.bgColor, ext.bgColor) +
			// Extension content (blended bg, main accent fg)
			style.apply(ext.bgColor, ext.fgColor, ext.text) +
			// Extension closing 
			style.powerlineRight(ext.bgColor);
	} else {
		result += style.powerlineRight(p.bgColor);
	}

	// Single space between pills
	result += trailingSpace ? " " : "";
	return result;
}

/** Computes the full visible width of a pill including its separators. */
function pillFullWidth(p: Pill): number {
	const leftChars = p.leftExt ? p.leftExt.width + 2 : 1;
	const rightChars = p.rightExt ? p.rightExt.width + 2 : 1;
	return leftChars + p.width + rightChars;
}

export function packPills(
	leftPills: readonly Pill[],
	rightPills: readonly Pill[],
	separator: PillSeparator,
	totalWidth: number,
): string {
	const left = [...leftPills];
	const right = [...rightPills];

	const spaceBetween = 1;

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
