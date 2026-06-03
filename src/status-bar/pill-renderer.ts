import { visibleWidth } from "@earendil-works/pi-tui";
import { ICONS } from "../icons.ts";

export interface Pill {
	text: string;
	width: number;
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

	let totalNeeded = 0;
	for (const p of [...left, ...right]) totalNeeded += p.width;
	totalNeeded += Math.max(0, left.length + right.length - 1) * separator.width;

	while (totalNeeded > totalWidth && (left.length > 0 || right.length > 0)) {
		if (right.length >= left.length && right.length > 0) {
			const removed = right.shift()!;
			totalNeeded -= removed.width + separator.width;
		} else if (left.length > 0) {
			const removed = left.pop()!;
			totalNeeded -= removed.width + separator.width;
		} else {
			break;
		}
	}

	const leftStr = left.map((p) => p.text).join(separator.char);
	const rightStr = right.map((p) => p.text).join(separator.char);

	const leftWidth =
		left.reduce((s, p) => s + p.width, 0) +
		Math.max(0, left.length - 1) * separator.width;
	const rightWidth =
		right.reduce((s, p) => s + p.width, 0) +
		Math.max(0, right.length - 1) * separator.width;

	const gap = totalWidth - leftWidth - rightWidth;
	const gapStr = gap > 0 ? " ".repeat(gap) : "";

	return leftStr + gapStr + rightStr;
}

export function makePill(iconStr: string, text: string, color: ColorFn): Pill {
	const content = iconStr ? `${iconStr} ${text}` : text;
	const styled = color(content);
	return { text: styled, width: visibleWidth(styled) };
}
