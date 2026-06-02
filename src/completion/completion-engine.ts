import { CompletionPopup } from "./completion-popup.ts";
import type { CompletionItem } from "./completion-popup.ts";

export type { CompletionItem } from "./completion-popup.ts";

/**
 * Manages the completion popup lifecycle.
 * Uses ctx.ui.custom() with overlay mode to show a floating popup.
 */
export class CompletionEngine {
	private closeFn: ((result: unknown) => void) | null = null;
	private readonly openOverlay: (
		factory: (
			tui: unknown,
			theme: unknown,
			kb: unknown,
			close: (result: unknown) => void,
		) => CompletionPopup,
		opts: { overlay: boolean },
	) => Promise<unknown>;
	private _onApply: ((value: string) => void) | null = null;

	constructor(openOverlay: CompletionEngine["openOverlay"]) {
		this.openOverlay = openOverlay;
	}

	show(
		items: CompletionItem[],
		_termHeight: number,
		editorWidth: number,
		theme: {
			fg: (c: string, t: string) => string;
			bg: (c: string, t: string) => string;
		},
		_cursorRow: number,
	): void {
		if (items.length === 0) return;
		this.dismiss();

		const maxHeight = Math.min(items.length, 8);
		const width = Math.max(20, Math.min(editorWidth, 60));

		const factory = (
			_tui: unknown,
			_appTheme: unknown,
			_kb: unknown,
			close: (result: unknown) => void,
		): CompletionPopup => {
			this.closeFn = close;

			return new CompletionPopup({
				items,
				width,
				maxHeight,
				onSelect: (item) => {
					this._onApply?.(item.value);
					close(null);
				},
				onCancel: () => close(null),
				theme,
			});
		};

		// Fire and forget — the overlay stays open until close() is called
		this.openOverlay(factory, { overlay: true })
			.then(() => {
				this.closeFn = null;
			})
			.catch(() => {
				this.closeFn = null;
			});
	}

	dismiss(): void {
		this.closeFn?.(null);
		this.closeFn = null;
	}

	get isActive(): boolean {
		return this.closeFn !== null;
	}

	set onApply(fn: (value: string) => void) {
		this._onApply = fn;
	}
}
