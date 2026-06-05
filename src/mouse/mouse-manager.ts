/**
 * MouseManager — manages SGR mouse tracking for the terminal.
 *
 * Enables/disables SGR extended mouse mode (1000 + 1006) so we get
 * coordinated button and scroll events encoded as SGR sequences.
 *
 * The returned input listener parses raw terminal data and routes
 * scroll events to the grid's hit-test + scroll mechanism, consuming
 * all mouse events so they never reach the editor input path.
 */

import { parseSgrMouseSequence } from "./types.ts";

/** The grid interface needed by MouseManager. */
export interface MouseGrid {
	hitTest(row: number, col: number): string | null;
	scrollCell(cellId: string, direction: number): void;
}

/** Input listener contract compatible with TUI.addInputListener(). */
export type InputListenerResult =
	| { consume?: boolean; data?: string }
	| undefined;

export type InputListener = (data: string) => InputListenerResult;

/**
 * Manages SGR mouse tracking and routes scroll/click events to the grid.
 */
export class MouseManager {
	constructor(
		private terminal: { write(data: string): void },
		private grid: MouseGrid,
	) {}

	/**
	 * Enable SGR mouse tracking.
	 *
	 * Writes the DECSET sequences for button-event tracking (1000) and
	 * SGR extended coordinate encoding (1006), then returns a cleanup
	 * function that calls disable().
	 */
	enable(): () => void {
		// 1000 = enable basic button-event tracking
		// 1006 = enable SGR extended coordinates (precise col/row)
		this.terminal.write("\x1b[?1000h\x1b[?1006h");

		return () => {
			this.disable();
		};
	}

	/**
	 * Disable SGR mouse tracking by writing the reset sequences.
	 */
	disable(): void {
		this.terminal.write("\x1b[?1000l\x1b[?1006l");
	}

	/**
	 * Return an input listener suitable for `TUI.addInputListener()`.
	 *
	 * - **Scroll events** (btn = 64 or 65): hit-test the cell at the
	 *   reported (col, row) and route scrollCell with the correct
	 *   direction (scroll-up → -1, scroll-down → +1).
	 * - **Other mouse events**: consumed silently (return `{ consume: true }`).
	 * - **Non-mouse input**: returns `undefined` so the event passes through.
	 */
	getInputListener(): InputListener {
		return (data: string): InputListenerResult => {
			const event = parseSgrMouseSequence(data);
			if (event === null) {
				// Not a mouse sequence — pass through.
				return undefined;
			}

			const { btn, col, row } = event;

			if (btn === 64) {
				// Scroll up
				const cellId = this.grid.hitTest(row, col);
				if (cellId !== null) {
					this.grid.scrollCell(cellId, -1);
				}
				return { consume: true };
			}

			if (btn === 65) {
				// Scroll down
				const cellId = this.grid.hitTest(row, col);
				if (cellId !== null) {
					this.grid.scrollCell(cellId, 1);
				}
				return { consume: true };
			}

			// All other mouse events (clicks, etc.) — consume.
			return { consume: true };
		};
	}
}
