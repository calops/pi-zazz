/**
 * A parsed SGR mouse event.
 *
 * SGR (Select Graphics Rendition) mouse tracking encodes button, column, and
 * row in an escape sequence of the form:
 *   Press:   \x1b[<btn;col;rowM
 *   Release: \x1b[<btn;col;rowm
 *
 * btn values:
 *   0–35  — mouse buttons (0 = left, 1 = middle, 2 = right, etc.)
 *   64    — scroll up
 *   65    — scroll down
 *
 * col and row are 1-based terminal coordinates.
 */
export interface ParsedSgrEvent {
	btn: number;
	col: number;
	row: number;
	/** true for press events (M), false for release events (m) */
	press: boolean;
}

/** Alias for {@link ParsedSgrEvent}. */
export interface MouseEvent extends ParsedSgrEvent {}

/**
 * Regex that matches SGR mouse escape sequences:
 *
 *   ^\x1b\[<(\d+);(\d+);(\d+)([Mm])$
 *
 * - Group 1: button number
 * - Group 2: column (1-based)
 * - Group 3: row (1-based)
 * - Group 4: 'M' (press) or 'm' (release)
 */
const SGR_MOUSE_RE = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/;

/**
 * Parse an SGR mouse escape sequence from raw terminal input.
 *
 * Returns a {@link ParsedSgrEvent} on success, or `null` if the input is not a
 * valid SGR mouse sequence.
 *
 * @param data – raw string from terminal input (may contain other sequences)
 * @returns parsed event, or `null`
 */
export function parseSgrMouseSequence(data: string): ParsedSgrEvent | null {
	const match = data.match(SGR_MOUSE_RE);
	if (!match) return null;

	const [, btnStr, colStr, rowStr, kind] = match;

	return {
		btn: Number(btnStr),
		col: Number(colStr),
		row: Number(rowStr),
		press: kind === "M",
	};
}
